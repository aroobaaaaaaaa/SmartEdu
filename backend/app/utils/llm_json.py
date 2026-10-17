# app/utils/llm_json.py
"""Tolerant extraction of a JSON object from raw LLM output."""

import json
import re

_FENCE = re.compile(r"```(?:json)?", re.I)


class LLMJsonError(ValueError):
    def __init__(self, message, raw, detail=None, truncated=False):
        super().__init__(message)
        self.raw = raw
        self.detail = detail
        self.truncated = truncated


def _scan(text, start):
    """Walk from the first '{' tracking string/escape state.

    Returns (end_exclusive, open_stack, in_string). end is -1 if unterminated.
    """
    stack, in_str, esc = [], False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack and stack[-1] == ch:
                stack.pop()
                if not stack:
                    return i + 1, [], False
    return -1, stack, in_str


def _close(fragment, stack, in_str):
    """Close an unterminated fragment so json.loads can read it."""
    out = fragment
    if in_str:
        out += '"'
    # strip whatever partial token truncation left behind
    out = re.sub(r",\s*$", "", out)
    out = re.sub(r'(,\s*)?"[^"]*"\s*:\s*$', "", out)
    out = re.sub(r",\s*$", "", out)
    for closer in reversed(stack):
        out += closer
    return out


def _error_context(body, err, window=120):
    pos = getattr(err, "pos", 0) or 0
    lo, hi = max(0, pos - window), min(len(body), pos + window)
    return (
        f"{err.msg} at line {err.lineno} column {err.colno} (char {pos}); "
        f"payload was {len(body)} chars; context: ...{body[lo:hi]!r}..."
    )


def parse_llm_json(raw):
    """Best-effort parse. Returns (data, repaired: bool). Raises LLMJsonError."""
    if not raw or not raw.strip():
        raise LLMJsonError("model returned an empty response", raw)

    text = _FENCE.sub("", raw).strip()
    start = text.find("{")
    if start == -1:
        raise LLMJsonError("no JSON object found in model output", raw)

    end, stack, in_str = _scan(text, start)
    complete = end != -1
    candidate = text[start:end] if complete else text[start:]

    attempts = [(candidate, False)]
    if complete:
        # trailing commas before a closer are the common case here
        attempts.append((re.sub(r",(\s*[}\]])", r"\1", candidate), True))
    else:
        attempts.append((_close(candidate, stack, in_str), True))

    last_err = None
    for body, repaired in attempts:
        try:
            return json.loads(body), repaired
        except json.JSONDecodeError as exc:
            last_err = exc

    raise LLMJsonError(
        "could not parse JSON from model output",
        raw,
        detail=_error_context(candidate, last_err),
        truncated=not complete,
    )
