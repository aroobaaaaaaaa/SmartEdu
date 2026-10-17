# reset_for_testing.py
"""
Full system reset for end-to-end testing.
Preserves the admin account and nothing else.

Run from the backend/ directory with (venv) active:
    python reset_for_testing.py
"""

import os
import shutil
from app.database.db import SessionLocal, engine
from app.models.models import (
    User, Course, Enrollment, TeacherCourseAssignment,
    Assignment, Rubric, RubricCriterion, Submission,
    AIEvaluation, FinalGrade, Document, ChatHistory,
    PasswordResetToken
)
from app.config import settings

db = SessionLocal()

try:
    print("Starting system reset...\n")

    # -------------------------------------------------------
    # STEP 1: Find the admin account — this is the only row
    # we preserve. Everything else gets wiped.
    # -------------------------------------------------------
    admin = db.query(User).filter(User.role == "admin").first()
    if not admin:
        print("ERROR: No admin account found. Aborting — run seed_admin.py first.")
        exit(1)

    print(f"Admin account found: {admin.email} — this account will be preserved.\n")

    # -------------------------------------------------------
    # STEP 2: Delete in dependency order.
    #
    # Why this order matters:
    # FinalGrade and AIEvaluation reference Submission
    # Submission references Assignment and User
    # Assignment references Rubric and Course
    # RubricCriterion references Rubric
    # TeacherCourseAssignment references User and Course
    # Enrollment references User and Course
    # Document references Course and User
    # ChatHistory references User and Course
    # PasswordResetToken references User
    # Course references User (created_by)
    # User is last — all dependents must be gone first
    #
    # SQLAlchemy cascade="all, delete-orphan" handles some of
    # this automatically when you delete a parent row, but
    # being explicit here is safer for a bulk-delete operation.
    # -------------------------------------------------------

    # Assignment evaluation data
    count = db.query(FinalGrade).delete(synchronize_session=False)
    print(f"Deleted {count} final grades")

    count = db.query(AIEvaluation).delete(synchronize_session=False)
    print(f"Deleted {count} AI evaluations")

    count = db.query(Submission).delete(synchronize_session=False)
    print(f"Deleted {count} submissions")

    # Assignment structure
    count = db.query(Assignment).delete(synchronize_session=False)
    print(f"Deleted {count} assignments")

    count = db.query(RubricCriterion).delete(synchronize_session=False)
    print(f"Deleted {count} rubric criteria")

    count = db.query(Rubric).delete(synchronize_session=False)
    print(f"Deleted {count} rubrics")

    # Course materials and chat
    count = db.query(Document).delete(synchronize_session=False)
    print(f"Deleted {count} document records")

    count = db.query(ChatHistory).delete(synchronize_session=False)
    print(f"Deleted {count} chat history records")

    # Course memberships
    count = db.query(TeacherCourseAssignment).delete(synchronize_session=False)
    print(f"Deleted {count} teacher-course assignments")

    count = db.query(Enrollment).delete(synchronize_session=False)
    print(f"Deleted {count} enrollments")

    # Courses themselves
    count = db.query(Course).delete(synchronize_session=False)
    print(f"Deleted {count} courses")

    # Password tokens for non-admin users (the admin's token, if any, gets
    # deleted too — that's fine, it will be regenerated if ever needed)
    count = db.query(PasswordResetToken).delete(synchronize_session=False)
    print(f"Deleted {count} password reset tokens")

    # All users except admin
    count = db.query(User).filter(User.id != admin.id).delete(synchronize_session=False)
    print(f"Deleted {count} user accounts (admin preserved)")

    # Commit all DB changes together
    db.commit()
    print("\nDatabase reset committed successfully.")

except Exception as e:
    db.rollback()
    print(f"\nERROR during database reset: {e}")
    print("All database changes have been rolled back — no data was deleted.")
    raise

finally:
    db.close()

# -------------------------------------------------------
# STEP 3: ChromaDB — delete the entire persisted folder
# and recreate it empty. This is the only reliable way to
# guarantee a clean slate, since deleting individual
# collections can leave stale metadata on disk.
# -------------------------------------------------------
chroma_dir = settings.CHROMA_PERSIST_DIR
if os.path.exists(chroma_dir):
    shutil.rmtree(chroma_dir)
    print(f"\nDeleted ChromaDB directory: {chroma_dir}")

os.makedirs(chroma_dir, exist_ok=True)
print(f"Recreated empty ChromaDB directory: {chroma_dir}")

# -------------------------------------------------------
# STEP 4: Uploaded files — delete everything in the
# uploads/ folder. This covers both course material PDFs
# (named doc_{id}_filename.pdf) and submission PDFs
# (named submission_{id}_filename.pdf).
# -------------------------------------------------------
upload_dir = settings.UPLOAD_DIR
if os.path.exists(upload_dir):
    removed_files = 0
    for filename in os.listdir(upload_dir):
        file_path = os.path.join(upload_dir, filename)
        if os.path.isfile(file_path):
            os.remove(file_path)
            removed_files += 1
    print(f"\nRemoved {removed_files} files from uploads directory: {upload_dir}")
else:
    print(f"\nUploads directory not found (already clean): {upload_dir}")

print("\n--- Verification ---")
db2 = SessionLocal()
try:
    admin_check = db2.query(User).filter(User.role == "admin").first()
    user_count = db2.query(User).count()
    course_count = db2.query(Course).count()
    submission_count = db2.query(Submission).count()

    # Capture as plain string WHILE session is still open
    admin_email_str = admin_check.email if admin_check else "NOT FOUND"

    print(f"Admin account:     {admin_email_str} ({'OK' if admin_check else 'MISSING — ERROR'})")
    print(f"Total users:       {user_count} (should be 1 — the admin)")
    print(f"Total courses:     {course_count} (should be 0)")
    print(f"Total submissions: {submission_count} (should be 0)")
    print(f"ChromaDB dir:      {'exists and empty' if os.path.exists(chroma_dir) and not os.listdir(chroma_dir) else 'check manually'}")
finally:
    db2.close()

print("\nReset complete. System is ready for end-to-end testing.")
print(f"Log in as admin: {admin_email_str}")