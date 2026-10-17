# app/services/engagement_service.py
"""
Minimal engagement tracking. Logged at existing chat and document-download
endpoints (see chat.py / documents.py) rather than inventing a new generic
event-tracking flow — reuses signals SmartEdu already generates.
"""
from sqlalchemy.orm import Session
from app.models.models import EngagementEvent


def log_event(student_id: int, course_id: int, event_type: str, db: Session):
    """Fire-and-forget style logger. Callers should not let a logging failure break the request."""
    try:
        db.add(EngagementEvent(student_id=student_id, course_id=course_id, event_type=event_type))
        db.commit()
    except Exception:
        db.rollback()


def get_engagement_counts(student_id: int, course_id: int, db: Session) -> dict:
    events = (
        db.query(EngagementEvent)
        .filter(EngagementEvent.student_id == student_id, EngagementEvent.course_id == course_id)
        .all()
    )
    return {
        "chat_message_count": sum(1 for e in events if e.event_type == "chat_message"),
        "document_download_count": sum(1 for e in events if e.event_type == "document_download"),
    }
