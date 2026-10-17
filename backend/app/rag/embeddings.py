# app/rag/embeddings.py
"""
Embeddings Service for SmartEdu.
- Document embeddings are generated once at upload time and persisted in ChromaDB.
- Query embeddings for user questions use LRU caching to eliminate redundant encodings.
"""

from functools import lru_cache
from sentence_transformers import SentenceTransformer
from app.config import settings

print(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Convert a list of text strings into a list of vectors.
    Used ONLY during document ingestion.
    """
    return embedding_model.encode(texts, show_progress_bar=False).tolist()


@lru_cache(maxsize=1024)
def _cached_encode_single(text: str) -> tuple:
    """Internal LRU cached encoder returning a tuple of floats."""
    vec = embedding_model.encode([text], show_progress_bar=False)[0]
    return tuple(vec.tolist())


def get_single_embedding(text: str) -> list[float]:
    """
    Convenience function for embedding a single query string.
    Uses LRU cache to instantly return embeddings for repeated queries.
    """
    cleaned_text = text.strip()
    return list(_cached_encode_single(cleaned_text))