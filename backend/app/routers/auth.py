# app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import User
from app.schemas.auth import UserLogin, TokenResponse
from app.utils.auth import verify_password, create_access_token

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # Deliberately identical error for "no user" and "wrong password"
    # to prevent account enumeration attacks
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")

    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated")

    if not user.has_set_password:
        raise HTTPException(403, "Please check your email to set your password before logging in")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role, full_name=user.full_name, user_id=user.id, email=user.email
    )