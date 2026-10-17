# app/services/progress_service.py
"""
Per-student progress analytics (daily / weekly / monthly) — Module 3 extension.

DESIGN NOTES — read before changing:

1. NO NEW TABLES. Every number here is derived from data SmartEdu already
   records: AttendanceRecord (+ ClassSession.session_date), Submission
   (+submitted_at/status), FinalGrade (+total_score), Assignment (+due_date),
   Rubric (+total_marks) and EngagementEvent (+created_at). Progress is a
   *view* over existing history, not a second copy of it.

2. RISK HISTORY IS REPLAYED, NOT STORED. StudentRiskAssessment keeps exactly
   one row per (student, course) and is overwritten on every recompute, so
   there is no stored risk history to chart. Rather than adding a snapshot
   table — which would show an empty chart until months of data accumulated,
   useless for a demo — risk is RECONSTRUCTED for each past period by
   filtering the timeline to `<= period_end` and re-scoring. Every input is
   timestamped, so this is exact.

   The replay uses the *rule-based* scorer (_point_in_time_risk), NOT the
   RandomForest from analytics_service. That is deliberate and should be
   stated in the FYP report: the forest is fitted on the CURRENT cohort's
   feature distribution, so applying it to a past week would score that week
   using information that did not exist yet (look-ahead bias). The rule
   thresholds are imported from analytics_service so the two never drift.

   The rule scorer is also CONTINUOUS here (graded shortfall against each
   threshold) rather than the binary 0.85/0.15 flip used in the fallback
   path, because a chart of a value that only ever takes two values is not
   a trend chart.

3. ONE COLLECTION PASS PER STUDENT. _collect_timeline() runs ~5 queries and
   returns plain dated tuples; every granularity, every period and every
   risk replay is then computed in memory from that one pass. The teacher
   overview therefore costs ~5N queries for N students, not 5N x periods.

4. HONEST NULLS. A period with no class sessions has attendance_rate = None,
   not 0. Weights are renormalised over the components that actually have
   data (_weighted_score), so a week where the teacher marked no attendance
   does not silently drag a student's score down.
"""
from datetime import datetime, timedelta, date
from typing import Optional, List, Dict, Any

import numpy as np
from sqlalchemy.orm import Session

from app.models.models import (
    User, Enrollment, Assignment, Submission, FinalGrade, Rubric,
    AttendanceRecord, ClassSession, EngagementEvent, StudentRiskAssessment,
)
from app.services.analytics_service import (
    _naive_utc,
    UNDATED_ASSIGNMENT_GRACE_DAYS,
    HEURISTIC_SCORE_FLOOR,
    HEURISTIC_ATTENDANCE_FLOOR,
    HEURISTIC_LATE_CEIL,
    HEURISTIC_MISSING_CEIL,
)

# ── Tunables ──────────────────────────────────────────────────────────────
GRANULARITIES = ("daily", "weekly", "monthly")
DEFAULT_PERIODS = {"daily": 14, "weekly": 8, "monthly": 6}
MAX_PERIODS = {"daily": 60, "weekly": 26, "monthly": 12}

# Composite performance score. Renormalised over whichever components have
# data in a given period — see _weighted_score().
COMPONENT_WEIGHTS = {
    "academic":   0.40,   # average % on work concluded in the period
    "attendance": 0.25,
    "submission": 0.20,   # completion / on-time behaviour
    "engagement": 0.15,
}

# Chatbot + materials have no natural denominator, so engagement is scored
# against a target rather than a percentage of anything. 1 point per chat
# message, 2 per material download (a download is a stronger signal than a
# one-line question). ~8 points/week ≈ "actively using the course".
ENGAGEMENT_POINTS_PER_CHAT = 1.0
ENGAGEMENT_POINTS_PER_DOWNLOAD = 2.0
ENGAGEMENT_TARGET_PER_WEEK = 8.0
_ENGAGEMENT_TARGET = {
    "daily":   ENGAGEMENT_TARGET_PER_WEEK / 5.0,   # 5 notional active days
    "weekly":  ENGAGEMENT_TARGET_PER_WEEK,
    "monthly": ENGAGEMENT_TARGET_PER_WEEK * 4.0,
}

# Daily "learning activity score" — did the student show up and do work today.
ACTIVITY_ATTENDED = 40.0
ACTIVITY_SUBMITTED = 30.0
ACTIVITY_CHAT_PER_MSG, ACTIVITY_CHAT_CAP = 7.0, 20.0
ACTIVITY_DOWNLOAD_PER, ACTIVITY_DOWNLOAD_CAP = 10.0, 20.0

# Which series is the headline for each view. Daily performance is dominated by
# "was anything scheduled today", so the daily view leads with the learning
# activity score instead — that is the metric the daily requirement asks for.
PRIMARY_SERIES = {"daily": "activity", "weekly": "performance", "monthly": "performance"}

# Trend classification. A slope inside +/- TREND_STABLE_BAND points-per-period
# is "stable". Slope and half-split delta must AGREE in sign before we are
# willing to call a direction — one noisy period should not flip the verdict.
TREND_MIN_PERIODS = 3
TREND_STABLE_BAND = 2.0
TREND_MIN_DELTA = 3.0

# Risk replay shortfall ramps: value >= good -> 0 risk, value <= bad -> 1.
_RISK_RAMPS = {
    "score":      {"good": 70.0, "bad": HEURISTIC_SCORE_FLOOR - 10.0, "weight": 0.40, "invert": True},
    "attendance": {"good": 0.85, "bad": HEURISTIC_ATTENDANCE_FLOOR - 0.15, "weight": 0.30, "invert": True},
    "missing":    {"good": 0.0,  "bad": HEURISTIC_MISSING_CEIL + 0.20, "weight": 0.20, "invert": False},
    "late":       {"good": 0.10, "bad": HEURISTIC_LATE_CEIL + 0.20, "weight": 0.10, "invert": False},
}
RISK_HIGH_AT, RISK_MEDIUM_AT = 0.66, 0.33   # same bands as analytics_service

# Insight thresholds
ATTENDANCE_CONCERN_PCT = 75.0
ATTENDANCE_CRITICAL_PCT = 60.0
COMPLETION_CONCERN_PCT = 70.0
SCORE_CONCERN_PCT = 50.0
SCORE_STRONG_PCT = 80.0
ENGAGEMENT_CONCERN_PCT = 30.0
DIMENSION_SPREAD_MIN = 8.0   # don't name a "weakest area" if everything is level


# ══════════════════════════════════════════════════════════════════════════
# Period axis helpers
# ══════════════════════════════════════════════════════════════════════════

def _as_date(dt) -> Optional[date]:
    dt = _naive_utc(dt)
    return dt.date() if isinstance(dt, datetime) else dt


def _period_start(d: date, granularity: str) -> date:
    if granularity == "daily":
        return d
    if granularity == "weekly":
        return d - timedelta(days=d.weekday())      # ISO Monday
    return d.replace(day=1)                          # monthly


def _step_back(d: date, granularity: str, n: int = 1) -> date:
    if granularity == "daily":
        return d - timedelta(days=n)
    if granularity == "weekly":
        return d - timedelta(weeks=n)
    y, m = d.year, d.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def _period_end(start: date, granularity: str) -> date:
    """Inclusive last day of the period starting at `start`."""
    if granularity == "daily":
        return start
    if granularity == "weekly":
        return start + timedelta(days=6)
    nxt = start.replace(day=28) + timedelta(days=4)
    return nxt.replace(day=1) - timedelta(days=1)


def _labels(start: date, granularity: str) -> tuple:
    if granularity == "daily":
        return start.strftime("%d %b"), start.strftime("%a %d %b %Y")
    if granularity == "weekly":
        return start.strftime("%d %b"), f"Week of {start.strftime('%d %b %Y')}"
    return start.strftime("%b %y"), start.strftime("%B %Y")


def _build_axis(granularity: str, periods: int, today: date) -> List[date]:
    """Ascending, contiguous period starts ending with the period containing `today`."""
    current = _period_start(today, granularity)
    axis = [_step_back(current, granularity, i) for i in range(periods)]
    return list(reversed(axis))


# ══════════════════════════════════════════════════════════════════════════
# Data collection — ONE pass, everything downstream is in-memory
# ══════════════════════════════════════════════════════════════════════════

def _first_activity_date(timeline: dict) -> Optional[date]:
    """Earliest date this course produced any record for this student."""
    candidates = [r["date"] for r in timeline["attendance"] if r["date"]]
    candidates += [e["date"] for e in timeline["engagement"] if e["date"]]
    for a in timeline["assignments"]:
        for key in ("submitted_date", "due_date_only", "concluded_date"):
            if a.get(key):
                candidates.append(a[key])
                break
    return min(candidates) if candidates else None


def _collect_timeline(student_id: int, course_id: int, db: Session) -> dict:
    """
    Pulls every dated fact for this (student, course) exactly once.
    Returns plain dicts/tuples — no ORM objects escape this function, so the
    bucketing and replay code below can be reasoned about (and unit tested)
    without a database.
    """
    now = datetime.utcnow()

    # ── Attendance ────────────────────────────────────────────────────────
    att_rows = (
        db.query(AttendanceRecord.status, ClassSession.session_date)
        .join(ClassSession, ClassSession.id == AttendanceRecord.session_id)
        .filter(
            ClassSession.course_id == course_id,
            AttendanceRecord.student_id == student_id,
        )
        .all()
    )
    attendance = [
        {"date": _as_date(session_date), "status": status}
        for status, session_date in att_rows
        if _as_date(session_date) is not None
    ]

    # ── Assignments + this student's latest submission + grade for each ───
    assignment_rows = (
        db.query(Assignment, Rubric.total_marks)
        .outerjoin(Rubric, Rubric.id == Assignment.rubric_id)
        .filter(Assignment.course_id == course_id)
        .all()
    )

    assignments: List[Dict[str, Any]] = []
    for a, total_marks in assignment_rows:
        sub = (
            db.query(Submission)
            .filter(Submission.assignment_id == a.id, Submission.student_id == student_id)
            .order_by(Submission.submitted_at.desc())
            .first()
        )
        final = (
            db.query(FinalGrade).filter(FinalGrade.submission_id == sub.id).first()
            if sub else None
        )

        due = _naive_utc(a.due_date)
        created = _naive_utc(a.created_at) or now
        submitted = _naive_utc(sub.submitted_at) if sub else None

        if due is not None:
            due_passed = due <= now
        else:
            # Undated assignment — same grace-period rule as analytics_service,
            # so an assignment with no deadline can still become "missing".
            due_passed = (now - created).days >= UNDATED_ASSIGNMENT_GRACE_DAYS

        # Exactly one outcome bucket, mirroring analytics_service._extract_student_features
        if final:
            outcome = "graded"
        elif sub and sub.status == "failed":
            outcome = "failed"
        elif sub:
            outcome = "pending_review" if due_passed else "submitted_early"
        elif due_passed:
            outcome = "missing"
        else:
            outcome = "not_due"

        pct = None
        if final and total_marks:
            pct = (final.total_score / total_marks) * 100.0
        elif outcome in ("missing", "failed"):
            pct = 0.0

        # When this outcome BECAME true — used to place it on the timeline and
        # to decide whether it was already known at a past period end.
        if outcome in ("graded", "failed", "pending_review", "submitted_early"):
            concluded_at = submitted or due or created
        else:
            concluded_at = due or (created + timedelta(days=UNDATED_ASSIGNMENT_GRACE_DAYS))

        assignments.append({
            "id": a.id,
            "title": a.title,
            "due": due,
            "created": created,
            "submitted": submitted,
            "outcome": outcome,
            "pct": pct,
            "is_late": bool(sub and due and submitted and submitted > due),
            "concluded_at": concluded_at,
            "concluded_date": _as_date(concluded_at),
            "due_date_only": _as_date(due or concluded_at),
            "submitted_date": _as_date(submitted),
        })

    # ── Engagement ────────────────────────────────────────────────────────
    eng_rows = (
        db.query(EngagementEvent.event_type, EngagementEvent.created_at)
        .filter(
            EngagementEvent.student_id == student_id,
            EngagementEvent.course_id == course_id,
        )
        .all()
    )
    engagement = [
        {"date": _as_date(created_at), "type": event_type}
        for event_type, created_at in eng_rows
        if _as_date(created_at) is not None
    ]

    return {"attendance": attendance, "assignments": assignments, "engagement": engagement}


# ══════════════════════════════════════════════════════════════════════════
# Scoring primitives
# ══════════════════════════════════════════════════════════════════════════

def _weighted_score(components: Dict[str, Optional[float]]) -> Optional[float]:
    """
    Weighted mean over ONLY the components that have data, with the weights
    renormalised. Returns None if nothing is measurable — never a silent 0.
    """
    num = den = 0.0
    for key, value in components.items():
        if value is None:
            continue
        w = COMPONENT_WEIGHTS[key]
        num += w * value
        den += w
    return round(num / den, 1) if den > 0 else None


def _shortfall(value: Optional[float], good: float, bad: float, invert: bool) -> Optional[float]:
    """0.0 = healthy, 1.0 = fully in the red. Linear between the two anchors."""
    if value is None:
        return None
    if invert:   # higher is better (scores, attendance)
        if value >= good:
            return 0.0
        if value <= bad:
            return 1.0
        return (good - value) / (good - bad)
    # lower is better (missing rate, late rate)
    if value <= good:
        return 0.0
    if value >= bad:
        return 1.0
    return (value - good) / (bad - good)


def _risk_level(score: float) -> str:
    return "high" if score >= RISK_HIGH_AT else "medium" if score >= RISK_MEDIUM_AT else "low"


def _point_in_time_risk(timeline: dict, as_of: date) -> Optional[dict]:
    """
    Replays the rule-based risk scorer using ONLY facts that were true on
    `as_of`. Returns None if nothing was determinable yet at that date.
    """
    cutoff = datetime.combine(as_of, datetime.max.time())

    scored = [
        a["pct"] for a in timeline["assignments"]
        if a["pct"] is not None and a["concluded_at"] and a["concluded_at"] <= cutoff
    ]
    concluded = [
        a for a in timeline["assignments"]
        if a["concluded_at"] and a["concluded_at"] <= cutoff and a["outcome"] != "not_due"
    ]
    submitted = [a for a in concluded if a["outcome"] != "missing"]

    avg_score = float(np.mean(scored)) if scored else None
    missing_rate = (
        sum(1 for a in concluded if a["outcome"] == "missing") / len(concluded)
        if concluded else None
    )
    late_rate = (
        sum(1 for a in submitted if a["is_late"]) / len(submitted)
        if submitted else None
    )

    att = [r for r in timeline["attendance"] if r["date"] and r["date"] <= as_of]
    attendance_rate = (
        sum(1 for r in att if r["status"] in ("present", "late")) / len(att)
        if att else None
    )

    values = {
        "score": avg_score, "attendance": attendance_rate,
        "missing": missing_rate, "late": late_rate,
    }

    num = den = 0.0
    drivers = {}
    for key, ramp in _RISK_RAMPS.items():
        sf = _shortfall(values[key], ramp["good"], ramp["bad"], ramp["invert"])
        if sf is None:
            continue
        drivers[key] = round(sf, 3)
        num += ramp["weight"] * sf
        den += ramp["weight"]

    if den == 0:
        return None

    score = round(min(1.0, max(0.0, num / den)), 4)
    return {"score": score, "level": _risk_level(score), "drivers": drivers}


# ══════════════════════════════════════════════════════════════════════════
# Period bucketing
# ══════════════════════════════════════════════════════════════════════════

def _build_period(timeline: dict, start: date, end: date, granularity: str,
                  course_start: Optional[date], today: date) -> dict:
    short, long_label = _labels(start, granularity)

    # A period that ended before the course produced ANY record is not "a zero",
    # it is "not measured". Everything stays None so it is excluded from trends
    # instead of manufacturing a fake climb out of nothing.
    if course_start is not None and end < course_start:
        return _empty_period(start, end, granularity, short, long_label, today)

    # ── Attendance in window ──
    att = [r for r in timeline["attendance"] if r["date"] and start <= r["date"] <= end]
    present = sum(1 for r in att if r["status"] == "present")
    late_att = sum(1 for r in att if r["status"] == "late")
    absent = sum(1 for r in att if r["status"] == "absent")
    attendance_pct = ((present + late_att) / len(att) * 100.0) if att else None

    # ── Assignment activity in window ──
    # "Due in this period" drives completion; "graded in this period" drives
    # the score. They are different questions and are counted separately.
    due_here = [
        a for a in timeline["assignments"]
        if a["due_date_only"] and start <= a["due_date_only"] <= end and a["outcome"] != "not_due"
    ]
    submitted_here = [
        a for a in timeline["assignments"]
        if a["submitted_date"] and start <= a["submitted_date"] <= end
    ]
    scored_here = [
        a for a in timeline["assignments"]
        if a["pct"] is not None and a["concluded_date"] and start <= a["concluded_date"] <= end
    ]

    completed = sum(1 for a in due_here if a["outcome"] != "missing")
    completion_pct = (completed / len(due_here) * 100.0) if due_here else None
    avg_score_pct = round(float(np.mean([a["pct"] for a in scored_here])), 1) if scored_here else None

    # ── Engagement in window ──
    eng = [e for e in timeline["engagement"] if e["date"] and start <= e["date"] <= end]
    chats = sum(1 for e in eng if e["type"] == "chat_message")
    downloads = sum(1 for e in eng if e["type"] == "document_download")
    points = chats * ENGAGEMENT_POINTS_PER_CHAT + downloads * ENGAGEMENT_POINTS_PER_DOWNLOAD
    target = _ENGAGEMENT_TARGET[granularity]

    # Engagement is only scorable if SOMETHING happened in this period. Scoring
    # a dead period as 0% engagement is what turned empty months into a fake
    # upward trend; a period with a class or a deadline in it and no activity
    # genuinely IS 0%, and still scores 0.
    had_activity = bool(att or due_here or submitted_here or scored_here or eng)
    engagement_pct = (
        round(min(100.0, points / target * 100.0), 1) if (had_activity and target) else None
    )

    # ── Learning activity score (headline metric for the daily view) ──
    activity = 0.0 if had_activity else None
    if activity is not None:
        if present or late_att:
            activity += ACTIVITY_ATTENDED
        if submitted_here:
            activity += ACTIVITY_SUBMITTED
        activity += min(ACTIVITY_CHAT_CAP, chats * ACTIVITY_CHAT_PER_MSG)
        activity += min(ACTIVITY_DOWNLOAD_CAP, downloads * ACTIVITY_DOWNLOAD_PER)
        activity = round(min(100.0, activity), 1)

    components = {
        "academic": avg_score_pct,
        "attendance": attendance_pct,
        "submission": completion_pct,
        "engagement": engagement_pct,
    }
    performance = _weighted_score(components)

    # Renormalising means a period missing a dimension is scored on a different
    # basis from its neighbours. Expose which dimensions were actually present
    # so the UI can say "no graded work this week" instead of the reader
    # wrongly comparing two scores that measure different things.
    present_components = [k for k, v in components.items() if v is not None]

    risk = _point_in_time_risk(timeline, end)

    return {
        "key": start.isoformat(),
        "label": short,
        "label_long": long_label,
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "has_data": had_activity,
        "is_current": start <= today <= end,
        "is_complete": end < today,
        "components_present": present_components,
        "attendance": {
            "sessions": len(att), "present": present, "late": late_att, "absent": absent,
            "attended": present + late_att,
            "rate_pct": round(attendance_pct, 1) if attendance_pct is not None else None,
        },
        "assignments": {
            "due": len(due_here),
            "submitted": len(submitted_here),
            "completed": completed,
            "missing": sum(1 for a in due_here if a["outcome"] == "missing"),
            "late": sum(1 for a in submitted_here if a["is_late"]),
            "graded": len([a for a in scored_here if a["outcome"] == "graded"]),
            "completion_pct": round(completion_pct, 1) if completion_pct is not None else None,
            "avg_score_pct": avg_score_pct,
        },
        "engagement": {
            "chat_messages": chats, "material_downloads": downloads,
            "points": round(points, 1), "score_pct": engagement_pct,
        },
        "activity_score": activity,
        "performance_score": performance,
        "risk_score": risk["score"] if risk else None,
        "risk_level": risk["level"] if risk else None,
    }


def _empty_period(start, end, granularity, short, long_label, today) -> dict:
    """A period that pre-dates any recorded course activity — measured as nothing."""
    return {
        "key": start.isoformat(), "label": short, "label_long": long_label,
        "range_start": start.isoformat(), "range_end": end.isoformat(),
        "has_data": False, "is_current": start <= today <= end, "is_complete": end < today,
        "components_present": [],
        "attendance": {"sessions": 0, "present": 0, "late": 0, "absent": 0,
                       "attended": 0, "rate_pct": None},
        "assignments": {"due": 0, "submitted": 0, "completed": 0, "missing": 0,
                        "late": 0, "graded": 0, "completion_pct": None, "avg_score_pct": None},
        "engagement": {"chat_messages": 0, "material_downloads": 0,
                       "points": 0.0, "score_pct": None},
        "activity_score": None, "performance_score": None,
        "risk_score": None, "risk_level": None,
    }


# ══════════════════════════════════════════════════════════════════════════
# Trend classification
# ══════════════════════════════════════════════════════════════════════════

def _classify_trend(series: List[Optional[float]], higher_is_better: bool = True,
                    stable_band: float = TREND_STABLE_BAND) -> dict:
    """
    "improving" / "stable" / "declining" / "insufficient_data".

    Requires the least-squares slope AND the second-half-minus-first-half
    delta to agree in sign before committing to a direction, so a single
    outlier period cannot flip the verdict.
    """
    idx = [(i, v) for i, v in enumerate(series) if v is not None]
    if len(idx) < TREND_MIN_PERIODS:
        return {
            "direction": "insufficient_data", "slope": 0.0, "delta": 0.0,
            "confidence": "none", "points": len(idx),
            "first_value": idx[0][1] if idx else None,
            "last_value": idx[-1][1] if idx else None,
        }

    x = np.array([i for i, _ in idx], dtype=float)
    y = np.array([v for _, v in idx], dtype=float)
    slope = float(np.polyfit(x, y, 1)[0])

    mid = len(y) // 2
    delta = float(np.mean(y[-mid:]) - np.mean(y[:mid])) if mid else 0.0

    rising = slope >= stable_band and delta >= TREND_MIN_DELTA
    falling = slope <= -stable_band and delta <= -TREND_MIN_DELTA

    if rising:
        direction = "improving" if higher_is_better else "declining"
    elif falling:
        direction = "declining" if higher_is_better else "improving"
    else:
        direction = "stable"

    spread = float(np.std(y))
    if len(idx) >= 5 and spread < 25:
        confidence = "high"
    elif len(idx) >= 4:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "direction": direction,
        "slope": round(slope, 2),
        "delta": round(delta, 1),
        "confidence": confidence,
        "points": len(idx),
        "first_value": round(y[0], 1),
        "last_value": round(y[-1], 1),
    }


# ══════════════════════════════════════════════════════════════════════════
# Dimensions, insights, recommendations
# ══════════════════════════════════════════════════════════════════════════

DIMENSION_LABELS = {
    "academic":   ("Academic performance", "ti-report"),
    "attendance": ("Attendance", "ti-calendar-check"),
    "submission": ("Submission consistency", "ti-clipboard-check"),
    "engagement": ("Course engagement", "ti-message-chatbot"),
}


def _overall_dimensions(timeline: dict, periods: List[dict], granularity: str) -> List[dict]:
    """Course-to-date score per dimension (0-100), independent of the period window."""
    concluded = [a for a in timeline["assignments"] if a["outcome"] != "not_due"]
    scored = [a["pct"] for a in concluded if a["pct"] is not None]
    academic = round(float(np.mean(scored)), 1) if scored else None

    att = timeline["attendance"]
    attendance = round(
        sum(1 for r in att if r["status"] in ("present", "late")) / len(att) * 100.0, 1
    ) if att else None

    submission = round(
        sum(1 for a in concluded if a["outcome"] != "missing") / len(concluded) * 100.0, 1
    ) if concluded else None

    # Engagement across the visible window only — a lifetime total would keep
    # rising forever and never register as a decline.
    windowed = [p["engagement"]["score_pct"] for p in periods if p["engagement"]["score_pct"] is not None]
    engagement = round(float(np.mean(windowed)), 1) if windowed else None

    values = {"academic": academic, "attendance": attendance,
              "submission": submission, "engagement": engagement}

    return [
        {
            "key": key,
            "label": DIMENSION_LABELS[key][0],
            "icon": DIMENSION_LABELS[key][1],
            "score": values[key],
            "has_data": values[key] is not None,
            "weight": COMPONENT_WEIGHTS[key],
        }
        for key in ("academic", "attendance", "submission", "engagement")
    ]


def _insight(severity, category, title, detail, action=None):
    return {"severity": severity, "category": category, "title": title,
            "detail": detail, "recommended_action": action}


def _build_insights(dimensions, trends, periods, timeline, granularity,
                    strongest, weakest, audience: str) -> List[dict]:
    """
    Rule-based insight generation, emitted in priority order (critical first).
    `audience` switches the phrasing between "you" (student) and
    "this student" (teacher) without duplicating the rule logic.
    """
    you = "You" if audience == "student" else "This student"
    your = "your" if audience == "student" else "their"
    out: List[dict] = []
    by_key = {d["key"]: d for d in dimensions}
    period_word = {"daily": "day", "weekly": "week", "monthly": "month"}[granularity]
    metric_word = "Learning activity" if granularity == "daily" else "Overall score"

    # ── Attendance ────────────────────────────────────────────────────────
    att = by_key["attendance"]
    if att["has_data"]:
        if att["score"] < ATTENDANCE_CRITICAL_PCT:
            out.append(_insight(
                "critical", "attendance", "Attendance is critically low",
                f"{you} attended {att['score']:.0f}% of classes so far.",
                "Attend every remaining session — missed classes are the single strongest predictor of falling behind."
                if audience == "student" else
                "Schedule a one-to-one; check for a practical barrier (timetable clash, travel, health) before treating this as disengagement.",
            ))
        elif att["score"] < ATTENDANCE_CONCERN_PCT:
            out.append(_insight(
                "warning", "attendance", "Attendance is slipping",
                f"{you} attended {att['score']:.0f}% of classes — below the {ATTENDANCE_CONCERN_PCT:.0f}% comfort line.",
                f"Aim to attend every class for the next few {period_word}s to pull this back up."
                if audience == "student" else
                "Worth a check-in before it turns into missed assessments.",
            ))
        elif att["score"] >= 90:
            out.append(_insight(
                "positive", "attendance", "Excellent attendance",
                f"{you} attended {att['score']:.0f}% of classes.",
                None,
            ))

    # ── Submissions ───────────────────────────────────────────────────────
    concluded = [a for a in timeline["assignments"] if a["outcome"] != "not_due"]
    missing = [a for a in concluded if a["outcome"] == "missing"]
    late = [a for a in concluded if a["is_late"]]
    pending = [a for a in timeline["assignments"] if a["outcome"] == "pending_review"]
    failed = [a for a in concluded if a["outcome"] == "failed"]

    sub = by_key["submission"]
    if missing:
        out.append(_insight(
            "critical" if (sub["has_data"] and sub["score"] < COMPLETION_CONCERN_PCT) else "warning",
            "submission",
            f"{len(missing)} assignment{'s' if len(missing) > 1 else ''} not submitted",
            "Missed: " + ", ".join(a["title"] for a in missing[:3])
            + (f" (+{len(missing) - 3} more)" if len(missing) > 3 else "")
            + ". Each one is counted as zero.",
            "Ask whether late submission is still possible, and prioritise upcoming deadlines."
            if audience == "student" else
            "Consider a deadline extension if the cause is recoverable — the extension tool keeps a full audit trail.",
        ))
    if len(late) >= 2:
        out.append(_insight(
            "warning", "submission", "Repeatedly submitting late",
            f"{len(late)} of {len(concluded)} assignments were submitted after the deadline.",
            "Try starting each assignment in the first half of its window — the work is usually there, the timing isn't."
            if audience == "student" else
            "Pattern suggests a planning problem rather than a comprehension one.",
        ))
    if failed:
        out.append(_insight(
            "warning", "submission", "Submission could not be read",
            f"{len(failed)} submission{'s' if len(failed) > 1 else ''} failed text extraction and scored zero.",
            "Re-upload as a clear, well-lit scan or a text-based PDF — blurry photos fail OCR."
            if audience == "student" else
            "Ask the student to re-upload; this is a file-quality issue, not a knowledge gap.",
        ))
    if pending:
        out.append(_insight(
            "info", "submission", f"{len(pending)} submission{'s' if len(pending) > 1 else ''} awaiting review",
            "Not yet counted in the average — the score will update once marked.",
            None if audience == "student" else "These are waiting on you.",
        ))

    # ── Academic ──────────────────────────────────────────────────────────
    ac = by_key["academic"]
    if ac["has_data"]:
        if ac["score"] < SCORE_CONCERN_PCT:
            out.append(_insight(
                "critical", "academic", "Grade average is below passing",
                f"{your.capitalize()} average across marked work is {ac['score']:.0f}%.",
                "Use the AI assistant on the specific topics you lost marks on, and check per-criterion feedback on each graded submission."
                if audience == "student" else
                "Review the per-criterion AI feedback across submissions — it usually shows the same rubric criterion failing repeatedly.",
            ))
        elif ac["score"] >= SCORE_STRONG_PCT:
            out.append(_insight(
                "positive", "academic", "Strong grade average",
                f"{your.capitalize()} average across marked work is {ac['score']:.0f}%.",
                None,
            ))

    # ── Engagement ────────────────────────────────────────────────────────
    eng = by_key["engagement"]
    if eng["has_data"] and eng["score"] < ENGAGEMENT_CONCERN_PCT:
        out.append(_insight(
            "warning", "engagement", "Low engagement with course material",
            f"Little chatbot or lecture-material activity in the last {len(periods)} {period_word}s.",
            "The assistant can explain any lecture PDF in this course — it's the fastest way to unblock yourself."
            if audience == "student" else
            "Low material access often precedes a drop in grades — worth flagging early.",
        ))

    # ── Trends ────────────────────────────────────────────────────────────
    perf = trends.get("primary", {})
    if perf.get("direction") == "improving":
        out.append(_insight(
            "positive", "trend", "Performance is improving",
            f"{metric_word} rose {abs(perf['delta']):.0f} points across the last {perf['points']} {period_word}s.",
            "Keep doing what changed — it's working." if audience == "student" else
            "Recognise the improvement; positive feedback here is cheap and effective.",
        ))
    elif perf.get("direction") == "declining":
        out.append(_insight(
            "critical", "trend", "Performance is declining",
            f"{metric_word} fell {abs(perf['delta']):.0f} points across the last {perf['points']} {period_word}s.",
            "Something changed recently — compare a strong week against a weak one below to spot what."
            if audience == "student" else
            "Intervene now rather than at the next assessment — the decline is measurable but not yet terminal.",
        ))

    risk_trend = trends.get("risk", {})
    if risk_trend.get("direction") == "declining":
        out.append(_insight(
            "critical", "risk", "Risk level is rising",
            "The at-risk score has moved upward over the visible window.",
            None if audience == "student" else "Add to the intervention list.",
        ))
    elif risk_trend.get("direction") == "improving":
        out.append(_insight(
            "positive", "risk", "Risk level is falling",
            "The at-risk score has moved downward over the visible window.", None,
        ))

    # ── Strongest / weakest ───────────────────────────────────────────────
    if strongest:
        out.append(_insight(
            "positive", "strength", f"Strongest area: {strongest['label']}",
            f"Scoring {strongest['score']:.0f}% here — {your} best-performing dimension.", None,
        ))
    if weakest:
        out.append(_insight(
            "info", "weakness", f"Weakest area: {weakest['label']}",
            f"Scoring {weakest['score']:.0f}% here — the highest-leverage thing to fix.",
            f"Focus effort on {weakest['label'].lower()} before anything else."
            if audience == "student" else
            f"Any intervention should target {weakest['label'].lower()} first.",
        ))

    if not any(i["severity"] in ("critical", "warning") for i in out):
        out.insert(0, _insight(
            "positive", "overall", "No concerns detected",
            f"Attendance, submissions and grades are all within healthy ranges.", None,
        ))

    order = {"critical": 0, "warning": 1, "positive": 2, "info": 3}
    return sorted(out, key=lambda i: order.get(i["severity"], 9))


# ══════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════

def get_student_progress(student_id: int, course_id: int, db: Session,
                         granularity: str = "weekly", periods: Optional[int] = None,
                         audience: str = "student") -> dict:
    if granularity not in GRANULARITIES:
        granularity = "weekly"
    count = periods or DEFAULT_PERIODS[granularity]
    count = max(2, min(count, MAX_PERIODS[granularity]))

    student = db.query(User).filter(User.id == student_id).first()
    timeline = _collect_timeline(student_id, course_id, db)

    today = datetime.utcnow().date()
    course_start = _first_activity_date(timeline)
    axis = _build_axis(granularity, count, today)
    buckets = [
        _build_period(timeline, start, _period_end(start, granularity),
                      granularity, course_start, today)
        for start in axis
    ]

    series = {
        "performance": [p["performance_score"] for p in buckets],
        "attendance": [p["attendance"]["rate_pct"] for p in buckets],
        "assignment_completion": [p["assignments"]["completion_pct"] for p in buckets],
        "score": [p["assignments"]["avg_score_pct"] for p in buckets],
        "engagement": [p["engagement"]["score_pct"] for p in buckets],
        "activity": [p["activity_score"] if p["has_data"] else None for p in buckets],
        "risk": [(p["risk_score"] * 100 if p["risk_score"] is not None else None) for p in buckets],
    }

    # The newest period is usually half-finished (a Monday sits in a week with
    # four days still to come). Charting it is right; letting it set the trend
    # direction is not — a partial week always looks like a collapse. Fit the
    # trend on completed periods only, whenever enough of them remain.
    trailing_partial = bool(buckets) and not buckets[-1]["is_complete"]

    def _fit(values, key):
        # Deliberately NO fallback to "include the partial period anyway when
        # that's the only way to reach 3 points". Two completed months is not a
        # monthly trend, and saying "declining" off a half-finished month is
        # worse than saying "not enough data yet".
        candidate = values[:-1] if trailing_partial else values
        return _classify_trend(
            candidate, higher_is_better=(key != "risk"),
            stable_band=1.5 if key == "risk" else TREND_STABLE_BAND,
        )

    trends = {key: _fit(values, key) for key, values in series.items()}
    primary_key = PRIMARY_SERIES[granularity]
    trends["primary"] = trends[primary_key]

    dimensions = _overall_dimensions(timeline, buckets, granularity)
    with_data = [d for d in dimensions if d["has_data"]]
    strongest = weakest = None
    if len(with_data) >= 2:
        ranked = sorted(with_data, key=lambda d: d["score"], reverse=True)
        if ranked[0]["score"] - ranked[-1]["score"] >= DIMENSION_SPREAD_MIN:
            strongest, weakest = ranked[0], ranked[-1]

    scored_periods = [p for p in buckets if p["performance_score"] is not None]

    # Live risk row (the RandomForest/heuristic value the teacher dashboard shows),
    # kept alongside the replayed history so the two are visibly reconciled.
    live = (
        db.query(StudentRiskAssessment)
        .filter(StudentRiskAssessment.student_id == student_id,
                StudentRiskAssessment.course_id == course_id)
        .first()
    )
    replayed_now = _point_in_time_risk(timeline, datetime.utcnow().date())

    insights = _build_insights(dimensions, trends, buckets, timeline,
                               granularity, strongest, weakest, audience)
    # Summary stats should ignore an in-progress period too.
    complete_scored = [p for p in scored_periods if p["is_complete"]] or scored_periods

    return {
        "student_id": student_id,
        "student_name": student.full_name if student else "Student",
        "course_id": course_id,
        "granularity": granularity,
        "periods_requested": count,
        "generated_at": datetime.utcnow(),
        "periods": buckets,
        "series": series,
        "trends": trends,
        "dimensions": dimensions,
        "strongest_area": strongest,
        "weakest_area": weakest,
        "summary": {
            "current_score": complete_scored[-1]["performance_score"] if complete_scored else None,
            "previous_score": complete_scored[-2]["performance_score"] if len(complete_scored) >= 2 else None,
            "delta": (round(complete_scored[-1]["performance_score"] - complete_scored[-2]["performance_score"], 1)
                      if len(complete_scored) >= 2 else None),
            "in_progress_score": buckets[-1]["performance_score"] if trailing_partial else None,
            "average_score": round(float(np.mean([p["performance_score"] for p in scored_periods])), 1) if scored_periods else None,
            "best_period": max(scored_periods, key=lambda p: p["performance_score"])["label"] if scored_periods else None,
            "worst_period": min(scored_periods, key=lambda p: p["performance_score"])["label"] if scored_periods else None,
            "periods_with_data": len(scored_periods),
            "total_assignments": len(timeline["assignments"]),
            "sessions_marked": len(timeline["attendance"]),
        },
        "risk": {
            "current_level": (replayed_now or {}).get("level"),
            "current_score": (replayed_now or {}).get("score"),
            "drivers": (replayed_now or {}).get("drivers", {}),
            "direction": trends["risk"]["direction"],
            "model_level": live.risk_level if live else None,
            "model_score": round(live.risk_score, 4) if live else None,
            "model_version": live.model_version if live else None,
            "history": [
                {"key": p["key"], "label": p["label"],
                 "level": p["risk_level"], "score": p["risk_score"]}
                for p in buckets
            ],
        },
        "insights": insights,
        "meta": {
            "primary_series": primary_key,
            "trailing_period_partial": trailing_partial,
            "weights": COMPONENT_WEIGHTS,
            "engagement_target": _ENGAGEMENT_TARGET[granularity],
            "scoring_note": (
                "Overall score is a weighted mean of the dimensions that have data in "
                "each period; weights are renormalised so an unmeasured dimension "
                "neither helps nor hurts. Risk history is replayed from timestamped "
                "records using rule thresholds, not the RandomForest."
            ),
        },
    }


def get_course_progress_overview(course_id: int, db: Session,
                                 granularity: str = "weekly",
                                 periods: Optional[int] = None) -> dict:
    """Teacher-facing: every enrolled student's trend line, plus the intervention list."""
    if granularity not in GRANULARITIES:
        granularity = "weekly"
    count = periods or DEFAULT_PERIODS[granularity]
    count = max(2, min(count, MAX_PERIODS[granularity]))

    students = (
        db.query(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .filter(Enrollment.course_id == course_id)
        .order_by(User.full_name)
        .all()
    )

    axis = _build_axis(granularity, count, datetime.utcnow().date())
    labels = [_labels(s, granularity)[0] for s in axis]

    student_summaries = []
    matrix = []

    for student in students:
        p = get_student_progress(student.id, course_id, db, granularity, count, audience="teacher")
        perf_series = p["series"]["performance"]
        matrix.append(perf_series)

        dims = {d["key"]: d for d in p["dimensions"]}
        
        # Primary concern determination
        primary_concern = None
        concern_detail = None
        recommended_action = None
        urgency = "low"

        crit_insights = [ins for ins in p["insights"] if ins.get("severity") == "critical"]
        warn_insights = [ins for ins in p["insights"] if ins.get("severity") == "warning"]

        if p["risk"]["current_level"] == "high":
            urgency = "high"
            primary_concern = "High risk assessment score"
            if crit_insights:
                concern_detail = crit_insights[0]["detail"]
                recommended_action = crit_insights[0].get("recommended_action")
        elif p["trends"]["primary"]["direction"] == "declining":
            urgency = "medium"
            primary_concern = "Declining performance velocity"
            if crit_insights or warn_insights:
                ins = crit_insights[0] if crit_insights else warn_insights[0]
                concern_detail = ins["detail"]
                recommended_action = ins.get("recommended_action")
        elif dims["attendance"]["has_data"] and dims["attendance"]["score"] < ATTENDANCE_CONCERN_PCT:
            urgency = "medium"
            primary_concern = f"Attendance rate is {dims['attendance']['score']:.0f}%"
            if crit_insights or warn_insights:
                ins = crit_insights[0] if crit_insights else warn_insights[0]
                concern_detail = ins["detail"]
                recommended_action = ins.get("recommended_action")
        elif crit_insights:
            urgency = "high"
            primary_concern = crit_insights[0]["title"]
            concern_detail = crit_insights[0]["detail"]
            recommended_action = crit_insights[0].get("recommended_action")
        elif warn_insights:
            # If student is low risk and has no critical trends/attendance issues,
            # surface the insight on their profile rather than flagging as priority intervention
            if p["risk"]["current_level"] in ("high", "medium"):
                urgency = "medium"
            else:
                urgency = "low"
            primary_concern = warn_insights[0]["title"]
            concern_detail = warn_insights[0]["detail"]
            recommended_action = warn_insights[0].get("recommended_action")

        student_summaries.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "email": student.email,
            "registration_number": student.registration_number,
            "current_score": p["summary"]["current_score"],
            "previous_score": p["summary"]["previous_score"],
            "score_delta": p["summary"]["delta"],
            "attendance_rate": dims["attendance"]["score"] if dims["attendance"]["has_data"] else None,
            "submission_rate": dims["submission"]["score"] if dims["submission"]["has_data"] else None,
            "academic_rate": dims["academic"]["score"] if dims["academic"]["has_data"] else None,
            "engagement_rate": dims["engagement"]["score"] if dims["engagement"]["has_data"] else None,
            "trend_direction": p["trends"]["primary"]["direction"],
            "trend_delta": p["trends"]["primary"]["delta"],
            "risk_level": p["risk"]["current_level"] or "low",
            "risk_score": p["risk"]["current_score"],
            "dimensions": p["dimensions"],
            "insights": p["insights"],
            "strongest_area": p["strongest_area"],
            "weakest_area": p["weakest_area"],
            "primary_concern": primary_concern,
            "concern_detail": concern_detail,
            "recommended_action": recommended_action,
            "urgency": urgency,
            "series": p["series"],
        })

    # Interventions shortlist: students with high/medium urgency or critical insights
    interventions = [
        s for s in student_summaries
        if s["urgency"] in ("high", "medium") or s["risk_level"] == "high" or s["trend_direction"] == "declining"
    ]
    # Sort interventions: high urgency first, then by risk score descending
    urgency_order = {"high": 0, "medium": 1, "low": 2}
    interventions.sort(key=lambda s: (urgency_order.get(s["urgency"], 9), -(s["risk_score"] or 0.0)))

    # Cohort-level aggregates per period
    cohort_trajectory = []
    for i, start in enumerate(axis):
        short, long_label = _labels(start, granularity)
        end = _period_end(start, granularity)
        today = datetime.utcnow().date()

        period_scores = []
        period_attendances = []
        period_completions = []
        active_count = 0

        for s in student_summaries:
            perf_val = s["series"]["performance"][i]
            att_val = s["series"]["attendance"][i]
            comp_val = s["series"]["assignment_completion"][i]

            if perf_val is not None:
                period_scores.append(perf_val)
                active_count += 1
            if att_val is not None:
                period_attendances.append(att_val)
            if comp_val is not None:
                period_completions.append(comp_val)

        cohort_trajectory.append({
            "key": start.isoformat(),
            "label": short,
            "label_long": long_label,
            "range_start": start.isoformat(),
            "range_end": end.isoformat(),
            "is_current": start <= today <= end,
            "is_complete": end < today,
            "active_students": active_count,
            "average_score": round(float(np.mean(period_scores)), 1) if period_scores else None,
            "average_attendance": round(float(np.mean(period_attendances)), 1) if period_attendances else None,
            "average_completion": round(float(np.mean(period_completions)), 1) if period_completions else None,
        })

    # Class-wide totals
    all_scores = [s["current_score"] for s in student_summaries if s["current_score"] is not None]
    avg_score = round(float(np.mean(all_scores)), 1) if all_scores else None

    risk_counts = {"high": 0, "medium": 0, "low": 0}
    for s in student_summaries:
        lvl = s["risk_level"]
        if lvl in risk_counts:
            risk_counts[lvl] += 1
        else:
            risk_counts["low"] += 1

    trend_counts = {"improving": 0, "stable": 0, "declining": 0, "insufficient_data": 0}
    for s in student_summaries:
        td = s["trend_direction"]
        if td in trend_counts:
            trend_counts[td] += 1
        else:
            trend_counts["insufficient_data"] += 1

    return {
        "course_id": course_id,
        "granularity": granularity,
        "periods_requested": count,
        "generated_at": datetime.utcnow(),
        "total_students": len(students),
        "average_score": avg_score,
        "risk_breakdown": risk_counts,
        "trend_breakdown": trend_counts,
        "cohort_trajectory": cohort_trajectory,
        "interventions": interventions,
        "students": student_summaries,
    }
