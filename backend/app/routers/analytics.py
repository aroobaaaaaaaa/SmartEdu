# app/routers/analytics.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import os
import joblib
import numpy as np
from sqlalchemy import func
from app.models.models import (
    ClassSession, AttendanceRecord, Assignment, 
    Submission, FinalGrade, EngagementEvent, StudentRiskAssessment
)

from app.database.db import get_db
from app.models.models import User, Enrollment
from app.schemas.analytics import CourseRiskSummary, StudentProgressResponse, CourseProgressOverviewResponse
from app.utils.auth import require_role, get_current_user
from app.routers.courses import get_course_for_access
from app.services import analytics_service, progress_service

router = APIRouter()


@router.get("/{course_id}/risk", response_model=CourseRiskSummary)
def get_course_risk(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """
    Returns the current at-risk assessment for this course.
    Always computes live to ensure passed deadlines and recent grades are reflected immediately.
    """
    get_course_for_access(course_id, current_user, db)
    return analytics_service.compute_course_risk(course_id, db)


@router.get("/{course_id}/students/{student_id}/progress", response_model=StudentProgressResponse)
def get_student_progress_endpoint(
    course_id: int,
    student_id: int,
    granularity: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    periods: Optional[int] = Query(None, ge=2, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns granular progress timeline, trend analysis, dimensional breakdown,
    replayed risk trajectory, and natural language actionable insights for a student.
    Teachers and admins can view any student enrolled in the course; students can view their own.
    """
    if current_user.role == "student":
        if current_user.id != student_id:
            raise HTTPException(403, "You can only view your own progress analytics")
        # Validate enrollment
        get_course_for_access(course_id, current_user, db)
        audience = "student"
    else:
        # Teacher or Admin
        get_course_for_access(course_id, current_user, db)
        # Check that the target student is actually enrolled
        enrolled = db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
        ).first()
        if not enrolled:
            raise HTTPException(404, "Student is not enrolled in this course")
        audience = "teacher"

    return progress_service.get_student_progress(
        student_id=student_id,
        course_id=course_id,
        db=db,
        granularity=granularity,
        periods=periods,
        audience=audience,
    )


@router.get("/{course_id}/my-progress", response_model=StudentProgressResponse)
def get_my_progress_endpoint(
    course_id: int,
    granularity: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    periods: Optional[int] = Query(None, ge=2, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convenience endpoint for the logged-in student to retrieve their own progress analytics.
    """
    get_course_for_access(course_id, current_user, db)
    return progress_service.get_student_progress(
        student_id=current_user.id,
        course_id=course_id,
        db=db,
        granularity=granularity,
        periods=periods,
        audience="student",
    )


@router.get("/{course_id}/progress-overview", response_model=CourseProgressOverviewResponse)
def get_course_progress_overview_endpoint(
    course_id: int,
    granularity: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    periods: Optional[int] = Query(None, ge=2, le=60),
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """
    Teacher course progress overview: aggregated cohort trajectories, risk & trend breakdowns,
    student list with trends, and prioritized intervention shortlist.
    """
    get_course_for_access(course_id, current_user, db)
    return progress_service.get_course_progress_overview(
        course_id=course_id,
        db=db,
        granularity=granularity,
        periods=periods,
    )

MODEL_PATH = "app/ml/risk_model.pkl"

def load_ml_model():
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    return None


@router.post("/{course_id}/students/{student_id}/assess-risk")
def assess_student_risk_ml(
    course_id: int,
    student_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """
    ML-based individual risk assessment using Random Forest classifier.
    Extracts live attendance, submission, grade, and engagement metrics from the DB.
    """
    # 1. Access Control & Enrollment Check
    get_course_for_access(course_id, current_user, db)
    
    enrolled = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.student_id == student_id,
    ).first()
    if not enrolled:
        raise HTTPException(404, "Student is not enrolled in this course")

    # 2. Extract Attendance Rate
    total_sessions = db.query(ClassSession).filter(ClassSession.course_id == course_id).count()
    if total_sessions > 0:
        attended = db.query(AttendanceRecord).join(ClassSession).filter(
            ClassSession.course_id == course_id,
            AttendanceRecord.student_id == student_id,
            AttendanceRecord.status == "present"
        ).count()
        attendance_rate = attended / total_sessions
    else:
        attendance_rate = 1.0

    # 3. Extract Submission Rate
    total_assignments = db.query(Assignment).filter(Assignment.course_id == course_id).count()
    if total_assignments > 0:
        submitted = db.query(Submission).join(Assignment).filter(
            Assignment.course_id == course_id,
            Submission.student_id == student_id
        ).count()
        submission_rate = submitted / total_assignments
    else:
        submission_rate = 1.0

    # 4. Extract Average Grade
    avg_grade_res = db.query(func.avg(FinalGrade.total_score)).join(Submission).join(Assignment).filter(
        Assignment.course_id == course_id,
        Submission.student_id == student_id
    ).scalar()
    avg_grade = float(avg_grade_res) if avg_grade_res is not None else 100.0

    # 5. Extract Engagement Events
    engagement_count = db.query(EngagementEvent).filter(
        EngagementEvent.course_id == course_id,
        EngagementEvent.student_id == student_id
    ).count()

    # 6. Model Prediction
    model = load_ml_model()
    if not model:
        raise HTTPException(500, "ML Model file 'app/ml/risk_model.pkl' not found. Run training script first.")

    features = np.array([[attendance_rate, submission_rate, avg_grade, engagement_count]])
    predicted_risk = model.predict(features)[0]
    probabilities = model.predict_proba(features)[0]

    class_labels = list(model.classes_)
    high_risk_idx = class_labels.index("high") if "high" in class_labels else -1
    risk_score = float(probabilities[high_risk_idx]) if high_risk_idx != -1 else 0.5

    # 7. Persist Assessment to DB
    assessment = StudentRiskAssessment(
        student_id=student_id,
        course_id=course_id,
        risk_level=predicted_risk,
        risk_score=risk_score,
        factors={
            "attendance_rate": round(attendance_rate, 2),
            "submission_rate": round(submission_rate, 2),
            "avg_grade": round(avg_grade, 2),
            "engagement_count": engagement_count
        }
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    return {
        "student_id": student_id,
        "course_id": course_id,
        "risk_level": predicted_risk,
        "risk_score": round(risk_score, 2),
        "contributing_factors": assessment.factors
    }