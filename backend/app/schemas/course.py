# app/schemas/course.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CourseCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class CourseResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    created_by: int          # was teacher_id — courses are now created by Admin, not owned by a teacher
    created_at: datetime

    class Config:
        from_attributes = True  # lets Pydantic read directly from SQLAlchemy objects


class EnrollRequest(BaseModel):
    student_email: str  # teacher enrolls a student by their email


class EnrollmentResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    enrolled_at: datetime

    class Config:
        from_attributes = True


class StudentInCourse(BaseModel):
    id: int
    full_name: str
    email: str

    class Config:
        from_attributes = True