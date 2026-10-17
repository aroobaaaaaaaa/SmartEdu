# app/schemas/admin.py
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


class CourseCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class CourseResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class AssignTeacherRequest(BaseModel):
    teacher_email: EmailStr


class EnrollStudentRequest(BaseModel):
    student_identifier: str


class UserSummary(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    registration_number: Optional[str] = None
    has_set_password: bool = False  # ADD THIS LINE
    created_at: datetime

    class Config:
        from_attributes = True


class CourseDetailResponse(CourseResponse):
    """Course + who teaches it + how many students, for the admin course list."""
    teachers: List[UserSummary] = []
    student_count: int = 0