# app/routers/courses.py
"""
Teacher and Student course access — READ ONLY for course/enrollment
structure now. All creation/assignment/enrollment lives in admin.py.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database.db import get_db
from app.models.models import User, Course, TeacherCourseAssignment, Enrollment
from app.schemas.course import CourseResponse, StudentInCourse
from app.utils.auth import get_current_user, require_role

router = APIRouter()


def get_course_for_access(course_id: int, current_user: User, db: Session) -> Course:
    """
    Replaces the old _get_owned_course_or_404. Now checks ASSIGNMENT
    (teacher) or ENROLLMENT (student) instead of direct ownership,
    since courses no longer belong to a single teacher.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")

    if current_user.role == "teacher":
        assigned = db.query(TeacherCourseAssignment).filter(
            TeacherCourseAssignment.course_id == course_id,
            TeacherCourseAssignment.teacher_id == current_user.id,
        ).first()
        if not assigned:
            raise HTTPException(403, "You are not assigned to this course")
    elif current_user.role == "student":
        enrolled = db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == current_user.id,
        ).first()
        if not enrolled:
            raise HTTPException(403, "You are not enrolled in this course")
    # admin always passes through unchecked

    return course


@router.get("/teaching", response_model=List[CourseResponse])
def list_my_assigned_courses(
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    return (
        db.query(Course)
        .join(TeacherCourseAssignment, TeacherCourseAssignment.course_id == Course.id)
        .filter(TeacherCourseAssignment.teacher_id == current_user.id)
        .all()
    )


@router.get("/enrolled", response_model=List[CourseResponse])
def list_enrolled_courses(
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    return (
        db.query(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .filter(Enrollment.student_id == current_user.id)
        .all()
    )


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_course_for_access(course_id, current_user, db)


@router.get("/{course_id}/students", response_model=List[StudentInCourse])
def list_roster(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """Teacher can VIEW roster (read-only) but cannot add/remove students — that's admin's job."""
    get_course_for_access(course_id, current_user, db)
    return (
        db.query(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .filter(Enrollment.course_id == course_id)
        .all()
    )