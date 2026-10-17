# app/routers/badges.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.database.db import get_db
from app.models.models import User
from app.utils.auth import get_current_user
from app.services.badge_service import get_student_badges, get_assignment_badges

router = APIRouter()


@router.get("/my-badges")
def get_my_badges(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all badges earned by the current student."""
    return get_student_badges(current_user.id, db)


@router.get("/assignment/{assignment_id}")
def get_badges_for_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all badges awarded for an assignment."""
    return get_assignment_badges(assignment_id, db)
