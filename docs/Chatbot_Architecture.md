# SmartEdu — Chatbot Architecture

This document covers the AI chatbot in depth: intent detection, RAG retrieval, LMS context generation, ChromaDB usage, Ollama usage, and the streaming pipeline. Primary source files: `app/routers/chat.py`, `app/services/rag_service.py`, `app/services/intent_classifier.py`, `app/services/lms_context_service.py`, `app/services/cache_service.py`, `app/rag/embeddings.py`, `app/rag/vector_store.py`, `app/utils/metrics.py`.

---

## 1. Overview

The chatbot is a **hybrid RAG system** — it does not always retrieve from the vector store. Every question first goes through a **rule-based intent classifier** that decides which data sources to consult:

- **`lms`** — questions about course structure/logistics (assignments, grades, deadlines, teacher info, enrollment, badges). Answered using a **structured text summary built directly from PostgreSQL** (not vector search).
- **`document`** — questions about lecture content (definitions, explanations, concepts). Answered using **ChromaDB vector retrieval** over uploaded lecture PDFs.
- **`hybrid`** — questions that need both (e.g. "which lecture should I study for Assignment 2?"), or when the classifier is uncertain (this is the **default fallback**).

Both context sources (when applicable) are concatenated into a single prompt sent to a local **Ollama** LLM (Mistral by default), which is instructed to answer strictly from the provided context.

---

## 2. Intent Classification

**File**: `app/services/intent_classifier.py`. Pure Python regex/keyword matching — **no LLM call**, runs in under ~0.5ms (verified by `benchmark_chat.py`).

Algorithm (`classify_intent(question) -> "lms" | "document" | "hybrid"`):
1. Lowercase + strip the question.
2. Check against a fixed list of **hybrid trigger regex patterns** first (e.g. `for (assignment|homework|exam|test|quiz)`, `which lecture`, `study for`, `prepare for`, `concept.*assignment`). Any match → immediately return `"hybrid"`.
3. Otherwise, count keyword hits against two fixed keyword sets:
   - `LMS_KEYWORDS`: `assignment`, `grade`, `due`, `deadline`, `submission`, `teacher`, `enrolled`, `rubric`, `status`, `progress`, etc.
   - `DOCUMENT_KEYWORDS`: `explain`, `define`, `concept`, `summarize`, `chapter`, `theory`, `formula`, `algorithm`, etc.
4. Decision: both sets hit → `"hybrid"`. Only LMS hits → `"lms"`. Only document hits → `"document"`. Neither → `"hybrid"` (safe default, retrieves from both sources).

This is deliberately simple/fast rather than accurate — it trades occasional misclassification for near-zero latency and no LLM round-trip cost per query.

---

## 3. LMS Context Generation

**File**: `app/services/lms_context_service.py`, function `build_lms_context(course_id, student_id, db) -> str`.

Builds a **compact, information-dense plain-text summary** (not JSON) of everything the LLM might need to answer a logistics question — this is the string injected into the prompt as `LMS CONTEXT:`. It is built with a small number of batched SQL queries (not per-row N+1 queries) and then cached.

Steps:
1. **Cache check** — `lms_context_cache.get((course_id, student_id))`; if present, return immediately (60s TTL).
2. Load the `Course`, its assigned teacher(s) (joined name string), and enrollment count.
3. Load all **indexed** `Document`s (lecture PDFs) ordered by `created_at` — used to build the "Lectures" section with ordinal labels (`Lecture 1 (First Lecture)`, ..., marking the most recent as `[Latest Upload]`).
4. Load all `Assignment`s for the course, plus in **batched** queries: rubric total marks per assignment, this student's `Submission` per assignment, `FinalGrade` per those submissions, and a submission-count-per-assignment aggregate (`GROUP BY`).
5. Load this student's earned `StudentAchievement` rows (joined to `Achievement`) for this course — formatted as `"{badge title} ({assignment title})"`.
6. Assemble a line-oriented text block, e.g.:
   ```
   [Course] Data Structures (CS201) | Instructor: Jane Doe | Enrolled: 42
   [Earned Badges] First Submitter (Assignment 1), Perfect Score (Assignment 2)
   [Lectures] Total: 3
    - Lecture 1 (First Lecture): intro.pdf
    - Lecture 2 (Second Lecture): trees.pdf
    - Lecture 3 (Third Lecture) [Latest Upload]: graphs.pdf
   [Assignments] Total: 2
    - Assignment 1: Max Marks=20, Due=12 Mar 2026 (PASSED), Total Subs=15, Status=GRADED (18/20) - Feedback: Well structured...
    - Assignment 2: Max Marks=30, Due=20 Apr 2026, Total Subs=3, Status=PENDING (not submitted)
   ```
   Per-assignment status is one of: `GRADED (score/max) - Feedback: ...`, `SUBMITTED (awaiting review)`, `SUBMISSION FAILED`, `PENDING (not submitted)`, `OVERDUE (not submitted)`.
7. Cache the result for 60s (`lms_context_cache.set(...)`), keyed by `(course_id, student_id)`.

**Cache invalidation**: explicitly cleared (not just left to expire) whenever an assignment is created or its deadline is extended (`assignments.py` calls `lms_context_cache.clear()`), so students immediately see updated deadlines in chat without waiting up to 60s.

**Why this matters architecturally**: the LLM is told in its system prompt to *trust LMS CONTEXT over prior chat history for dates, counts, and grades* and that *if a submission record exists, the assignment is NOT pending/overdue* — this is a deliberate anti-hallucination guardrail, since LLMs are otherwise prone to inventing plausible-sounding but wrong assignment statuses.

---

## 4. Lecture Ordinal Resolution

**File**: `rag_service.py`, function `resolve_lecture_ordinal(question, course_id, db)`.

Handles natural-language references to a specific lecture by position rather than filename — e.g. *"summarize lecture 2"*, *"explain the first lecture"*, *"what's in the latest lecture?"*. It:
1. Fetches all indexed `Document`s for the course, ordered by `created_at` (this ordering **is** the lecture numbering — there is no explicit `lecture_number` column).
2. Checks for "last/latest/most recent lecture" phrasing → resolves to the newest document.
3. Otherwise regex-matches ordinal expressions in two forms — `"lecture 2"` / `"lecture #2"` / `"lecture two"` / `"lecture 2nd"`, or `"second lecture"` / `"2nd lecture"` — against an `ORDINAL_MAP` covering words/digits 1–10.
4. Returns `(Document | None, target_index | None)`.

If resolved, the target document's filename is injected as a `NOTE:` line in the prompt ("'Lecture 2' refers to uploaded file: 'trees.pdf'"), **and** the vector search is filtered to only that document's chunks (`document_id` where-clause in `search_similar_chunks`) — so the LLM's retrieved excerpts come specifically from that lecture rather than being diluted by semantically-similar chunks from other lectures.

---

## 5. Document Retrieval (ChromaDB)

**Files**: `app/rag/vector_store.py`, `app/rag/embeddings.py`.

### 5.1 Storage
- **ChromaDB** persistent client (`chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)`) — an embedded, file-backed vector store, not a separately-run server process.
- **One collection per course**: `course_{course_id}`, created lazily via `get_or_create_collection`, configured with `hnsw:space: "cosine"` similarity.
- Each chunk is stored with: a random `uuid4` id, the chunk text (as Chroma's `documents`), its embedding vector, and metadata `{document_id, course_id, chunk_index}`.

### 5.2 Ingestion (write path)
Happens inside `ingest_document_task` (background task, triggered on PDF upload):
1. `extract_text_from_pdf()` — see `Assignment_Evaluation_System.md` §OCR for full detail on this shared extraction function.
2. `chunk_text(text, chunk_size=500, overlap=100)` — **sentence-aware** chunking (splits on `.!?` boundaries via regex, groups sentences up to `chunk_size` chars, carries a trailing overlap window of sentences into the next chunk). Deliberately avoids blind character-slicing, which would cut sentences mid-word and damage both embedding quality and LLM readability of the retrieved excerpt.
3. `get_embeddings(chunks)` — batch-encodes all chunks in one `SentenceTransformer.encode()` call.
4. `add_chunks_to_collection()` — bulk insert into the course's Chroma collection.
5. `Document.status = "indexed"`, `chunk_count = N` (or `"failed"` + `error_message` on any exception, including empty extraction or zero chunks).

### 5.3 Retrieval (read path)
`search_similar_chunks(course_id, query_embedding, n_results=3, max_distance=0.8, document_id=None)`:
1. Short-circuits to `[]` if the collection is empty.
2. If `document_id` is set (lecture-ordinal resolution matched), first runs a metadata-only `.get(where={"document_id": ...})` to check how many chunks exist for that document, then queries with `n_results = min(3, matched_count)` and the same `where` filter — so the search space is restricted to just that lecture.
3. Otherwise queries the whole collection (`n_results = min(3, total_chunks)`).
4. Post-filters results by cosine **distance threshold** (`max_distance=0.8`) — chunks beyond this distance are considered noise and dropped, *unless* filtering would remove every result, in which case the single closest chunk is kept anyway (better than returning nothing).

### 5.4 Deletion
- `delete_document_chunks(course_id, document_id)` — removes all chunks for one document (called when a teacher deletes a lecture PDF).
- `delete_course_collection(course_id)` — drops the entire collection (defined but **not called from anywhere** in the current codebase — courses are never deleted through the API, so this is currently dead code kept for future use).

### 5.5 Embeddings
**File**: `app/rag/embeddings.py`. Model: `sentence-transformers/all-MiniLM-L6-v2` (configurable via `EMBEDDING_MODEL` env var), loaded **once at module import time** (i.e., at backend process startup — this is the source of the "Loading embedding model..." console line seen when the app starts).
- `get_embeddings(texts)` — batch encode, used only during ingestion.
- `get_single_embedding(text)` — used for encoding a user's live question. Wrapped in an `@lru_cache(maxsize=1024)` internal function (`_cached_encode_single`) keyed on the stripped query text, so repeated identical questions across any student/course skip re-encoding entirely.

---

## 6. Prompt Construction

Both `answer_question` (non-streaming) and `answer_question_stream` (streaming) build an **identical prompt structure** in `rag_service.py`:

```
{SYSTEM_PROMPT}

LMS CONTEXT:
{build_lms_context output}          ← only if intent ∈ {lms, hybrid}

NOTE: 'Lecture N' refers to uploaded file: '{filename}'.   ← only if an ordinal was resolved

COURSE MATERIAL EXCERPTS:
[1]: {chunk text, truncated to 450 chars}
[2]: ...
[3]: ...

QUESTION: {the user's question}
ANSWER:
```

`SYSTEM_PROMPT` (verbatim, `rag_service.py`):
> *"You are SmartEdu, an AI academic assistant for this LMS. RULES: 1. Assignment statuses MUST come strictly from the LMS CONTEXT section. 2. If a submission record exists, the assignment is NOT pending/overdue. 3. Always trust LMS CONTEXT over prior chat history for dates, counts, and grades. 4. Never invent facts. Be concise, direct, and helpful."*

If **neither** LMS context nor document chunks were retrieved (empty course, no materials/assignments), the pipeline short-circuits before ever calling the LLM and returns a canned message: *"I don't have enough information to answer that question. This course may not have any uploaded materials or assignments yet."*

---

## 7. Ollama / LLM Invocation

Both chat call sites use the `ollama` Python client against a locally running Ollama server, model name from `settings.OLLAMA_MODEL` (env var, default `"mistral"`).

| Call | Streaming | `num_predict` | `num_ctx` | `temperature` |
|---|---|---|---|---|
| `answer_question` | No | 400 | 2048 | 0.2 |
| `answer_question_stream` | Yes | 400 | 2048 | 0.2 |

`num_thread` is set to `os.cpu_count()` in both cases. On `main.py` startup, a one-token warmup call (`ollama.chat(..., options={"num_predict": 1})`) is fired to pre-load the model into memory so the first real user request isn't slowed by a cold model load; failures here are caught and logged, not fatal to app startup.

If the model's response is cut off by hitting `num_predict` (`chunk.get("done_reason") == "length"`), the streaming path appends a visible notice to the answer: *"(Response cut short — ask a more specific question for a complete answer.)"*.

---

## 8. Streaming Implementation

### 8.1 Backend
`POST /api/chat/stream` (`chat.py`) returns a `StreamingResponse(generate(), media_type="text/plain")`. The `generate()` generator:
1. Opens its **own** `SessionLocal()` (separate from the request-scoped session — needed because the generator continues executing after the route function itself has returned control to Starlette).
2. Iterates `answer_question_stream(...)`, which itself iterates the Ollama `stream=True` chat response chunk-by-chunk, yielding `chunk["message"]["content"]` tokens as they arrive.
3. Accumulates the full answer text as it streams out.
4. After the stream ends, opens a **second** fresh session to persist both the user's question and the full assistant answer to `chat_history` (can't reuse the first session/generator context cleanly after the response has been sent).
5. Any exception during generation is caught and appended to the stream as visible text (`"\n\n[Error: ...]"`) rather than raising an unhandled 500 — since headers/status have already been sent once streaming begins, a mid-stream HTTP error isn't otherwise representable to the client.

Raw response caching (`response_cache`, 300s TTL) is checked at the **start** of `answer_question_stream` — on a cache hit, the entire cached answer is yielded as a single chunk (not re-streamed token-by-token), and metrics/logging mark it as `cached=True`.

### 8.2 Frontend
`frontend/src/api/chat.js`, `sendMessageStream(courseId, message, onChunk, signal)` — uses the **raw browser `fetch()` API**, not axios, because axios does not expose a readable stream in the browser the same way. Key details:
- Manually attaches the JWT from `localStorage` as an `Authorization` header (bypassing the shared axios interceptor in `client.js`, since this isn't an axios call).
- Passes an `AbortController.signal` straight through to `fetch()`, enabling the UI's "Stop" button to cancel generation mid-stream.
- Reads the response body via `response.body.getReader()` + `TextDecoder`, calling `onChunk(fullTextSoFar)` after every decoded chunk (the callback receives the **cumulative** text, not just the delta — the UI replaces the last message bubble's content wholesale each time rather than appending).

`StudentCourseDetail.jsx` (chat tab) wires this up:
- Maintains an in-memory `messages[]` array (`{role, content, isError?, isStopped?}`), reset on every page load — **chat history is not restored from the backend** even though `chat_history` rows are persisted (see `Pending_Tasks.md`).
- On send: pushes the user message, pushes an empty assistant placeholder bubble, then streams tokens into that placeholder via `onChunk`.
- On `AbortError` (user clicked Stop): marks the current bubble `isStopped: true` rather than treating it as a failure; any partial text already streamed is preserved, not discarded.
- Shows a three-dot "typing" indicator only while `chatting === true` **and** the last bubble's content is still empty (i.e., before the first token arrives).

---

## 9. Response Caching

**File**: `app/services/cache_service.py`. A hand-rolled thread-safe (`threading.Lock`) in-memory TTL cache (`TTLCache`), **not Redis or any external cache** — meaning it is per-process and does not survive a restart or work correctly with multiple uvicorn worker processes.

- `response_cache` (300s TTL, max 1000 entries) — full chat answers, keyed by `(course_id, student_id, normalize_query(question))`. `normalize_query` lowercases, strips punctuation, and collapses whitespace, so trivially-different phrasings of the same question (extra spaces, punctuation, casing) still hit the cache.
- `lms_context_cache` (60s TTL, max 200 entries) — see §3 above.
- Eviction: on `set()`, if the store is at `max_size`, first purges expired entries; if still full, evicts an arbitrary ("oldest" by dict-iteration-order, not true LRU) entry.
- `invalidate_course(course_id)` exists on `TTLCache` but is **not currently called anywhere** — actual invalidation in the codebase always uses the blunter `.clear()` (wipes the *entire* cache, all courses) rather than this more targeted method. See `Pending_Tasks.md`.

---

## 10. Performance Telemetry

**File**: `app/utils/metrics.py`, class `PipelineMetrics`. Instantiated once per chat request and threaded through the whole pipeline, recording wall-clock durations (via `time.perf_counter()`) for: intent classification, LMS context build, vector retrieval, prompt construction, LLM time-to-first-token (TTFT), total LLM generation time, and overall request time. Also tracks whether the response was a cache hit.

- `.to_dict()` is what's returned as `ChatResponse.metrics` on the **non-streaming** endpoint.
- `.log(question, intent)` writes a single structured line to a dedicated `smartedu.perf` logger (prefixed `[PERF]`) — this is the primary way to observe chatbot latency in practice, since the metrics aren't surfaced in the streaming UI.
- **TTFT approximation on the non-streaming path**: since `answer_question` calls `ollama.chat()` without `stream=True`, it has no real "first token" signal — it estimates `ttft_ms` as `20% of total LLM duration` (`llm_duration * 0.2`), a rough heuristic, not a measured value. The **streaming** path (`answer_question_stream`) measures TTFT for real (time from stream start to the first non-empty token chunk).

`backend/benchmark_chat.py` is a standalone script (not part of the running app, not a pytest suite) that exercises intent classification speed and the query-embedding LRU cache speedup, printing results to stdout — useful for manually re-verifying pipeline performance claims after changes, but not wired into CI (no CI configuration exists in the repo).

---

## 11. Chat Data Persistence vs. What's Actually Used

- Every completed chat turn (both streaming and non-streaming) is written to `chat_history` (`student_id, course_id, message, role`).
- **No endpoint reads `chat_history` back.** There's no "load my past conversation" API, and the frontend never fetches it — `StudentCourseDetail.jsx` always starts a new chat session with a single hardcoded greeting message on every mount/navigation.
- This means `chat_history` currently functions purely as a write-only audit log — see `Pending_Tasks.md` for the implication (a "resume conversation" or "conversation history" feature is straightforward to build on top of existing data, but doesn't exist yet).
