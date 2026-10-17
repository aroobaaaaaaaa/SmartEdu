# create_tables.py — sync tables and run migrations
from sqlalchemy import text
from app.database.db import engine, Base
from app.models import models

# 1. Create any missing tables
Base.metadata.create_all(bind=engine)

# 2. Migration for existing PostgreSQL/SQLite tables: Add summary column if missing
with engine.connect() as conn:
    try:
        # PostgreSQL / SQLite ALTER TABLE
        conn.execute(text("ALTER TABLE plagiarism_reports ADD COLUMN IF NOT EXISTS summary TEXT;"))
        conn.execute(text("ALTER TABLE plagiarism_reports ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(20) DEFAULT 'high';"))
        conn.execute(text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ocr_engine_used VARCHAR(30);"))
        conn.execute(text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(30);"))
        conn.execute(text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ocr_processing_time FLOAT;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_engagement_student_course_created ON engagement_events (student_id, course_id, created_at);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_student_assignment ON submissions (student_id, assignment_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_attendance_student_session ON attendance_records (student_id, session_id);"))
        conn.commit()
        print("Successfully migrated plagiarism_reports, submission OCR columns, and indexes.")
    except Exception as e:
        print(f"Migration note: {e}")

print("Tables synced and migrated.")