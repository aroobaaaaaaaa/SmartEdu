# app/routers/password.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import User
from app.schemas.password import ForgotPasswordRequest, SetPasswordRequest, ChangePasswordRequest
from app.utils.auth import hash_password, get_current_user
from app.utils.tokens import create_reset_token, validate_and_consume_token
from app.services.email_service import send_password_reset_email

router = APIRouter()


@router.post("/forgot")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user and user.is_active:
        token = create_reset_token(db, user.id, expires_minutes=30)
        send_password_reset_email(user.email, user.full_name, token)
    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/set")
def set_password(payload: SetPasswordRequest, db: Session = Depends(get_db)):
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user_id = validate_and_consume_token(db, payload.token)
    if not user_id:
        raise HTTPException(400, "This link is invalid or has expired. Please request a new one.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.password_hash = hash_password(payload.new_password)
    user.has_set_password = True
    db.commit()
    return {"message": "Password set successfully. You can now log in."}


@router.post("/change")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Re-fetch the user in THIS route's db session.
    # current_user comes from get_current_user which uses a separate
    # dependency-injected session — mutating it and calling db.commit()
    # on a different session does nothing (the object isn't tracked by db).
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}