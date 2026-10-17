# reset_assignments_data.py
"""
Wipes all assignment-related test data: submissions, AI evaluations,
final grades, assignments, and rubrics. Does NOT touch users, courses,
enrollments, or RAG/document data — only Module 2's tables.
"""

import os
import shutil
from app.database.db import SessionLocal
from app.models.models import Assignment, Submission, AIEvaluation, FinalGrade, Rubric, RubricCriterion
from app.config import settings

db = SessionLocal()

# Order matters for clarity even though cascade="all, delete-orphan" on the
# relationships would handle most of this automatically — being explicit
# here makes the cleanup script self-documenting and safe to re-run
deleted_grades = db.query(FinalGrade).delete()
deleted_evals = db.query(AIEvaluation).delete()
deleted_submissions = db.query(Submission).delete()
deleted_assignments = db.query(Assignment).delete()
deleted_criteria = db.query(RubricCriterion).delete()
deleted_rubrics = db.query(Rubric).delete()

db.commit()
db.close()

print(f"Deleted: {deleted_grades} grades, {deleted_evals} AI evaluations, "
      f"{deleted_submissions} submissions, {deleted_assignments} assignments, "
      f"{deleted_rubrics} rubrics ({deleted_criteria} criteria).")

# Also clear physical submission PDFs from disk — they're named
# "submission_{id}_..." so they're distinguishable from course material uploads
if os.path.exists(settings.UPLOAD_DIR):
    removed_files = 0
    for f in os.listdir(settings.UPLOAD_DIR):
        if f.startswith("submission_"):
            os.remove(os.path.join(settings.UPLOAD_DIR, f))
            removed_files += 1
    print(f"Removed {removed_files} submission files from disk.")

print("Assignment module reset complete.")