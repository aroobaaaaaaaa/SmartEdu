# SmartEdu — Current Features

Everything below is verified working end-to-end in the codebase (backend route + service logic + frontend UI all present and connected), as of this documentation pass. Organized by role/module.

---

## Authentication & Account Management
- JWT-based login (`/api/auth/login`), 60-minute token expiry by default.
- Admin-only account provisioning (no public self-registration) — creates a `User` with no password, emails a "set your password" link valid 48 hours.
- Password set (first-time) and forgot-password (reset) flows, sharing one single-use, expiring token mechanism.
- Change password (while logged in) via a modal from the sidebar, with a live password-strength meter (length/case/digit/symbol scoring).
- Account activation/deactivation (soft-disable, preserves history) and permanent deletion (admin only; self-deletion and deleting other admins are both blocked).
- Resend account-setup email for accounts that haven't completed setup.
- Global 401 handling: any expired/invalid token anywhere in the app force-logs-out and redirects to `/login`.
- Role-based route protection on the frontend (`ProtectedRoute`) mirroring backend role checks.

## Admin Console
- Dashboard with live stat cards: course count, teacher count, student count, and accounts pending password setup.
- Course CRUD (create; list with per-course teacher(s) and student count).
- Assign/unassign teachers to a course.
- Enroll/unenroll students to a course, by email **or** registration number.
- User list with role filtering, search-by-role tabs.

## Teacher — Course & Materials
- View assigned courses (read-only roster access, no self-assignment).
- Upload lecture PDFs (background-ingested for RAG — status visible as Processing → Ready/Indexed → Failed, with live polling).
- View/download any uploaded lecture PDF.
- Delete a lecture PDF (also purges its vector chunks from ChromaDB).
- View course roster (read-only — enrollment changes are admin-only).

## Teacher — Assignments & Grading
- Create an assignment with an inline, dynamic rubric builder (add/remove criteria, live total-marks calculation, optional due date/time).
- View all assignments for a course with due-date status (open/closed) and rubric summary.
- Delete an assignment (cascades submissions + files on disk).
- View all submissions for an assignment with live status (Processing / Extracted / Ready for review / Graded / Failed) and per-student badge indicators.
- View AI-generated rubric scoring + structured feedback (per-criterion good/missing notes, strengths, weaknesses, improvement suggestions, summary) before finalizing.
- Edit/override any AI-suggested score per criterion, add free-text comments, and finalize the grade (one-shot — cannot be re-edited afterward).
- View/download a student's raw submitted PDF.
- View OCR-extracted text (for scanned submissions) with a visible confidence percentage, collapsible.
- Extend an assignment's deadline via a modal (date/time + optional reason), with an audit-trail history viewer showing every past change and who made it.

## Student — Course & Materials
- View enrolled courses on a dashboard.
- View course lecture materials list; view/download any indexed lecture PDF.
- Course description shown alongside materials.

## Student — Assignments & Submissions
- View all posted assignments with the marking rubric shown before submitting.
- Submit a PDF (blocked once the deadline passes).
- Live status tracking of a submission (auto-polls while processing/grading).
- Delete/resubmit a submission (only before the deadline and before it's been graded).
- View/download their own submitted PDF.
- View the final grade once a teacher approves it: total score, per-criterion breakdown with AI good/missing notes, strengths/weaknesses/improvements, teacher's own comments, and whether the AI's original score was overridden.
- Submissions and grades lock automatically once the deadline passes or a grade is finalized (UI reflects this with a "locked" state and disables further edits).

## Achievement / Badge System
- Three actively-awarded badge types: **First Submitter** 🚀 (earliest valid pre-deadline submission, evaluated only after the deadline passes), **High Achiever** 🏆 (highest graded score on an assignment, ties fully supported), **Perfect Score** 💯 (100% of rubric total marks).
- Badges shown: on the student dashboard (showcase card), inline on each assignment card (student view), and next to each student's name in the teacher's submissions roster.
- Badge awarding is idempotent and automatically re-evaluated at multiple natural trigger points (deadline extension, opening the submissions list, fetching badges, finalizing a review) — no manual "run evaluation" action needed.
- Earned badges are surfaced to the AI chatbot's context, so students can ask about their own achievements conversationally.

## AI Chatbot (per course, student-facing)
- Real-time **streaming** responses (token-by-token) with a working Stop/cancel button (via `AbortController`).
- Automatic intent classification (LMS/logistics vs. lecture-content vs. hybrid) routing to the right context source(s), invisible to the user.
- Answers grounded in real course data: assignment due dates, submission/grading status, rubric marks, teacher names, enrollment counts, earned badges — pulled live from PostgreSQL, not the LLM's imagination.
- Answers grounded in lecture content via semantic search over uploaded PDFs (ChromaDB), including natural references like "the first lecture" or "lecture 2" resolved to the correct uploaded file.
- Response caching (5-minute TTL) so repeated/near-identical questions return instantly.
- Graceful "not enough information" fallback when a course has no materials or assignments yet, instead of a hallucinated answer.
- Per-message error handling in the UI (distinguishes "you don't have access" from generic failures) and a distinct "generation stopped" state for user-cancelled responses.

## OCR & Document Processing
- Automatic typed-text extraction for digital PDFs (no OCR needed, fast path).
- Automatic OCR fallback (Tesseract, with image denoising + adaptive thresholding preprocessing) for scanned/image-only PDF pages, with per-word confidence scoring.
- Submissions with unreliably-low OCR confidence are automatically flagged as failed (with a message asking the student to resubmit a clearer scan) rather than silently AI-graded on garbage text.
- Sentence-aware text chunking for lecture material (never splits mid-sentence), preserving semantic and readability quality for both embedding and LLM context use.

## Performance & Operations
- In-memory TTL caching for both LMS context strings and full chat responses, with targeted cache invalidation on data-changing operations (new assignment, deadline extension).
- LRU caching of query embeddings so repeated questions across any user/course skip re-encoding.
- Server-side performance telemetry (per-stage timing breakdown) logged for every chatbot query.
- Ollama model warmup on backend startup to avoid a slow first request.
- Standalone benchmark script (`benchmark_chat.py`) for manually re-verifying pipeline latency.
