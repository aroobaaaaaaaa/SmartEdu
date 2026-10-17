# app/utils/tokens.py
import secrets
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.models import PasswordResetToken


def create_reset_token(db: Session, user_id: int, expires_minutes: int) -> str:
    """
    Creates a cryptographically random, single-use token stored in the DB.
    secrets.token_urlsafe is the correct function for this — NOT random.random()
    or uuid4(), which are not designed for security-sensitive token generation.
    """
    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        user_id=user_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(minutes=expires_minutes),
    ))
    db.commit()
    return token


def validate_and_consume_token(db: Session, token: str) -> int | None:
    """
    Returns the user_id if the token is valid, unexpired, and unused.
    Marks it as used immediately (single-use enforcement).
    Returns None for anything invalid.
    """
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token
    ).first()

    if not record:
        return None
    if record.used:
        return None
    if record.expires_at < datetime.utcnow():
        return None

    record.used = True
    db.commit()
    return record.user_id