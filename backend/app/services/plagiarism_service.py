# app/services/plagiarism_service.py
"""
Plagiarism Detection Engine for SmartEdu.
Implements hybrid three-signal similarity analysis:
1. TF-IDF + Cosine Similarity (Scikit-Learn)
2. N-gram / Shingle Overlap Jaccard Similarity
3. Sentence-Transformer Semantic Similarity (RAG Embeddings)

Features:
- Excludes assignment title, description, and rubric text from candidate comparison.
- Exact and near-exact text span extraction using difflib.SequenceMatcher.
- Max-of-signals composite scoring & risk level classification (Low, Medium, High).
- Short submission safeguard.
"""

import re
import difflib
import numpy as np
from typing import List, Dict, Any, Tuple, Set
from sqlalchemy.orm import Session
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.models.models import Submission, Assignment, Rubric, RubricCriterion, PlagiarismReport, User
from app.rag.embeddings import get_single_embedding, get_embeddings


def _extract_prompt_text(assignment: Assignment, db: Session) -> str:
    """Combines assignment title, description, and rubric criteria into a single template text string."""
    prompt_parts = []
    if assignment.title:
        prompt_parts.append(assignment.title)
    if assignment.description:
        prompt_parts.append(assignment.description)

    if assignment.rubric_id:
        criteria = db.query(RubricCriterion).filter(
            RubricCriterion.rubric_id == assignment.rubric_id
        ).all()
        for c in criteria:
            if c.label:
                prompt_parts.append(c.label)
            if c.description:
                prompt_parts.append(c.description)

    return " ".join(prompt_parts)


def _tokenize_words(text: str) -> List[str]:
    """Basic lowercase word tokenizer."""
    return re.findall(r"\b\w+\b", text.lower())


def _get_shingles(text: str, n: int = 4) -> Set[str]:
    """Generates word n-gram shingles from text."""
    words = _tokenize_words(text)
    if len(words) < n:
        return set()
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


ACADEMIC_SECTION_HEADINGS = {
    "introduction", "conclusion", "references", "bibliography", "abstract",
    "table of contents", "contents", "executive summary", "discussion",
    "background", "methodology", "methods", "results", "works cited",
    "literature review", "declaration", "acknowledgements", "acknowledgments",
    "appendix", "appendices", "table of figures", "table of tables",
    "list of figures", "list of tables", "summary", "overview", "aims", "objectives"
}

COVER_PAGE_METADATA_PATTERNS = [
    r"department\s+of\s+.*",
    r"faculty\s+of\s+.*",
    r"university\s+of\s+.*",
    r".*university.*",
    r"school\s+of\s+.*",
    r"college\s+of\s+.*",
    r"bahria\s+university.*",
    r"instructor\s*:?.*",
    r"lecturer\s*:?.*",
    r"professor\s*:?.*",
    r"teacher\s*:?.*",
    r"submitted\s+by\s*:?.*",
    r"submitted\s+to\s*:?.*",
    r"student\s+name\s*:?.*",
    r"student\s+id\s*:?.*",
    r"registration\s+no\.?\s*:?.*",
    r"enrollment\s+no\.?\s*:?.*",
    r"roll\s+no\.?\s*:?.*",
    r"course\s+name\s*:?.*",
    r"course\s+code\s*:?.*",
    r"assignment\s+title\s*:?.*",
    r"assignment\s+#?\d*.*",
    r"submission\s+date\s*:?.*",
    r"date\s+of\s+submission\s*:?.*",
    r"cover\s+page",
    r"title\s+page",
    r"page\s+\d+\s*(of\s+\d+)?",
]


def _clean_text_for_comparison(text: str, prompt_text: str) -> str:
    """
    Advanced Academic Preprocessing & Noise Filter:
    1. Strips References/Bibliography section from the end of the document.
    2. Strips cover page & title page metadata blocks (department, university, instructor, student info, dates).
    3. Ignores common section headings (Introduction, Conclusion, References, Table of Contents, etc.).
    4. Excludes teacher-provided assignment instructions, title, and rubric criteria text.
    """
    if not text:
        return ""

    # Strip References / Bibliography section if present at document end
    ref_pattern = re.compile(r"\n\s*(references|bibliography|works cited)\s*\n.*$", re.IGNORECASE | re.DOTALL)
    text = ref_pattern.sub("", text)

    lines = text.splitlines()
    filtered_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        lower_line = stripped.lower()

        # Check 1: Skip standalone academic section headers
        if lower_line in ACADEMIC_SECTION_HEADINGS:
            continue

        # Check 2: Skip page numbers e.g. "Page 1 of 5" or standalone digits
        if re.match(r"^(page\s+\d+(\s+of\s+\d+)?|\d+)$", lower_line):
            continue

        # Check 3: Short standalone cover metadata lines (< 12 words) e.g. "Department of CS", "Bahria University", "Course: CS101"
        words = _tokenize_words(lower_line)
        is_metadata_line = False
        if len(words) < 12:
            for pat in COVER_PAGE_METADATA_PATTERNS:
                if re.search(r"^" + pat + r"$", lower_line) or re.search(r"^(student|instructor|course|department|faculty|university|date|assignment)\s*:", lower_line):
                    is_metadata_line = True
                    break
        if is_metadata_line:
            continue

        # Strip metadata prefix labels from longer lines e.g. "Assignment 1: Artificial Intelligence (AI) is transforming..."
        cleaned_line = re.sub(r"^(student\s+name|student\s+id|registration\s+no|course\s+name|course\s+code|assignment\s+#?\d*|instructor)\s*:\s*", "", stripped, flags=re.IGNORECASE)

        filtered_lines.append(cleaned_line)

    cleaned_text = " ".join(filtered_lines)
    cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()

    # Subtract teacher-provided assignment prompt / rubric text if present
    if prompt_text:
        prompt_clean = re.sub(r"\s+", " ", prompt_text).strip()
        if len(prompt_clean) > 15 and prompt_clean.lower() in cleaned_text.lower():
            pattern = re.escape(prompt_clean)
            cleaned_text = re.sub(pattern, "", cleaned_text, flags=re.IGNORECASE).strip()

    return cleaned_text


def _compute_shingle_jaccard(
    target_shingles: Set[str], candidate_shingles: Set[str], prompt_shingles: Set[str]
) -> float:
    """Computes Jaccard index between shingle sets after subtracting assignment prompt shingles."""
    filtered_target = target_shingles - prompt_shingles
    filtered_candidate = candidate_shingles - prompt_shingles

    if not filtered_target or not filtered_candidate:
        return 0.0

    intersection = len(filtered_target & filtered_candidate)
    union = len(filtered_target | filtered_candidate)
    return intersection / union if union > 0 else 0.0


def _cosine_sim_vectors(vec1: List[float], vec2: List[float]) -> float:
    """Computes cosine similarity between two 1D vector arrays."""
    v1 = np.array(vec1)
    v2 = np.array(vec2)
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (norm1 * norm2))


def _is_academic_noise_span(text_span: str, prompt_text: str) -> bool:
    """Returns True ONLY if matching span is merely a single line of academic noise or section heading."""
    span_clean = text_span.strip()
    span_lower = span_clean.lower()
    words = _tokenize_words(span_lower)

    # Multi-sentence paragraphs (>= 15 words) are real student body content, not cover metadata
    if len(words) >= 15:
        return False

    if span_lower in ACADEMIC_SECTION_HEADINGS:
        return True

    # Line-anchored regex for short metadata headers
    for pat in COVER_PAGE_METADATA_PATTERNS:
        if re.search(r"^" + pat + r"$", span_lower) or re.search(r"^(student|instructor|course|department|faculty|university|date|assignment)\s*:", span_lower):
            return True

    if prompt_text and len(span_lower) < 100 and span_lower in prompt_text.lower():
        return True

    content_words = [w for w in words if w not in ACADEMIC_SECTION_HEADINGS]
    if len(content_words) < 5:
        return True

    return False


def _extract_matching_spans(
    target_text: str, candidate_text: str, prompt_text: str = "", min_chars: int = 40, max_spans: int = 15
) -> List[Dict[str, Any]]:
    """Extracts overlapping matching text blocks of student-written content using difflib SequenceMatcher."""
    matcher = difflib.SequenceMatcher(None, target_text, candidate_text)
    matching_blocks = matcher.get_matching_blocks()

    spans = []
    for block in matching_blocks:
        if block.size >= min_chars:
            matched_str = target_text[block.a : block.a + block.size].strip()
            if len(matched_str) >= min_chars:
                if not _is_academic_noise_span(matched_str, prompt_text):
                    spans.append({
                        "source_start": block.a,
                        "source_end": block.a + block.size,
                        "matched_start": block.b,
                        "matched_end": block.b + block.size,
                        "text": matched_str,
                        "length": block.size,
                    })

    # Sort spans by length descending and take top N
    spans.sort(key=lambda s: s["length"], reverse=True)
    return spans[:max_spans]


def compute_plagiarism_report(submission_id: int, db: Session) -> PlagiarismReport:
    """
    Computes a comprehensive plagiarism report for a given submission ID against
    all other submissions in the same course (Option 1 course-level comparison).
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission or not submission.extracted_text:
        return None

    assignment = db.query(Assignment).filter(Assignment.id == submission.assignment_id).first()
    if not assignment:
        return None

    # Load assignment prompt & rubric text to exclude from comparison
    prompt_text = _extract_prompt_text(assignment, db)
    prompt_shingles = _get_shingles(prompt_text, n=4)

    target_text = _clean_text_for_comparison(submission.extracted_text, prompt_text)
    target_words = _tokenize_words(target_text)

    # Short submission safeguard (< 30 words)
    if len(target_words) < 30:
        submission.plagiarism_score = 0.0
        submission.detection_status = "short_submission"
        db.commit()

        existing_report = db.query(PlagiarismReport).filter(
            PlagiarismReport.submission_id == submission_id
        ).first()
        if not existing_report:
            existing_report = PlagiarismReport(submission_id=submission_id)
            db.add(existing_report)

        existing_report.matched_submission_id = None
        existing_report.matched_student_id = None
        existing_report.similarity_score = 0.0
        existing_report.risk_level = "low"
        existing_report.confidence_level = "high"
        existing_report.tfidf_score = 0.0
        existing_report.shingle_score = 0.0
        existing_report.semantic_score = 0.0
        existing_report.matching_spans = []
        existing_report.summary = "Short submission (< 30 words). Skipped plagiarism analysis."
        db.commit()
        db.refresh(existing_report)
        return existing_report

    # Fetch comparison corpus: all submissions in the same course, excluding current student's own submissions
    course_assignments = db.query(Assignment.id).filter(
        Assignment.course_id == assignment.course_id
    ).all()
    course_assignment_ids = [a.id for a in course_assignments]

    candidates = db.query(Submission).filter(
        Submission.assignment_id.in_(course_assignment_ids),
        Submission.id != submission_id,
        Submission.student_id != submission.student_id,
        Submission.extracted_text.isnot(None),
        Submission.extracted_text != "",
    ).all()

    if not candidates:
        # No candidates in corpus yet
        submission.plagiarism_score = 0.0
        submission.detection_status = "completed"
        db.commit()

        existing_report = db.query(PlagiarismReport).filter(
            PlagiarismReport.submission_id == submission_id
        ).first()
        if not existing_report:
            existing_report = PlagiarismReport(submission_id=submission_id)
            db.add(existing_report)

        existing_report.matched_submission_id = None
        existing_report.matched_student_id = None
        existing_report.similarity_score = 0.0
        existing_report.risk_level = "low"
        existing_report.confidence_level = "high"
        existing_report.tfidf_score = 0.0
        existing_report.shingle_score = 0.0
        existing_report.semantic_score = 0.0
        existing_report.matching_spans = []
        existing_report.summary = "Low similarity (0.0%). Content appears to be original student work with no significant plagiarism detected."
        db.commit()
        db.refresh(existing_report)
        return existing_report

    valid_candidates = []
    candidate_texts = []
    candidate_shingles_list = []

    for cand in candidates:
        c_clean = _clean_text_for_comparison(cand.extracted_text, prompt_text)
        c_words = _tokenize_words(c_clean)
        if len(c_words) >= 15:
            valid_candidates.append(cand)
            candidate_texts.append(c_clean)
            candidate_shingles_list.append(_get_shingles(c_clean, n=4))

    if not valid_candidates:
        submission.plagiarism_score = 0.0
        submission.detection_status = "completed"
        db.commit()

        existing_report = db.query(PlagiarismReport).filter(
            PlagiarismReport.submission_id == submission_id
        ).first()
        if not existing_report:
            existing_report = PlagiarismReport(submission_id=submission_id)
            db.add(existing_report)

        existing_report.matched_submission_id = None
        existing_report.matched_student_id = None
        existing_report.similarity_score = 0.0
        existing_report.risk_level = "low"
        existing_report.confidence_level = "high"
        existing_report.tfidf_score = 0.0
        existing_report.shingle_score = 0.0
        existing_report.semantic_score = 0.0
        existing_report.matching_spans = []
        existing_report.summary = "Low similarity (0.0%). Content appears to be original student work with no significant plagiarism detected."
        db.commit()
        db.refresh(existing_report)
        return existing_report

    # ── Signal 1: TF-IDF Cosine Similarity ───────────────────────────────
    corpus = [target_text] + candidate_texts
    try:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, stop_words="english")
        tfidf_matrix = vectorizer.fit_transform(corpus)
        tfidf_sims = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
    except Exception:
        tfidf_sims = np.zeros(len(valid_candidates))

    tfidf_scores = [float(s) for s in tfidf_sims]

    # ── Signal 2: Shingle Jaccard Similarity ─────────────────────────────
    target_shingles = _get_shingles(target_text, n=4)
    shingle_scores = [
        _compute_shingle_jaccard(target_shingles, cand_sh, prompt_shingles)
        for cand_sh in candidate_shingles_list
    ]

    # ── Signal 3: Sentence-Transformer Vector Semantic Similarity ───────
    semantic_scores = [0.0] * len(valid_candidates)
    try:
        all_vecs = get_embeddings(corpus)
        target_vec = all_vecs[0]
        for idx, cand_vec in enumerate(all_vecs[1:]):
            sem_sim = _cosine_sim_vectors(target_vec, cand_vec)
            semantic_scores[idx] = max(0.0, sem_sim)
    except Exception as e:
        print(f"[PlagiarismService] Semantic embedding error: {e}")

    # ── Evidence-Weighted Scoring Model ─────────────────────────────────
    # Weights: Shingle overlap (60%), Matching Passage Coverage (25%), Semantic (10%), TF-IDF (5%)
    best_candidate_idx = -1
    best_composite_score = -1.0
    best_breakdown = (0.0, 0.0, 0.0)
    best_matched_spans = []

    for idx in range(len(valid_candidates)):
        tf_s = tfidf_scores[idx]
        sh_s = shingle_scores[idx]
        se_s = semantic_scores[idx]

        # Extract verified student-written matching text spans
        cand_spans = _extract_matching_spans(
            target_text, candidate_texts[idx], prompt_text=prompt_text
        )
        total_chars = sum(span["length"] for span in cand_spans)
        num_spans = len(cand_spans)

        passage_coverage_score = min(1.0, total_chars / 400.0) if num_spans > 0 else 0.0

        # Evidence-weighted composite formula
        weighted_evidence_score = (
            0.60 * sh_s +
            0.25 * passage_coverage_score +
            0.10 * se_s +
            0.05 * tf_s
        )

        if sh_s < 0.05 and num_spans == 0:
            # NO verbatim text overlap (shingles < 5% and 0 matching spans).
            # Common academic topic similarity contributes 0% to plagiarism risk — capped strictly at LOW RISK (< 15%)
            cand_composite = min(0.149, weighted_evidence_score * 0.20)
        else:
            cand_composite = max(sh_s, weighted_evidence_score)

        if cand_composite > best_composite_score:
            best_composite_score = cand_composite
            best_candidate_idx = idx
            best_breakdown = (tf_s, sh_s, se_s)
            best_matched_spans = cand_spans

    matched_candidate = valid_candidates[best_candidate_idx]
    best_tfidf, best_shingle, best_semantic = best_breakdown
    matched_spans = best_matched_spans

    total_matching_chars = sum(span["length"] for span in matched_spans)
    num_matching_spans = len(matched_spans)

    # ── Evidence-Driven Risk & Confidence Matrix ────────────────────────
    if best_shingle >= 0.30 or (best_composite_score >= 0.35 and num_matching_spans >= 1):
        risk_level = "high"
        confidence_level = "high"
    elif best_shingle >= 0.15 or (best_composite_score >= 0.20 and num_matching_spans >= 1):
        risk_level = "medium"
        confidence_level = "high" if num_matching_spans >= 1 else "medium"
    else:
        risk_level = "low"
        confidence_level = "low" if (best_semantic >= 0.50 or best_tfidf >= 0.50) else "high"

    # Save to database
    percentage_score = round(float(best_composite_score) * 100.0, 1)
    submission.plagiarism_score = percentage_score
    submission.detection_status = "completed"
    db.commit()

    matched_student_user = db.query(User).filter(User.id == matched_candidate.student_id).first()
    student_display_name = matched_student_user.full_name if matched_student_user else f"Student #{matched_candidate.student_id}"

    # ── AI Narrative Summary (Truth & Evidence Grounded) ──────────────
    if risk_level == "high":
        summary_text = (
            f"High plagiarism risk ({percentage_score}%). Verified verbatim matching text passages ({num_matching_spans} section(s)) detected with {student_display_name}'s submission."
        )
    elif risk_level == "medium":
        summary_text = (
            f"Moderate similarity ({percentage_score}%) with verified text overlap matching {student_display_name}'s submission."
        )
    elif best_semantic >= 0.50 or best_tfidf >= 0.50:
        summary_text = (
            f"No direct matching passages found. High semantic similarity ({percentage_score}%) is driven by shared topic terminology rather than verbatim plagiarism."
        )
    else:
        summary_text = (
            f"Low similarity ({percentage_score}%). Content appears to be original student work with no significant plagiarism detected."
        )

    # Only assign matched candidate if similarity is non-trivial (medium/high risk)
    final_matched_sub_id = matched_candidate.id if risk_level != "low" else None
    final_matched_stu_id = matched_candidate.student_id if risk_level != "low" else None

    report = db.query(PlagiarismReport).filter(
        PlagiarismReport.submission_id == submission_id
    ).first()
    if not report:
        report = PlagiarismReport(submission_id=submission_id)
        db.add(report)

    report.matched_submission_id = final_matched_sub_id
    report.matched_student_id = final_matched_stu_id
    report.similarity_score = round(float(best_composite_score), 4)
    report.risk_level = risk_level
    report.confidence_level = confidence_level
    report.tfidf_score = round(float(best_tfidf), 4)
    report.shingle_score = round(float(best_shingle), 4)
    report.semantic_score = round(float(best_semantic), 4)
    report.matching_spans = matched_spans
    report.summary = summary_text
    db.commit()
    db.refresh(report)

    return report


def recompute_assignment_plagiarism(assignment_id: int, db: Session) -> Dict[str, Any]:
    """Recomputes plagiarism reports for all valid submissions in an assignment."""
    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.extracted_text.isnot(None),
        Submission.extracted_text != "",
    ).all()

    processed = 0
    for sub in submissions:
        compute_plagiarism_report(sub.id, db)
        processed += 1

    return {
        "assignment_id": assignment_id,
        "processed_submissions": processed,
        "message": f"Successfully recomputed plagiarism scores for {processed} submissions.",
    }
