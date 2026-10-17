# app/routers/assignments.py
import os
import shutil
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from datetime import datetime
from pydantic import BaseModel

from app.database.db import get_db, SessionLocal
from app.schemas.assignment import (
    AssignmentCreate, AssignmentResponse, SubmissionResponse,
    AIEvaluationResponse, TeacherReviewRequest, FinalGradeResponse,
)
from app.utils.auth import require_role, get_current_user
from app.routers.courses import get_course_for_access
from app.services.evaluation_service import evaluate_submission_task
from app.services.badge_service import evaluate_assignment_badges, get_assignment_badges
from app.services.cache_service import lms_context_cache
from app.config import settings
from app.models.models import (
    User, Assignment, Submission, AIEvaluation, FinalGrade, Enrollment,
    Rubric, RubricCriterion, AssignmentDeadlineHistory, PlagiarismReport, StudentAchievement
)
from app.services.plagiarism_service import compute_plagiarism_report, recompute_assignment_plagiarism

router = APIRouter()


class ExtendDeadlineRequest(BaseModel):
    new_due_date: datetime
    reason: Optional[str] = None


# ---------- Teacher: create assignment ----------
@router.post("/{course_id}", response_model=AssignmentResponse)
def create_assignment(
    course_id: int,
    payload: AssignmentCreate,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)

    if not payload.criteria:
        raise HTTPException(400, "At least one rubric criterion is required")

    total_marks = sum(c.max_marks for c in payload.criteria)

    rubric = Rubric(
        course_id=course_id,
        created_by=current_user.id,
        title=f"{payload.title} — Rubric",
        total_marks=total_marks,
    )
    db.add(rubric)
    db.commit()
    db.refresh(rubric)

    import re
    for c in payload.criteria:
        clean_label = re.sub(r'[\t\r\n]+', ' ', c.label or "").strip()[:250]
        key = re.sub(r'[^a-z0-9_]', '', re.sub(r'[\s\t\/\-]+', '_', clean_label.lower())).strip('_')[:250]
        if not key:
            key = f"criterion_{rubric.id}"
        db.add(RubricCriterion(
            rubric_id=rubric.id,
            key=key,
            label=clean_label or "Criterion",
            max_marks=c.max_marks,
            description=c.description,
        ))
    db.commit()

    assignment = Assignment(
        course_id=course_id,
        created_by=current_user.id,
        rubric_id=rubric.id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    lms_context_cache.clear()
    return _assignment_with_criteria(assignment, db)


def _assignment_with_criteria(assignment: Assignment, db: Session) -> dict:
    """Helper: attach criteria and total marks to assignment response."""
    criteria = db.query(RubricCriterion).filter(
        RubricCriterion.rubric_id == assignment.rubric_id
    ).all()
    rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()

    result = AssignmentResponse.model_validate(assignment)
    result.criteria = criteria
    result.total_marks = rubric.total_marks if rubric else 0
    return result


@router.get("/{course_id}", response_model=List[AssignmentResponse])
def list_assignments(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)
    assignments = db.query(Assignment).filter(
        Assignment.course_id == course_id
    ).all()
    return [_assignment_with_criteria(a, db) for a in assignments]


# ---------- Fetch single assignment (title, due date, criteria) ----------
@router.get("/detail/{assignment_id}", response_model=AssignmentResponse)
def get_assignment_detail(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)
    return _assignment_with_criteria(assignment, db)


# ---------- Teacher: Extend Deadline ----------
@router.put("/{assignment_id}/extend-deadline")
def extend_deadline(
    assignment_id: int,
    payload: ExtendDeadlineRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    get_course_for_access(assignment.course_id, current_user, db)

    previous_due = assignment.due_date

    # Record deadline history audit log
    history_entry = AssignmentDeadlineHistory(
        assignment_id=assignment_id,
        previous_due_date=previous_due,
        new_due_date=payload.new_due_date,
        updated_by=current_user.id,
        reason=payload.reason,
    )
    db.add(history_entry)

    # Update assignment due date
    assignment.due_date = payload.new_due_date
    db.commit()
    db.refresh(assignment)

    # Invalidate LMS context cache so AI chatbot and students get fresh date immediately
    lms_context_cache.clear()

    # Re-evaluate badges
    evaluate_assignment_badges(assignment_id, db)

    return {
        "message": "Deadline updated successfully",
        "assignment_id": assignment_id,
        "previous_due_date": previous_due,
        "new_due_date": assignment.due_date,
    }


@router.get("/{assignment_id}/deadline-history")
def get_deadline_history(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)

    histories = db.query(AssignmentDeadlineHistory).filter(
        AssignmentDeadlineHistory.assignment_id == assignment_id
    ).order_by(AssignmentDeadlineHistory.updated_at.desc()).all()

    results = []
    for h in histories:
        results.append({
            "id": h.id,
            "previous_due_date": h.previous_due_date,
            "new_due_date": h.new_due_date,
            "updated_by": h.updater.full_name if h.updater else "Teacher",
            "updated_at": h.updated_at,
            "reason": h.reason,
        })
    return results


@router.get("/{assignment_id}/badges")
def get_badges_for_assignment_endpoint(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)

    # Evaluate any pending badges (e.g. if deadline recently passed)
    evaluate_assignment_badges(assignment_id, db)
    return get_assignment_badges(assignment_id, db)


# ---------- Student: fetch rubric ----------
@router.get("/{assignment_id}/rubric")
def get_assignment_rubric(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)

    criteria = db.query(RubricCriterion).filter(
        RubricCriterion.rubric_id == assignment.rubric_id
    ).all()
    rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()

    return {
        "assignment_title": assignment.title,
        "description": assignment.description,
        "total_marks": rubric.total_marks if rubric else 0,
        "criteria": [
            {"label": c.label, "max_marks": c.max_marks, "description": c.description}
            for c in criteria
        ],
    }


# ---------- Student: submit ----------
@router.post("/{assignment_id}/submit", response_model=SubmissionResponse)
async def submit_assignment(
    assignment_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    get_course_for_access(assignment.course_id, current_user, db)

    if assignment.due_date and datetime.utcnow() > assignment.due_date:
        raise HTTPException(
            400,
            f"The deadline for this assignment passed on {assignment.due_date.strftime('%b %d, %Y at %I:%M %p')}. Late submissions are not accepted.",
        )

    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    submission = Submission(
        assignment_id=assignment_id, student_id=current_user.id,
        file_path="", status="processing",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, f"submission_{submission.id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    submission.file_path = file_path
    db.commit()

    background_tasks.add_task(
        evaluate_submission_task,
        submission_id=submission.id, file_path=file_path,
        db_session_factory=SessionLocal,
    )

    return submission


# ---------- Teacher: manual re-run OCR for a submission ----------
@router.post("/submissions/{submission_id}/reprocess-ocr")
def reprocess_ocr(
    submission_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.file_path or not os.path.exists(submission.file_path):
        raise HTTPException(400, "Submission PDF file not found on disk")

    submission.extracted_text = None  # force re-extraction, bypassing cache
    submission.extraction_method = None
    submission.extraction_confidence = None
    submission.ocr_engine_used = None
    submission.extraction_status = None
    submission.ocr_processing_time = None
    submission.status = "processing"
    submission.error_message = None
    db.commit()

    background_tasks.add_task(
        evaluate_submission_task,
        submission_id=submission.id,
        file_path=submission.file_path,
        db_session_factory=SessionLocal,
    )
    return {"status": "reprocessing"}


# ---------- Student: check own submission status ----------
@router.get("/submissions/{submission_id}", response_model=SubmissionResponse)
def get_submission_status(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    if current_user.role == "student" and submission.student_id != current_user.id:
        raise HTTPException(403, "Not your submission")
    return submission


# ---------- Teacher: list submissions ----------
@router.get("/{assignment_id}/submissions", response_model=List[SubmissionResponse])
def list_submissions(
    assignment_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)

    # Evaluate badges post-deadline if needed
    evaluate_assignment_badges(assignment_id, db)

    submissions = db.query(Submission).filter(Submission.assignment_id == assignment_id).all()

    student_ids = [s.student_id for s in submissions]
    students = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(student_ids)).all()}
    for s in submissions:
        s.student_name = students.get(s.student_id)

    return submissions


# ---------- Teacher: view AI evaluation ----------
@router.get("/submissions/{submission_id}/ai-evaluation", response_model=AIEvaluationResponse)
def get_ai_evaluation(
    submission_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.ai_evaluation:
        raise HTTPException(404, "AI evaluation not ready yet")
    return submission.ai_evaluation


# ---------- Teacher: approve/override -> creates FINAL grade ----------
@router.post("/submissions/{submission_id}/review", response_model=FinalGradeResponse)
def review_submission(
    submission_id: int,
    payload: TeacherReviewRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.ai_evaluation:
        raise HTTPException(400, "Cannot review before AI evaluation completes")
    if submission.final_grade:
        raise HTTPException(400, "This submission has already been reviewed")

    total_score = sum(payload.criteria_scores.values())
    was_overridden = payload.criteria_scores != submission.ai_evaluation.criteria_scores

    final_grade = FinalGrade(
        submission_id=submission.id, reviewed_by=current_user.id,
        criteria_scores=payload.criteria_scores, total_score=total_score,
        teacher_comments=payload.teacher_comments, was_ai_overridden=was_overridden,
    )
    db.add(final_grade)
    submission.status = "teacher_reviewed"
    db.commit()
    db.refresh(final_grade)

    # Trigger badge evaluation (High Achiever & Perfect Score)
    evaluate_assignment_badges(submission.assignment_id, db)

    return final_grade


# ---------- Student: view final grade ----------
@router.get("/submissions/{submission_id}/grade")
def get_final_grade(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    if current_user.role == "student" and submission.student_id != current_user.id:
        raise HTTPException(403, "Not your submission")

    if not submission.final_grade:
        raise HTTPException(404, "This submission has not been graded yet")

    grade = submission.final_grade

    ai_feedback = None
    if submission.ai_evaluation:
        ai_feedback = submission.ai_evaluation.feedback

    return {
        "criteria_scores": grade.criteria_scores,
        "total_score": grade.total_score,
        "teacher_comments": grade.teacher_comments,
        "was_ai_overridden": grade.was_ai_overridden,
        "reviewed_at": grade.reviewed_at,
        "ai_feedback": ai_feedback,
    }


@router.get("/{assignment_id}/my-submission", response_model=SubmissionResponse)
def get_my_submission(
    assignment_id: int,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.student_id == current_user.id,
    ).order_by(Submission.submitted_at.desc()).first()

    if not submission:
        raise HTTPException(404, "No submission found")
    return submission


@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    get_course_for_access(assignment.course_id, current_user, db)

    submission_ids = [s.id for s in assignment.submissions]

    # Delete achievements and deadline history referencing this assignment
    db.query(StudentAchievement).filter(StudentAchievement.assignment_id == assignment_id).delete(synchronize_session=False)
    db.query(AssignmentDeadlineHistory).filter(AssignmentDeadlineHistory.assignment_id == assignment_id).delete(synchronize_session=False)

    if submission_ids:
        # Nullify foreign key references in other plagiarism reports pointing to these submissions
        db.query(PlagiarismReport).filter(
            PlagiarismReport.matched_submission_id.in_(submission_ids)
        ).update({"matched_submission_id": None, "matched_student_id": None}, synchronize_session=False)

    for submission in assignment.submissions:
        if submission.file_path and os.path.exists(submission.file_path):
            try:
                os.remove(submission.file_path)
            except Exception:
                pass

    rubric_id = assignment.rubric_id

    db.delete(assignment)
    db.commit()

    # Clean orphaned rubric if no other assignment references it
    if rubric_id:
        other_assignment = db.query(Assignment).filter(Assignment.rubric_id == rubric_id).first()
        if not other_assignment:
            rubric = db.query(Rubric).filter(Rubric.id == rubric_id).first()
            if rubric:
                db.delete(rubric)
                db.commit()

    lms_context_cache.clear()
    return {"message": "Assignment deleted"}



@router.get("/submissions/{submission_id}/file")
def download_submission_file(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")

    if current_user.role == "student":
        if submission.student_id != current_user.id:
            raise HTTPException(403, "Not your submission")
    elif current_user.role == "teacher":
        get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.file_path or not os.path.exists(submission.file_path):
        raise HTTPException(404, "File not found on server")

    original_filename = os.path.basename(submission.file_path).split("_", 2)[-1]
    return FileResponse(
        submission.file_path,
        filename=original_filename,
        media_type="application/pdf",
    )


@router.delete("/submissions/{submission_id}")
def delete_my_submission(
    submission_id: int,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")

    if submission.student_id != current_user.id:
        raise HTTPException(403, "Not your submission")

    assignment = submission.assignment

    if assignment.due_date and datetime.utcnow() > assignment.due_date:
        raise HTTPException(
            400,
            "This assignment's deadline has passed. Submissions are locked and can no longer be deleted.",
        )

    if submission.status == "teacher_reviewed":
        raise HTTPException(400, "This submission has already been graded and cannot be deleted.")

    if submission.file_path and os.path.exists(submission.file_path):
        os.remove(submission.file_path)

    db.delete(submission)
    db.commit()
    return {"message": "Submission deleted. You may resubmit before the deadline."}


@router.get("/submissions/{submission_id}/plagiarism")
def get_plagiarism_report(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")

    if current_user.role == "student" and submission.student_id != current_user.id:
        raise HTTPException(403, "Access denied")
    elif current_user.role == "teacher":
        get_course_for_access(submission.assignment.course_id, current_user, db)

    report = db.query(PlagiarismReport).filter(PlagiarismReport.submission_id == submission_id).first()

    # Recompute if report missing or lacks narrative summary
    if (not report or not report.summary or "Similarity score of" in report.summary) and submission.extracted_text:
        report = compute_plagiarism_report(submission_id, db)

    if not report:
        return {
            "submission_id": submission_id,
            "similarity_score": 0.0,
            "percentage_score": 0.0,
            "risk_level": "low",
            "confidence_level": "high",
            "detection_status": submission.detection_status or "not_checked",
            "summary": "Low similarity (0.0%). Content appears to be original student work with no significant plagiarism detected.",
            "tfidf_score": 0.0,
            "shingle_score": 0.0,
            "semantic_score": 0.0,
            "matching_spans": [],
            "matched_student_name": None,
            "matched_submission_id": None,
        }

    matched_student_name = None
    if report.matched_student_id:
        student_user = db.query(User).filter(User.id == report.matched_student_id).first()
        if student_user:
            matched_student_name = student_user.full_name

    return {
        "id": report.id,
        "submission_id": report.submission_id,
        "matched_submission_id": report.matched_submission_id,
        "matched_student_id": report.matched_student_id,
        "matched_student_name": matched_student_name,
        "similarity_score": report.similarity_score,
        "percentage_score": round(report.similarity_score * 100.0, 1),
        "risk_level": report.risk_level,
        "confidence_level": getattr(report, "confidence_level", "medium") or "medium",
        "summary": report.summary or f"Similarity score of {round(report.similarity_score * 100.0, 1)}% ({report.risk_level} risk).",
        "tfidf_score": report.tfidf_score,
        "shingle_score": report.shingle_score,
        "semantic_score": report.semantic_score,
        "matching_spans": report.matching_spans or [],
        "created_at": report.created_at,
    }


@router.post("/{assignment_id}/plagiarism/recompute")
def recompute_plagiarism_endpoint(
    assignment_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    get_course_for_access(assignment.course_id, current_user, db)

    result = recompute_assignment_plagiarism(assignment_id, db)
    return result