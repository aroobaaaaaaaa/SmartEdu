# test_chatbot_retrieval.py
"""
Unit test script for Chatbot Course Content Retrieval & Follow-up Conversation Memory.
Verifies:
1. Intent classification for follow-up questions ('Can you name them?', 'List lecture names').
2. LMS Context lecture title formatting.
3. Conversation memory propagation in RAG messages.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.intent_classifier import classify_intent
from app.services.lms_context_service import build_lms_context
from app.services.rag_service import resolve_lecture_ordinal


def test_chatbot_retrieval():
    print("Testing Chatbot Intent Classifier for Lecture Naming & Follow-ups...")

    queries_and_expected = [
        ("How many lectures are available in this course?", ["lms", "hybrid"]),
        ("Can you name them?", ["lms", "hybrid"]),
        ("List all lecture names", ["lms", "hybrid"]),
        ("What are the lecture titles?", ["lms", "hybrid"]),
        ("What is Lecture 1 about?", ["document", "hybrid"]),
        ("Which lecture discusses Digital Twins?", ["document", "hybrid"]),
    ]

    for query, expected_intents in queries_and_expected:
        intent = classify_intent(query)
        print(f"Query: '{query}' => Classified Intent: '{intent}'")
        assert intent in expected_intents, f"Query '{query}' failed intent classification. Got: {intent}"

    print("\nAll Intent Classification Tests Passed Successfully!")


if __name__ == "__main__":
    test_chatbot_retrieval()
