# app/routers/attendance.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import User, ClassSession, AttendanceRecord, Enrollment
from app.schemas.attendance import (
    SessionCreate, SessionResponse, MarkAttendanceRequest,
    AttendanceRecordResponse, StudentAttendanceSummary,
)
from app.utils.auth import get_current_user, require_role
from app.routers.courses import get_course_for_access
from app.services import attendance_service

router = APIRouter()


@router.post("/{course_id}/sessions", response_model=SessionResponse)
def create_session(
    course_id: int,
    payload: SessionCreate,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)

    session = ClassSession(
        course_id=course_id,
        session_date=payload.session_date,
        topic=payload.topic,
        created_by=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    response = SessionResponse.model_validate(session)
    response.marked_count = 0
    return response


@router.get("/{course_id}/sessions", response_model=List[SessionResponse])
def list_sessions(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Any authenticated user with course access (teacher or student) can view the session list."""
    get_course_for_access(course_id, current_user, db)

    sessions = attendance_service.get_course_sessions(course_id, db)
    results = []
    for s in sessions:
        r = SessionResponse.model_validate(s)
        r.marked_count = (
            db.query(AttendanceRecord).filter(AttendanceRecord.session_id == s.id).count()
        )
        results.append(r)
    return results


@router.post("/sessions/{session_id}/mark", response_model=List[AttendanceRecordResponse])
def mark_attendance(
    session_id: int,
    payload: MarkAttendanceRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """
    Bulk upsert — the teacher submits the whole roster's status at once.
    Idempotent: re-marking a session updates existing records rather than duplicating them.
    """
    session = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    get_course_for_access(session.course_id, current_user, db)

    # Validate every student is actually enrolled in this course
    enrolled_ids = {
        e.student_id for e in db.query(Enrollment).filter(Enrollment.course_id == session.course_id).all()
    }

    saved = []
    for mark in payload.records:
        if mark.student_id not in enrolled_ids:
            raise HTTPException(400, f"Student {mark.student_id} is not enrolled in this course")

        existing = db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session_id,
            AttendanceRecord.student_id == mark.student_id,
        ).first()

        if existing:
            existing.status = mark.status
            existing.marked_by = current_user.id
            saved.append(existing)
        else:
            record = AttendanceRecord(
                session_id=session_id,
                student_id=mark.student_id,
                status=mark.status,
                marked_by=current_user.id,
            )
            db.add(record)
            saved.append(record)

    db.commit()
    for r in saved:
        db.refresh(r)

    # Attach student names for the response
    name_map = {}
    for r in saved:
        if r.student_id not in name_map:
            name_map[r.student_id] = r.student.full_name if r.student else None

    responses = []
    for r in saved:
        resp = AttendanceRecordResponse.model_validate(r)
        resp.student_name = name_map.get(r.student_id)
        responses.append(resp)
    return responses


@router.get("/sessions/{session_id}/records", response_model=List[AttendanceRecordResponse])
def get_session_records(
    session_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    session = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    get_course_for_access(session.course_id, current_user, db)

    records = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session_id).all()
    results = []
    for r in records:
        resp = AttendanceRecordResponse.model_validate(r)
        resp.student_name = r.student.full_name if r.student else None
        results.append(resp)
    return results


@router.get("/{course_id}/summary", response_model=List[StudentAttendanceSummary])
def get_attendance_summary(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)
    return attendance_service.get_course_attendance_summary(course_id, db)


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """Deletes a class attendance session and all associated student attendance records."""
    session = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    get_course_for_access(session.course_id, current_user, db)

    db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"message": "Attendance session deleted successfully", "id": session_id}
