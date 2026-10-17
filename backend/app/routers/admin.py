# app/routers/admin.py
"""
All Admin-only operations: course creation, teacher assignment,
student enrollment, user management.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database.db import get_db
from app.models.models import User, Course, TeacherCourseAssignment, Enrollment
from app.schemas.admin import (
    CourseCreate, CourseResponse, CourseDetailResponse,
    AssignTeacherRequest, EnrollStudentRequest, UserSummary,
)
from app.schemas.auth import AdminCreateUser, TokenResponse
from app.utils.auth import require_role, hash_password, create_access_token
from app.utils.tokens import create_reset_token
from app.services.email_service import send_account_setup_email, send_enrollment_notification


router = APIRouter()


# ---------- User management ----------


@router.post("/users", response_model=dict)
def create_user(
    payload: AdminCreateUser,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    # Pydantic already validated role, full_name, and registration_number
    # rules above — if we reach here, those are all structurally valid

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "An account with this email already exists")

    if payload.registration_number:
        existing_reg = db.query(User).filter(
            User.registration_number == payload.registration_number
        ).first()
        if existing_reg:
            raise HTTPException(400, f"Registration number {payload.registration_number} is already assigned to another account")

    user = User(
        email=payload.email,
        password_hash=None,
        full_name=payload.full_name,
        role=payload.role,
        registration_number=payload.registration_number,
        has_set_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    setup_token = create_reset_token(db, user.id, expires_minutes=48 * 60)
    email_sent = send_account_setup_email(user.email, user.full_name, setup_token)

    return {
        "message": f"Account created for {user.email}. {'Setup email sent.' if email_sent else 'Email could not be sent — check SMTP configuration.'}",
        "email_sent": email_sent,
        "user_id": user.id,
        "pending_verification": True,
    }



@router.get("/users", response_model=List[UserSummary])
def list_users(
    role: str | None = None,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    return query.all()


@router.patch("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Soft-disable rather than delete — preserves history (submissions, chat logs, etc.)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = False
    db.commit()
    return {"message": f"{user.email} deactivated"}

@router.patch("/users/{user_id}/activate")
def activate_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Re-enable a previously deactivated account."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = True
    db.commit()
    return {"message": f"{user.email} reactivated"}


# ---------- Course management ----------

@router.post("/courses", response_model=CourseResponse)
def create_course(
    payload: CourseCreate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    existing = db.query(Course).filter(Course.code == payload.code).first()
    if existing:
        raise HTTPException(400, "A course with this code already exists")

    course = Course(
        name=payload.name, code=payload.code,
        description=payload.description, created_by=current_user.id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/courses", response_model=List[CourseDetailResponse])
def list_all_courses(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    courses = db.query(Course).all()
    result = []
    for course in courses:
        teacher_ids = [a.teacher_id for a in course.teacher_assignments]
        teachers = db.query(User).filter(User.id.in_(teacher_ids)).all() if teacher_ids else []
        student_count = db.query(Enrollment).filter(Enrollment.course_id == course.id).count()

        item = CourseDetailResponse.model_validate(course)
        item.teachers = teachers
        item.student_count = student_count
        result.append(item)
    return result


@router.delete("/courses/{course_id}")
def delete_course(
    course_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes a course and cleans up all related records
    (chat history, enrollments, teacher assignments, sessions, attendance, assignments, submissions, rubrics, documents).
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")

    from app.models.models import (
        ClassSession, AttendanceRecord, Document, Assignment,
        Submission, PlagiarismReport, AIEvaluation, FinalGrade,
        Rubric, RubricCriterion, ChatHistory, StudentAchievement,
        AssignmentDeadlineHistory
    )
    from app.services.lms_context_service import lms_context_cache

    # 1. Delete chat history for this course
    db.query(ChatHistory).filter(ChatHistory.course_id == course_id).delete(synchronize_session=False)

    # 2. Delete student achievements for this course
    db.query(StudentAchievement).filter(StudentAchievement.course_id == course_id).delete(synchronize_session=False)

    # 3. Clean teacher assignments & enrollments
    db.query(TeacherCourseAssignment).filter(TeacherCourseAssignment.course_id == course_id).delete(synchronize_session=False)
    db.query(Enrollment).filter(Enrollment.course_id == course_id).delete(synchronize_session=False)

    # 4. Clean class sessions and attendance records
    session_ids = [s.id for s in db.query(ClassSession).filter(ClassSession.course_id == course_id).all()]
    if session_ids:
        db.query(AttendanceRecord).filter(AttendanceRecord.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(ClassSession).filter(ClassSession.course_id == course_id).delete(synchronize_session=False)

    # 5. Clean assignments and submissions
    assignments = db.query(Assignment).filter(Assignment.course_id == course_id).all()
    assignment_ids = [a.id for a in assignments]
    if assignment_ids:
        submissions = db.query(Submission).filter(Submission.assignment_id.in_(assignment_ids)).all()
        submission_ids = [sub.id for sub in submissions]
        if submission_ids:
            db.query(PlagiarismReport).filter(
                (PlagiarismReport.submission_id.in_(submission_ids)) |
                (PlagiarismReport.matched_submission_id.in_(submission_ids))
            ).delete(synchronize_session=False)
            db.query(AIEvaluation).filter(AIEvaluation.submission_id.in_(submission_ids)).delete(synchronize_session=False)
            db.query(FinalGrade).filter(FinalGrade.submission_id.in_(submission_ids)).delete(synchronize_session=False)
            db.query(Submission).filter(Submission.id.in_(submission_ids)).delete(synchronize_session=False)

        db.query(AssignmentDeadlineHistory).filter(AssignmentDeadlineHistory.assignment_id.in_(assignment_ids)).delete(synchronize_session=False)
        db.query(Assignment).filter(Assignment.id.in_(assignment_ids)).delete(synchronize_session=False)

    # 6. Clean rubrics & rubric criteria
    rubrics = db.query(Rubric).filter(Rubric.course_id == course_id).all()
    rubric_ids = [r.id for r in rubrics]
    if rubric_ids:
        db.query(RubricCriterion).filter(RubricCriterion.rubric_id.in_(rubric_ids)).delete(synchronize_session=False)
        db.query(Rubric).filter(Rubric.id.in_(rubric_ids)).delete(synchronize_session=False)

    # 7. Clean documents
    db.query(Document).filter(Document.course_id == course_id).delete(synchronize_session=False)

    # 8. Delete the course itself
    course_name = course.name
    db.delete(course)
    db.commit()

    lms_context_cache.clear()
    return {"message": f"Course '{course_name}' deleted successfully"}


@router.post("/courses/{course_id}/assign-teacher")
def assign_teacher(
    course_id: int,
    payload: AssignTeacherRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")

    teacher = db.query(User).filter(
        User.email == payload.teacher_email, User.role == "teacher"
    ).first()
    if not teacher:
        raise HTTPException(404, "No teacher found with that email")

    # Enforce single teacher restriction: a course can only have one assigned teacher
    existing_assignment = db.query(TeacherCourseAssignment).filter(
        TeacherCourseAssignment.course_id == course_id
    ).first()
    if existing_assignment:
        if existing_assignment.teacher_id == teacher.id:
            raise HTTPException(400, "This teacher is already assigned to this course")
        else:
            raise HTTPException(
                400,
                "This course already has a teacher assigned. A course can only have one teacher. Remove the current teacher first before assigning a new one."
            )

    assignment = TeacherCourseAssignment(
        teacher_id=teacher.id, course_id=course_id, assigned_by=current_user.id,
    )
    db.add(assignment)
    db.commit()
    return {"message": f"{teacher.full_name} assigned to {course.name}"}


@router.delete("/courses/{course_id}/assign-teacher/{teacher_id}")
def unassign_teacher(
    course_id: int,
    teacher_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    assignment = db.query(TeacherCourseAssignment).filter(
        TeacherCourseAssignment.course_id == course_id,
        TeacherCourseAssignment.teacher_id == teacher_id,
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    db.delete(assignment)
    db.commit()
    return {"message": "Teacher unassigned"}


@router.get("/courses/{course_id}/students")
def list_course_students(
    course_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Returns the list of enrolled students for a specific course (used by Admin UI)."""
    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    student_ids = [e.student_id for e in enrollments]
    students = db.query(User).filter(User.id.in_(student_ids)).all() if student_ids else []
    return [
        {
            "id": s.id,
            "full_name": s.full_name,
            "email": s.email,
            "registration_number": s.registration_number,
            "is_active": s.is_active,
        }
        for s in students
    ]


@router.post("/courses/{course_id}/enroll")
def enroll_student(
    course_id: int,
    payload: EnrollStudentRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")

    # Now accepts either email OR registration number for lookup
    student = db.query(User).filter(
        User.role == "student",
        (User.email == payload.student_identifier) |
        (User.registration_number == payload.student_identifier)
    ).first()
    if not student:
        raise HTTPException(404, "No student found with that email or registration number")

    existing = db.query(Enrollment).filter(
        Enrollment.course_id == course_id, Enrollment.student_id == student.id
    ).first()
    if existing:
        raise HTTPException(400, "Student already enrolled")

    enrollment = Enrollment(
        student_id=student.id, course_id=course_id, enrolled_by=current_user.id,
    )
    db.add(enrollment)
    db.commit()

    # Notify the student
    send_enrollment_notification(student.email, student.full_name, course.name, course.code)

    return {"message": f"{student.full_name} enrolled in {course.name}"}


@router.delete("/courses/{course_id}/enroll/{student_id}")
def unenroll_student(
    course_id: int,
    student_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == course_id, Enrollment.student_id == student_id,
    ).first()
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    db.delete(enrollment)
    db.commit()
    return {"message": "Student unenrolled"}

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes a user account and all associated data.
    Admin accounts cannot be deleted, even by another admin.
    The cascade rules on the foreign keys handle cleanup of related
    rows (enrollments, submissions, chat history, etc.) automatically.
    """
    if user_id == current_user.id:
        raise HTTPException(400, "You cannot delete your own admin account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user.role == "admin":
        raise HTTPException(403, "Admin accounts cannot be deleted")

    user_email = user.email
    user_name = user.full_name
    db.delete(user)
    db.commit()

    return {"message": f"Account for {user_name} ({user_email}) permanently deleted"}


@router.post("/users/{user_id}/resend-setup-email")
def resend_setup_email(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Resends the account setup email for accounts that haven't verified yet.
    Useful when a user says they never received the original email.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.has_set_password:
        raise HTTPException(400, "This account has already been verified")

    # Invalidate any existing unused tokens for this user before issuing a new one
    from app.models.models import PasswordResetToken
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user_id,
        PasswordResetToken.used == False
    ).update({"used": True})
    db.commit()

    setup_token = create_reset_token(db, user.id, expires_minutes=48 * 60)
    email_sent = send_account_setup_email(user.email, user.full_name, setup_token)

    return {"message": "Setup email resent" if email_sent else "Failed to send email — check SMTP configuration"}