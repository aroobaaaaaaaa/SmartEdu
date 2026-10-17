# app/schemas/attendance.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Literal


class SessionCreate(BaseModel):
    session_date: datetime
    topic: Optional[str] = None


class SessionResponse(BaseModel):
    id: int
    course_id: int
    session_date: datetime
    topic: Optional[str]
    created_by: int
    created_at: datetime
    marked_count: int = 0   # how many students already have a record for this session

    class Config:
        from_attributes = True


class AttendanceMark(BaseModel):
    student_id: int
    status: Literal["present", "absent", "late"]


class MarkAttendanceRequest(BaseModel):
    """Bulk mark — the teacher submits the whole roster's status in one call."""
    records: List[AttendanceMark]


class AttendanceRecordResponse(BaseModel):
    id: int
    session_id: int
    student_id: int
    student_name: Optional[str] = None
    status: str
    marked_at: datetime

    class Config:
        from_attributes = True


class StudentAttendanceSummary(BaseModel):
    student_id: int
    student_name: str
    total_sessions: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_rate: Optional[float] = None  # None if no sessions recorded yet
