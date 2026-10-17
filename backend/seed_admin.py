# seed_admin.py
"""
Run once to create or fix the Admin account.

Safe to run multiple times — idempotent.

Usage:
    python seed_admin.py
"""

from app.database.db import SessionLocal
from app.models.models import User
from app.utils.auth import hash_password

NEW_EMAIL    = "smartedu768@gmail.com"
PASSWORD     = "admin123"
ADMIN_NAME   = "System Admin"
OLD_EMAIL    = "admin@smartedu.com"

db = SessionLocal()

try:
    # Look for existing admin by new email first, then old email
    admin = db.query(User).filter(User.email == NEW_EMAIL).first()

    if not admin:
        admin = db.query(User).filter(User.email == OLD_EMAIL).first()

    if admin:
        # Update in place — never delete, because courses.created_by
        # references this user's id and has a NOT NULL constraint.
        admin.email           = NEW_EMAIL
        admin.password_hash   = hash_password(PASSWORD)
        admin.full_name       = ADMIN_NAME
        admin.role            = "admin"
        admin.is_active       = True
        admin.has_set_password = True
        db.commit()
        print(f"Admin updated → email: {NEW_EMAIL} / password: {PASSWORD}")
    else:
        admin = User(
            email            = NEW_EMAIL,
            password_hash    = hash_password(PASSWORD),
            full_name        = ADMIN_NAME,
            role             = "admin",
            is_active        = True,
            has_set_password = True,
        )
        db.add(admin)
        db.commit()
        print(f"Admin created → email: {NEW_EMAIL} / password: {PASSWORD}")

finally:
    db.close()