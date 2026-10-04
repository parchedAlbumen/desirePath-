"""In-memory sliding-window rate limiter. One process only: counts reset on restart and aren't shared
between workers, which is fine for a single hackathon server (use Redis if that ever changes)."""
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app import config


class RateLimited(Exception):
    def __init__(self, retry_after: int, scope: str):
        super().__init__(f"rate limited ({scope})")
        self.retry_after = retry_after
        self.scope = scope  # "ip" or "global"


class SlidingWindow:
    """Allows at most `limit` hits per `window` seconds for each key."""

    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self.hits[key]
        while q and q[0] <= now - self.window:
            q.popleft()
        if not q:
            self.hits.pop(key, None)  # don't keep an entry per IP forever
        return q

    def retry_after(self, key: str, now: float) -> int:
        """0 if a hit is allowed now, otherwise seconds until the oldest hit expires."""
        q = self._prune(key, now)
        if len(q) < self.limit:
            return 0
        return max(1, int(q[0] + self.window - now) + 1)

    def record(self, key: str, now: float) -> None:
        self.hits[key].append(now)


class GenerateLimiter:
    def __init__(self, per_ip_minute: int, per_ip_hour: int, global_minute: int, lookup_minute: int = 10**9):
        self._lookup = SlidingWindow(lookup_minute, 60)
        self._ip_minute = SlidingWindow(per_ip_minute, 60)
        self._ip_hour = SlidingWindow(per_ip_hour, 3600)
        self._global = SlidingWindow(global_minute, 60)
        self._lock = threading.Lock()

    def check_lookup(self, ip: str, now: float | None = None) -> None:
        """Loose cap on every valid request, cached or not (each one may trigger a geocoding call)."""
        now = time.monotonic() if now is None else now
        with self._lock:
            wait = self._lookup.retry_after(ip, now)
            if wait:
                raise RateLimited(wait, "ip")
            self._lookup.record(ip, now)

    def check(self, ip: str, now: float | None = None) -> None:
        """Counts one uncached generate for `ip`, or raises RateLimited without counting it."""
        now = time.monotonic() if now is None else now
        with self._lock:
            waits = [
                (self._ip_minute.retry_after(ip, now), "ip"),
                (self._ip_hour.retry_after(ip, now), "ip"),
                (self._global.retry_after("all", now), "global"),
            ]
            wait, scope = max(waits)
            if wait:
                raise RateLimited(wait, scope)
            self._ip_minute.record(ip, now)
            self._ip_hour.record(ip, now)
            self._global.record("all", now)

    def reset(self) -> None:
        with self._lock:
            for w in (self._lookup, self._ip_minute, self._ip_hour, self._global):
                w.hits.clear()


generate_limiter = GenerateLimiter(
    config.GENERATE_LIMIT_PER_IP_MINUTE, config.GENERATE_LIMIT_PER_IP_HOUR, config.GENERATE_LIMIT_GLOBAL_MINUTE,
    config.GENERATE_LOOKUP_LIMIT_PER_IP_MINUTE,
)


def client_ip(request: Request) -> str:
    # Behind a reverse proxy this is the proxy's address; read X-Forwarded-For there if we ever deploy that way.
    return request.client.host if request.client else "unknown"
