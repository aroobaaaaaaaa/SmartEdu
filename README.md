
# SmartEdu

An AI-based educational platform with a syllabus-grounded chatbot, rubric-based assignment evaluation with teacher approval, and performance analytics for spotting at-risk students.

## Features

- **Interactive Assistant:** a RAG chatbot that answers questions from uploaded course material (ChromaDB + Mistral via Ollama).
- **Automated Assignment Evaluation:** PDF text extraction with OCR fallback, per-criterion rubric scoring and feedback. A teacher must approve every grade before the student sees it.
- **Performance Analytics:** Random Forest risk prediction from grades, attendance and engagement, with a teacher dashboard and a student progress view.
- **Extras:** achievement badges, a teacher-only similarity report, deadline extensions with history, attendance tracking.
- **Roles:** admin, teacher and student, with JWT authentication.

## Tech Stack

- Frontend: React
- Backend: Python, FastAPI, SQLAlchemy
- Database: PostgreSQL, ChromaDB
- AI/ML: Ollama (Mistral), sentence-transformers, Tesseract OCR, scikit-learn

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js and npm
- PostgreSQL
- [Ollama](https://ollama.com)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)

### Backend

```bash
ollama pull mistral

cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

pip install -r requirements.txt
```

Create a `.env` file in `backend/` with your database URL, JWT secret and email settings, then run:

```bash
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
backend/    FastAPI app (app/main.py)
frontend/   React app
```

## Notes

- Automated scores are provisional until a teacher finalises them.
- Text extractions with low OCR confidence are rejected instead of graded.
- Risk predictions are advisory only.
