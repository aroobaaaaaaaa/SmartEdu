# app/services/analytics_service.py
"""
Performance Analytics & At-Risk Detection (Module 3).

IMPORTANT — read before changing thresholds:
SmartEdu has no historical ground-truth outcomes (no "did this student actually
fail/drop out" label exists anywhere in the schema). To still deliver a real
supervised model rather than just a hand-written formula, this service:

  1. Computes a *heuristic* risk label per student from clear, defensible rules
     (low average score, low attendance, high lateness, missed assignments).
  2. Trains a RandomForestClassifier to reproduce/generalize that heuristic
     across the engineered feature set (rather than a flat weighted sum), which
     also yields feature-importance rankings the teacher UI can surface.
  3. If a course has too few students or only one class present in the
     bootstrap labels (RandomForest needs both classes), falls back to
     reporting the heuristic score directly with model_version="heuristic-fallback".

This is a legitimate "weak supervision" bootstrap pattern, but it is NOT
validated against real outcomes — it will always be at least as accurate as
the heuristic it was trained on, no more. Documented here deliberately so
this isn't misrepresented as a validated predictive model in the FYP report.

── Per-assignment classification (fixed 2026-08) ──────────────────────────
For each assignment, per student, exactly one bucket applies:
  - "graded"          FinalGrade exists                       → real score counts
  - "missing"         due date passed, no submission at all    → counts as 0
  - "failed"          submitted, OCR/extraction failed         → counts as 0
                       (will never reach grading through the normal pipeline)
  - "pending_review"  submitted, past due, awaiting teacher     → EXCLUDED from
                       review                                    the average
                       (outcome genuinely unknown — not the student's fault,
                       so we don't score it, but we also don't hide it: it's
                       surfaced separately as pending_review_count)
  - not yet due, no submission                                 → excluded
                       entirely from every rate; too early to judge

Grade Average, Missing Rate, Completion Rate, and Score Trend are all derived
from the SAME "eligible" set (graded ∪ missing ∪ failed ∪ pending_review,
i.e. every assignment that has either concluded or come due), so they can
never silently disagree with each other again.

── Future extension: Examination module (not yet implemented) ─────────────
When exams are added, the expected shape mirrors Assignment/Submission
(e.g. an Exam table + ExamScore table, or a boolean "kind" on Assignment).
Exam performance should slot in as an additional feature — e.g. "avg_exam_pct"
appended to FEATURE_NAMES and folded into _extract_student_features()'s
eligible/scored_entries loop the same way assignments are — rather than a
parallel scoring pipeline. Flagging this now so that addition is a small
diff, not a restructure.

── Fix: undated assignments never counted as missing (fixed 2026-08) ──────
Assignment.due_date is nullable ("never closes" per product docs). The
original eligibility rule (`due_passed = due_date is not None and due_date
<= now`) meant an assignment with NO due date could NEVER become "missing" —
it stayed permanently excluded from avg_score_pct, missing_rate, and risk
calculations even after months of non-submission, surfacing as an incorrect
"No Data" in the UI instead of a real zero. Fixed by giving undated
assignments a grace period from their creation date (UNDATED_ASSIGNMENT_GRACE_DAYS)
after which an unsubmitted one is judged exactly like a passed deadline would.

── Fix: "Assignments submitted 0/0" when work was actually assigned (fixed 2026-08) ──
The teacher-facing "Assignments submitted X/Y" display was reading Y from
eligible_assignments (assignments that have either concluded or come due) —
so a course with one assignment whose deadline hadn't passed yet showed
"0/0" instead of "0/1", because that assignment was correctly excluded from
SCORING (per Scenario A: don't grade work before its deadline) but was
incorrectly also invisible to the ASSIGNED-work COUNT. These are different
questions — "should this count toward the grade average yet" vs. "was this
assignment actually given to the student" — and eligible_assignments should
only ever answer the first one. total_assignments now answers the second,
and total_submitted_count (any submission at all, not gated by eligibility,
so early submissions before a deadline are counted too) is the numerator to
pair with it. Extended deadlines need no special handling here — due_date
is mutated in place by the extend-deadline endpoint, so this logic always
sees the current deadline automatically.

── Fix: naive/aware datetime drift could hide a passed deadline (fixed 2026-08) ──
All prior verification of this file ran against SQLite in a sandbox, which
stores datetimes as plain strings with no timezone semantics at all — it
cannot reproduce a real production Postgres/psycopg2 driver returning a
timezone-AWARE datetime for a value that was originally sent as an ISO
string with a UTC "Z" suffix (which Pydantic parses as aware), even though
the column itself is declared naive. Comparing that aware value against
datetime.utcnow() (naive) either raises TypeError or, worse, can silently
misjudge whether a deadline has passed if any offset survives the round
trip. Every datetime pulled from the DB in this function is now normalized
through _naive_utc() before comparison, closing that gap regardless of
which form the driver hands back.
"""
from datetime import datetime, timezone
from typing import Optional
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sqlalchemy.orm import Session

from app.models.models import (
    User, Enrollment, Assignment, Submission, FinalGrade, Rubric, StudentRiskAssessment,
)
from app.services import attendance_service, engagement_service, badge_service

MODEL_VERSION = "rf-v1"

# Features fed to the RandomForest — order matters, must match _to_vector()
FEATURE_NAMES = [
    "avg_score_pct", "score_trend", "late_rate", "missing_rate",
    "ocr_fail_rate", "attendance_rate", "chat_engagement", "download_engagement",
]

# Neutral imputation used ONLY when building the ML vector for a student with
# zero determinable outcomes yet (no eligible assignments, or everything still
# pending review) — deliberately neutral (neither rewards nor punishes), never
# used for the honest/displayed value in contributing_factors.
NEUTRAL_SCORE_DEFAULT = 75.0
NEUTRAL_ATTENDANCE_DEFAULT = 1.0

# Chatbot engagement has no natural denominator (unlike grades/attendance),
# so it's surfaced to students/teachers as a bucketed level rather than a
# fabricated percentage. Tunable thresholds on raw message count.
ENGAGEMENT_LOW_MAX = 2       # 0-2 messages → "low"
ENGAGEMENT_MEDIUM_MAX = 9    # 3-9 messages → "medium", 10+ → "high"

# See "Fix: undated assignments" in the module docstring — an assignment
# with no due_date is judged the same way a passed deadline would be, once
# this many days have elapsed since it was created and still unsubmitted.
UNDATED_ASSIGNMENT_GRACE_DAYS = 14

# Heuristic bootstrap thresholds — used only to generate training labels, see module docstring
HEURISTIC_SCORE_FLOOR = 50.0     # avg % below this contributes to "at risk"
HEURISTIC_ATTENDANCE_FLOOR = 0.6
HEURISTIC_LATE_CEIL = 0.5
HEURISTIC_MISSING_CEIL = 0.4


def _naive_utc(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _engagement_level(message_count: float) -> str:
    if message_count <= ENGAGEMENT_LOW_MAX:
        return "low"
    if message_count <= ENGAGEMENT_MEDIUM_MAX:
        return "medium"
    return "high"


def _extract_student_features(student_id: int, course_id: int, db: Session) -> dict:
    """
    Returns an HONEST feature dict — avg_score_pct and attendance_rate may be
    None when there is genuinely no determinable data yet. Callers that need a
    numeric vector (the ML model) must go through _to_vector(), which applies
    the documented neutral imputation explicitly rather than baking it in here.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    now_local = datetime.now()
    assignments = db.query(Assignment).filter(Assignment.course_id == course_id).all()
    total_assignments = len(assignments)

    scored_entries = []   # (order_key, assignment_title, effective_pct) — graded, failed(=0), missing(=0)
    graded_count = 0
    failed_count = 0
    missing_count = 0
    pending_review_count = 0
    late_count = 0
    eligible_count = 0
    total_submitted_count = 0   # ANY submission exists, regardless of eligibility — see fix note below

    for a in assignments:
        rubric = db.query(Rubric).filter(Rubric.id == a.rubric_id).first()
        total_marks = rubric.total_marks if rubric and rubric.total_marks else None

        sub = (
            db.query(Submission)
            .filter(Submission.assignment_id == a.id, Submission.student_id == student_id)
            .order_by(Submission.submitted_at.desc())
            .first()
        )

        final = None
        if sub:
            final = db.query(FinalGrade).filter(FinalGrade.submission_id == sub.id).first()

        if sub:
            # Count this as "submitted" even if the assignment isn't eligible
            # for scoring yet (e.g. student submitted early, before the
            # deadline) — this must NOT be gated behind the eligibility
            # check below, or an early submitter looks like a non-submitter.
            total_submitted_count += 1

        due_date = _naive_utc(a.due_date)
        submitted_at = _naive_utc(sub.submitted_at) if sub else None
        created_at = _naive_utc(a.created_at) or a.created_at

        if due_date is not None:
            due_passed = (due_date <= now_utc) or (due_date <= now_local)
        else:
            # No deadline set — apply the grace period instead of excluding
            # this assignment from analytics forever (see module docstring).
            due_passed = (now_utc - created_at).days >= UNDATED_ASSIGNMENT_GRACE_DAYS
        eligible = bool(final) or due_passed
        if not eligible:
            # Not yet due and not graded — too early to judge for SCORING
            # purposes (avg/missing-rate), but it still counts as "assigned"
            # via total_assignments, and as "submitted" above if applicable.
            continue

        eligible_count += 1
        order_key = due_date or (submitted_at if sub else created_at)

        if final:
            pct = (final.total_score / total_marks) * 100 if total_marks else 0.0
            graded_count += 1
            scored_entries.append((order_key, a.title, pct))
        elif sub and sub.status == "failed":
            failed_count += 1
            scored_entries.append((order_key, a.title, 0.0))
        elif sub:
            # Submitted, past due, teacher hasn't reviewed yet — outcome unknown.
            # Not the student's fault: don't score it, but don't hide it either.
            pending_review_count += 1
        else:
            missing_count += 1
            scored_entries.append((order_key, a.title, 0.0))

        if sub and due_date and submitted_at and submitted_at > due_date:
            late_count += 1

    submitted_count = graded_count + failed_count + pending_review_count

    missing_rate = (missing_count / eligible_count) if eligible_count > 0 else 0.0
    completion_rate = ((eligible_count - missing_count) / eligible_count) if eligible_count > 0 else 1.0
    late_rate = (late_count / submitted_count) if submitted_count > 0 else 0.0
    ocr_fail_rate = (failed_count / submitted_count) if submitted_count > 0 else 0.0
    # "Of what was actually submitted (excluding still-pending), how much came out gradeable?"
    determined_submissions = graded_count + failed_count
    submission_success_rate = (graded_count / determined_submissions) if determined_submissions > 0 else 1.0

    avg_score_pct = float(np.mean([pct for _, _, pct in scored_entries])) if scored_entries else None

    score_trend = 0.0
    score_timeline = []
    if scored_entries:
        ordered = sorted(scored_entries, key=lambda t: t[0])
        score_timeline = [{"label": title, "score_pct": round(pct, 1)} for _, title, pct in ordered]
        if len(ordered) >= 2:
            y = np.array([pct for _, _, pct in ordered])
            x = np.arange(len(y))
            score_trend = float(np.polyfit(x, y, 1)[0])  # slope: pct change per assignment, chronological by due date

    attendance_rate = attendance_service.get_student_attendance_rate(student_id, course_id, db)
    engagement = engagement_service.get_engagement_counts(student_id, course_id, db)
    chat_message_count = float(engagement["chat_message_count"])

    return {
        # ── ML feature vector fields (see FEATURE_NAMES / _to_vector) ──
        "avg_score_pct": avg_score_pct,             # HONEST — may be None, see _to_vector for imputation
        "score_trend": score_trend,
        "late_rate": late_rate,
        "missing_rate": missing_rate,
        "ocr_fail_rate": ocr_fail_rate,
        "attendance_rate": attendance_rate,          # HONEST — may be None, see _to_vector for imputation
        "chat_engagement": chat_message_count,
        "download_engagement": float(engagement["document_download_count"]),

        # ── Display-only fields (UI, not fed to the model) ──
        "chatbot_engagement_level": _engagement_level(chat_message_count),  # "low" | "medium" | "high"
        "score_timeline": score_timeline,            # [{label, score_pct}, ...] chronological, for the trend chart
        "completion_rate": completion_rate,
        "submission_success_rate": submission_success_rate,
        "total_assignments": total_assignments,
        "total_submitted_count": total_submitted_count,  # ANY submission exists, across ALL assignments — use this (not eligible-gated counts) for "assigned/submitted" display
        "eligible_assignments": eligible_count,
        "graded_count": graded_count,
        "missing_count": missing_count,
        "failed_count": failed_count,
        "pending_review_count": pending_review_count,
    }


def _heuristic_label(features: dict) -> int:
    """Returns 1 ("at risk") if any clear red-flag threshold is crossed, else 0."""
    avg = features["avg_score_pct"]
    if avg is not None and avg < HEURISTIC_SCORE_FLOOR:
        return 1
    attendance = features["attendance_rate"]
    if attendance is not None and attendance < HEURISTIC_ATTENDANCE_FLOOR:
        return 1
    if features["late_rate"] > HEURISTIC_LATE_CEIL:
        return 1
    if features["missing_rate"] > HEURISTIC_MISSING_CEIL:
        return 1
    return 0


def _to_vector(features: dict) -> list:
    """Builds the numeric ML feature vector, applying the documented neutral imputation for None values."""
    avg = features["avg_score_pct"] if features["avg_score_pct"] is not None else NEUTRAL_SCORE_DEFAULT
    attendance = features["attendance_rate"] if features["attendance_rate"] is not None else NEUTRAL_ATTENDANCE_DEFAULT
    lookup = {**features, "avg_score_pct": avg, "attendance_rate": attendance}
    return [lookup[name] for name in FEATURE_NAMES]


def compute_course_risk(course_id: int, db: Session) -> dict:
    """
    Recomputes and persists risk assessments for every enrolled student in the course.
    Returns a summary dict (matches CourseRiskSummary shape minus the response model wrapping).
    """
    students = (
        db.query(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .filter(Enrollment.course_id == course_id)
        .all()
    )

    if not students:
        return {
            "course_id": course_id, "total_students": 0, "high_risk_count": 0,
            "medium_risk_count": 0, "low_risk_count": 0, "model_version": MODEL_VERSION,
            "feature_importance": None, "students": [],
        }

    per_student_features = {s.id: _extract_student_features(s.id, course_id, db) for s in students}
    labels = {sid: _heuristic_label(f) for sid, f in per_student_features.items()}

    X = np.array([_to_vector(f) for f in per_student_features.values()])
    y = np.array(list(labels.values()))

    use_model = len(students) >= 4 and len(set(y.tolist())) == 2
    feature_importance = None
    model_version = MODEL_VERSION

    if use_model:
        clf = RandomForestClassifier(n_estimators=100, max_depth=4, random_state=42, class_weight="balanced")
        clf.fit(X, y)
        proba = clf.predict_proba(X)
        risk_class_idx = list(clf.classes_).index(1)
        scores = {sid: float(proba[i][risk_class_idx]) for i, sid in enumerate(per_student_features.keys())}
        feature_importance = {name: float(imp) for name, imp in zip(FEATURE_NAMES, clf.feature_importances_)}
    else:
        # Not enough data/variation to train meaningfully — report the heuristic directly
        model_version = "heuristic-fallback"
        scores = {sid: (0.85 if labels[sid] == 1 else 0.15) for sid in per_student_features.keys()}

    now = datetime.utcnow()
    students_out = []
    counts = {"high": 0, "medium": 0, "low": 0}

    for student in students:
        score = scores[student.id]
        level = "high" if score >= 0.66 else "medium" if score >= 0.33 else "low"
        counts[level] += 1

        factors = dict(per_student_features[student.id])
        badges = badge_service.get_student_badges_for_course(student.id, course_id, db)

        existing = db.query(StudentRiskAssessment).filter(
            StudentRiskAssessment.student_id == student.id,
            StudentRiskAssessment.course_id == course_id,
        ).first()
        if existing:
            existing.risk_level = level
            existing.risk_score = score
            existing.contributing_factors = factors
            existing.model_version = model_version
            existing.computed_at = now
        else:
            db.add(StudentRiskAssessment(
                student_id=student.id, course_id=course_id,
                risk_level=level, risk_score=score,
                contributing_factors=factors, model_version=model_version, computed_at=now,
            ))

        students_out.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "risk_level": level,
            "risk_score": round(score, 4),
            "contributing_factors": factors,
            "badges": badges,
            "model_version": model_version,
            "computed_at": now,
        })

    db.commit()

    return {
        "course_id": course_id,
        "total_students": len(students),
        "high_risk_count": counts["high"],
        "medium_risk_count": counts["medium"],
        "low_risk_count": counts["low"],
        "model_version": model_version,
        "feature_importance": feature_importance,
        "students": sorted(students_out, key=lambda s: s["risk_score"], reverse=True),
    }


def get_cached_course_risk(course_id: int, db: Session) -> Optional[dict]:
    """Returns the most recently computed assessments without retraining, or None if never computed."""
    rows = db.query(StudentRiskAssessment).filter(StudentRiskAssessment.course_id == course_id).all()
    if not rows:
        return None

    counts = {"high": 0, "medium": 0, "low": 0}
    students_out = []
    model_version = MODEL_VERSION
    for r in rows:
        counts[r.risk_level] = counts.get(r.risk_level, 0) + 1
        model_version = r.model_version
        badges = badge_service.get_student_badges_for_course(r.student_id, course_id, db)
        students_out.append({
            "student_id": r.student_id,
            "student_name": r.student.full_name if r.student else "Student",
            "risk_level": r.risk_level,
            "risk_score": r.risk_score,
            "contributing_factors": r.contributing_factors,
            "badges": badges,
            "model_version": r.model_version,
            "computed_at": r.computed_at,
        })

    return {
        "course_id": course_id,
        "total_students": len(rows),
        "high_risk_count": counts["high"],
        "medium_risk_count": counts["medium"],
        "low_risk_count": counts["low"],
        "model_version": model_version,
        "feature_importance": None,  # not persisted per-row; only available right after a fresh compute
        "students": sorted(students_out, key=lambda s: s["risk_score"], reverse=True),
    }