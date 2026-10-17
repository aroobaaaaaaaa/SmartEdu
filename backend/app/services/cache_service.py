# app/services/cache_service.py
"""
In-memory TTL Caching Service for SmartEdu.
Caches:
1. LMS Context strings per (course_id, student_id)
2. Response results per (course_id, student_id, normalized_question)
"""

import time
import re
import threading
from typing import Any, Optional, Dict, Tuple


def normalize_query(text: str) -> str:
    """Normalizes query text by lowercasing, stripping punctuation and extra whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text)


class TTLCache:
    def __init__(self, default_ttl: int = 300, max_size: int = 500):
        self.default_ttl = default_ttl
        self.max_size = max_size
        self._store: Dict[Any, Tuple[Any, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: Any) -> Optional[Any]:
        with self._lock:
            if key not in self._store:
                return None
            val, expire_time = self._store[key]
            if time.time() > expire_time:
                del self._store[key]
                return None
            return val

    def set(self, key: Any, value: Any, ttl: Optional[int] = None):
        with self._lock:
            if len(self._store) >= self.max_size:
                # Simple cleanup of expired items
                now = time.time()
                expired = [k for k, (_, exp) in self._store.items() if now > exp]
                for k in expired:
                    del self._store[k]
                # If still full, pop oldest
                if len(self._store) >= self.max_size:
                    oldest_key = next(iter(self._store))
                    del self._store[oldest_key]

            ttl_val = ttl if ttl is not None else self.default_ttl
            expire_time = time.time() + ttl_val
            self._store[key] = (value, expire_time)

    def invalidate_course(self, course_id: int):
        """Invalidates all cached entries for a given course_id."""
        with self._lock:
            keys_to_del = []
            for k in self._store:
                if isinstance(k, tuple) and len(k) >= 1 and k[0] == course_id:
                    keys_to_del.append(k)
            for k in keys_to_del:
                del self._store[k]

    def clear(self):
        with self._lock:
            self._store.clear()


# Global cache instances
lms_context_cache = TTLCache(default_ttl=60, max_size=200)    # 1 minute TTL for LMS DB summary
response_cache = TTLCache(default_ttl=300, max_size=1000)     # 5 minutes TTL for QA responses
