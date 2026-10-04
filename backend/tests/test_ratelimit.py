import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ratelimit import GenerateLimiter, RateLimited, generate_limiter
from app.services import geocode, ors
from tests.test_generate import BODY, fake_route


def test_per_ip_minute_limit_and_retry_after():
    lim = GenerateLimiter(per_ip_minute=3, per_ip_hour=100, global_minute=100)
    for t in (0, 1, 2):
        lim.check("a", now=t)
    with pytest.raises(RateLimited) as exc:
        lim.check("a", now=3)
    assert exc.value.scope == "ip" and 55 <= exc.value.retry_after <= 60
    lim.check("b", now=3)  # other IPs are unaffected
    lim.check("a", now=61)  # window slid past the first hit


def test_blocked_requests_are_not_counted():
    lim = GenerateLimiter(per_ip_minute=1, per_ip_hour=100, global_minute=100)
    lim.check("a", now=0)
    for t in range(1, 30):
        with pytest.raises(RateLimited):
            lim.check("a", now=t)
    lim.check("a", now=61)  # hammering while blocked didn't extend the block


def test_global_limit_applies_across_ips():
    lim = GenerateLimiter(per_ip_minute=10, per_ip_hour=100, global_minute=2)
    lim.check("a", now=0)
    lim.check("b", now=0)
    with pytest.raises(RateLimited) as exc:
        lim.check("c", now=1)
    assert exc.value.scope == "global"


def test_per_ip_hour_limit():
    lim = GenerateLimiter(per_ip_minute=100, per_ip_hour=2, global_minute=100)
    lim.check("a", now=0)
    lim.check("a", now=100)
    with pytest.raises(RateLimited) as exc:
        lim.check("a", now=200)
    assert exc.value.retry_after > 3000


def test_endpoint_returns_429_with_retry_after(monkeypatch):
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: ors.Place(49.278, -122.92, "Burnaby Mountain", "Burnaby, BC"))
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: fake_route(seed, km * 1.4))
    client = TestClient(app)
    def body(i):  # different settings each time, so the cache can't answer
        return {**BODY, "targetDistanceKm": 10 + i}

    for i in range(generate_limiter._ip_minute.limit):
        assert client.post("/api/routes/generate", json=body(i)).status_code == 200
    r = client.post("/api/routes/generate", json=body(99))
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0 and "too fast" in r.json()["detail"]


def test_invalid_requests_dont_use_up_the_limit():
    client = TestClient(app)
    for _ in range(10):
        assert client.post("/api/routes/generate", json={**BODY, "postalCode": "12345"}).status_code == 422
    assert generate_limiter._ip_minute.hits == {}


def test_lookup_limit_stops_geocoding_spam():
    lim = GenerateLimiter(per_ip_minute=10, per_ip_hour=100, global_minute=100, lookup_minute=2)
    lim.check_lookup("a", now=0)
    lim.check_lookup("a", now=1)
    with pytest.raises(RateLimited):
        lim.check_lookup("a", now=2)
    lim.check_lookup("b", now=2)
