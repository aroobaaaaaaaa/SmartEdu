# app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from fastapi.responses import StreamingResponse

from app.database.db import get_db, SessionLocal
from app.models.models import User, ChatHistory
from app.utils.auth import get_current_user
from app.services.rag_service import answer_question, answer_question_stream
from app.services.engagement_service import log_event
from app.routers.courses import get_course_for_access

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    course_id: int
    session_id: Optional[str] = "default"


class EditMessageRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    intent: Optional[str] = None
    answer_source: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None


@router.get("/sessions/{course_id}")
def list_chat_sessions(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists distinct chat sessions for the student in a course with first message title and latest timestamp."""
    get_course_for_access(course_id, current_user, db)

    # Query distinct session_ids and their latest message timestamp
    subquery = db.query(
        ChatHistory.session_id,
        func.max(ChatHistory.created_at).label("last_updated"),
        func.min(ChatHistory.id).label("first_msg_id")
    ).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == course_id
    ).group_by(ChatHistory.session_id).order_by(text_last_updated_desc()).all()

    sessions = []
    for row in subquery:
        first_msg = db.query(ChatHistory.message).filter(ChatHistory.id == row.first_msg_id).first()
        title = (first_msg[0][:40] + "...") if first_msg and first_msg[0] else "New Chat"
        sessions.append({
            "session_id": row.session_id,
            "title": title,
            "last_updated": row.last_updated.isoformat() if row.last_updated else None
        })

    return sessions


def text_last_updated_desc():
    return func.max(ChatHistory.created_at).desc()


@router.get("/history/{course_id}")
def get_chat_history(
    course_id: int,
    session_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves chat history filtered by session_id."""
    get_course_for_access(course_id, current_user, db)

    query = db.query(ChatHistory).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == course_id
    )

    if session_id:
        query = query.filter(ChatHistory.session_id == session_id)
    else:
        # Default: pick most recent active session_id if any exists
        latest_row = db.query(ChatHistory.session_id).filter(
            ChatHistory.student_id == current_user.id,
            ChatHistory.course_id == course_id
        ).order_by(ChatHistory.created_at.desc()).first()
        if latest_row:
            query = query.filter(ChatHistory.session_id == latest_row[0])
        else:
            return []

    records = query.order_by(ChatHistory.created_at.asc()).all()

    return [
        {
            "id": r.id,
            "session_id": r.session_id,
            "role": r.role,
            "message": r.message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


@router.delete("/session/{session_id}")
def delete_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes an entire chat session owned by the student."""
    db.query(ChatHistory).filter(
        ChatHistory.session_id == session_id,
        ChatHistory.student_id == current_user.id
    ).delete(synchronize_session=False)
    db.commit()

    return {"message": "Chat session deleted successfully."}


@router.delete("/history/{course_id}")
def clear_chat_history(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clears all conversation history for the student & course across all sessions."""
    get_course_for_access(course_id, current_user, db)

    db.query(ChatHistory).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == course_id
    ).delete(synchronize_session=False)
    db.commit()

    return {"message": "All chat history cleared successfully."}


@router.delete("/message/{message_id}")
def delete_chat_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes a single chat message owned by the student."""
    msg = db.query(ChatHistory).filter(
        ChatHistory.id == message_id,
        ChatHistory.student_id == current_user.id
    ).first()

    if not msg:
        raise HTTPException(404, "Message not found or access denied.")

    db.delete(msg)
    db.commit()
    return {"message": "Message deleted."}


@router.put("/message/{message_id}")
def edit_chat_message(
    message_id: int,
    payload: EditMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edits a single chat message text owned by the student."""
    if not payload.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    msg = db.query(ChatHistory).filter(
        ChatHistory.id == message_id,
        ChatHistory.student_id == current_user.id
    ).first()

    if not msg:
        raise HTTPException(404, "Message not found or access denied.")

    msg.message = payload.message.strip()
    db.commit()
    return {"id": msg.id, "message": msg.message, "role": msg.role}


@router.post("/", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)
    sess_id = request.session_id or "default"

    recent_history_objs = db.query(ChatHistory).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == request.course_id,
        ChatHistory.session_id == sess_id
    ).order_by(ChatHistory.created_at.desc()).limit(12).all()

    recent_history = [
        {"role": h.role, "message": h.message} for h in reversed(recent_history_objs)
    ]

    result = answer_question(
        question=request.message,
        course_id=request.course_id,
        student_id=current_user.id,
        db=db,
        history=recent_history,
        session_id=sess_id,
    )

    db.add(ChatHistory(
        session_id=sess_id, student_id=current_user.id, course_id=request.course_id,
        message=request.message, role="user",
    ))
    db.add(ChatHistory(
        session_id=sess_id, student_id=current_user.id, course_id=request.course_id,
        message=result["answer"], role="assistant",
    ))
    db.commit()
    log_event(current_user.id, request.course_id, "chat_message", db)

    return {
        "answer": result["answer"],
        "sources": result.get("sources", []),
        "intent": result.get("intent"),
        "answer_source": result.get("answer_source"),
        "metrics": result.get("metrics"),
    }


@router.post("/stream")
def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)

    student_id = current_user.id
    course_id = request.course_id
    message = request.message
    sess_id = request.session_id or "default"

    recent_history_objs = db.query(ChatHistory).filter(
        ChatHistory.student_id == student_id,
        ChatHistory.course_id == course_id,
        ChatHistory.session_id == sess_id
    ).order_by(ChatHistory.created_at.desc()).limit(12).all()

    recent_history = [
        {"role": h.role, "message": h.message} for h in reversed(recent_history_objs)
    ]

    # Commit user message to ChatHistory immediately so it's guaranteed to be saved
    db.add(ChatHistory(
        session_id=sess_id, student_id=student_id, course_id=course_id,
        message=message, role="user",
    ))
    db.commit()
    log_event(student_id, course_id, "chat_message", db)

    def generate():
        full_answer = ""
        try:
            stream_db = SessionLocal()
            try:
                for token in answer_question_stream(
                    message, course_id, student_id, stream_db,
                    history=recent_history, session_id=sess_id,
                ):
                    full_answer += token
                    yield token
            finally:
                stream_db.close()
        except Exception as e:
            full_answer += f"\n\n[Error: {str(e)}]"
            yield f"\n\n[Error: {str(e)}]"
            return
        finally:
            if full_answer.strip():
                history_db = SessionLocal()
                try:
                    history_db.add(ChatHistory(
                        session_id=sess_id, student_id=student_id, course_id=course_id,
                        message=full_answer, role="assistant",
                    ))
                    history_db.commit()
                finally:
                    history_db.close()

    return StreamingResponse(generate(), media_type="text/plain")