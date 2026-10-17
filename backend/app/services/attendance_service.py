# app/services/attendance_service.py
"""
Attendance business logic. Kept separate from the router (same pattern as
badge_service.py / lms_context_service.py) because get_student_attendance_rate()
is also called from analytics_service.py during feature extraction.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from app.models.models import ClassSession, AttendanceRecord, Enrollment, User


def get_course_sessions(course_id: int, db: Session) -> list[ClassSession]:
    return (
        db.query(ClassSession)
        .filter(ClassSession.course_id == course_id)
        .order_by(ClassSession.session_date.desc())
        .all()
    )


def get_student_attendance_rate(student_id: int, course_id: int, db: Session) -> Optional[float]:
    """
    Returns present-rate (present + late counted as attended) as a 0.0–1.0 float,
    or None if no sessions have been marked yet for this student in this course
    (callers should treat None as "no data" rather than 0% attendance).
    """
    records = (
        db.query(AttendanceRecord)
        .join(ClassSession, ClassSession.id == AttendanceRecord.session_id)
        .filter(ClassSession.course_id == course_id, AttendanceRecord.student_id == student_id)
        .all()
    )
    if not records:
        return None
    attended = sum(1 for r in records if r.status in ("present", "late"))
    return attended / len(records)


def get_course_attendance_summary(course_id: int, db: Session) -> list[dict]:
    """Per-student attendance breakdown for every enrolled student in the course."""
    students = (
        db.query(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .filter(Enrollment.course_id == course_id)
        .all()
    )

    session_ids = [s.id for s in get_course_sessions(course_id, db)]
    total_sessions = len(session_ids)

    results = []
    for student in students:
        records = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.student_id == student.id, AttendanceRecord.session_id.in_(session_ids))
            .all()
            if session_ids else []
        )
        present = sum(1 for r in records if r.status == "present")
        absent = sum(1 for r in records if r.status == "absent")
        late = sum(1 for r in records if r.status == "late")
        marked = present + absent + late
        rate = (present + late) / marked if marked > 0 else None
        results.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "total_sessions": total_sessions,
            "present_count": present,
            "absent_count": absent,
            "late_count": late,
            "attendance_rate": rate,
        })
    return results
