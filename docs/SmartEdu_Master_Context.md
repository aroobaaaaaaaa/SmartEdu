# SmartEdu — Master Context

> This document is the top-level entry point for understanding the SmartEdu project. It is written to give a future Claude conversation (or a new engineer) enough context to work on this codebase without needing to re-read every file. All statements below are derived directly from the code as it exists in the repository — nothing is speculative.

---

## 1. What SmartEdu Is

SmartEdu is a full-stack **Learning Management System (LMS)** for a fictional institution called **"Alpha Education Network" / "Alpha College"**. It combines traditional LMS functionality (course management, enrollment, lecture materials, assignments, grading) with an **AI layer**:

- A **Retrieval-Augmented Generation (RAG) chatbot** that answers student questions using both course/LMS data and uploaded lecture PDFs.
- An **AI-assisted assignment grading pipeline** that OCRs/extracts submitted PDFs and produces rubric-based scores and feedback, which a teacher then reviews and finalizes.
- A **gamification layer** (achievement badges) that rewards students for being first to submit, scoring highest, or achieving a perfect score.

The system is a monorepo with two top-level folders:

```
smartedu/
├── backend/    FastAPI + PostgreSQL + ChromaDB + Ollama (Python)
└── frontend/   React 19 + Vite + React Router (JavaScript)
```

---

## 2. Business Purpose

SmartEdu digitizes the full lifecycle of a university course:

1. An **Admin** onboards the institution: creates courses, creates teacher/student accounts, assigns teachers to courses, and enrolls students.
2. A **Teacher** uploads lecture material (PDFs), creates assignments with a marking rubric, and reviews AI-generated grades before finalizing them.
3. A **Student** enrolls (via admin), reads lecture material, submits assignment PDFs, views AI-graded feedback once a teacher approves it, and asks an AI chatbot questions about the course (both structural/LMS questions like "when is Assignment 2 due" and content questions like "explain CPU scheduling").

The AI grading pipeline exists to reduce teacher workload on first-pass grading while keeping a human in the loop (teachers can override any AI-suggested score before it becomes final). The chatbot exists to give students a self-service way to ask about course logistics and lecture content without waiting on a teacher.

---

## 3. User Roles

There are exactly three roles, stored as a string column (`User.role`) with no dedicated roles table:

| Role | Created by | Key capabilities |
|---|---|---|
| **admin** | Seeded directly in the database (no self-registration) | Create courses, create teacher/student accounts, assign teachers to courses, enroll/unenroll students, activate/deactivate/delete accounts, resend account-setup emails |
| **teacher** | Admin (via `POST /api/admin/users`) | Upload lecture PDFs, create assignments + rubrics, view roster (read-only), review AI evaluations and finalize grades, extend assignment deadlines, view deadline history and awarded badges |
| **student** | Admin (via `POST /api/admin/users`, requires a `registration_number`) | View enrolled courses, view/download lecture PDFs, submit assignment PDFs, view final grades/feedback, chat with the AI assistant, view earned badges |

There is **no self-registration flow** in practice: `POST /api/auth/register` is referenced in `frontend/src/api/auth.js` but **no corresponding backend route exists** (`backend/app/routers/auth.py` only implements `/login`). All accounts are created by an admin, who triggers an email containing a "set your password" link (`/set-password?token=...`), valid for 48 hours.

---

## 4. Major Modules

| Module | Backend location | Frontend location |
|---|---|---|
| Auth & password management | `app/routers/auth.py`, `app/routers/password.py`, `app/utils/auth.py`, `app/utils/tokens.py` | `src/pages/Login.jsx`, `ForgotPassword.jsx`, `SetPassword.jsx`, `src/context/AuthContext.jsx` |
| Admin operations (users/courses) | `app/routers/admin.py` | `src/pages/admin/*` |
| Course access (teacher/student read) | `app/routers/courses.py` | `src/pages/TeacherCourseDetail.jsx`, `StudentCourseDetail.jsx` |
| Lecture documents + ingestion | `app/routers/documents.py`, `app/services/rag_service.py` (ingestion half) | `src/api/documents.js` |
| Assignments, submissions, grading | `app/routers/assignments.py`, `app/services/evaluation_service.py`, `app/services/ocr_service.py` | `src/components/teacher/AssignmentsPanel.jsx`, `src/components/student/AssignmentsPanel.jsx`, `src/pages/TeacherSubmissions.jsx` |
| Achievements / badges | `app/routers/badges.py`, `app/services/badge_service.py` | `src/components/BadgePill.jsx`, `src/api/badges.js`, integrated into `StudentDashboard.jsx`, `AssignmentsPanel.jsx` (student), `TeacherSubmissions.jsx` |
| AI Chatbot / RAG | `app/routers/chat.py`, `app/services/rag_service.py`, `app/services/intent_classifier.py`, `app/services/lms_context_service.py`, `app/rag/*` | `src/pages/StudentCourseDetail.jsx` (chat tab), `src/api/chat.js` |
| Caching / performance | `app/services/cache_service.py`, `app/utils/metrics.py`, `backend/benchmark_chat.py` | — |

---

## 5. High-Level Architecture

```
┌──────────────────────────┐        HTTPS/JSON, JWT Bearer         ┌───────────────────────────────────────┐
│   React SPA (Vite)       │ ───────────────────────────────────▶ │   FastAPI backend (uvicorn)            │
│   frontend/src           │ ◀─────────────────────────────────── │   backend/app                          │
└──────────────────────────┘        REST + streaming (chat)        └───────────────────────────────────────┘
                                                                              │            │            │
                                                                              ▼            ▼            ▼
                                                                    ┌────────────┐ ┌──────────────┐ ┌──────────┐
                                                                    │ PostgreSQL │ │  ChromaDB     │ │  Ollama  │
                                                                    │ (SQLAlchemy)│ │ (persistent  │ │ (Mistral │
                                                                    │            │ │  vector DB)  │ │  model)  │
                                                                    └────────────┘ └──────────────┘ └──────────┘
```

- Backend: **FastAPI** (Python), **SQLAlchemy** ORM over **PostgreSQL**, **ChromaDB** for vector storage (local persistent client), **Ollama** running a **Mistral** model locally for both chat and grading LLM calls, **Tesseract OCR** (via `pytesseract`) + **PyMuPDF** (`fitz`) for PDF text extraction, **sentence-transformers** (`all-MiniLM-L6-v2`) for embeddings.
- Frontend: **React 19** SPA built with **Vite 8**, **React Router v7**, **axios** for HTTP, no external UI kit — all styling is done with inline JS style objects sourced from a single `src/theme.js` design-token file (plus Tabler Icons via CSS classes, and a small amount of legacy Tailwind CSS present but largely unused).

---

## 6. Current Implementation Status

### Fully implemented and wired end-to-end
- JWT-based authentication with role-based route protection (`require_role`, `get_current_user`).
- Admin-provisioned account creation with email-based password setup and reset flows (Gmail SMTP).
- Course CRUD (admin), teacher assignment, student enrollment (by email or registration number).
- Lecture PDF upload → background ingestion (OCR/text extraction → sentence chunking → embedding → ChromaDB storage).
- Assignment creation with inline rubric builder (dynamic criteria + max marks).
- Student PDF submission → background OCR/extraction → LLM rubric-based scoring → teacher review/override → final grade.
- Deadline extension with full audit trail (`AssignmentDeadlineHistory`).
- Achievement/badge system: First Submitter, High Achiever, Perfect Score (+ two unused seeded types, see `Pending_Tasks.md`), awarded automatically and surfaced in the UI and in the chatbot's LMS context.
- Hybrid RAG chatbot with intent classification, LMS-context injection, ChromaDB retrieval, lecture-ordinal resolution ("first lecture", "lecture 2"), response caching, and **token-streaming** replies.
- Performance telemetry (`PipelineMetrics`) logged server-side for every chatbot query.

### Partially implemented / inconsistent
- Two separate, drifted implementations of assignment AI evaluation exist in the codebase (see `Pending_Tasks.md` — one is dead code).
- Some frontend components (`StatusBadge.jsx`, `SubmissionStatusBadge.jsx`, `CourseTabs.jsx`) are unused legacy components that don't match the current Layout/theme system and are not imported anywhere.
- `frontend/src/pages/SetPassword.jsx` uses Tailwind utility classes while the rest of the app uses the inline-style `theme.js` system — this page has not been restyled to match.
- Frontend `register()` API call and `removeStudent()` API call reference backend endpoints that do not exist.

### Not implemented (see `Pending_Tasks.md` for full list)
- No automated tests (no test directories/files found in either `backend/` or `frontend/`).
- No plagiarism-detection logic despite `Submission.plagiarism_score` / `Submission.detection_status` columns existing on the model.
- No database migration tooling in active use: Alembic is listed in `requirements.txt` but there is no `alembic/` directory or migration scripts anywhere in the repo. Schema setup is a one-shot manual script, `backend/create_tables.py`, which calls `Base.metadata.create_all(bind=engine)`. This means schema changes (e.g. adding the `Achievement`/`StudentAchievement`/`AssignmentDeadlineHistory` tables) must be applied by re-running this script by hand — there is no migration history or rollback path.
- No `consistent_performer` / `top_contributor` badge-evaluation logic (achievements are seeded but never awarded).
