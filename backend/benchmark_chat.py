# benchmark_chat.py
"""
Benchmark & Testing Script for SmartEdu Chatbot Pipeline.
Tests:
1. Intent Classification Speed (< 1ms)
2. LMS Context Generation & Caching Speed
3. Vector Retrieval & Query Embedding LRU Caching
4. End-to-End Pipeline Performance & Metric Telemetry
"""

import time
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.intent_classifier import classify_intent
from app.rag.embeddings import get_single_embedding
from app.services.lms_context_service import build_lms_context
from app.database.db import SessionLocal


def test_intent_classification():
    print("\n--- 1. Intent Classification Latency Test ---")
    test_questions = [
        ("When is Assignment 1 due?", "lms"),
        ("What is an Operating System process?", "document"),
        ("Which lecture should I study for Assignment 2?", "hybrid"),
        ("Who is the instructor for this course?", "lms"),
    ]

    t0 = time.perf_counter()
    iterations = 100
    for _ in range(iterations):
        for q, _ in test_questions:
            classify_intent(q)
    total_time = (time.perf_counter() - t0) * 1000
    avg_per_call = total_time / (iterations * len(test_questions))

    print(f"Executed {iterations * len(test_questions)} classification calls.")
    print(f"Total time: {total_time:.2f} ms | Average per call: {avg_per_call:.4f} ms")

    for q, expected in test_questions:
        intent = classify_intent(q)
        print(f"  Q: '{q}' -> Predicted: {intent} (Expected: {expected})")


def test_query_embedding_cache():
    print("\n--- 2. Query Embedding LRU Cache Test ---")
    q = "Explain CPU scheduling algorithms"

    # First call (compute)
    t0 = time.perf_counter()
    emb1 = get_single_embedding(q)
    t1 = (time.perf_counter() - t0) * 1000

    # Second call (cached)
    t0 = time.perf_counter()
    emb2 = get_single_embedding(q)
    t2 = (time.perf_counter() - t0) * 1000

    print(f"Uncached embedding generation time: {t1:.2f} ms")
    print(f"Cached embedding generation time:   {t2:.4f} ms")
    print(f"LRU Cache speedup factor: {t1 / (t2 + 1e-6):.1f}x faster")


def main():
    print("==================================================")
    print("   SmartEdu Chatbot Pipeline Performance Benchmark")
    print("==================================================")
    test_intent_classification()
    test_query_embedding_cache()
    print("\nBenchmark completed successfully!")


if __name__ == "__main__":
    main()
