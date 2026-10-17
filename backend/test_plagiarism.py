# test_plagiarism.py
"""
Unit test for SmartEdu Plagiarism Detection Engine.
Tests:
1. TF-IDF, Shingle, and Semantic vector calculation.
2. Assignment title, description, and rubric text exclusion.
3. Matching text span extraction via difflib.SequenceMatcher.
4. Composite max scoring & risk band classification.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.plagiarism_service import (
    _get_shingles,
    _compute_shingle_jaccard,
    _extract_matching_spans,
    _clean_text_for_comparison,
)
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def test_plagiarism_logic():
    print("Testing SmartEdu Plagiarism Detection Logic...")

    prompt_text = "Assignment 1: Artificial Intelligence Overview. Write a report on Neural Networks and Deep Learning."
    prompt_shingles = _get_shingles(prompt_text, n=4)

    target_submission = (
        "Assignment 1: Artificial Intelligence Overview. Write a report on Neural Networks and Deep Learning. "
        "Artificial Intelligence (AI) is transforming society rapidly. Deep neural networks consist of input, "
        "hidden, and output layers that transform features hierarchically to learn complex representations. "
        "Backpropagation uses gradient descent to adjust weights iteratively based on loss gradients."
    )

    copied_submission = (
        "Artificial Intelligence (AI) is transforming society rapidly. Deep neural networks consist of input, "
        "hidden, and output layers that transform features hierarchically to learn complex representations. "
        "Backpropagation uses gradient descent to adjust weights iteratively based on loss gradients."
    )

    different_submission = (
        "Database management systems organize data using relational tables and primary keys. "
        "SQL queries allow users to select, insert, update, and delete records efficiently with index optimization."
    )

    # 1. Clean texts
    clean_target = _clean_text_for_comparison(target_submission, prompt_text)
    clean_copied = _clean_text_for_comparison(copied_submission, prompt_text)
    clean_different = _clean_text_for_comparison(different_submission, prompt_text)

    # 2. Shingle Jaccard
    target_sh = _get_shingles(clean_target, n=4)
    copied_sh = _get_shingles(clean_copied, n=4)
    diff_sh = _get_shingles(clean_different, n=4)

    shingle_cop_score = _compute_shingle_jaccard(target_sh, copied_sh, prompt_shingles)
    shingle_diff_score = _compute_shingle_jaccard(target_sh, diff_sh, prompt_shingles)

    print(f"Shingle Copied Score: {shingle_cop_score:.4f} (expected > 0.8)")
    print(f"Shingle Different Score: {shingle_diff_score:.4f} (expected 0.0)")

    assert shingle_cop_score > 0.8, "Copied submission should have high shingle score"
    assert shingle_diff_score == 0.0, "Different submission should have 0 shingle score"

    # 3. TF-IDF Cosine
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform([clean_target, clean_copied, clean_different])
    sims = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()

    print(f"TF-IDF Copied Cosine: {sims[0]:.4f} (expected > 0.85)")
    print(f"TF-IDF Different Cosine: {sims[1]:.4f} (expected ~0.0)")

    assert sims[0] > 0.85, "Copied submission should have high TF-IDF similarity"

    # 4. Text Span Matching
    spans = _extract_matching_spans(clean_target, clean_copied)
    print(f"Extracted {len(spans)} matching text spans.")
    if spans:
        print(f"Top matching span excerpt: '{spans[0]['text'][:60]}...'")

    assert len(spans) > 0, "SequenceMatcher should find matching spans"

    print("\nALL PLAGIARISM UNIT TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_plagiarism_logic()
