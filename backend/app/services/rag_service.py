# app/services/rag_service.py
"""
Hybrid RAG Service for SmartEdu.
Orchestrates Document Ingestion, Hybrid Retrieval (LMS DB + ChromaDB Vectors),
Lecture Ordinal Resolution (Lecture 1, First Lecture, etc.), Prompt Engineering,
Response Caching, and Streaming with Performance Telemetry.
"""

import os
import re
import time
import json
import logging
import numpy as np
import ollama
from sqlalchemy.orm import Session

from app.rag.embeddings import get_embeddings, get_single_embedding
from app.rag.vector_store import add_chunks_to_collection, search_similar_chunks
from app.services.lms_context_service import build_lms_context
from app.services.intent_classifier import classify_intent
from app.services.cache_service import response_cache, normalize_query
from app.utils.metrics import PipelineMetrics
from app.models.models import Document
from app.config import settings
from app.services.ocr_service import extract_text_from_pdf, chunk_text


from typing import Optional, Dict, Any, List

logger = logging.getLogger("smartedu.chatbot")

BASE_SYSTEM_PROMPT = """You are SmartEdu, an intelligent AI academic assistant for this LMS course.

Answer naturally and conversationally, like a knowledgeable teaching assistant talking to a student — not a form or report. Stay focused on what they actually asked. Use markdown structure (headings, bold, bullets) only when it genuinely helps organize a multi-part or list-heavy answer; short, direct questions deserve short, direct, conversational answers. Always complete your thoughts fully."""

TOPIC_DIRECTIVES = {
    "grades": "The student is asking about grades, performance, or academic risk. Using the data below, explain what's relevant to their question — their score, risk status, feedback, or specific risk factors. You don't need to list all 8 risk model dimensions unless they specifically ask how the risk model works. Don't bring up lecture content or plagiarism unless they asked about it too.",
    "assignments": "The student is asking about assignments or deadlines. Using the data below, answer with the relevant assignment title(s), due dates, and status. Don't bring up lecture content, grades, or plagiarism unless they asked about it too.",
    "lectures": "The student is asking about lectures or course materials. Using the data below, answer with the relevant lecture/material information. Don't bring up assignments, grades, or plagiarism unless they asked about it too.",
    "plagiarism": "The student is asking about the plagiarism/academic-integrity policy. Using the data below, describe the relevant policy. Don't bring up grades or assignments unless they asked about it too.",
}

# A handful of example phrasings per topic. Not a training set — just anchor points
# for semantic (embedding-based) similarity matching, so paraphrases route the same
# way as their keyword-matching equivalents without hardcoding every possible wording.
TOPIC_EXEMPLARS = {
    "grades": [
        "what is my grade in this course",
        "how am i performing academically",
        "am i at risk of failing",
        "what is my current score",
        "show me my academic risk status",
        "why am i marked as high risk",
    ],
    "assignments": [
        "what assignments are due",
        "when is my next deadline",
        "have i submitted all my homework",
        "list the pending assignments",
        "what tasks are overdue",
    ],
    "lectures": [
        "how many lectures are in this course",
        "summarize the available lecture materials",
        "what lecture notes have been uploaded",
        "how much course content is available",
        "list the lecture slides",
        "what has been uploaded so far",
    ],
    "plagiarism": [
        "how does plagiarism detection work",
        "what is the similarity scoring policy",
        "explain the academic integrity checks",
    ],
}

_topic_centroid_cache: Dict[str, np.ndarray] = {}
SEMANTIC_TOPIC_THRESHOLD = 0.40


def _cosine(a, b) -> float:
    a, b = np.asarray(a), np.asarray(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


def _get_topic_centroid(topic: str) -> np.ndarray:
    """Average embedding of a topic's exemplar phrases, cached after first use."""
    if topic not in _topic_centroid_cache:
        vecs = np.array([get_single_embedding(p) for p in TOPIC_EXEMPLARS[topic]])
        centroid = vecs.mean(axis=0)
        norm = np.linalg.norm(centroid)
        _topic_centroid_cache[topic] = centroid / norm if norm else centroid
    return _topic_centroid_cache[topic]


def _detect_topic_keywords(question: str) -> Optional[str]:
    """Fast, free first pass for unambiguous exact wording."""
    q_lower = question.lower().strip()
    if any(k in q_lower for k in ["grade", "score", "mark", "graded", "feedback", "performance", "risk", "status"]):
        return "grades"
    if any(k in q_lower for k in ["assignment", "assignments", "due", "deadline", "overdue", "pending", "homework"]):
        return "assignments"
    if any(k in q_lower for k in ["lecture", "lectures", "slides", "material"]):
        return "lectures"
    if "plagiarism" in q_lower or "shingle" in q_lower or "similarity" in q_lower:
        return "plagiarism"
    return None


def detect_topic(question: str, question_embedding: Optional[list] = None) -> Optional[str]:
    """
    Topic detection used to scope both LMS context and the system-prompt directive.
    Keyword match first (cheap, unambiguous); falls back to semantic similarity
    against topic exemplars so paraphrases ("how much course material is available"
    vs "how many lectures") route the same way without needing every wording listed.
    """
    topic = _detect_topic_keywords(question)
    if topic:
        return topic

    if question_embedding is None:
        question_embedding = get_single_embedding(question)

    best_topic, best_score = None, 0.0
    for candidate in TOPIC_EXEMPLARS:
        score = _cosine(question_embedding, _get_topic_centroid(candidate))
        if score > best_score:
            best_topic, best_score = candidate, score

    return best_topic if best_score >= SEMANTIC_TOPIC_THRESHOLD else None


def build_system_prompt(topic: Optional[str]) -> str:
    """Composes a topic-scoped system prompt instead of always sending every rule for every question."""
    if topic and topic in TOPIC_DIRECTIVES:
        return f"{BASE_SYSTEM_PROMPT}\n\n{TOPIC_DIRECTIVES[topic]}"
    return f"{BASE_SYSTEM_PROMPT}\n\nAnswer using only the information given below. If the question doesn't map to a specific topic, give a brief, relevant course summary."


def filter_context_for_query(topic: Optional[str], full_lms_context: str) -> str:
    """Filters LMS context to only include sections relevant to the detected topic."""
    if topic == "grades":
        lines = [line for line in full_lms_context.split("\n") if line.startswith("[Course]") or line.startswith("[Student Performance Analytics]") or (line.strip().startswith("- ") and "Status=" in line)]
        return "\n".join(lines) if lines else full_lms_context

    if topic == "assignments":
        lines = [line for line in full_lms_context.split("\n") if line.startswith("[Course]") or line.startswith("[Assignments]") or (line.strip().startswith("- ") and not line.strip().startswith("- Lecture"))]
        return "\n".join(lines) if lines else full_lms_context

    if topic == "lectures":
        lines = [line for line in full_lms_context.split("\n") if line.startswith("[Course]") or line.startswith("[Lectures]") or line.strip().startswith("- Lecture")]
        return "\n".join(lines) if lines else full_lms_context

    if topic == "plagiarism":
        lines = [line for line in full_lms_context.split("\n") if line.startswith("[Course]") or line.startswith("[Plagiarism Policy]")]
        return "\n".join(lines) if lines else full_lms_context

    return full_lms_context




def handle_special_query_guards(question: str) -> Optional[str]:
    """
    Evaluates privacy guards, data leakage prevention, and off-topic redirects.
    Returns a formatted string response if guarded, or None to proceed with RAG/LLM.
    """
    q_lower = question.lower().strip()

    # 1. Peer Privacy & Cross-Student Data Leakage Prevention
    if any(k in q_lower for k in ["another student", "other student", "peer submission", "peer answer", "someone else's", "other's grade", "who is at risk"]):
        return "### 🔒 Privacy Protection Notice\n\nI cannot disclose or access another student's submissions, grades, or personal academic records. All student data is kept strictly confidential within SmartEdu."

    # 2. Student-Facing Plagiarism Score Confidentiality
    if any(k in q_lower for k in ["my plagiarism score", "my plagiarism percentage", "my similarity score", "my similarity percentage", "my shingle score"]):
        return "### 🛡️ Academic Integrity Notice\n\nIndividual plagiarism similarity scores and highlighted passage reports are used internally by instructors to verify academic integrity. You can view your official grade, rubric breakdown, and teacher feedback in your submission dashboard."

    # 3. Off-Topic Query Redirection
    if any(k in q_lower for k in ["weather", "football", "cricket", "recipe", "movie", "president", "tell me a joke", "crypto", "bitcoin"]):
        return "### 🎓 SmartEdu Course Assistant\n\nI am your dedicated academic assistant for this course. Please ask any question regarding lecture materials, course topics, assignment deadlines, or your grades!"

    return None


def _history_fingerprint(history: Optional[List[Dict[str, str]]]) -> str:
    """
    Short fingerprint of the immediately preceding turn, used to keep the
    response cache from serving a follow-up answer ('name them', 'list them')
    that was actually generated for a *different* prior conversational turn.
    """
    if not history:
        return "no-history"
    last = history[-1]
    return normalize_query(last.get("message", ""))[:80]


def _cache_key(course_id: int, student_id: int, session_id: Optional[str], norm_q: str, history):
    return (course_id, student_id, session_id or "default", _history_fingerprint(history), norm_q)


def answer_question(
    question: str,
    course_id: int,
    student_id: int,
    db: Session,
    history: Optional[List[Dict[str, str]]] = None,
    session_id: Optional[str] = None,
) -> dict:
    metrics = PipelineMetrics()
    norm_q = normalize_query(question)
    cache_key = _cache_key(course_id, student_id, session_id, norm_q, history)

    # 1. Response Cache Check (Runs for ALL queries)
    cached_res = response_cache.get(cache_key)
    if cached_res is not None:
        metrics.cached = True
        metrics.finish()
        metrics.log(question, cached_res.get("intent", "cached"))
        res_copy = dict(cached_res)
        res_copy["metrics"] = metrics.to_dict()
        return res_copy

    # 2. Check Security & Privacy Guards
    guarded_response = handle_special_query_guards(question)
    if guarded_response:
        metrics.finish()
        metrics.log(question, "guarded")
        result = {"answer": guarded_response, "sources": [], "intent": "guarded", "metrics": metrics.to_dict()}
        response_cache.set(cache_key, result, ttl=300)
        return result

    t0 = time.perf_counter()
    intent = classify_intent(question)  # kept for logging/telemetry & API response label only
    metrics.mark_intent(time.perf_counter() - t0)

    # Single embedding, reused for semantic topic detection AND vector retrieval below —
    # avoids the previous design's dependency on keyword intent matching to decide
    # whether course material even gets searched.
    question_embedding = get_single_embedding(question)

    t0 = time.perf_counter()
    topic = detect_topic(question, question_embedding)
    full_lms_context = build_lms_context(course_id, student_id, db)
    lms_context = filter_context_for_query(topic, full_lms_context)
    metrics.mark_lms(time.perf_counter() - t0)

    target_doc, target_idx = resolve_lecture_ordinal(question, course_id, db)
    doc_id_filter = target_doc.id if target_doc else None

    # Always attempt course-material retrieval (search_similar_chunks itself is a
    # cheap no-op if the course has zero indexed documents). Previously this only
    # ran when the keyword-based intent classifier happened to guess "document" or
    # "hybrid" — meaning a differently-worded but perfectly valid question about
    # course material could silently get zero retrieval. Distance filtering inside
    # search_similar_chunks already discards irrelevant matches.
    t0 = time.perf_counter()
    document_chunks = search_similar_chunks(
        course_id=course_id,
        query_embedding=question_embedding,
        n_results=2,
        document_id=doc_id_filter,
    )
    metrics.mark_retrieval(time.perf_counter() - t0)

    t0 = time.perf_counter()
    system_prompt = build_system_prompt(topic)
    prompt_parts = [system_prompt, f"\nLMS CONTEXT:\n{lms_context}"]
    if document_chunks:
        prompt_parts.append("\nCOURSE MATERIAL EXCERPTS:")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[{i}]: {chunk[:350]}")

    system_content = "\n".join(prompt_parts)
    ollama_messages = [{"role": "system", "content": system_content}]
    if history:
        for item in history:
            r = "assistant" if item.get("role") == "assistant" else "user"
            ollama_messages.append({"role": r, "content": item.get("message", "")})
    # Reinforcement placed right next to the question — small local models follow
    # instructions near the end of the prompt far more reliably than ones stated
    # only once at the top, far from the actual user turn.
    reminder = TOPIC_DIRECTIVES.get(topic, "Answer only what is asked below, using only the information given.")
    ollama_messages.append({"role": "system", "content": f"Reminder: {reminder}"})
    ollama_messages.append({"role": "user", "content": question})
    metrics.mark_prompt(time.perf_counter() - t0)

    try:
        response = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=ollama_messages,
            options={"num_predict": 600, "num_ctx": 1536, "temperature": 0.15, "num_thread": os.cpu_count()},
        )
        answer_text = response["message"]["content"]
        answer_source = "llm"
    except Exception as e:
        logger.warning(f"Ollama call failed ({type(e).__name__}: {e}) — using fallback template for: {question[:60]!r}")
        answer_text = synthesize_instant_response(question, full_lms_context, document_chunks, target_doc, target_idx)
        answer_source = "fallback_template"

    metrics.finish()
    metrics.log(question, intent)

    result = {
        "answer": answer_text,
        "sources": [c[:150] + "..." for c in document_chunks],
        "intent": intent,
        "answer_source": answer_source,
        "metrics": metrics.to_dict(),
    }
    response_cache.set(cache_key, result, ttl=300)
    return result


def answer_question_stream(
    question: str,
    course_id: int,
    student_id: int,
    db: Session,
    history: Optional[List[Dict[str, str]]] = None,
    session_id: Optional[str] = None,
):
    """Streaming answer pipeline with response caching and topic isolation."""
    metrics = PipelineMetrics()
    norm_q = normalize_query(question)
    cache_key = _cache_key(course_id, student_id, session_id, norm_q, history)

    # 1. Response Cache Check (Runs for ALL queries)
    cached_res = response_cache.get(cache_key)
    if cached_res is not None:
        metrics.cached = True
        metrics.finish()
        metrics.log(question, cached_res.get("intent", "cached"))
        yield cached_res["answer"]
        return

    # 2. Check Security & Privacy Guards
    guarded_response = handle_special_query_guards(question)
    if guarded_response:
        metrics.finish()
        metrics.log(question, "guarded")
        result_obj = {"answer": guarded_response, "sources": [], "intent": "guarded", "metrics": metrics.to_dict()}
        response_cache.set(cache_key, result_obj, ttl=300)
        yield guarded_response
        return

    t0 = time.perf_counter()
    intent = classify_intent(question)  # kept for logging/telemetry & API response label only
    metrics.mark_intent(time.perf_counter() - t0)

    # Single embedding, reused for semantic topic detection AND vector retrieval below —
    # avoids the previous design's dependency on keyword intent matching to decide
    # whether course material even gets searched.
    question_embedding = get_single_embedding(question)

    t0 = time.perf_counter()
    topic = detect_topic(question, question_embedding)
    full_lms_context = build_lms_context(course_id, student_id, db)
    lms_context = filter_context_for_query(topic, full_lms_context)
    metrics.mark_lms(time.perf_counter() - t0)

    target_doc, target_idx = resolve_lecture_ordinal(question, course_id, db)
    doc_id_filter = target_doc.id if target_doc else None

    # Always attempt course-material retrieval (search_similar_chunks itself is a
    # cheap no-op if the course has zero indexed documents). Previously this only
    # ran when the keyword-based intent classifier happened to guess "document" or
    # "hybrid" — meaning a differently-worded but perfectly valid question about
    # course material could silently get zero retrieval. Distance filtering inside
    # search_similar_chunks already discards irrelevant matches.
    t0 = time.perf_counter()
    document_chunks = search_similar_chunks(
        course_id=course_id,
        query_embedding=question_embedding,
        n_results=2,
        document_id=doc_id_filter,
    )
    metrics.mark_retrieval(time.perf_counter() - t0)

    t0 = time.perf_counter()
    system_prompt = build_system_prompt(topic)
    prompt_parts = [system_prompt, f"\nLMS CONTEXT:\n{lms_context}"]
    if document_chunks:
        prompt_parts.append("\nCOURSE MATERIAL EXCERPTS:")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[{i}]: {chunk[:350]}")

    system_content = "\n".join(prompt_parts)
    ollama_messages = [{"role": "system", "content": system_content}]
    if history:
        for item in history:
            r = "assistant" if item.get("role") == "assistant" else "user"
            ollama_messages.append({"role": r, "content": item.get("message", "")})
    reminder = TOPIC_DIRECTIVES.get(topic, "Answer only what is asked below, using only the information given.")
    ollama_messages.append({"role": "system", "content": f"Reminder: {reminder}"})
    ollama_messages.append({"role": "user", "content": question})
    metrics.mark_prompt(time.perf_counter() - t0)

    t_llm_start = time.perf_counter()
    full_text = []
    used_fallback = False

    try:
        stream = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=ollama_messages,
            stream=True,
            options={
                "num_predict": 600,
                "num_ctx": 1536,
                "temperature": 0.15,
                "num_thread": os.cpu_count(),
            },
        )

        for chunk in stream:
            token = chunk.get("message", {}).get("content", "")
            if token:
                full_text.append(token)
                yield token

    except Exception as e:
        logger.warning(f"Ollama stream failed ({type(e).__name__}: {e}) — using fallback template for: {question[:60]!r}")
        used_fallback = True
        # Fallback if Ollama local daemon is offline
        fallback_msg = synthesize_instant_response(question, full_lms_context, document_chunks, target_doc, target_idx)
        words = fallback_msg.split(" ")
        for i, word in enumerate(words):
            token = word + (" " if i < len(words) - 1 else "")
            full_text.append(token)
            yield token
            time.sleep(0.01)

    llm_duration = time.perf_counter() - t_llm_start
    metrics.mark_llm_total(llm_duration)
    metrics.finish()
    metrics.log(question, intent)

    full_answer = "".join(full_text)
    result_obj = {
        "answer": full_answer,
        "sources": [c[:150] + "..." for c in document_chunks],
        "intent": intent,
        "answer_source": "fallback_template" if used_fallback else "llm",
        "metrics": metrics.to_dict(),
    }
    response_cache.set(cache_key, result_obj, ttl=300)

ORDINAL_MAP = {
    "first": 1, "1st": 1, "one": 1, "1": 1, "01": 1,
    "second": 2, "2nd": 2, "two": 2, "2": 2, "02": 2,
    "third": 3, "3rd": 3, "three": 3, "3": 3, "03": 3,
    "fourth": 4, "4th": 4, "four": 4, "4": 4, "04": 4,
    "fifth": 5, "5th": 5, "five": 5, "5": 5, "05": 5,
    "sixth": 6, "6th": 6, "six": 6, "6": 6,
    "seventh": 7, "7th": 7, "seven": 7, "7": 7,
    "eighth": 8, "8th": 8, "eight": 8, "8": 8,
    "ninth": 9, "9th": 9, "nine": 9, "9": 9,
    "tenth": 10, "10th": 10, "ten": 10, "10": 10,
}


def ingest_document_task(document_id: int, file_path: str, course_id: int, db_session_factory):
    """
    Runs as a FastAPI BackgroundTask. Takes a SESSION FACTORY (not a session)
    because the session that handled the original HTTP request gets closed
    as soon as the response is returned — background tasks need their OWN
    fresh session, opened and closed inside this function.
    """
    db: Session = db_session_factory()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return

        extraction = extract_text_from_pdf(file_path)
        raw_text = extraction["text"]
        if not raw_text.strip():
            document.status = "failed"
            document.error_message = "No text could be extracted from this PDF"
            db.commit()
            return

        if extraction["low_confidence"]:
            confidence_str = f"{extraction['confidence']:.0f}%" if extraction["confidence"] is not None else "unknown"
            document.status = "failed"
            document.error_message = (
                f"OCR confidence was too low ({confidence_str}) to reliably index this PDF "
                "for search. Try uploading a clearer scan, or a native (non-scanned) PDF."
            )
            db.commit()
            return

        text_chunks = chunk_text(raw_text, chunk_size=500, overlap=100)
        if not text_chunks:
            document.status = "failed"
            document.error_message = "Chunking produced no results"
            db.commit()
            return

        embeddings = get_embeddings(text_chunks)
        chunks_data = [{"text": t, "embedding": e} for t, e in zip(text_chunks, embeddings)]

        stored_count = add_chunks_to_collection(
            course_id=course_id,
            document_id=document_id,
            chunks=chunks_data,
        )

        document.status = "indexed"
        document.chunk_count = stored_count
        db.commit()

    except Exception as e:
        if document:
            document.status = "failed"
            document.error_message = str(e)
            db.commit()
    finally:
        db.close()


def resolve_lecture_ordinal(question: str, course_id: int, db: Session):
    """
    Parses ordinal references like 'Lecture 1', 'first lecture', '2nd lecture', 'latest lecture'
    or topic keywords and maps them to the corresponding Document object ordered by created_at.
    Returns (Document or None, target_index or None).
    """
    if not question:
        return None, None

    q_lower = question.lower().strip()

    documents = db.query(Document).filter(
        Document.course_id == course_id,
        Document.status == "indexed"
    ).order_by(Document.created_at.asc()).all()

    if not documents:
        return None, None

    if re.search(r"\b(last|latest|most recent)\s+lecture\b", q_lower) or re.search(r"\blecture\s+(last|latest)\b", q_lower):
        return documents[-1], len(documents)

    target_idx = None

    m1 = re.search(r"\blecture\s*(?:#|no\.?|number)?\s*(\d+|0\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b", q_lower)
    if m1:
        val = m1.group(1)
        if val.isdigit():
            target_idx = int(val)
        elif val in ORDINAL_MAP:
            target_idx = ORDINAL_MAP[val]

    if target_idx is None:
        m2 = re.search(r"\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+lecture\b", q_lower)
        if m2:
            val = m2.group(1)
            target_idx = ORDINAL_MAP.get(val)

    if target_idx is not None:
        if 1 <= target_idx <= len(documents):
            return documents[target_idx - 1], target_idx
        else:
            return None, target_idx

    for idx, doc in enumerate(documents, 1):
        filename_clean = doc.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").lower()
        terms = [t for t in filename_clean.split() if len(t) > 3]
        if any(t in q_lower for t in terms):
            return doc, idx

    return None, None


def synthesize_instant_response(question: str, lms_context: str, document_chunks: list, target_doc=None, target_idx=None) -> str:
    """
    Synthesizes a clean, human-readable, beautifully formatted academic response from LMS context
    and retrieved document chunks. Never outputs raw system tags like [Course] or [Lectures].
    """
    q_lower = question.lower().strip()

    # Parse LMS Context into structured dictionary
    lms_data = {
        "course_info": "",
        "instructor": "",
        "enrolled": "",
        "plagiarism_policy": "",
        "performance_analytics": "",
        "badges": [],
        "lectures": [],
        "assignments": []
    }

    for line in lms_context.split("\n"):
        line_str = line.strip()
        if line_str.startswith("[Course]"):
            lms_data["course_info"] = line_str.replace("[Course]", "").strip()
        elif line_str.startswith("[Student Performance Analytics]"):
            lms_data["performance_analytics"] = line_str.replace("[Student Performance Analytics]", "").strip()
        elif line_str.startswith("[Plagiarism Policy]"):
            lms_data["plagiarism_policy"] = line_str.replace("[Plagiarism Policy]", "").strip()
        elif line_str.startswith("[Earned Badges]"):
            lms_data["badges"].append(line_str.replace("[Earned Badges]", "").strip())
        elif line_str.startswith("- Lecture"):
            lms_data["lectures"].append(line_str[2:].strip())
        elif line_str.startswith("- "):
            lms_data["assignments"].append(line_str[2:].strip())

    # 1. Friendly Greetings
    if q_lower in ["hi", "hello", "hey", "greetings", "good morning", "good afternoon"]:
        res = "### 👋 Welcome to SmartEdu AI Assistant!\n\n"
        res += f"I am your academic assistant for **{lms_data['course_info']}**.\n\n"
        res += "Here are some things I can help you with:\n"
        res += "• **Lectures**: Ask me to summarize lectures or list topics.\n"
        res += "• **Assignments**: Ask about deadlines, grades, and submission status.\n"
        res += "• **Plagiarism**: Learn about our 4-gram shingle & TF-IDF scanning policy.\n"
        res += "• **Course Q&A**: Ask any conceptual question from your uploaded slides.\n"
        return res

    # 2. Lecture listing or specific lecture queries
    if any(k in q_lower for k in ["lecture", "lectures", "slides", "material", "topic"]):
        if target_doc:
            clean_name = target_doc.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
            res = f"### 📚 Lecture {target_idx}: {clean_name}\n\n"
            res += f"• **Filename**: `{target_doc.filename}`\n"
            res += f"• **Position**: Lecture {target_idx} in course syllabus\n"
            if document_chunks:
                res += "\n**Key Excerpts & Concepts**:\n"
                for i, chunk in enumerate(document_chunks, 1):
                    res += f"> {chunk[:280].strip()}...\n\n"
            return res

        if lms_data["lectures"]:
            res = "### 📚 Course Lectures & Slide Materials\n\n"
            for lec in lms_data["lectures"]:
                res += f"• **{lec}**\n"
            if document_chunks:
                res += "\n**Recent Lecture Topics**:\n"
                for i, chunk in enumerate(document_chunks, 1):
                    res += f"> *{chunk[:220].strip()}...*\n\n"
            return res
        else:
            return "### 📚 Course Lectures\n\nNo lecture files or slide PDFs have been uploaded for this course yet.\n\nYour instructor can upload course documents in the **Documents** tab, and I will index and summarize their contents automatically."

    # 3a. Grade / Score / Risk Analytics query — full multi-factor breakdown
    if any(k in q_lower for k in ["grade", "score", "mark", "graded", "feedback", "performance", "risk", "why am i high risk", "why at risk"]):
        res = "### 📊 Your Academic Performance & Risk Breakdown\n\n"
        if lms_data["performance_analytics"]:
            res += f"• **Overall Performance & Risk**: {lms_data['performance_analytics']}\n\n"

        res += "**Assignment Scores & Teacher Feedback**:\n"
        if lms_data["assignments"]:
            for asgn in lms_data["assignments"]:
                res += f"• **{asgn}**\n"
        else:
            res += "No grades or assignment scores recorded yet.\n"

        res += "\n**SmartEdu Multi-Factor Risk Model Evaluation Basis**:\n"
        res += "Your academic risk status is calculated by evaluating **8 core learning dimensions**:\n"
        res += "1. 📝 **Assignment Grade Average**: Passing threshold is 50%. A score below 50% flags High Risk.\n"
        res += "2. ⏰ **Missing / Overdue Rate**: Unsubmitted assignments past the deadline.\n"
        res += "3. ⏳ **Lateness Rate**: Submissions submitted after the due date.\n"
        res += "4. 📅 **Lecture Attendance Rate**: Class participation in scheduled lectures.\n"
        res += "5. 💬 **AI Chatbot Engagement Level**: Active learning and question frequency.\n"
        res += "6. 📥 **Document Download Rate**: Reading & downloading lecture slides.\n"
        res += "7. 📈 **Grade Trajectory Trend**: Performance direction across sequential tasks.\n"
        res += "8. 📄 **Document OCR Success Rate**: Proper file upload readability.\n"
        return res

    # 3b. Plain assignment / deadline queries (no grade/score/risk language)
    if any(k in q_lower for k in ["assignment", "assignments", "due", "deadline", "overdue", "pending", "task", "homework"]):
        if lms_data["assignments"]:
            res = "### 📝 Course Assignments & Deadlines\n\n"
            for asgn in lms_data["assignments"]:
                res += f"• **{asgn}**\n"
            return res
        else:
            return "### 📝 Course Assignments\n\nThere are currently no assignments created or due for this course."

    # 4. Plagiarism policy & evaluation queries
    if "plagiarism" in q_lower or "shingle" in q_lower or "similarity" in q_lower:
        return (
            "### 🛡️ SmartEdu Plagiarism Detection System\n\n"
            "SmartEdu evaluates student submissions using a multi-layer verification engine:\n\n"
            "1. **K-Shingle 4-Gram Overlap**: Compares 4-word sequences against all peer submissions in the course to detect direct copy-pasting.\n"
            "2. **TF-IDF Cosine Similarity**: Measures overall textual document similarity across the course corpus.\n"
            "3. **Risk Level Classification**:\n"
            "   - 🟢 **Low Risk (<15%)**: Normal academic phrasing.\n"
            "   - 🟡 **Medium Risk (15–39%)**: Partial overlap; flagged for review.\n"
            "   - 🔴 **High Risk (≥40%)**: Significant similarity; highlighted for instructor action.\n\n"
            "Passage matches are highlighted directly in the teacher submission portal for verification."
        )

    # 5. Teacher / Instructor queries
    if any(k in q_lower for k in ["teacher", "instructor", "professor", "who teaches"]):
        if lms_data["course_info"]:
            return f"### 👨‍🏫 Course Instructor & Info\n\n• **Course Details**: {lms_data['course_info']}"
        return "Instructor information is currently not set for this course."

    # 6. Course overview or syllabus queries
    if any(k in q_lower for k in ["course", "info", "overview", "syllabus", "about"]):
        res = "### 📌 Course Details & Overview\n\n"
        if lms_data["course_info"]:
            res += f"• **Course**: {lms_data['course_info']}\n"
        res += f"• **Lectures Indexed**: {len(lms_data['lectures'])}\n"
        res += f"• **Assignments**: {len(lms_data['assignments'])}\n"
        if lms_data["badges"]:
            res += f"• **Earned Badges**: {', '.join(lms_data['badges'])}\n"
        return res

    # 7. Document chunks excerpt response
    if document_chunks:
        res = "### 📖 Relevant Course Material Excerpts\n\n"
        for i, chunk in enumerate(document_chunks, 1):
            res += f"**Excerpt {i}**:\n> {chunk[:280].strip()}...\n\n"
        return res

    # 8. Clean Fallback Overview
    res = "### 📌 Course Summary\n\n"
    if lms_data["course_info"]:
        res += f"• **Course Details**: {lms_data['course_info']}\n"
    if lms_data["lectures"]:
        res += f"• **Lectures**: {len(lms_data['lectures'])} uploaded\n"
    if lms_data["assignments"]:
        res += f"• **Assignments**: {len(lms_data['assignments'])} created\n"
    res += "\nFeel free to ask specific questions about lecture topics, assignment due dates, or plagiarism policies!"
    return res