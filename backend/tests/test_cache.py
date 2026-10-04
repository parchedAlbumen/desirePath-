import pytest
from fastapi.testclient import TestClient

from app.cache import TTLCache, make_key
from app.main import app
from app.ratelimit import generate_limiter
from app.schemas.generate import GenerateRequest
from app.services import geocode, ors
from tests.test_generate import BODY, fake_route

client = TestClient(app)

HERE = ors.Place(49.2780, -122.9200, "Burnaby Mountain", "Burnaby, BC")
NEXT_DOOR = ors.Place(49.2784, -122.9203, "Burnaby Mountain", "Burnaby, BC")  # ~40 m away
ACROSS_TOWN = ors.Place(49.2500, -122.9000, "Elsewhere", "Burnaby, BC")


@pytest.fixture
def ors_calls(monkeypatch):
    calls = []
    places = {"V5A 1S6": HERE, "V5A 1S7": NEXT_DOOR, "V6B 1A1": ACROSS_TOWN}
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: places[code])
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: calls.append(seed) or fake_route(seed, km * 1.4))
    return calls


def post(**patch):
    return client.post("/api/routes/generate", json={**BODY, **patch})


def test_repeat_request_is_served_from_cache(ors_calls):
    first = post()
    n = len(ors_calls)
    assert n > 0
    second = post()
    assert len(ors_calls) == n  # no new ORS calls
    assert second.json() == first.json()


def test_nearby_postal_code_shares_routes_but_is_relabelled(ors_calls):
    first = post().json()
    n = len(ors_calls)
    second = post(postalCode="V5A 1S7").json()
    assert len(ors_calls) == n
    assert second["area"]["startLabel"] == "Near V5A 1S7"
    assert [r["id"] for r in second["routes"]] == ["V5A1S7-easy", "V5A1S7-medium", "V5A1S7-hard"]
    assert second["routes"][0]["points"] == first["routes"][0]["points"]
    assert first["area"]["startLabel"] == "Near V5A 1S6"  # the cached original wasn't mutated


def test_far_away_postal_code_or_different_settings_miss(ors_calls):
    post()
    n = len(ors_calls)
    post(postalCode="V6B 1A1")
    assert len(ors_calls) > n
    n = len(ors_calls)
    generate_limiter.reset()  # 3 uncached generates in a row would pass the guest limit; that's not what this tests
    post(maxElevation=400)
    assert len(ors_calls) > n


def test_cache_hits_dont_count_against_ors_limits(ors_calls):
    post()
    for _ in range(10):
        assert post().status_code == 200
    assert generate_limiter._ip_minute.hits["testclient"].__len__() == 1


def test_failed_generation_is_not_cached(monkeypatch, ors_calls):
    def fail(*a, **k):
        raise ors.ORSTimeout("slow")
    monkeypatch.setattr(ors, "round_trip", fail)
    assert post().status_code == 504
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: fake_route(seed, km * 1.4))
    assert post().status_code == 200


def test_ttl_expiry_and_lru_eviction():
    now = [0.0]
    cache = TTLCache(maxsize=2, ttl=10, clock=lambda: now[0])
    cache.set("a", 1)
    cache.set("b", 2)
    assert cache.get("a") == 1  # touching "a" makes "b" the oldest
    cache.set("c", 3)
    assert cache.get("b") is None and cache.get("a") == 1 and cache.get("c") == 3
    now[0] = 11
    assert cache.get("a") is None


def test_key_ignores_postal_code_text_but_not_location():
    req = GenerateRequest(**BODY)
    assert make_key(HERE, req) == make_key(NEXT_DOOR, req)
    assert make_key(HERE, req) != make_key(ACROSS_TOWN, req)
