# SmartEdu — Project Architecture

## 1. Repository Layout

```
smartedu/
├── backend/
│   ├── app/
│   │   ├── main.py                  FastAPI app instantiation, router registration, startup hooks
│   │   ├── config.py                Settings loaded from .env via python-dotenv
│   │   ├── database/
│   │   │   └── db.py                SQLAlchemy engine, SessionLocal, Base, get_db() dependency
│   │   ├── models/
│   │   │   └── models.py            All SQLAlchemy ORM models (single file)
│   │   ├── schemas/                 Pydantic request/response models, grouped per domain
│   │   │   ├── auth.py, admin.py, course.py, document.py, assignment.py, password.py
│   │   │   └── evaluation_service.py   ⚠ orphaned duplicate — see Pending_Tasks.md
│   │   ├── routers/                 FastAPI APIRouter modules, one per domain
│   │   │   ├── auth.py, password.py, admin.py, courses.py, documents.py
│   │   │   ├── assignments.py, badges.py, chat.py
│   │   ├── services/                Business logic / orchestration layer
│   │   │   ├── rag_service.py          RAG pipeline orchestration (ingest + answer)
│   │   │   ├── intent_classifier.py    Rule-based question intent classifier
│   │   │   ├── lms_context_service.py  Builds structured LMS text context for the LLM
│   │   │   ├── cache_service.py        In-memory TTL cache (LMS context + chat responses)
│   │   │   ├── ocr_service.py          PDF text extraction + OCR + chunking
│   │   │   ├── evaluation_service.py   AI rubric-based grading of submissions
│   │   │   ├── badge_service.py        Achievement seeding + evaluation + retrieval
│   │   │   └── email_service.py        Transactional email sending (SMTP)
│   │   ├── rag/
│   │   │   ├── embeddings.py        SentenceTransformer wrapper (+ LRU query cache)
│   │   │   ├── vector_store.py      ChromaDB client wrapper
│   │   │   └── llm_chain.py         ⚠ empty file (dead/unused)
│   │   └── utils/
│   │       ├── auth.py              JWT + bcrypt password hashing + FastAPI auth dependencies
│   │       ├── tokens.py            Password-reset/setup single-use token generation
│   │       ├── metrics.py           PipelineMetrics performance telemetry class
│   │       └── file_utils.py        ⚠ empty file (dead/unused)
│   ├── create_tables.py             One-shot DB schema creation script
│   ├── benchmark_chat.py            Standalone perf benchmark script for the chat pipeline
│   ├── requirements.txt
│   └── uploads/, chroma_db/ (runtime data directories, git-ignored)
│
└── frontend/
    ├── src/
    │   ├── main.jsx                 React root render + ErrorBoundary
    │   ├── App.jsx                  BrowserRouter + all route definitions
    │   ├── theme.js                 Single source of truth for design tokens (colors, type scale)
    │   ├── context/AuthContext.jsx  Auth state (localStorage-backed) + login/logout
    │   ├── components/
    │   │   ├── Layout.jsx           Sidebar shell + shared primitives (Btn, Card, Input, Alert, etc.)
    │   │   ├── ProtectedRoute.jsx   Role-gated route wrapper
    │   │   ├── ChangePasswordModal.jsx
    │   │   ├── BadgePill.jsx        Badge chip with hover tooltip
    │   │   ├── StatusBadge.jsx, SubmissionStatusBadge.jsx, CourseTabs.jsx   ⚠ unused legacy components
    │   │   ├── teacher/AssignmentsPanel.jsx   Teacher: create/list/delete assignments
    │   │   └── student/AssignmentsPanel.jsx   Student: view/submit/track assignments + badges
    │   ├── pages/
    │   │   ├── Login.jsx, ForgotPassword.jsx, SetPassword.jsx
    │   │   ├── TeacherDashboard.jsx, TeacherCourseDetail.jsx, TeacherSubmissions.jsx
    │   │   ├── StudentDashboard.jsx, StudentCourseDetail.jsx (incl. chat UI)
    │   │   └── admin/AdminDashboard.jsx, AdminUsers.jsx, AdminCourses.jsx, AdminCourseDetail.jsx
    │   ├── api/                     One thin axios wrapper module per backend router
    │   │   ├── client.js            Configured axios instance (baseURL, JWT interceptor, 401 handler)
    │   │   ├── auth.js, password.js, admin.js, courses.js, documents.js, assignments.js, badges.js, chat.js
    │   └── utils/errorMessage.js    Normalizes FastAPI/Pydantic error payloads into a display string
    └── package.json
```

---

## 2. Frontend Architecture

### 2.1 Framework & Tooling
- **React 19** + **Vite 8** (dev server + build), **React Router v7** for client-side routing.
- **No component library.** All UI is hand-built with inline `style={{...}}` objects, sourced from constants in `src/theme.js` (`C` = color tokens, `T` = typography scale, `ROLE_COLORS`).
- **Tabler Icons** (`<i className="ti ti-xxx" />`) used throughout for iconography (loaded via CSS, not a React icon library).
- A small amount of **Tailwind CSS** is configured (`tailwindcss`, `postcss`, `autoprefixer` in `package.json`) but only used in a few leftover/legacy files (`SetPassword.jsx`, `StatusBadge.jsx`, `SubmissionStatusBadge.jsx`, `CourseTabs.jsx`) — the rest of the app does not use Tailwind classes.

### 2.2 Application Shell
- `App.jsx` wraps everything in `<BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>`.
- Routes are statically declared; each protected route is wrapped in `<ProtectedRoute requiredRole="...">`, which redirects to `/login` if unauthenticated, or to the user's role-home if the role doesn't match.
- `HomeRedirect` (`/`) sends the user to `/admin`, `/teacher`, or `/student` based on `user.role`.
- `Layout.jsx` is the persistent chrome for every authenticated page: a collapsible dark sidebar (desktop), icon-only sidebar (tablet, 768–1023px), and a slide-out drawer (mobile, <768px). It also exports a set of shared primitives used across nearly every page: `PageShell`, `Card`, `CardHeader`, `Btn`, `Badge`, `Alert`, `Input`, `Select`.
- The sidebar's navigation is **contextual**: for teachers/students it shows a "Dashboard" link plus, when on a specific course's detail page (`:courseId` present in the URL), a sub-nav of tabs (`materials` / `assignments` / `students` for teachers; `materials` / `assignments` / `chatbot` for students) driven by a `?tab=` query parameter rather than nested routes.

### 2.3 State Management
- No Redux/Zustand/Context-heavy state management. Each page fetches its own data with `useEffect` + local `useState`.
- The only global state is **auth** (`AuthContext`): current user object (`{ id, fullName, role }`) is kept in React state and mirrored to `localStorage` (`token`, `user`) so it survives page reloads.
- `client.js` (axios instance) attaches the JWT from `localStorage` to every request via a request interceptor, and force-logs-out (redirects to `/login`, clears storage) on any `401` response that isn't itself a login/register call.

### 2.4 API Layer
- One module per backend router under `src/api/`, each exporting plain functions that wrap `client.get/post/patch/delete`. No data-fetching library (no React Query/SWR) — components call these directly inside `useEffect`/event handlers and manage loading/error state themselves.

### 2.5 Data Flow Pattern (typical page)
```
Component mounts
  → useEffect calls api/*.js function
    → axios (client.js) attaches JWT, sends request
      → backend responds
    → setState() with response data
  → conditionally polls via setInterval for async background work
    (submission grading status, document ingestion status)
    until status leaves a "processing" state, then clears the interval
```
This polling pattern is used in three places: `TeacherCourseDetail.jsx` (document ingestion status), `StudentAssignmentsPanel.jsx` (submission grading status), `TeacherSubmissions.jsx` (submission grading status).

### 2.6 Streaming (Chat) Data Flow
Unlike the rest of the app, the chatbot does **not** use axios/JSON — it uses the raw `fetch()` API to consume a streamed `text/plain` HTTP response body (see `Chatbot_Architecture.md` for full detail).

---

## 3. Backend Architecture

### 3.1 Framework & Structure
- **FastAPI** application (`app/main.py`) composed of independent `APIRouter` modules, each mounted under an `/api/<domain>` prefix.
- Standard **3-layer separation**:
  1. **Routers** (`app/routers/*.py`) — HTTP concerns only: request parsing (Pydantic schemas), auth dependency injection, calling into services/models, shaping the HTTP response.
  2. **Services** (`app/services/*.py`) — business logic: the RAG pipeline, OCR/extraction, AI grading, badge evaluation, email sending. Several services are also used as **FastAPI `BackgroundTasks`** entry points (`ingest_document_task`, `evaluate_submission_task`) — these open their **own** `SessionLocal()` DB session rather than reusing the request-scoped one, since the request (and its session) will have already completed and closed by the time the background task runs.
  3. **Models** (`app/models/models.py`) — SQLAlchemy ORM models, all in a single file.
- **Dependency injection**: `Depends(get_db)` supplies a scoped `Session` per request (closed in a `finally` block); `Depends(get_current_user)` / `Depends(require_role("teacher"))` supply the authenticated `User` and enforce role checks.

### 3.2 Authorization Model
- JWT bearer tokens (`python-jose`), signed with `HS256` using `SECRET_KEY` from `.env`, containing `{"sub": user_id, "role": role, "exp": ...}`. Default expiry: 60 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- Two authorization primitives, both in `app/utils/auth.py`:
  - `get_current_user` — decodes the token, loads the `User`, rejects if missing/inactive.
  - `require_role(role)` — a dependency **factory**; wraps `get_current_user` and additionally 403s if `user.role != role`.
- **Resource-level authorization** (does this teacher/student actually have access to *this* course?) is handled separately by `get_course_for_access()` in `app/routers/courses.py`, called explicitly at the top of nearly every course-scoped route across `documents.py`, `assignments.py`, and `chat.py`. It checks `TeacherCourseAssignment` for teachers and `Enrollment` for students; admins bypass the check entirely.

### 3.3 Background Processing Model
FastAPI's `BackgroundTasks` (in-process, no external queue like Celery/RQ) is used for anything slow enough to block a request:
- **Document ingestion** (`ingest_document_task`, in `rag_service.py`) — triggered from `POST /api/documents/{course_id}/upload`.
- **Submission evaluation** (`evaluate_submission_task`, in `evaluation_service.py`) — triggered from `POST /api/assignments/{assignment_id}/submit`.

Both tasks run OCR/extraction, then embedding or LLM scoring, and finish by updating a `status` column on the `Document`/`Submission` row that the frontend polls for. There is no retry/dead-letter mechanism — a failed task simply sets `status = "failed"` with an `error_message`.

### 3.4 Caching Layer
`app/services/cache_service.py` implements a simple thread-safe, in-memory **TTL cache** (`TTLCache`, dict + lock, no external cache server like Redis). Two global instances:
- `lms_context_cache` (60s TTL) — caches the per-`(course_id, student_id)` LMS context string built by `lms_context_service.build_lms_context`.
- `response_cache` (300s TTL) — caches full chatbot answers keyed by `(course_id, student_id, normalized_question)`.

Both are explicitly invalidated (`.clear()`) whenever underlying data changes — e.g. `assignments.py` calls `lms_context_cache.clear()` after creating an assignment or extending a deadline, so the chatbot immediately reflects the change rather than waiting out the TTL.

Because this cache is a Python process-local dict, **it does not work correctly across multiple backend worker processes** (e.g. `uvicorn --workers N>1`) — see `Pending_Tasks.md`.

### 3.5 AI Architecture

Two independent LLM call sites, both going through the same local **Ollama** server running a **Mistral** model (`OLLAMA_MODEL` env var, default `"mistral"`):

1. **Chatbot inference** (`rag_service.answer_question` / `answer_question_stream`) — low temperature (0.2), constrained context window (2048 tokens), `num_predict=400`.
2. **Assignment grading** (`evaluation_service.evaluate_submission_task`) — even lower temperature (0.15), larger context window (6144 tokens) to fit rubric + submission excerpt, `num_predict=1000`, and expects a strict JSON response that's defensively parsed out of the raw model output.

Both are synchronous Ollama calls (`ollama.chat(...)`) — grading always is; chat has both a synchronous (`answer_question`) and a streaming (`answer_question_stream`, `stream=True`) variant, with the streaming path used by the production chat UI.

Embeddings are generated locally via **sentence-transformers** (`all-MiniLM-L6-v2`, 384-dim), loaded once at process startup (module import time in `app/rag/embeddings.py`) — this is why importing `app.main` triggers a one-time "Loading embedding model…" console message and a short delay.

Vector storage is **ChromaDB**, running as a local **persistent client** (`chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)`, default `./chroma_db`) — not a separate server process. One Chroma **collection per course** (`course_{course_id}`), using cosine similarity (`hnsw:space: cosine`).

See `Chatbot_Architecture.md` for the full RAG/retrieval/streaming pipeline, and `Assignment_Evaluation_System.md` for the grading pipeline.

---

## 4. Data Flow Diagrams

### 4.1 Authentication
```
Admin creates account (POST /api/admin/users)
        │
        ▼
User row created (password_hash=NULL, has_set_password=False)
        │
        ▼
create_reset_token() → PasswordResetToken (48h expiry)
        │
        ▼
send_account_setup_email() → link: FRONTEND_URL/set-password?token=...
        │
        ▼
User clicks link → SetPassword.jsx → POST /api/password/set
        │
        ▼
Token validated + consumed (single use) → password_hash set, has_set_password=True
        │
        ▼
User can now POST /api/auth/login → JWT issued → stored in localStorage
```

### 4.2 Lecture Document Ingestion (RAG indexing)
```
Teacher uploads PDF  (POST /api/documents/{course_id}/upload)
        │
        ▼
Document row created (status="processing"), file saved to UPLOAD_DIR
        │
        ▼  [BackgroundTask: ingest_document_task]
extract_text_from_pdf()  ──▶  typed text via PyMuPDF, OR OCR via Tesseract per page
        │
        ▼
chunk_text()  →  sentence-aware chunks (~500 chars, 100 overlap)
        │
        ▼
get_embeddings()  →  SentenceTransformer vectors (batch)
        │
        ▼
add_chunks_to_collection()  →  ChromaDB collection "course_{id}"
        │
        ▼
Document.status = "indexed", chunk_count = N   (or "failed" + error_message)
```

### 4.3 Assignment Submission & Grading
```
Student submits PDF  (POST /api/assignments/{id}/submit)
        │
        ▼
Submission row created (status="processing"), file saved
        │
        ▼  [BackgroundTask: evaluate_submission_task]
extract_text_from_pdf()  →  {text, method, confidence, low_confidence}
        │
        ├─ low_confidence / empty text → status="failed", stop
        │
        ▼
status="extracted"
        │
        ▼
Load Assignment → Rubric → RubricCriterion[]
        │
        ▼
Build grading prompt (rubric + representative excerpt of submission text)
        │
        ▼
ollama.chat()  →  JSON: criteria_scores, criteria_feedback, strengths, weaknesses, summary
        │
        ▼
Clamp scores to each criterion's max_marks  →  AIEvaluation row created
        │
        ▼
status="ai_evaluated"          ◀── Teacher now sees this in TeacherSubmissions.jsx
        │
        ▼
Teacher reviews (POST /api/assignments/submissions/{id}/review)
        │
        ▼
FinalGrade row created, Submission.status="teacher_reviewed"
        │
        ▼
evaluate_assignment_badges()  →  High Achiever / Perfect Score badges possibly awarded
        │
        ▼
Student sees final grade + AI feedback in AssignmentsPanel.jsx
```

### 4.4 Chatbot Query (Streaming)
```
Student types a question in StudentCourseDetail.jsx (chatbot tab)
        │
        ▼
fetch() POST /api/chat/stream  (raw fetch, not axios — needs a readable stream)
        │
        ▼
chat_stream() router: auth + course-access check
        │
        ▼  generator: answer_question_stream()
response_cache lookup (course_id, student_id, normalized question)
        │  cache MISS
        ▼
classify_intent(question)  →  "lms" | "document" | "hybrid"
        │
        ├─ intent ∈ {lms, hybrid}   → build_lms_context()  (cached 60s per course+student)
        ├─ intent ∈ {document,hybrid} → resolve_lecture_ordinal() + search_similar_chunks()
        │
        ▼
Prompt assembled (system prompt + LMS context + doc excerpts + question)
        │
        ▼
ollama.chat(..., stream=True)  →  token-by-token generator
        │
        ▼  each token yielded immediately to the HTTP response (StreamingResponse)
Frontend reads response.body.getReader(), decodes chunks, updates the assistant bubble live
        │
        ▼
On stream completion: full answer cached (response_cache, 300s) + ChatHistory rows persisted
```

### 4.5 Badge Evaluation Trigger Points
```
evaluate_assignment_badges(assignment_id) is called from THREE places:

1. PUT  /api/assignments/{id}/extend-deadline     (deadline may have just passed/changed)
2. GET  /api/assignments/{id}/submissions          (teacher opens the submissions list)
3. GET  /api/assignments/{id}/badges               (explicit badge fetch)
4. POST /api/assignments/submissions/{id}/review   (after a teacher finalizes a grade)

Inside evaluate_assignment_badges():
   - First Submitter: only evaluated if now > assignment.due_date
        → earliest Submission (status != "failed", submitted_at <= due_date) wins
   - High Achiever: evaluated whenever any FinalGrade exists for this assignment
        → all students tied at the max total_score are awarded (ties supported)
   - Perfect Score: evaluated alongside High Achiever
        → any student whose total_score == rubric.total_marks is awarded
   All awards are idempotent (existence-checked before insert) via UniqueConstraint
   (student_id, achievement_id, assignment_id).
```
