# SmartEdu — API Documentation

Base URL: `http://localhost:8000` (backend dev server). All routes below are additionally prefixed as mounted in `app/main.py`. All request/response bodies are JSON unless noted (file upload endpoints use `multipart/form-data`; file download endpoints return binary `FileResponse`; the chat stream endpoint returns `text/plain`).

**Authentication**: unless marked "Public", every endpoint requires an `Authorization: Bearer <JWT>` header. The JWT is obtained from `POST /api/auth/login` and contains `{"sub": user_id, "role": role}`. Role requirements below reflect `Depends(require_role(...))`; "Any authenticated user" reflects `Depends(get_current_user)` with course-level access additionally checked via `get_course_for_access()` where noted.

CORS: only `http://localhost:5173` (the Vite dev server) is allowed (`app/main.py`), credentials enabled, all methods/headers allowed.

---

## 1. Auth — `/api/auth` (`app/routers/auth.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Body: `{email, password}`. Returns `{access_token, token_type: "bearer", role, full_name, user_id}`. Rejects with an identical 401 message for both "no such user" and "wrong password" (prevents account enumeration). 403 if account deactivated or password not yet set. |

> ⚠ `frontend/src/api/auth.js` exports a `register()` function calling `POST /api/auth/register`, but **no such backend route exists**. This call would 404 if ever invoked; it is currently unused in the UI.

---

## 2. Password — `/api/password` (`app/routers/password.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/password/forgot` | Public | Body: `{email}`. Always returns a generic success message regardless of whether the account exists (anti-enumeration). Sends a reset email if the account exists and is active. |
| POST | `/api/password/set` | Public | Body: `{token, new_password}`. Used for both first-time account setup and forgot-password resets. Validates + consumes the single-use token, sets `password_hash`, sets `has_set_password=True`. 400 if password < 8 chars or token invalid/expired. |
| POST | `/api/password/change` | Any authenticated user | Body: `{current_password, new_password}`. **Note:** `current_password` is accepted in the schema but **never checked** against the stored hash — the endpoint only validates `new_password` length (≥8) and overwrites the hash unconditionally. The frontend (`ChangePasswordModal.jsx`) always sends an empty string for `current_password`. |

---

## 3. Admin — `/api/admin` (`app/routers/admin.py`, role required: `admin`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/users` | Create a teacher or student account. Body validated by `AdminCreateUser` (registration_number required for students, forbidden for teachers). Triggers a 48h account-setup email. Returns `{message, email_sent, user_id, pending_verification}`. |
| GET | `/api/admin/users` | List users. Optional query param `?role=teacher\|student\|admin`. |
| PATCH | `/api/admin/users/{user_id}/deactivate` | Soft-disable an account (`is_active=False`). |
| PATCH | `/api/admin/users/{user_id}/activate` | Re-enable an account. |
| DELETE | `/api/admin/users/{user_id}` | **Permanently** delete a user and cascade all related data. Admins cannot delete themselves or any other admin account (403). |
| POST | `/api/admin/users/{user_id}/resend-setup-email` | Invalidates prior unused tokens, issues a new 48h setup token/email. 400 if the account already has a password set. |
| POST | `/api/admin/courses` | Create a course. Body: `{name, code, description?}`. 400 if course code already exists. |
| GET | `/api/admin/courses` | List all courses, each annotated with `teachers[]` and `student_count`. |
| POST | `/api/admin/courses/{course_id}/assign-teacher` | Body: `{teacher_email}`. Assigns a teacher to a course; 400 if already assigned. |
| DELETE | `/api/admin/courses/{course_id}/assign-teacher/{teacher_id}` | Removes a teacher's assignment to a course. |
| POST | `/api/admin/courses/{course_id}/enroll` | Body: `{student_identifier}` — accepts either email **or** registration number. Sends an enrollment notification email. |
| DELETE | `/api/admin/courses/{course_id}/enroll/{student_id}` | Unenrolls a student. |

---

## 4. Courses — `/api/courses` (`app/routers/courses.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/courses/teaching` | role: `teacher` | Courses this teacher is assigned to. |
| GET | `/api/courses/enrolled` | role: `student` | Courses this student is enrolled in. |
| GET | `/api/courses/{course_id}` | Any authenticated user | Course detail. 403 if teacher not assigned / student not enrolled (admins always pass). |
| GET | `/api/courses/{course_id}/students` | role: `teacher` | Read-only roster for a course the teacher is assigned to. |

> ⚠ `frontend/src/api/courses.js` exports `removeStudent(courseId, studentId)` calling `DELETE /api/courses/{courseId}/students/{studentId}` — **no such backend route exists** (only `admin.py`'s `/api/admin/courses/{course_id}/enroll/{student_id}` performs unenrollment). This frontend function is currently unused anywhere in the UI.

This module also exports `get_course_for_access(course_id, user, db)`, a shared authorization helper imported by `documents.py`, `assignments.py`, and `chat.py` — not an HTTP endpoint itself.

---

## 5. Documents — `/api/documents` (`app/routers/documents.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/documents/{course_id}` | Any authenticated user with course access | List all lecture documents for a course (all statuses). |
| POST | `/api/documents/{course_id}/upload` | role: `teacher` (+ course access) | `multipart/form-data`, field `file` (PDF only, checked by filename extension). Creates a `Document` row and schedules background ingestion. Returns the `Document` immediately with `status="processing"`. |
| GET | `/api/documents/{course_id}/{document_id}/download` | Any authenticated user with course access | Returns the raw PDF (`FileResponse`, `application/pdf`). Used by the frontend for both "View" (opened in a new tab as a blob) and "Download". |
| DELETE | `/api/documents/{course_id}/{document_id}` | role: `teacher` (+ course access) | Deletes the document row, its ChromaDB vector chunks, and the file on disk. |

---

## 6. Assignments — `/api/assignments` (`app/routers/assignments.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/assignments/{course_id}` | role: `teacher` (+ course access) | Creates an assignment with an inline rubric. Body: `{title, description?, due_date?, criteria: [{label, max_marks, description?}]}`. Creates a `Rubric` + `RubricCriterion` rows, then the `Assignment`. Clears `lms_context_cache`. |
| GET | `/api/assignments/{course_id}` | Any authenticated user with course access | Lists all assignments for a course, each with `criteria[]` and `total_marks` attached. |
| GET | `/api/assignments/detail/{assignment_id}` | Any authenticated user with course access | Single assignment (title, description, `due_date`, criteria, total_marks). |
| PUT | `/api/assignments/{assignment_id}/extend-deadline` | role: `teacher` (+ course access) | Body: `{new_due_date, reason?}`. Writes an `AssignmentDeadlineHistory` row, updates `Assignment.due_date`, clears `lms_context_cache`, re-runs badge evaluation. |
| GET | `/api/assignments/{assignment_id}/deadline-history` | Any authenticated user with course access | Full audit trail of deadline changes, newest first. |
| GET | `/api/assignments/{assignment_id}/badges` | Any authenticated user with course access | Runs badge (re-)evaluation, then returns all badges awarded for this assignment (all students). |
| GET | `/api/assignments/{assignment_id}/rubric` | Any authenticated user with course access | Assignment title/description/total_marks/criteria (used by the student submission view before submitting). |
| POST | `/api/assignments/{assignment_id}/submit` | role: `student` (+ course access) | `multipart/form-data`, field `file` (PDF only). 400 if past due date. Creates a `Submission` (`status="processing"`), schedules background AI evaluation. |
| GET | `/api/assignments/submissions/{submission_id}` | Any authenticated user | Poll a submission's current status. Students may only view their own (403 otherwise). |
| GET | `/api/assignments/{assignment_id}/submissions` | role: `teacher` (+ course access) | Lists all submissions for an assignment, annotated with `student_name`. Runs badge evaluation first. |
| GET | `/api/assignments/submissions/{submission_id}/ai-evaluation` | role: `teacher` (+ course access) | Returns the AI's rubric scoring + structured feedback for a submission. 404 if not yet evaluated. |
| POST | `/api/assignments/submissions/{submission_id}/review` | role: `teacher` (+ course access) | Body: `{criteria_scores, teacher_comments?}`. Creates the `FinalGrade` (400 if no AI evaluation yet, or already reviewed). Marks `was_ai_overridden` if scores differ from the AI's. Triggers badge evaluation. |
| GET | `/api/assignments/submissions/{submission_id}/grade` | Any authenticated user | Final grade + AI feedback for a submission. Students may only view their own. 404 if ungraded. |
| GET | `/api/assignments/{assignment_id}/my-submission` | role: `student` | The current student's latest submission for an assignment (most recent by `submitted_at`). |
| DELETE | `/api/assignments/{assignment_id}` | role: `teacher` (+ course access) | Deletes the assignment and all its submission files from disk. |
| GET | `/api/assignments/submissions/{submission_id}/file` | Any authenticated user | Downloads/views the raw submitted PDF. Students: own submissions only. Teachers: any submission in their assigned course. |
| DELETE | `/api/assignments/submissions/{submission_id}` | role: `student` | Deletes the student's own submission — only allowed before the deadline and before it's been graded (`status != "teacher_reviewed"`). Allows resubmission. |

**Route-ordering note**: `GET /api/assignments/detail/{assignment_id}` uses a literal `detail` path segment specifically so it doesn't collide with `GET /api/assignments/{course_id}` (single path-param route) — FastAPI/Starlette path matching combined with the `int` type converter on `assignment_id`/`course_id` params keeps all of these unambiguous.

---

## 7. Badges — `/api/badges` (`app/routers/badges.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/badges/my-badges` | Any authenticated user | All badges earned by the calling user (intended for students; not role-restricted). |
| GET | `/api/badges/assignment/{assignment_id}` | Any authenticated user | All badges awarded for a specific assignment (no course-level access check performed here — see `Pending_Tasks.md`). |

Note: `assignments.py`'s `GET /{assignment_id}/badges` (see §6) is functionally similar but additionally performs `get_course_for_access` and triggers re-evaluation first — the two endpoints are not identical despite similar names.

---

## 8. Chat — `/api/chat` (`app/routers/chat.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/chat/` | Any authenticated user (+ course access) | Body: `{message, course_id}`. Non-streaming; returns `{answer, sources[], intent, metrics}` in one response. Persists both the user message and assistant reply to `chat_history`. |
| POST | `/api/chat/stream` | Any authenticated user (+ course access) | Same body. Returns a `text/plain` **streamed** response — the raw token text is written incrementally, not SSE/JSON-lines framed. Persists `chat_history` after the stream completes. This is the endpoint the production UI (`StudentCourseDetail.jsx`) actually uses, via raw `fetch()` with an `AbortController` for the "Stop" button. |

Both endpoints 400 on an empty/whitespace-only `message`.

`ChatResponse.metrics` (non-streaming only) surfaces the `PipelineMetrics` breakdown: `intent_ms`, `lms_ms`, `retrieval_ms`, `prompt_ms`, `ttft_ms`, `llm_total_ms`, `total_ms`, `cached`. The frontend currently does not display these metrics anywhere — they are logged server-side and returned but unused by the streaming path the UI actually uses.

---

## 9. Misc / Root

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | `{"message": "SmartEdu API is running!"}` |
| GET | `/health` | Public | `{"status": "healthy"}` |

---

## 10. Known Frontend/Backend API Mismatches

These are dead frontend API calls with no live backend counterpart — safe to remove, or should be implemented if the feature is actually wanted:

1. `authApi.register()` → `POST /api/auth/register` — no route exists.
2. `coursesApi.removeStudent()` → `DELETE /api/courses/{course_id}/students/{student_id}` — no route exists (the real unenroll route lives under `/api/admin/...`).
