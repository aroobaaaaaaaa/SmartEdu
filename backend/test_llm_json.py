# backend/test_llm_json.py
import sys
from app.utils.llm_json import parse_llm_json, LLMJsonError

def run_tests():
    print("Running LLM JSON parser tests...\n")
    passed = 0
    total = 0

    # Test 1: Clean valid JSON
    total += 1
    sample1 = '''{
      "criteria_scores": {"content": 8, "structure": 4},
      "criteria_feedback": [
        {"key": "content", "label": "Content", "score": 8, "max_score": 10, "what_was_good": "Great details", "what_was_missing": null}
      ],
      "strengths": ["Clear arguments"],
      "weaknesses": ["Needs more citations"],
      "improvements": ["Add bibliography"],
      "summary": "Well written assignment."
    }'''
    data1, repaired1 = parse_llm_json(sample1)
    assert not repaired1
    assert data1["criteria_scores"]["content"] == 8
    print("[PASS] Test 1 passed: Clean valid JSON")
    passed += 1

    # Test 2: Markdown fenced JSON
    total += 1
    sample2 = f"Here is the evaluation:\n```json\n{sample1}\n```\nHope this helps!"
    data2, repaired2 = parse_llm_json(sample2)
    assert data2["criteria_scores"]["structure"] == 4
    print("[PASS] Test 2 passed: Markdown code fenced JSON")
    passed += 1

    # Test 3: Trailing commas
    total += 1
    sample3 = '''{
      "criteria_scores": {"content": 8, "structure": 4,},
      "strengths": ["Good work",],
    }'''
    data3, repaired3 = parse_llm_json(sample3)
    assert repaired3
    assert data3["criteria_scores"]["content"] == 8
    print("[PASS] Test 3 passed: Trailing commas repaired")
    passed += 1

    # Test 4: Truncated mid-object / mid-array (The exact bug char 2886 scenario)
    total += 1
    sample4 = '''{
      "criteria_scores": {"content": 8, "structure": 4},
      "criteria_feedback": [
        {"key": "content", "label": "Content", "score": 8, "max_score": 10, "what_was_good": "Good attempt", "what_was_missing": null},
        {"key": "structure", "label": "Structure", "score": 4, "max_score": 5, "what_was_good": "Nice formatting"'''
    data4, repaired4 = parse_llm_json(sample4)
    assert repaired4
    assert data4["criteria_scores"]["content"] == 8
    assert len(data4["criteria_feedback"]) >= 1
    print(f"[PASS] Test 4 passed: Truncated mid-object repaired (parsed: {list(data4.keys())})")
    passed += 1

    # Test 5: Truncated inside string
    total += 1
    sample5 = '''{
      "criteria_scores": {"content": 10},
      "summary": "This was an excellent submission because the student'''
    data5, repaired5 = parse_llm_json(sample5)
    assert repaired5
    assert data5["criteria_scores"]["content"] == 10
    assert "student" in data5["summary"]
    print("[PASS] Test 5 passed: Truncated inside string repaired")
    passed += 1

    # Test 6: Empty response
    total += 1
    try:
        parse_llm_json("")
        assert False, "Should have raised LLMJsonError"
    except LLMJsonError as e:
        print(f"[PASS] Test 6 passed: Empty response raises LLMJsonError ({e})")
        passed += 1

    # Test 7: Non-JSON response
    total += 1
    try:
        parse_llm_json("Sorry, as an AI I cannot complete this task.")
        assert False, "Should have raised LLMJsonError"
    except LLMJsonError as e:
        print(f"[PASS] Test 7 passed: Non-JSON raises LLMJsonError ({e})")
        passed += 1

    print(f"\nAll {passed}/{total} tests passed successfully!")

if __name__ == "__main__":
    run_tests()
