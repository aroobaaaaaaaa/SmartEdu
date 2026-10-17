import os
import shutil
from typing import List

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database.db import get_db, SessionLocal
from app.models.models import User, Document
from app.schemas.document import DocumentResponse
from app.utils.auth import get_current_user, require_role
from app.services.rag_service import ingest_document_task
from app.services.engagement_service import log_event
from app.rag.vector_store import delete_document_chunks
from app.config import settings
from app.routers.courses import get_course_for_access  # IMPORTANT FIX

router = APIRouter()


# =========================
# LIST DOCUMENTS (MISSING FIX)
# =========================
@router.get("/{course_id}", response_model=List[DocumentResponse])
def list_documents(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # must check access (teacher assigned OR student enrolled)
    get_course_for_access(course_id, current_user, db)

    docs = db.query(Document).filter(Document.course_id == course_id).all()
    return docs




# =========================
# UPLOAD DOCUMENT
# =========================
@router.post("/{course_id}/upload", response_model=DocumentResponse)
async def upload_document(
    course_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)

    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    document = Document(
        course_id=course_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        file_path="",
        status="processing",
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    file_path = os.path.join(
        settings.UPLOAD_DIR,
        f"doc_{document.id}_{file.filename}"
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    document.file_path = file_path
    db.commit()

    background_tasks.add_task(
        ingest_document_task,
        document_id=document.id,
        file_path=file_path,
        course_id=course_id,
        db_session_factory=SessionLocal,
    )

    return document


# =========================
# DOWNLOAD DOCUMENT
# =========================
@router.get("/{course_id}/{document_id}/download")
def download_document(
    course_id: int,
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)

    document = db.query(Document).filter(
        Document.id == document_id, Document.course_id == course_id
    ).first()
    if not document or not os.path.exists(document.file_path):
        raise HTTPException(404, "File not found")

    if current_user.role == "student":
        log_event(current_user.id, course_id, "document_download", db)

    return FileResponse(document.file_path, filename=document.filename, media_type="application/pdf")


# =========================
# DELETE DOCUMENT
# =========================
@router.delete("/{course_id}/{document_id}")
def delete_document(
    course_id: int,
    document_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.course_id == course_id
    ).first()

    if not document:
        raise HTTPException(404, "Document not found")

    delete_document_chunks(course_id, document_id)

    if document.file_path and os.path.exists(document.file_path):
        os.remove(document.file_path)

    db.delete(document)
    db.commit()

    return {"message": "Document deleted"}