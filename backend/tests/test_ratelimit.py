import pytest
from fastapi.testclient import TestClient

from app import config
from app.auth import create_token
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


def test_logged_in_users_get_their_own_higher_limit():
    lim = GenerateLimiter(per_ip_minute=100, per_ip_hour=1, global_minute=100, per_user_minute=100, per_user_hour=3)
    lim.check("a", now=0)
    with pytest.raises(RateLimited) as exc:
        lim.check("a", now=1)  # guest on this IP is out
    assert exc.value.scope == "ip"
    for t in (1, 2, 3):
        lim.check("a", now=t, user_id=7)  # same IP, but logged in: counted per account
    with pytest.raises(RateLimited) as exc:
        lim.check("a", now=4, user_id=7)
    assert exc.value.scope == "user"
    lim.check("a", now=4, user_id=8)  # another account on the same Wi-Fi is unaffected


def test_global_limit_also_applies_to_logged_in_users():
    lim = GenerateLimiter(per_ip_minute=10, per_ip_hour=100, global_minute=2)
    lim.check("a", now=0, user_id=1)
    lim.check("b", now=0)
    with pytest.raises(RateLimited) as exc:
        lim.check("c", now=1, user_id=2)
    assert exc.value.scope == "global"


def _generate_until_limited(client, headers=None, first_km=10):
    """How many uncached generates succeed before a 429. Pick a different first_km per call so the cache can't answer."""
    for i in range(50):
        r = client.post("/api/routes/generate", json={**BODY, "targetDistanceKm": first_km + i}, headers=headers)
        if r.status_code == 429:
            return i, r
        assert r.status_code == 200, r.text
    raise AssertionError("never rate limited")


def test_endpoint_limits_guests_per_ip_and_users_per_account(monkeypatch):
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: ors.Place(49.278, -122.92, "Burnaby Mountain", "Burnaby, BC"))
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: fake_route(seed, km * 1.4))
    client = TestClient(app)

    n, r = _generate_until_limited(client)
    assert n == generate_limiter._ip_minute.limit and "Log in for a higher limit" in r.json()["detail"]

    # Same IP, now logged in: a fresh, per-account allowance
    generate_limiter._global.hits.clear()  # only isolating the per-account limit here
    user = {"Authorization": f"Bearer {create_token(424242)}"}
    n, r = _generate_until_limited(client, user, first_km=100)
    assert n == generate_limiter._user_minute.limit and "Log in" not in r.json()["detail"]

    # A bad token doesn't break generate; it's just treated as logged out (and that IP is still limited)
    r = client.post("/api/routes/generate", json={**BODY, "targetDistanceKm": 99}, headers={"Authorization": "Bearer junk"})
    assert r.status_code == 429 and "Log in" in r.json()["detail"]


@pytest.mark.parametrize("hops, forwarded, expected", [
    (0, "6.6.6.6", "testclient"),                # local dev: header ignored, it could be faked
    (1, "1.2.3.4", "1.2.3.4"),                   # one proxy (Render) appended the real caller
    (1, "6.6.6.6, 1.2.3.4", "1.2.3.4"),          # caller faked an entry; we take the proxy's, not theirs
    (2, "6.6.6.6, 1.2.3.4, 10.0.0.1", "1.2.3.4"),  # two proxies (Vercel -> Render)
    (2, "1.2.3.4", "testclient"),                # fewer entries than proxies: misconfigured, don't trust it
])
def test_client_ip_behind_proxies(monkeypatch, hops, forwarded, expected):
    monkeypatch.setattr(config, "TRUSTED_PROXY_HOPS", hops)
    seen = {}
    def fake_check_lookup(ip, now=None):
        seen["ip"] = ip
        raise RateLimited(1, "ip")  # stop before doing any real work
    monkeypatch.setattr(generate_limiter, "check_lookup", fake_check_lookup)
    TestClient(app).post("/api/routes/generate", json=BODY, headers={"X-Forwarded-For": forwarded})
    assert seen["ip"] == expected
