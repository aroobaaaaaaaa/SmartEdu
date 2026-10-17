# app/rag/vector_store.py
"""
ChromaDB interface — optimized for single collection queries per course,
supporting targeted document filtering for ordinal lecture lookups.
"""

import uuid
import chromadb
from app.config import settings

_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)


def get_or_create_collection(course_id: int):
    collection_name = f"course_{course_id}"
    return _client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks_to_collection(course_id: int, document_id: int, chunks: list[dict]) -> int:
    """
    chunks: list of {"text": str, "embedding": list[float]}
    """
    collection = get_or_create_collection(course_id)

    ids = [str(uuid.uuid4()) for _ in chunks]
    texts = [c["text"] for c in chunks]
    embeddings = [c["embedding"] for c in chunks]
    metadatas = [
        {
            "document_id": document_id,
            "course_id": course_id,
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(chunks)


def search_similar_chunks(
    course_id: int, query_embedding: list[float], n_results: int = 3,
    max_distance: float = 0.8, document_id: int = None,
) -> list[str]:
    """
    Optimized chunk retrieval:
    - If document_id is provided, filters ChromaDB query strictly to chunks from that lecture.
    - Evaluates distance threshold to eliminate noise.
    """
    collection = get_or_create_collection(course_id)

    total_chunks = collection.count()
    if total_chunks == 0:
        return []

    where_clause = {"document_id": document_id} if document_id is not None else None

    if where_clause:
        matching = collection.get(where=where_clause)
        matched_count = len(matching["ids"]) if matching and "ids" in matching else 0
        if matched_count == 0:
            return []
        fetch_k = min(n_results, matched_count)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_k,
            where=where_clause,
            include=["documents", "distances"],
        )
    else:
        fetch_k = min(n_results, total_chunks)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_k,
            include=["documents", "distances"],
        )

    if not results or not results.get("documents") or not results["documents"][0]:
        return []

    documents = results["documents"][0]
    distances = results["distances"][0]

    # Keep chunks within distance threshold
    filtered = [doc for doc, dist in zip(documents, distances) if dist <= max_distance]

    if not filtered and documents:
        return [documents[0]]

    return filtered


def delete_document_chunks(course_id: int, document_id: int) -> int:
    """Deletes all chunks associated with a document_id."""
    collection = get_or_create_collection(course_id)
    matching = collection.get(where={"document_id": document_id})
    count = len(matching["ids"]) if matching and "ids" in matching else 0

    if count > 0:
        collection.delete(where={"document_id": document_id})

    return count


def delete_course_collection(course_id: int):
    """Deletes the entire course vector collection."""
    try:
        _client.delete_collection(name=f"course_{course_id}")
    except Exception:
        pass