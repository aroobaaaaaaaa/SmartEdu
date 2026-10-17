# app/models/models.py — UPDATED

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, JSON, Float
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True) 
    full_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    registration_number = Column(String(50), unique=True, nullable=True)
    has_set_password = Column(Boolean, default=False, nullable=False)

    teaching_assignments = relationship(
        "TeacherCourseAssignment",
        back_populates="teacher",
        foreign_keys="TeacherCourseAssignment.teacher_id",
    )
    enrollments = relationship(
        "Enrollment",
        back_populates="student",
        foreign_keys="Enrollment.student_id",
    )
    courses_created = relationship(
        "Course",
        back_populates="created_by_admin",
        foreign_keys="Course.created_by",
    )


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    created_by_admin = relationship(
        "User",
        back_populates="courses_created",
        foreign_keys=[created_by],
    )
    teacher_assignments = relationship("TeacherCourseAssignment", back_populates="course", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="course", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")


class TeacherCourseAssignment(Base):
    __tablename__ = "teacher_course_assignments"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, server_default=func.now())

    teacher = relationship(
        "User",
        back_populates="teaching_assignments",
        foreign_keys=[teacher_id],
    )
    course = relationship("Course", back_populates="teacher_assignments")

    __table_args__ = (UniqueConstraint("teacher_id", "course_id", name="unique_teacher_assignment"),)


class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    enrolled_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    enrolled_at = Column(DateTime, server_default=func.now())

    student = relationship(
        "User",
        back_populates="enrollments",
        foreign_keys=[student_id],
    )
    course = relationship("Course", back_populates="enrollments")

    __table_args__ = (UniqueConstraint("student_id", "course_id", name="unique_enrollment"),)


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    status = Column(String(30), default="processing")
    chunk_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    course = relationship("Course", back_populates="documents")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), nullable=False, default="default", index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    message = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Rubric(Base):
    __tablename__ = "rubrics"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    total_marks = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    criteria = relationship("RubricCriterion", back_populates="rubric", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="rubric")


class RubricCriterion(Base):
    __tablename__ = "rubric_criteria"

    id = Column(Integer, primary_key=True, index=True)
    rubric_id = Column(Integer, ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(255), nullable=False)
    label = Column(String(255), nullable=False)
    max_marks = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)

    rubric = relationship("Rubric", back_populates="criteria")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    rubric_id = Column(Integer, ForeignKey("rubrics.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    rubric = relationship("Rubric", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")
    deadline_history = relationship("AssignmentDeadlineHistory", back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"))
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    file_path = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    extraction_method = Column(String(20), nullable=True)
    extraction_confidence = Column(Integer, nullable=True)
    ocr_engine_used = Column(String(30), nullable=True)
    extraction_status = Column(String(30), nullable=True)
    ocr_processing_time = Column(Float, nullable=True)
    status = Column(String(30), default="processing")
    error_message = Column(Text, nullable=True)
    submitted_at = Column(DateTime, server_default=func.now())

    ai_score = Column(Float, nullable=True)
    plagiarism_score = Column(Float, nullable=True)
    detection_status = Column(String(30), default="not_checked", nullable=True)

    assignment = relationship("Assignment", back_populates="submissions")
    ai_evaluation = relationship("AIEvaluation", back_populates="submission", uselist=False, cascade="all, delete-orphan")
    final_grade = relationship("FinalGrade", back_populates="submission", uselist=False, cascade="all, delete-orphan")
    plagiarism_report = relationship("PlagiarismReport", back_populates="submission", uselist=False, cascade="all, delete-orphan", foreign_keys="[PlagiarismReport.submission_id]")


class PlagiarismReport(Base):
    __tablename__ = "plagiarism_reports"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    matched_submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="SET NULL"), nullable=True)
    matched_student_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    similarity_score = Column(Float, nullable=False, default=0.0)
    risk_level = Column(String(20), nullable=False, default="low")  # "low", "medium", "high"
    confidence_level = Column(String(20), nullable=False, default="high")  # "low", "medium", "high"
    tfidf_score = Column(Float, nullable=True)
    shingle_score = Column(Float, nullable=True)
    semantic_score = Column(Float, nullable=True)
    matching_spans = Column(JSON, nullable=True)  # List of matched excerpts and offsets
    summary = Column(Text, nullable=True)  # Human-readable AI summary of plagiarism findings
    created_at = Column(DateTime, server_default=func.now())

    submission = relationship("Submission", foreign_keys=[submission_id], back_populates="plagiarism_report")
    matched_submission = relationship("Submission", foreign_keys=[matched_submission_id])
    matched_student = relationship("User", foreign_keys=[matched_student_id])


class AIEvaluation(Base):
    __tablename__ = "ai_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True)
    criteria_scores = Column(JSON, nullable=False)
    total_score = Column(Integer, nullable=False)
    feedback = Column(Text, nullable=False)
    raw_model_output = Column(Text, nullable=True)
    evaluated_at = Column(DateTime, server_default=func.now())

    submission = relationship("Submission", back_populates="ai_evaluation")


class FinalGrade(Base):
    __tablename__ = "final_grades"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    criteria_scores = Column(JSON, nullable=False)
    total_score = Column(Integer, nullable=False)
    teacher_comments = Column(Text, nullable=True)
    was_ai_overridden = Column(Boolean, default=False)
    reviewed_at = Column(DateTime, server_default=func.now())

    submission = relationship("Submission", back_populates="final_grade")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


# ══════════════════════════════════════════════════════════════════════
# NEW: Achievement & Badge Framework Models
# ══════════════════════════════════════════════════════════════════════

class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # e.g. "first_submitter", "high_achiever"
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    badge_icon = Column(String(50), default="ti-award")  # Tabler icon name
    color_scheme = Column(String(50), default="primary")
    created_at = Column(DateTime, server_default=func.now())


class StudentAchievement(Base):
    __tablename__ = "student_achievements"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    achievement_id = Column(Integer, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    earned_at = Column(DateTime, server_default=func.now())

    student = relationship("User", foreign_keys=[student_id])
    achievement = relationship("Achievement")
    assignment = relationship("Assignment")
    course = relationship("Course")

    __table_args__ = (
        UniqueConstraint("student_id", "achievement_id", "assignment_id", name="unique_student_assignment_achievement"),
    )


class AssignmentDeadlineHistory(Base):
    __tablename__ = "assignment_deadline_histories"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_due_date = Column(DateTime, nullable=True)
    new_due_date = Column(DateTime, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at = Column(DateTime, server_default=func.now())
    reason = Column(Text, nullable=True)

    assignment = relationship("Assignment", back_populates="deadline_history")
    updater = relationship("User", foreign_keys=[updated_by])


# ══════════════════════════════════════════════════════════════════════
# NEW: Module 3 — Attendance, Engagement & Performance Analytics
# ══════════════════════════════════════════════════════════════════════

class ClassSession(Base):
    """A single class meeting for a course, created by the teacher when taking attendance."""
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    session_date = Column(DateTime, nullable=False)
    topic = Column(String(255), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    course = relationship("Course")
    attendance_records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    """One student's attendance status for one class session. Idempotent per (session, student)."""
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False)  # "present" | "absent" | "late"
    marked_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    marked_at = Column(DateTime, server_default=func.now())

    session = relationship("ClassSession", back_populates="attendance_records")
    student = relationship("User", foreign_keys=[student_id])

    __table_args__ = (UniqueConstraint("session_id", "student_id", name="unique_session_attendance"),)


class EngagementEvent(Base):
    """
    Lightweight engagement log — chatbot usage and material downloads.
    Write-heavy, read by the analytics feature-extraction pipeline (see analytics_service.py).
    No ondelete on student/course FKs, deliberately mirroring ChatHistory's audit-log convention.
    """
    __tablename__ = "engagement_events"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    event_type = Column(String(30), nullable=False)  # "chat_message" | "document_download"
    created_at = Column(DateTime, server_default=func.now())


class StudentRiskAssessment(Base):
    """
    Latest computed at-risk assessment for a student in a course.
    Recomputed on demand (teacher-triggered) or lazily when analytics are viewed — see analytics_service.py.
    One row per (student, course); recompute updates the existing row rather than appending history.
    """
    __tablename__ = "student_risk_assessments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    risk_level = Column(String(20), nullable=False)      # "low" | "medium" | "high"
    risk_score = Column(Float, nullable=False)           # 0.0–1.0 probability/heuristic score
    contributing_factors = Column(JSON, nullable=True)    # {feature_name: value, ...} + top drivers
    model_version = Column(String(50), nullable=False)   # e.g. "rf-v1" or "heuristic-fallback"
    computed_at = Column(DateTime, server_default=func.now())

    student = relationship("User", foreign_keys=[student_id])
    course = relationship("Course")

    __table_args__ = (UniqueConstraint("student_id", "course_id", name="unique_student_course_risk"),)
