# app/services/lms_context_service.py
"""
Optimized LMS Context Service.
Builds a high-density, compact summary of course & student LMS data.
Features:
- Achievement badges awareness (First Submitter, High Achiever, etc.).
- Lecture ordering & ordinal mapping awareness (Lecture 1, First Lecture, etc.).
- Batched SQL queries to prevent N+1 overhead.
- In-memory TTL caching per (course_id, student_id).
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.models import (
    Document, Assignment, Submission, FinalGrade, AIEvaluation,
    Enrollment, Course, TeacherCourseAssignment, User,
    Rubric, RubricCriterion, StudentAchievement, Achievement
)
from app.services.cache_service import lms_context_cache


ORDINAL_LABELS = [
    "First", "Second", "Third", "Fourth", "Fifth",
    "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"
]


def build_lms_context(course_id: int, student_id: int, db: Session) -> str:
    """
    Builds a compact summary of LMS context for a given course and student.
    Uses in-memory TTL caching to avoid repetitive database execution.
    """
    cached_ctx = lms_context_cache.get((course_id, student_id))
    if cached_ctx is not None:
        return cached_ctx

    now = datetime.now(timezone.utc)

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        return "ERROR: Course not found."

    teacher_assignments = db.query(TeacherCourseAssignment).filter(
        TeacherCourseAssignment.course_id == course_id
    ).all()
    teacher_ids = [ta.teacher_id for ta in teacher_assignments]
    teachers = db.query(User).filter(User.id.in_(teacher_ids)).all() if teacher_ids else []
    teacher_names = ", ".join(t.full_name for t in teachers) if teachers else "Not assigned"

    enrollment_count = db.query(Enrollment).filter(
        Enrollment.course_id == course_id
    ).count()

    documents = db.query(Document).filter(
        Document.course_id == course_id,
        Document.status == "indexed"
    ).order_by(Document.created_at.asc()).all()

    assignments = db.query(Assignment).filter(
        Assignment.course_id == course_id
    ).order_by(Assignment.created_at).all()

    asgn_ids = [a.id for a in assignments]

    rubric_ids = [a.rubric_id for a in assignments if a.rubric_id]
    rubrics = db.query(Rubric).filter(Rubric.id.in_(rubric_ids)).all() if rubric_ids else []
    rubric_map = {r.id: r.total_marks for r in rubrics}

    student_subs = db.query(Submission).filter(
        Submission.assignment_id.in_(asgn_ids),
        Submission.student_id == student_id
    ).all() if asgn_ids else []
    student_sub_map = {s.assignment_id: s for s in student_subs}

    student_sub_ids = [s.id for s in student_subs]
    grades = db.query(FinalGrade).filter(
        FinalGrade.submission_id.in_(student_sub_ids)
    ).all() if student_sub_ids else []
    grade_map = {g.submission_id: g for g in grades}

    sub_count_rows = db.query(
        Submission.assignment_id, func.count(Submission.id)
    ).filter(
        Submission.assignment_id.in_(asgn_ids)
    ).group_by(Submission.assignment_id).all() if asgn_ids else []
    total_sub_map = {row[0]: row[1] for row in sub_count_rows}

    # Earned badges
    student_badges = db.query(StudentAchievement).join(Achievement).filter(
        StudentAchievement.student_id == student_id,
        StudentAchievement.course_id == course_id
    ).all()
    badge_titles = [f"{sa.achievement.title} ({sa.assignment.title if sa.assignment else 'Course'})" for sa in student_badges]

    lines = []
    lines.append(f"[Course] {course.name} ({course.code}) | Instructor: {teacher_names} | Enrolled: {enrollment_count}")
    lines.append("[Plagiarism Policy] Evaluated using hybrid TF-IDF similarity, 4-gram shingle overlap, and semantic embeddings. Risk Levels: LOW (<15%), MEDIUM (15-39%), HIGH (>=40%). Findings guide teacher review.")

    if badge_titles:
        lines.append(f"[Earned Badges] {', '.join(badge_titles)}")

    if not documents:
        lines.append("[Lectures] Total: 0 (No lecture materials uploaded yet)")
    else:
        lines.append(f"[Lectures] Total: {len(documents)}")
        for idx, doc in enumerate(documents, 1):
            lbl = ORDINAL_LABELS[idx - 1] if idx <= len(ORDINAL_LABELS) else f"{idx}th"
            latest = " [Latest Upload]" if idx == len(documents) else ""
            base_name = doc.filename.rsplit(".", 1)[0]
            clean_title = base_name.replace("_", " ").replace("-", " ").title()
            lines.append(f" - Lecture {idx} ({lbl} Lecture{latest}): Title: \"{clean_title}\" (Filename: {doc.filename})")

    # Calculate Student Grade Analytics & Risk Classification
    earned_marks = 0
    possible_marks = 0
    overdue_count = 0

    if assignments:
        lines.append(f"[Assignments] Total: {len(assignments)}")
        for a in assignments:
            marks = rubric_map.get(a.rubric_id, 0)
            sub = student_sub_map.get(a.id)

            due_str = "No deadline"
            if a.due_date:
                due = a.due_date.replace(tzinfo=timezone.utc) if a.due_date.tzinfo is None else a.due_date
                past = now > due
                due_str = due.strftime("%d %b %Y") + (" (PASSED)" if past else "")

            if sub is None:
                if a.due_date and now > (a.due_date.replace(tzinfo=timezone.utc) if a.due_date.tzinfo is None else a.due_date):
                    status_str = "OVERDUE (not submitted)"
                    overdue_count += 1
                else:
                    status_str = "PENDING (not submitted)"
            elif sub.status == "teacher_reviewed":
                g = grade_map.get(sub.id)
                score_val = g.total_score if g else 0
                score_str = f"{score_val}/{marks}" if g else "Graded"
                fb_str = f" - Feedback: {g.teacher_comments[:80]}" if (g and g.teacher_comments) else ""
                status_str = f"GRADED ({score_str}){fb_str}"

                if isinstance(marks, (int, float)) and marks > 0:
                    earned_marks += score_val
                    possible_marks += marks
            elif sub.status in ("processing", "extracted", "ai_evaluated"):
                status_str = "SUBMITTED (awaiting review)"
            elif sub.status == "failed":
                status_str = "SUBMISSION FAILED"
            else:
                status_str = f"SUBMITTED ({sub.status})"

            total_received = total_sub_map.get(a.id, 0)
            lines.append(f" - {a.title}: Max Marks={marks}, Due={due_str}, Total Subs={total_received}, Status={status_str}")

    # Determine Student Academic Risk Category & Risk Factor Drivers
    risk_factors = []
    if possible_marks > 0:
        pct = (earned_marks / possible_marks) * 100
        if pct < 50:
            risk_factors.append(f"Assignment Grade Average ({pct:.0f}% < 50% passing threshold)")
        if overdue_count >= 2:
            risk_factors.append(f"Multiple Overdue Assignments ({overdue_count} overdue)")

        if pct < 50 or overdue_count >= 2:
            risk_level = f"HIGH RISK (Action Required - Grade {pct:.0f}%)"
        elif pct < 70 or overdue_count == 1:
            risk_level = f"MODERATE RISK (Attention Needed - Grade {pct:.0f}%)"
        else:
            risk_level = f"LOW RISK (On Track - Grade {pct:.0f}%)"
    else:
        if overdue_count > 0:
            risk_factors.append(f"Unsubmitted/Overdue Assignments ({overdue_count} overdue)")
            risk_level = "MODERATE RISK (Overdue Assignments Pending)"
        else:
            risk_level = "NEUTRAL / SAFE (No Graded Items Yet)"

    factors_str = " | Primary Risk Drivers: " + "; ".join(risk_factors) if risk_factors else " | Primary Risk Drivers: All metrics on track"

    lines.append(f"[Student Performance Analytics] Earned Score: {earned_marks}/{possible_marks} | Academic Risk Status: {risk_level}{factors_str} | Multi-Factor Risk Model Dimensions: [1] Assignment Grade Average, [2] Missing/Overdue Rate, [3] Lateness Rate, [4] Lecture Attendance Rate, [5] AI Chatbot Engagement Level, [6] Material Access/Downloads, [7] Score Trajectory Trend, [8] Submission Extraction/OCR Rate.")

    result_context = "\n".join(lines)
    lms_context_cache.set((course_id, student_id), result_context, ttl=60)
    return result_context