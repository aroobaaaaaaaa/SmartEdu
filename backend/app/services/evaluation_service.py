# app/services/evaluation_service.py
"""
AI evaluation engine — uses assignment description, instructions,
rubric criteria, and extracted submission text to generate
rich, criterion-specific feedback.
"""

import json
import re
import os
import logging
from datetime import datetime, timezone
import ollama
from sqlalchemy.orm import Session, joinedload

from app.services.ocr_service import extract_text_from_pdf
from app.services.plagiarism_service import compute_plagiarism_report
from app.models.models import Submission, AIEvaluation, Assignment, Rubric, RubricCriterion
from app.config import settings
from app.utils.llm_json import parse_llm_json, LLMJsonError

logger = logging.getLogger("smartedu.evaluation")
FAILED_OUTPUT_DIR = os.path.join("logs", "evaluation_failures")


def clean_extracted_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _prepare_submission_text(text: str, max_chars: int = 6000) -> str:
    """
    Instead of blindly truncating from the start (which loses most content
    for long documents), take content from the beginning, middle, and end.
    This ensures the LLM sees a representative sample of the full submission.
    """
    if len(text) <= max_chars:
        return text

    chunk = max_chars // 3
    start = text[:chunk]
    mid_start = len(text) // 2 - chunk // 2
    middle = text[mid_start:mid_start + chunk]
    end = text[-chunk:]

    return (
        f"{start}\n\n[... middle section ...]\n\n"
        f"{middle}\n\n[... final section ...]\n\n"
        f"{end}"
    )


def _dump_raw_output(submission_id, raw, reason):
    """Persist the exact model response that could not be used or needed repair."""
    try:
        os.makedirs(FAILED_OUTPUT_DIR, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        path = os.path.join(FAILED_OUTPUT_DIR, f"submission_{submission_id}_{stamp}.txt")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f"# submission_id : {submission_id}\n")
            fh.write(f"# model         : {settings.OLLAMA_MODEL}\n")
            fh.write(f"# reason        : {reason}\n")
            fh.write(f"# raw length    : {len(raw or '')} chars\n")
            fh.write("# ---- raw model output ----\n")
            fh.write(raw or "<empty>")
        return path
    except Exception as exc:
        logger.warning("could not save raw output for submission %s: %s", submission_id, exc)
        return None


def _as_int(value, default=0):
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value)
        if match:
            return int(float(match.group()))
    return default


def _as_list(value):
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _run_model(prompt: str, num_predict: int):
    response = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        format="json",
        options={
            "num_predict": num_predict,
            "num_ctx": 8192,
            "temperature": 0.10,
            "num_thread": os.cpu_count(),
        },
    )
    return response["message"]["content"]


def _save_evaluation(db, submission, criteria_scores, total, feedback, raw_output):
    """Insert or update — submission_id is unique on ai_evaluations."""
    existing = db.query(AIEvaluation).filter(
        AIEvaluation.submission_id == submission.id
    ).first()
    feedback_str = json.dumps(feedback) if isinstance(feedback, (dict, list)) else str(feedback)
    if existing:
        existing.criteria_scores = criteria_scores
        existing.total_score = total
        existing.feedback = feedback_str
        existing.raw_model_output = raw_output
    else:
        db.add(AIEvaluation(
            submission_id=submission.id,
            criteria_scores=criteria_scores,
            total_score=total,
            feedback=feedback_str,
            raw_model_output=raw_output,
        ))


def evaluate_submission_task(submission_id: int, file_path: str, db_session_factory):
    db: Session = db_session_factory()
    submission = None
    try:
        # Eager load assignment in a single joined query
        submission = db.query(Submission).options(
            joinedload(Submission.assignment)
        ).filter(Submission.id == submission_id).first()

        if not submission:
            return

        # ── Text extraction (Check existing cached text first) ───────────
        if submission.extracted_text and submission.extracted_text.strip():
            cleaned_text = submission.extracted_text
        else:
            extraction = extract_text_from_pdf(file_path)

            if not extraction["text"].strip():
                submission.status = "failed"
                submission.error_message = "No text could be extracted from this PDF."
                db.commit()
                return

            cleaned_text = clean_extracted_text(extraction["text"])
            submission.extracted_text = cleaned_text
            submission.extraction_method = extraction["method"]
            submission.extraction_confidence = (
                round(extraction["confidence"]) if extraction["confidence"] is not None else None
            )
            submission.ocr_engine_used = extraction.get("ocr_engine_used")
            submission.extraction_status = extraction.get("extraction_status")
            submission.ocr_processing_time = extraction.get("processing_time")

            if extraction["low_confidence"]:
                submission.status = "failed"
                conf_str = f"{extraction['confidence']:.0f}%" if extraction['confidence'] is not None else "N/A"
                engine_str = f" using {extraction['ocr_engine_used']}" if extraction.get('ocr_engine_used') else ""
                submission.error_message = (
                    f"Text extraction confidence was too low ({conf_str}){engine_str} to reliably "
                    "evaluate this submission. Please ask the student to resubmit a clearer scan."
                )
                db.commit()
                return

            submission.status = "extracted"
            db.commit()

        # ── Plagiarism Detection ──────────────────────────────────────────
        plagiarism_report = None
        try:
            plagiarism_report = compute_plagiarism_report(submission.id, db)
        except Exception as p_err:
            logger.warning("Plagiarism computation error for submission %s: %s", submission.id, p_err)

        # ── Load assignment + rubric ──────────────────────────────────────
        assignment = submission.assignment or db.query(Assignment).filter(
            Assignment.id == submission.assignment_id
        ).first()

        rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()
        criteria = db.query(RubricCriterion).filter(
            RubricCriterion.rubric_id == rubric.id
        ).order_by(RubricCriterion.id).all()

        # ── Prepare submission text — sample across full document ─────────
        submission_excerpt = _prepare_submission_text(cleaned_text)

        # ── Build evaluation prompt ───────────────────────────────────────
        criteria_block = "\n".join([
            f'- Key: "{c.key}" | Criterion: {c.label} | Max marks: {c.max_marks}'
            + (f' | Description: {c.description}' if c.description else '')
            for c in criteria
        ])

        criteria_keys = ", ".join([f'"{c.key}": 0' for c in criteria])

        plagiarism_notice_block = ""
        if plagiarism_report and plagiarism_report.risk_level in ["medium", "high"]:
            plagiarism_notice_block = (
                f"\nPLAGIARISM & SIMILARITY NOTICE:\n"
                f"A similarity score of {submission.plagiarism_score:.1f}% ({plagiarism_report.risk_level.upper()} risk) "
                f"was detected compared to another submission in this course.\n"
                f"Instructions for AI Evaluator:\n"
                f"- Note any relevant academic integrity observations in your written summary if appropriate.\n"
                f"- Do NOT automatically deduct marks or award zero solely based on this notice. Grade the content against rubric criteria fairly as the human teacher will review all plagiarism flags.\n"
            )

        prompt = f"""You are an experienced academic lecturer evaluating a student assignment.
Your goal is fair, balanced, and encouraging assessment — not to find every flaw.

ASSIGNMENT TITLE: {assignment.title}

ASSIGNMENT DESCRIPTION AND INSTRUCTIONS:
{assignment.description or 'No specific instructions provided.'}

RUBRIC CRITERIA (evaluate EACH one separately):
{criteria_block}

STUDENT SUBMISSION (representative sample from the full document):
{submission_excerpt}
{plagiarism_notice_block}
SCORING GUIDELINES — READ CAREFULLY:
- Award FULL marks if the student has made a genuine, reasonable attempt at the criterion.
- Award PARTIAL marks for work that is present but incomplete or lacking depth.
- Award ZERO only if the criterion topic is completely absent from the submission.
- A student who covers a topic with reasonable depth but misses minor details should NOT score zero.
- The submission excerpt may not show every part of the full document — give benefit of the doubt if a topic appears to be covered.
- Do NOT penalize for things not explicitly required by the rubric.
- Keep each criterion feedback to 1-2 sentences. Be specific, not generic.
- Strengths: 2-3 bullet points on what was genuinely done well.
- Weaknesses: 2-3 bullet points on genuine gaps only.
- Summary: 2-3 sentences maximum.

Respond with ONLY a valid JSON object, no other text before or after:
{{
  "criteria_scores": {{ {criteria_keys} }},
  "criteria_feedback": [
    {{
      "key": "criterion_key",
      "label": "Criterion Label",
      "score": 0,
      "max_score": 0,
      "what_was_good": "one specific positive observation",
      "what_was_missing": "one specific gap, or null if fully met"
    }}
  ],
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "improvements": ["improvement suggestion 1", "improvement suggestion 2"],
  "summary": "2-3 sentence overall assessment."
}}"""

        # ── Generate, with one retry on a larger budget ───────────────────
        raw_output, parsed, parse_error = "", None, None
        for attempt, budget in enumerate((1600, 2400), start=1):
            raw_output = _run_model(prompt, budget)
            try:
                parsed, repaired = parse_llm_json(raw_output)
                if repaired:
                    logger.warning(
                        "submission %s: model JSON needed repair (attempt %s, %s chars)",
                        submission.id, attempt, len(raw_output),
                    )
                    _dump_raw_output(submission.id, raw_output, "repaired before parsing")
                break
            except LLMJsonError as exc:
                parse_error = exc
                path = _dump_raw_output(submission.id, raw_output, str(exc))
                logger.error(
                    "submission %s: JSON parse failed (attempt %s, truncated=%s) — %s | %s | saved to %s",
                    submission.id, attempt, exc.truncated, exc, exc.detail, path,
                )

        # ── Unusable output: keep the submission gradable ────────────────
        if parsed is None:
            note = (
                "Automated evaluation was unavailable for this submission — the AI "
                "response could not be read. Please grade it manually against the rubric."
            )
            _save_evaluation(
                db, submission,
                criteria_scores={c.key: 0 for c in criteria},
                total=0,
                feedback={
                    "criteria_feedback": [
                        {
                            "key": c.key,
                            "label": c.label,
                            "score": 0,
                            "max_score": c.max_marks,
                            "what_was_good": None,
                            "what_was_missing": None,
                        }
                        for c in criteria
                    ],
                    "strengths": [],
                    "weaknesses": [],
                    "improvements": [],
                    "summary": note,
                    "ai_evaluation_failed": True,
                    "ai_error": str(parse_error) if parse_error else "unknown parse failure",
                    "ai_score": submission.ai_score,
                    "plagiarism_score": submission.plagiarism_score,
                },
                raw_output=raw_output,
            )
            submission.status = "ai_evaluated"
            submission.error_message = note
            db.commit()
            return

        # ── Score against the rubric's own keys, never the model's ───────
        max_by_key = {c.key: c.max_marks for c in criteria}
        raw_scores = parsed.get("criteria_scores")
        if not isinstance(raw_scores, dict):
            raw_scores = {}
        clamped_scores = {
            key: max(0, min(_as_int(raw_scores.get(key)), max_marks))
            for key, max_marks in max_by_key.items()
        }
        total_score = sum(clamped_scores.values())

        missing = [k for k in max_by_key if k not in raw_scores]
        if missing:
            logger.warning(
                "submission %s: model omitted scores for %s — defaulted to 0",
                submission.id, missing,
            )

        # ── Rebuild feedback from the rubric so a bad key can't drop a row ─
        by_key = {
            item["key"]: item
            for item in (parsed.get("criteria_feedback") or [])
            if isinstance(item, dict) and item.get("key") in max_by_key
        }
        criteria_feedback = []
        for c in criteria:
            item = dict(by_key.get(c.key, {}))
            item["key"] = c.key
            item["label"] = item.get("label") or c.label
            item["score"] = clamped_scores[c.key]
            item["max_score"] = c.max_marks
            criteria_feedback.append(item)

        _save_evaluation(
            db, submission,
            criteria_scores=clamped_scores,
            total=total_score,
            feedback={
                "criteria_feedback": criteria_feedback,
                "strengths": _as_list(parsed.get("strengths")),
                "weaknesses": _as_list(parsed.get("weaknesses")),
                "improvements": _as_list(parsed.get("improvements")),
                "summary": parsed.get("summary") if isinstance(parsed.get("summary"), str) else "",
                "ai_score": submission.ai_score,
                "plagiarism_score": submission.plagiarism_score,
            },
            raw_output=raw_output,
        )
        submission.status = "ai_evaluated"
        submission.error_message = None
        db.commit()

    except Exception as e:
        logger.exception("submission %s: evaluation task failed", submission_id)
        try:
            if submission is None:
                submission = db.query(Submission).filter(
                    Submission.id == submission_id
                ).first()
            if submission:
                submission.status = "failed"
                submission.error_message = f"Evaluation failed: {e}"
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()