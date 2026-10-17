# SmartEdu — Database Schema

Database: **PostgreSQL**, accessed via **SQLAlchemy 2.0** ORM. All models live in `backend/app/models/models.py`. Schema is created by running `backend/create_tables.py` (`Base.metadata.create_all`) — there is no Alembic migration history in the repo despite Alembic being an installed dependency.

Timestamps use `server_default=func.now()` (DB-generated, UTC-naive). No `updated_at` columns exist anywhere in the schema — rows are either immutable after creation or mutated in place with no modification timestamp.

---

## 1. Entity Overview

| Table | Purpose |
|---|---|
| `users` | All accounts — admin, teacher, student (single-table, role column) |
| `courses` | A course offering |
| `teacher_course_assignments` | Many-to-many: which teachers teach which courses |
| `enrollments` | Many-to-many: which students are enrolled in which courses |
| `documents` | Uploaded lecture PDFs + their RAG-ingestion status |
| `chat_history` | Persisted chatbot conversation turns |
| `rubrics` | A scoring rubric, one per assignment |
| `rubric_criteria` | Individual scoring criteria within a rubric |
| `assignments` | An assignment posted to a course |
| `submissions` | A student's submitted PDF for an assignment |
| `ai_evaluations` | The AI's rubric-based scoring of a submission |
| `final_grades` | The teacher-approved/overridden final grade |
| `password_reset_tokens` | Single-use tokens for password set/reset |
| `achievements` | Catalog of badge types (system-seeded) |
| `student_achievements` | A badge earned by a specific student |
| `assignment_deadline_histories` | Audit trail of deadline extensions |

---

## 2. Entity-Relationship Diagram

```
users (1)───────< teacher_course_assignments >───────(1) courses
users (1)───────< enrollments >───────────────────────(1) courses
users (1)───────< courses.created_by (admin)
courses (1)─────< documents
courses (1)─────< rubrics
courses (1)─────< enrollments
courses (1)─────< teacher_course_assignments

rubrics (1)──────< rubric_criteria
rubrics (1)──────< assignments

assignments (1)──< submissions
assignments (1)──< assignment_deadline_histories
assignments (1)──< student_achievements (nullable FK)

submissions (1)──(0..1) ai_evaluations
submissions (1)──(0..1) final_grades

users (1, student)───< submissions
users (1, admin/teacher via reviewed_by)───< final_grades

users (1)────────< chat_history >────────(1) courses

users (1)────────< password_reset_tokens

achievements (1)─< student_achievements >─(1) users (student)
courses (1)──────< student_achievements
```

---

## 3. Table Definitions

### 3.1 `users`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `email` | String(255), unique, not null, indexed | Login identifier |
| `password_hash` | String(255), nullable | `NULL` until the user completes account setup; bcrypt via passlib |
| `full_name` | String(255), not null | |
| `role` | String(20), not null | `"admin"` \| `"teacher"` \| `"student"` — enforced only at the Pydantic validation layer, **not** a DB constraint/enum |
| `is_active` | Boolean, default `True` | Soft-disable flag; deactivated users can't log in |
| `created_at` | DateTime, server default now | |
| `registration_number` | String(50), unique, nullable | Required for students, forbidden for teachers/admins (enforced in `AdminCreateUser` Pydantic validator) |
| `has_set_password` | Boolean, not null, default `False` | Gate on login — must be `True` to authenticate |

Relationships: `teaching_assignments` (→ `TeacherCourseAssignment`), `enrollments` (→ `Enrollment`), `courses_created` (→ `Course`, as admin creator).

### 3.2 `courses`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `name` | String(255), not null | |
| `code` | String(50), unique, not null | e.g. `"CS101"` |
| `description` | Text, nullable | |
| `created_by` | Integer, FK → `users.id`, not null | The admin who created it |
| `created_at` | DateTime, server default now | |

Relationships: `created_by_admin`, `teacher_assignments` (cascade delete-orphan), `documents` (cascade delete-orphan), `enrollments` (cascade delete-orphan).

### 3.3 `teacher_course_assignments`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `teacher_id` | Integer, FK → `users.id`, `ondelete=CASCADE`, indexed | |
| `course_id` | Integer, FK → `courses.id`, `ondelete=CASCADE`, indexed | |
| `assigned_by` | Integer, FK → `users.id`, not null | Admin who made the assignment |
| `assigned_at` | DateTime, server default now | |

Constraint: `UNIQUE(teacher_id, course_id)` — a teacher can't be assigned to the same course twice.

### 3.4 `enrollments`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `student_id` | Integer, FK → `users.id`, `ondelete=CASCADE` | |
| `course_id` | Integer, FK → `courses.id`, `ondelete=CASCADE` | |
| `enrolled_by` | Integer, FK → `users.id`, not null | Admin who enrolled the student |
| `enrolled_at` | DateTime, server default now | |

Constraint: `UNIQUE(student_id, course_id)`.

### 3.5 `documents`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `course_id` | Integer, FK → `courses.id`, `ondelete=CASCADE`, not null | |
| `uploaded_by` | Integer, FK → `users.id`, not null | The teacher who uploaded it |
| `filename` | String(255), not null | Original filename |
| `file_path` | String(500), not null | Local disk path (`UPLOAD_DIR/doc_{id}_{filename}`) |
| `status` | String(30), default `"processing"` | `"processing"` → `"indexed"` \| `"failed"` |
| `chunk_count` | Integer, default `0` | Number of vector chunks stored for this doc |
| `error_message` | Text, nullable | Populated on ingestion failure |
| `created_at` | DateTime, server default now | Also used to order lectures for "Lecture 1 / 2 / ..." ordinal resolution |

### 3.6 `chat_history`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `student_id` | Integer, FK → `users.id`, not null | |
| `course_id` | Integer, FK → `courses.id`, not null | |
| `message` | Text, not null | |
| `role` | String(20), not null | `"user"` \| `"assistant"` |
| `created_at` | DateTime, server default now | |

Note: rows are written after both the streaming and non-streaming chat endpoints complete, but are **never read back** anywhere in the codebase (no endpoint returns chat history, no UI displays past sessions across reloads — the frontend chat state is in-memory only and resets on navigation/refresh). See `Pending_Tasks.md`.

### 3.7 `rubrics`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `course_id` | Integer, FK → `courses.id`, `ondelete=CASCADE`, not null | |
| `created_by` | Integer, FK → `users.id`, not null | |
| `title` | String(255), not null | Auto-generated as `"{assignment title} — Rubric"` |
| `total_marks` | Integer, not null | Sum of all criteria's `max_marks` |
| `created_at` | DateTime, server default now | |

Relationships: `criteria` (→ `RubricCriterion`, cascade delete-orphan), `assignments`.

Note: a `Rubric` is created 1:1 alongside each `Assignment` (not reusable across multiple assignments) — `assignments.py`'s `create_assignment` always creates a fresh rubric.

### 3.8 `rubric_criteria`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `rubric_id` | Integer, FK → `rubrics.id`, `ondelete=CASCADE`, not null | |
| `key` | String(50), not null | Slugified from label (lowercase, spaces→underscore) — used as the JSON key in AI scoring output |
| `label` | String(255), not null | Human-readable criterion name |
| `max_marks` | Integer, not null | |
| `description` | Text, nullable | |

### 3.9 `assignments`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `course_id` | Integer, FK → `courses.id`, `ondelete=CASCADE`, not null | |
| `created_by` | Integer, FK → `users.id`, not null | |
| `rubric_id` | Integer, FK → `rubrics.id`, not null | |
| `title` | String(255), not null | |
| `description` | Text, nullable | Instructions shown to students and fed into the AI grading prompt |
| `due_date` | DateTime, nullable | If `NULL`, the assignment never closes and First-Submitter badge logic never triggers |
| `created_at` | DateTime, server default now | |

Relationships: `rubric`, `submissions` (cascade delete-orphan), `deadline_history` (→ `AssignmentDeadlineHistory`, cascade delete-orphan).

### 3.10 `submissions`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `assignment_id` | Integer, FK → `assignments.id`, `ondelete=CASCADE` | |
| `student_id` | Integer, FK → `users.id`, `ondelete=CASCADE` | |
| `file_path` | String, nullable | Local disk path |
| `extracted_text` | Text, nullable | Cleaned OCR/PDF-extracted text |
| `extraction_method` | String(20), nullable | `"typed"` \| `"ocr"` |
| `extraction_confidence` | Integer, nullable | 0–100, average Tesseract word confidence (only set when OCR was used) |
| `status` | String(30), default `"processing"` | `"processing"` → `"extracted"` → `"ai_evaluated"` → `"teacher_reviewed"`, or `"failed"` at any point |
| `error_message` | Text, nullable | |
| `submitted_at` | DateTime, server default now | Used for "first submitter" badge ordering |
| `ai_score` | Float, nullable | **Declared but never populated anywhere in the codebase** (see `Pending_Tasks.md`) |
| `plagiarism_score` | Float, nullable | **Declared but never populated** — no plagiarism-detection logic exists |
| `detection_status` | String(30), default `"not_checked"`, nullable | **Declared but never updated** from its default |

Relationships: `assignment`, `ai_evaluation` (1:1, cascade delete-orphan), `final_grade` (1:1, cascade delete-orphan).

### 3.11 `ai_evaluations`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `submission_id` | Integer, FK → `submissions.id`, `ondelete=CASCADE`, unique, not null | Enforces 1:1 with `Submission` |
| `criteria_scores` | JSON, not null | `{criterion_key: score}` — clamped to each criterion's `max_marks` |
| `total_score` | Integer, not null | Sum of `criteria_scores` |
| `feedback` | Text, not null | JSON-serialized string containing `criteria_feedback[]`, `strengths[]`, `weaknesses[]`, `improvements[]`, `summary` |
| `raw_model_output` | Text, nullable | The raw, unparsed LLM response — kept for debugging |
| `evaluated_at` | DateTime, server default now | |

### 3.12 `final_grades`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `submission_id` | Integer, FK → `submissions.id`, `ondelete=CASCADE`, unique, not null | 1:1 with `Submission` |
| `reviewed_by` | Integer, FK → `users.id`, not null | The teacher who finalized it |
| `criteria_scores` | JSON, not null | Teacher's (possibly edited) scores |
| `total_score` | Integer, not null | |
| `teacher_comments` | Text, nullable | |
| `was_ai_overridden` | Boolean, default `False` | `True` if `criteria_scores != ai_evaluation.criteria_scores` |
| `reviewed_at` | DateTime, server default now | |

### 3.13 `password_reset_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `user_id` | Integer, FK → `users.id`, `ondelete=CASCADE`, not null | |
| `token` | String(255), unique, not null, indexed | `secrets.token_urlsafe(32)` |
| `expires_at` | DateTime, not null | 30 min (forgot-password) or 48h (account setup) from issuance |
| `used` | Boolean, default `False`, not null | Single-use enforcement |
| `created_at` | DateTime, server default now | |

Used for **both** "set initial password" (admin-created accounts) and "forgot password" flows — same table, same validation function (`validate_and_consume_token`).

### 3.14 `achievements`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `code` | String(50), unique, not null, indexed | e.g. `"first_submitter"` |
| `title` | String(100), not null | |
| `description` | Text, not null | |
| `badge_icon` | String(50), default `"ti-award"` | Tabler icon class suffix |
| `color_scheme` | String(50), default `"primary"` | Not actually consumed by the frontend — `BadgePill.jsx` hardcodes its own color map by `code` instead |
| `created_at` | DateTime, server default now | |

Seeded on backend startup (`seed_default_achievements`, called from `main.py`'s `startup_tasks`) with **5** rows: `first_submitter`, `high_achiever`, `perfect_score`, `consistent_performer`, `top_contributor`. Only the first three ever get awarded by any code path — see `Pending_Tasks.md`.

### 3.15 `student_achievements`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `student_id` | Integer, FK → `users.id`, `ondelete=CASCADE`, not null, indexed | |
| `achievement_id` | Integer, FK → `achievements.id`, `ondelete=CASCADE`, not null | |
| `assignment_id` | Integer, FK → `assignments.id`, `ondelete=CASCADE`, nullable, indexed | `NULL` would represent a course-level (non-assignment-specific) badge, but nothing currently awards one that way |
| `course_id` | Integer, FK → `courses.id`, `ondelete=CASCADE`, not null, indexed | |
| `earned_at` | DateTime, server default now | |

Constraint: `UNIQUE(student_id, achievement_id, assignment_id)` — prevents a student earning the same badge twice for the same assignment (this is the idempotency mechanism for badge evaluation, which re-runs on multiple trigger points).

### 3.16 `assignment_deadline_histories`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer, PK | |
| `assignment_id` | Integer, FK → `assignments.id`, `ondelete=CASCADE`, not null, indexed | |
| `previous_due_date` | DateTime, nullable | `NULL` if the assignment previously had no deadline |
| `new_due_date` | DateTime, not null | |
| `updated_by` | Integer, FK → `users.id`, not null | The teacher who made the change |
| `updated_at` | DateTime, server default now | |
| `reason` | Text, nullable | Optional free-text reason entered by the teacher |

---

## 4. Notable Schema Observations

- **No `updated_at` audit columns** anywhere — deadline changes are the only mutation type that gets its own audit trail, via a separate history table rather than versioning the `assignments` row itself.
- **`role` is a free string**, not a Postgres enum or a separate `roles` table — validity is enforced only at the Pydantic (`AdminCreateUser`) layer on account creation, so a direct DB write could set an invalid role.
- **Cascading deletes are used aggressively** (`ondelete="CASCADE"` on nearly every FK), meaning deleting a `User`, `Course`, `Assignment`, or `Submission` cascades through essentially the entire dependent object graph (enrollments, submissions, grades, badges, chat history is the one exception — `ChatHistory.student_id`/`course_id` have **no** `ondelete` clause set, so deleting a user or course with existing chat history would raise a FK violation rather than cascading).
- **`Submission.ai_score`, `Submission.plagiarism_score`, `Submission.detection_status`** exist on the model but are dead columns — always `NULL`/default, never written to by any service.
- Badge idempotency relies entirely on the composite unique constraint plus an existence check in `badge_service.evaluate_assignment_badges` before each insert — there's no separate "evaluation run" tracking table.
