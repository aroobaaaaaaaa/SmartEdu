# app/services/badge_service.py
"""
Badge & Achievement Engine for SmartEdu LMS.
Handles achievement seeding, automatic badge evaluation post-deadline and post-grading,
and retrieval of earned achievements for students and teachers.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.models import (
    Achievement, StudentAchievement, Assignment, Submission, FinalGrade, Rubric
)

DEFAULT_ACHIEVEMENTS = [
    {
        "code": "first_submitter",
        "title": "First Submitter",
        "description": "First student to submit their assignment successfully before the deadline.",
        "badge_icon": "ti-rocket",
        "color_scheme": "blue",
    },
    {
        "code": "high_achiever",
        "title": "High Achiever",
        "description": "Scored the highest mark in an assignment.",
        "badge_icon": "ti-trophy",
        "color_scheme": "gold",
    },
    {
        "code": "perfect_score",
        "title": "Perfect Score",
        "description": "Achieved 100% on an assignment rubric.",
        "badge_icon": "ti-star",
        "color_scheme": "emerald",
    },
    {
        "code": "consistent_performer",
        "title": "Consistent Performer",
        "description": "Consistently submitted assignments on time with excellent performance.",
        "badge_icon": "ti-flame",
        "color_scheme": "purple",
    },
    {
        "code": "top_contributor",
        "title": "Top Contributor",
        "description": "Active participant in course activities and learning modules.",
        "badge_icon": "ti-award",
        "color_scheme": "cyan",
    },
]


def seed_default_achievements(db: Session):
    """Ensures all standard system achievements exist in database."""
    for ach_data in DEFAULT_ACHIEVEMENTS:
        existing = db.query(Achievement).filter(Achievement.code == ach_data["code"]).first()
        if not existing:
            db.add(Achievement(**ach_data))
    db.commit()


def evaluate_assignment_badges(assignment_id: int, db: Session):
    """
    Evaluates and awards First Submitter, High Achiever, and Perfect Score badges.
    Called when an assignment deadline passes or after a submission is reviewed.
    """
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        return

    now = datetime.now(timezone.utc)
    due = assignment.due_date.replace(tzinfo=timezone.utc) if (assignment.due_date and assignment.due_date.tzinfo is None) else assignment.due_date

    # Seed achievements if needed
    seed_default_achievements(db)

    ach_map = {a.code: a for a in db.query(Achievement).all()}

    # 1. EVALUATE FIRST SUBMITTER BADGE (Only after deadline has passed)
    if due and now > due:
        # Check if first_submitter already awarded for this assignment
        first_sub_ach = ach_map.get("first_submitter")
        if first_sub_ach:
            already_awarded = db.query(StudentAchievement).filter(
                StudentAchievement.assignment_id == assignment_id,
                StudentAchievement.achievement_id == first_sub_ach.id
            ).first()

            if not already_awarded:
                # Find earliest valid submission submitted on or before deadline
                earliest_sub = db.query(Submission).filter(
                    Submission.assignment_id == assignment_id,
                    Submission.status != "failed",
                    Submission.submitted_at <= assignment.due_date
                ).order_by(Submission.submitted_at.asc()).first()

                if earliest_sub:
                    db.add(StudentAchievement(
                        student_id=earliest_sub.student_id,
                        achievement_id=first_sub_ach.id,
                        assignment_id=assignment_id,
                        course_id=assignment.course_id,
                    ))
                    db.commit()

    # 2. EVALUATE HIGH ACHIEVER & PERFECT SCORE BADGES (Based on graded submissions)
    high_ach = ach_map.get("high_achiever")
    perfect_ach = ach_map.get("perfect_score")

    graded_subs = db.query(Submission).join(FinalGrade).filter(
        Submission.assignment_id == assignment_id,
        Submission.status == "teacher_reviewed"
    ).all()

    if graded_subs and high_ach:
        rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()
        total_possible = rubric.total_marks if rubric else None

        # Find maximum score achieved
        max_score = max(s.final_grade.total_score for s in graded_subs if s.final_grade)

        for sub in graded_subs:
            if not sub.final_grade:
                continue

            score = sub.final_grade.total_score

            # High Achiever Award (Ties supported)
            if score == max_score and max_score > 0:
                exists = db.query(StudentAchievement).filter(
                    StudentAchievement.student_id == sub.student_id,
                    StudentAchievement.achievement_id == high_ach.id,
                    StudentAchievement.assignment_id == assignment_id
                ).first()
                if not exists:
                    db.add(StudentAchievement(
                        student_id=sub.student_id,
                        achievement_id=high_ach.id,
                        assignment_id=assignment_id,
                        course_id=assignment.course_id,
                    ))

            # Perfect Score Award
            if total_possible and score == total_possible and perfect_ach:
                exists = db.query(StudentAchievement).filter(
                    StudentAchievement.student_id == sub.student_id,
                    StudentAchievement.achievement_id == perfect_ach.id,
                    StudentAchievement.assignment_id == assignment_id
                ).first()
                if not exists:
                    db.add(StudentAchievement(
                        student_id=sub.student_id,
                        achievement_id=perfect_ach.id,
                        assignment_id=assignment_id,
                        course_id=assignment.course_id,
                    ))
        db.commit()


def get_student_badges(student_id: int, db: Session) -> list[dict]:
    """Returns all badges earned by a student with assignment & course details."""
    student_achs = db.query(StudentAchievement).filter(
        StudentAchievement.student_id == student_id
    ).order_by(StudentAchievement.earned_at.desc()).all()

    results = []
    for sa in student_achs:
        ach = sa.achievement
        asgn = sa.assignment
        course = sa.course
        results.append({
            "id": sa.id,
            "code": ach.code,
            "title": ach.title,
            "description": ach.description,
            "badge_icon": ach.badge_icon,
            "color_scheme": ach.color_scheme,
            "earned_at": sa.earned_at,
            "course_id": sa.course_id,
            "course_name": course.name if course else None,
            "assignment_id": sa.assignment_id,
            "assignment_title": asgn.title if asgn else None,
        })
    return results


def get_assignment_badges(assignment_id: int, db: Session) -> list[dict]:
    """Returns all badges awarded for a specific assignment."""
    student_achs = db.query(StudentAchievement).filter(
        StudentAchievement.assignment_id == assignment_id
    ).all()

    results = []
    for sa in student_achs:
        ach = sa.achievement
        student = sa.student
        results.append({
            "id": sa.id,
            "student_id": sa.student_id,
            "student_name": student.full_name if student else "Student",
            "code": ach.code,
            "title": ach.title,
            "badge_icon": ach.badge_icon,
            "color_scheme": ach.color_scheme,
            "earned_at": sa.earned_at,
        })
    return results

def get_student_badges_for_course(student_id: int, course_id: int, db: Session) -> list[dict]:
    """
    Same shape as get_student_badges(), scoped to one course — used by the
    teacher-facing per-student analytics view so a student's badges from
    other courses don't bleed into this course's summary.
    """
    student_achs = db.query(StudentAchievement).filter(
        StudentAchievement.student_id == student_id,
        StudentAchievement.course_id == course_id,
    ).order_by(StudentAchievement.earned_at.desc()).all()

    results = []
    for sa in student_achs:
        ach = sa.achievement
        asgn = sa.assignment
        results.append({
            "id": sa.id,
            "code": ach.code,
            "title": ach.title,
            "description": ach.description,
            "badge_icon": ach.badge_icon,
            "color_scheme": ach.color_scheme,
            "earned_at": sa.earned_at,
            "assignment_id": sa.assignment_id,
            "assignment_title": asgn.title if asgn else None,
        })
    return results