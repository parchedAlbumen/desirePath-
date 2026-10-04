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
        self.scope = scope  # "ip" (logged out), "user" (logged in) or "global"


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
    def __init__(
        self, per_ip_minute: int, per_ip_hour: int, global_minute: int, lookup_minute: int = 10**9,
        per_user_minute: int | None = None, per_user_hour: int | None = None,
    ):
        self._lookup = SlidingWindow(lookup_minute, 60)
        self._ip_minute = SlidingWindow(per_ip_minute, 60)
        self._ip_hour = SlidingWindow(per_ip_hour, 3600)
        # Logged-in users get their own windows; same limits as IPs unless given
        self._user_minute = SlidingWindow(per_user_minute or per_ip_minute, 60)
        self._user_hour = SlidingWindow(per_user_hour or per_ip_hour, 3600)
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

    def check(self, ip: str, now: float | None = None, user_id: int | None = None) -> None:
        """Counts one uncached generate for the user if logged in, otherwise for `ip`,
        or raises RateLimited without counting it."""
        now = time.monotonic() if now is None else now
        if user_id is None:
            minute, hour, key, scope = self._ip_minute, self._ip_hour, ip, "ip"
        else:
            minute, hour, key, scope = self._user_minute, self._user_hour, str(user_id), "user"
        with self._lock:
            waits = [
                (minute.retry_after(key, now), scope),
                (hour.retry_after(key, now), scope),
                (self._global.retry_after("all", now), "global"),
            ]
            wait, scope = max(waits)
            if wait:
                raise RateLimited(wait, scope)
            minute.record(key, now)
            hour.record(key, now)
            self._global.record("all", now)

    def reset(self) -> None:
        with self._lock:
            for w in (self._lookup, self._ip_minute, self._ip_hour, self._user_minute, self._user_hour, self._global):
                w.hits.clear()


generate_limiter = GenerateLimiter(
    config.GENERATE_LIMIT_PER_IP_MINUTE, config.GENERATE_LIMIT_PER_IP_HOUR, config.GENERATE_LIMIT_GLOBAL_MINUTE,
    config.GENERATE_LOOKUP_LIMIT_PER_IP_MINUTE,
    config.GENERATE_LIMIT_PER_USER_MINUTE, config.GENERATE_LIMIT_PER_USER_HOUR,
)


def client_ip(request: Request) -> str:
    """The caller's IP. Behind a proxy the connecting address is the proxy's, so with TRUSTED_PROXY_HOPS set we
    read X-Forwarded-For instead: each proxy appends the address it saw, so the entry `hops` from the end is
    the real caller. Anything further left was sent by the caller and could be faked to dodge the limits."""
    hops = config.TRUSTED_PROXY_HOPS
    if hops:
        forwarded = [a.strip() for a in request.headers.get("x-forwarded-for", "").split(",") if a.strip()]
        if len(forwarded) >= hops:
            return forwarded[-hops]
    return request.client.host if request.client else "unknown"
