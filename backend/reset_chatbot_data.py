# reset_chatbot_data.py
"""
One-time cleanup: wipes ALL ChromaDB collections and all Document rows,
so the chatbot starts with zero knowledge. Run this once, then re-upload
materials cleanly.
"""

import shutil
import os
from app.database.db import SessionLocal
from app.models.models import Document
from app.config import settings

# 1. Delete the entire ChromaDB folder from disk — this removes every
#    collection (every course's vectors) in one shot, more reliable than
#    looping delete_collection() per course since it can't miss orphans
if os.path.exists(settings.CHROMA_PERSIST_DIR):
    shutil.rmtree(settings.CHROMA_PERSIST_DIR)
    print(f"Deleted ChromaDB directory: {settings.CHROMA_PERSIST_DIR}")
else:
    print("No ChromaDB directory found — already clean.")

os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)

# 2. Wipe all Document rows from PostgreSQL so the UI doesn't show
#    "indexed" documents that no longer have any vectors behind them
db = SessionLocal()
deleted_count = db.query(Document).delete()
db.commit()
db.close()
print(f"Deleted {deleted_count} document records from PostgreSQL.")

# 3. Also delete the physical uploaded files
if os.path.exists(settings.UPLOAD_DIR):
    for f in os.listdir(settings.UPLOAD_DIR):
        os.remove(os.path.join(settings.UPLOAD_DIR, f))
    print("Cleared uploads folder.")

print("Reset complete. Chatbot has no knowledge until new material is uploaded.")