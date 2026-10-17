# app/utils/metrics.py
"""
Performance Telemetry module for SmartEdu Chatbot pipeline.
Tracks latency for Intent Classification, LMS Queries, Vector Retrieval,
Prompt Construction, LLM TTFT (Time To First Token), and Total Response Time.
"""

import time
import logging

logger = logging.getLogger("smartedu.perf")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[PERF] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class PipelineMetrics:
    def __init__(self):
        self.start_time = time.perf_counter()
        self.intent_ms = 0.0
        self.lms_ms = 0.0
        self.retrieval_ms = 0.0
        self.prompt_ms = 0.0
        self.ttft_ms = 0.0
        self.llm_total_ms = 0.0
        self.total_ms = 0.0
        self.cached = False

    def mark_intent(self, duration_sec: float):
        self.intent_ms = round(duration_sec * 1000, 2)

    def mark_lms(self, duration_sec: float):
        self.lms_ms = round(duration_sec * 1000, 2)

    def mark_retrieval(self, duration_sec: float):
        self.retrieval_ms = round(duration_sec * 1000, 2)

    def mark_prompt(self, duration_sec: float):
        self.prompt_ms = round(duration_sec * 1000, 2)

    def mark_ttft(self, duration_sec: float):
        self.ttft_ms = round(duration_sec * 1000, 2)

    def mark_llm_total(self, duration_sec: float):
        self.llm_total_ms = round(duration_sec * 1000, 2)

    def finish(self):
        self.total_ms = round((time.perf_counter() - self.start_time) * 1000, 2)

    def to_dict(self) -> dict:
        return {
            "intent_ms": self.intent_ms,
            "lms_ms": self.lms_ms,
            "retrieval_ms": self.retrieval_ms,
            "prompt_ms": self.prompt_ms,
            "ttft_ms": self.ttft_ms,
            "llm_total_ms": self.llm_total_ms,
            "total_ms": self.total_ms,
            "cached": self.cached,
        }

    def log(self, question: str, intent: str = "unknown"):
        q_short = question[:35] + ("..." if len(question) > 35 else "")
        if self.cached:
            logger.info(
                f'Q: "{q_short}" | CACHED HIT | Total: {self.total_ms}ms'
            )
        else:
            logger.info(
                f'Q: "{q_short}" | Intent: {intent} ({self.intent_ms}ms) | '
                f'LMS: {self.lms_ms}ms | Retrieval: {self.retrieval_ms}ms | '
                f'Prompt: {self.prompt_ms}ms | TTFT: {self.ttft_ms}ms | '
                f'LLM Total: {self.llm_total_ms}ms | Total: {self.total_ms}ms'
            )
