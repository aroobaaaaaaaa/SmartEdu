# SmartEdu — Assignment & Evaluation System

Covers the full lifecycle: assignment creation, rubric design, student submission, OCR/text extraction, AI evaluation, teacher review, deadline extensions, and badge awarding. Primary source files: `app/routers/assignments.py`, `app/services/evaluation_service.py`, `app/services/ocr_service.py`, `app/services/badge_service.py`, `app/models/models.py`.

---

## 1. Assignment Creation (Teacher)

**Endpoint**: `POST /api/assignments/{course_id}` — `frontend/src/components/teacher/AssignmentsPanel.jsx`.

The teacher fills in a title, optional description/instructions, optional due date, and builds a **rubric inline** as part of the same form — there is no separate "manage rubrics" screen and no rubric reuse across assignments. Each criterion is `{label, max_marks, description?}`; the UI enforces at least one criterion with a non-empty label and lets the teacher add/remove rows dynamically, live-summing `total_marks` as they type.

On submit, the backend (`create_assignment` in `assignments.py`):
1. Validates `criteria` is non-empty (400 otherwise).
2. Computes `total_marks = sum(c.max_marks for c in criteria)`.
3. Creates a `Rubric` row (`title = "{assignment title} — Rubric"`).
4. Creates one `RubricCriterion` row per criterion — `key` is auto-slugified from the label (`lowercase, spaces→_, /→_`), used later as the JSON key both in AI scoring and in the teacher's score-editing form.
5. Creates the `Assignment` row, linked to the new rubric.
6. Clears `lms_context_cache` (so the chatbot immediately reflects the new assignment).

---

## 2. Assignment Listing & Detail

- `GET /api/assignments/{course_id}` — all assignments for a course, each with `criteria[]` and `total_marks` attached via the shared helper `_assignment_with_criteria()`.
- `GET /api/assignments/detail/{assignment_id}` — single assignment, same shape (added specifically to support `TeacherSubmissions.jsx`, which only has an `assignmentId` route param, not a `courseId`).
- `GET /api/assignments/{assignment_id}/rubric` — a leaner view (`assignment_title, description, total_marks, criteria[]`, no ids) used by the student's assignment card to preview the rubric before submitting.

---

## 3. Student Submission

**Endpoint**: `POST /api/assignments/{assignment_id}/submit` — `frontend/src/components/student/AssignmentsPanel.jsx`.

Client-side: file input restricted to `.pdf` (checked by filename, both client- and server-side — not by MIME sniffing content). On successful upload, the UI immediately shows a "Submitted successfully" banner and begins polling `GET /api/assignments/submissions/{id}` every 4 seconds until status leaves the in-progress states.

Server-side (`submit_assignment`):
1. 404 if assignment doesn't exist; course-access check via `get_course_for_access`.
2. **400 if past due date** (`datetime.utcnow() > assignment.due_date`) — hard submission lockout, no grace period.
3. 400 if filename doesn't end in `.pdf`.
4. Creates the `Submission` row immediately (`status="processing"`, empty `file_path`), commits, *then* writes the file to disk (`UPLOAD_DIR/submission_{id}_{filename}`) and updates `file_path`.
5. Schedules `evaluate_submission_task` as a `BackgroundTask` and returns the `Submission` object right away (HTTP response does **not** wait for grading).

**Resubmission**: `DELETE /api/assignments/submissions/{submission_id}` lets a student delete their own submission and resubmit, but only if the deadline hasn't passed **and** it hasn't already been graded (`status != "teacher_reviewed"`) — this is the only path to "resubmit," there is no dedicated resubmit/replace endpoint.

---

## 4. OCR / Text Extraction Pipeline

**File**: `app/services/ocr_service.py`, function `extract_text_from_pdf(file_path) -> dict`. This single function is **shared** by both the lecture-document ingestion pipeline (`rag_service.py`) and the assignment-grading pipeline (`evaluation_service.py`) — one extraction implementation, two consumers.

Return shape (a dict, not a bare string — both callers must read `.text` etc., not treat the return value as a plain string):
```python
{
    "text": str,                # best-effort extracted text (typed + OCR'd pages combined)
    "method": "typed" | "ocr",  # "ocr" if ANY page in the doc needed OCR
    "confidence": float | None, # average Tesseract word confidence 0-100, None if no OCR was used
    "low_confidence": bool,     # True if OCR was used AND avg confidence < 40
}
```

Algorithm, per page (via PyMuPDF/`fitz`):
1. Try `page.get_text()` first (native PDF text layer). If non-empty, use it directly — no OCR needed for that page (fast path for typed/digital PDFs).
2. If empty (i.e., the page is a scanned image with no text layer), fall back to OCR:
   - Render the page to a 300 DPI pixmap image.
   - **Preprocess** (`preprocess_image_for_ocr`): convert to grayscale, denoise (`cv2.fastNlMeansDenoising`), then adaptive Gaussian thresholding to binarize — tuned for scanned/photographed printed text, explicitly documented in code comments as only marginally helpful for true handwriting (Tesseract was never trained on handwritten letterforms).
   - Run `pytesseract.image_to_data()` (not `image_to_string`) specifically to get **per-word confidence scores**, config `--oem 1 --psm 6` (LSTM engine, "assume a single uniform block of text" — tuned for single-column scanned assignment pages).
   - Collect words with `conf > 0` (Tesseract returns `-1` for "no text detected" boxes) and accumulate their confidences.
3. After all pages: join extracted text with double-newlines, compute the average confidence across all OCR'd words (`None` if no OCR occurred at all), and flag `low_confidence` if OCR was used and the average is below 40 — an empirically chosen threshold documented in code as reliably correlating with garbage/unusable OCR output.

**Chunking** (`chunk_text`, used only by the RAG ingestion path, not by grading): sentence-aware — see `Chatbot_Architecture.md` §5.2.

**Downstream handling of extraction results**:
- If `extraction["text"]` is empty → `Submission.status = "failed"`, `error_message = "No text could be extracted from this PDF."`, evaluation stops.
- If `extraction["low_confidence"]` is `True` → `status = "failed"`, with an error message specifically telling the teacher the OCR confidence was too low and to ask the student to resubmit a clearer scan or typed document. **The submission never reaches AI grading in this case.**
- Otherwise → `extracted_text`, `extraction_method`, `extraction_confidence` are saved to the `Submission`, `status = "extracted"`, and grading proceeds.

---

## 5. AI Evaluation

**File**: `app/services/evaluation_service.py`, function `evaluate_submission_task(submission_id, file_path, db_session_factory)` — runs as a `BackgroundTask`, opens its own DB session (the request session is already closed).

> ⚠ **This is the active implementation.** There is a second, older file at `app/schemas/evaluation_service.py` (misplaced in the `schemas/` package) that is a stale, unused duplicate — see `Pending_Tasks.md`. Everything below describes only the real, imported module (`app.services.evaluation_service`).

### 5.1 Text Preparation
`_prepare_submission_text(text, max_chars=8000)` — rather than naively truncating from the start (which for a long submission would mean the LLM only ever sees the introduction), it samples **beginning + middle + end** thirds of the document when it exceeds 8000 characters, joined with `[... middle section ...]` / `[... final section ...]` markers — intended to give the model a representative view of the whole submission within its context budget.

### 5.2 Prompt Construction
The grading prompt includes:
- Assignment title and full description/instructions.
- Every rubric criterion, each rendered as `- Key: "{key}" | Criterion: {label} | Max marks: {max} | Description: ...`.
- The prepared submission excerpt.
- Explicit **scoring guidelines** instructing the model to: award full marks for a genuine reasonable attempt, partial marks for incomplete-but-present work, zero only if a criterion topic is completely absent, and to give benefit of the doubt since the excerpt may not represent 100% of the document. This is a deliberate anti-harshness calibration — the prompt explicitly frames the goal as "fair, balanced, and encouraging assessment — not to find every flaw."
- A strict output-format instruction requesting **only** a JSON object (no prose) with: `criteria_scores` (per-key int), `criteria_feedback[]` (per-criterion `{key, label, score, max_score, what_was_good, what_was_missing}`), `strengths[]`, `weaknesses[]`, `improvements[]`, `summary`.

### 5.3 LLM Call
`ollama.chat()`, `num_predict=1000`, `num_ctx=6144` (larger than the chat pipeline's 2048, to fit rubric + submission excerpt + JSON schema), `temperature=0.15` (lower than chat's 0.2, favoring consistency for grading).

### 5.4 Parsing & Validation
- Extracts the JSON object defensively — finds the first `{` and last `}` in the raw output and parses only that substring (LLMs sometimes wrap JSON in markdown fences or prose despite instructions).
- **Clamps every score** to `[0, criterion.max_marks]` — the model's arithmetic is never trusted blindly (`max(0, min(int(v), max_marks))`).
- `total_score = sum(clamped_scores.values())`.
- Merges the clamped (possibly-corrected) scores back into `criteria_feedback[]` so the per-criterion score shown to the teacher always matches the clamped total, even if the model's own feedback text disagreed.
- Wraps everything (`criteria_feedback`, `strengths`, `weaknesses`, `improvements`, `summary`, plus placeholder `ai_score`/`plagiarism_score` fields that are always `None`) into one JSON string stored in `AIEvaluation.feedback` (a `Text` column, not a native JSON column — the frontend `JSON.parse()`s it on read).
- On **any exception** anywhere in this function (extraction, LLM call, JSON parse, DB write) — `Submission.status = "failed"`, `error_message = f"Evaluation failed: {e}"`. This is a broad catch-all, meaning a malformed LLM response, a transient Ollama connection error, and a genuine bug all surface identically to the teacher as a generic "failed" status.

---

## 6. Teacher Review Workflow

**Page**: `frontend/src/pages/TeacherSubmissions.jsx`. **Endpoint**: `POST /api/assignments/submissions/{submission_id}/review`.

1. Teacher opens the assignment's submissions list (`GET /api/assignments/{assignment_id}/submissions`) — a left-column student roster with status pills (`Processing`, `Extracted`, `Ready`/`ai_evaluated`, `Graded`, `Failed`), plus badge indicators (🚀🏆💯) next to any student who has already earned a badge for this assignment.
2. Clicking a student with status `ai_evaluated` or `teacher_reviewed` loads `GET .../ai-evaluation`, pre-filling an editable score form (`scores` state) with the AI's `criteria_scores` and rendering the full structured AI feedback (per-criterion good/missing, strengths, weaknesses, summary) alongside it.
3. The teacher can freely edit any per-criterion score (number input) and add free-text comments, then **Approve & finalize grade**.
4. Server-side (`review_submission`): 400 if no AI evaluation exists yet, 400 if already reviewed (finalization is **one-shot** — there is no "re-review" or "edit grade" endpoint once a `FinalGrade` exists). `total_score` is recomputed server-side from the submitted `criteria_scores` (not trusted from the AI's stored total). `was_ai_overridden` is set by a straightforward dict-equality comparison against the AI's original scores.
5. After creating the `FinalGrade` and setting `Submission.status = "teacher_reviewed"`, `evaluate_assignment_badges()` is triggered synchronously (not backgrounded) — so High Achiever / Perfect Score badges may be awarded the instant a grade is finalized, potentially re-ranking previous awardees if a later-graded student ties or exceeds the current max (see §8).

**Locked/immutable once graded**: neither the teacher nor the student can edit a `FinalGrade` after creation through any exposed endpoint. A student also cannot delete a submission once it's `teacher_reviewed`.

---

## 7. Deadline Extension & Audit Trail

**Endpoint**: `PUT /api/assignments/{assignment_id}/extend-deadline` — teacher-only, from an "Extend Deadline" modal in `TeacherSubmissions.jsx` (date/time picker + optional free-text reason).

Server-side (`extend_deadline`):
1. Records the *previous* `due_date` and the new one into `AssignmentDeadlineHistory` (append-only — every extension creates a new row, nothing is overwritten).
2. Updates `Assignment.due_date`.
3. Clears `lms_context_cache` (the chatbot must reflect the new deadline immediately, not after up to 60s).
4. Re-runs `evaluate_assignment_badges()` — relevant because moving the deadline later could change whether "now > due_date" for First Submitter evaluation.

`GET /api/assignments/{assignment_id}/deadline-history` returns the full trail (newest first), each entry resolved to the updating teacher's name — surfaced in the UI via a "History" modal next to the "Extend Deadline" button.

**Note**: there is no validation preventing a teacher from setting a new deadline *in the past*, nor any restriction on how many times a deadline can be extended.

---

## 8. Badge / Achievement Evaluation

**File**: `app/services/badge_service.py`, function `evaluate_assignment_badges(assignment_id, db)`. See `Chatbot_Architecture.md`/`Project_Architecture.md` for trigger points; this section covers the evaluation logic itself.

Seeded achievement types (`seed_default_achievements`, run on backend startup): `first_submitter`, `high_achiever`, `perfect_score`, `consistent_performer`, `top_contributor`. **Only the first three are ever actually awarded** — no code path evaluates `consistent_performer` or `top_contributor` (see `Pending_Tasks.md`).

### 8.1 First Submitter
- Only evaluated **after** the deadline has passed (`now > assignment.due_date`) — this is an explicit design decision (documented in the code and in the earlier planning discussion for this feature) to prevent students from submitting a placeholder file immediately, "locking in" first place, then withdrawing/replacing it — since submission deletion is blocked after the deadline anyway, evaluating only post-deadline closes that gap.
- If not already awarded for this assignment (existence check), finds the earliest `Submission` (`status != "failed"`, `submitted_at <= due_date`) and awards it to that student.
- Assignments with `due_date = NULL` **never** trigger this evaluation (the `if due and now > due` guard never passes) — a deadline-less assignment can never produce a First Submitter badge.

### 8.2 High Achiever
- Evaluated whenever there's at least one `FinalGrade` for the assignment (queries `Submission JOIN FinalGrade` where `Submission.status == "teacher_reviewed"`).
- Computes `max_score` across all graded submissions' `total_score`.
- **Every** student whose `total_score == max_score` (and `max_score > 0`) is awarded — ties are fully supported, not just the first-found.
- Because this re-runs on every trigger point (each new review, each deadline extension, each submissions-list view, each badge fetch), if a later student's grade ties or beats the current max, that student is newly awarded too — but **existing High Achiever awards are never revoked** even if a subsequent grade surpasses them. In other words, the badge can accumulate additional winners over time but never removes a prior winner who's since been "beaten." This is a specific, verifiable behavior of the current implementation (see `Pending_Tasks.md` if this is not the intended product behavior).

### 8.3 Perfect Score
- Evaluated in the same pass as High Achiever.
- Any graded student whose `total_score == rubric.total_marks` is awarded (independent of whether they also happen to be the max — a student can hold both badges simultaneously).

### 8.4 Idempotency
Every award path explicitly queries for an existing `StudentAchievement` row (`student_id, achievement_id, assignment_id`) before inserting — combined with the DB-level `UniqueConstraint` on that same triple, awarding is safe to re-run on every request without creating duplicates.

### 8.5 Badge Surfacing
- Student: `GET /api/badges/my-badges` — shown on `StudentDashboard.jsx` (an "Earned Achievements" showcase card) and as inline `BadgePill` chips next to each assignment card in `StudentAssignmentsPanel.jsx`.
- Teacher: `GET /api/assignments/{assignment_id}/badges` (triggers re-evaluation first) or `GET /api/badges/assignment/{assignment_id}` — shown as small badge chips next to each student's name in `TeacherSubmissions.jsx`'s roster.
- Chatbot: earned badges are included in `build_lms_context()`'s output (`[Earned Badges] ...` line), so a student can ask the AI assistant "what badges have I earned?" and get an answer grounded in real data.
