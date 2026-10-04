import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import geocode, ors
from app.services.calories import estimate_kcal_range

client = TestClient(app)  # no `with`: skips the DB pool, generate doesn't need it

BODY = {
    "postalCode": "V5A 1S6",
    "targetDistanceKm": 10,
    "targetTime": {"hours": 0, "minutes": 45},
    "minElevation": 260,
    "avgElevation": 310,
    "maxElevation": 370,
}


def fake_route(seed: int, distance_km: float = 10.0) -> ors.RawRoute:
    """A loop whose climb grows with the seed, so difficulties are distinguishable."""
    n = 50
    amp = 20 * seed
    coords = [(49.27 + i * 1e-4, -122.92 + i * 1e-4, 260 + amp * (1 - abs(2 * i / (n - 1) - 1))) for i in range(n)]
    return ors.RawRoute(coords=coords, distance_km=distance_km + seed * 0.1, ascent=amp, descent=amp)


@pytest.fixture
def fake_ors(monkeypatch):
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: ors.Place(49.278, -122.92, "Burnaby Mountain", "Burnaby, BC"))
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: fake_route(seed, km * 1.4))


def test_generate_matches_agreed_shape(fake_ors):
    r = client.post("/api/routes/generate", json=BODY)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["area"]["name"] == "Burnaby Mountain"
    assert data["area"]["start"] == {"lat": 49.278, "lng": -122.92}
    assert [x["difficulty"] for x in data["routes"]] == ["easy", "medium", "hard"]

    route = data["routes"][0]
    assert set(route) == {"id", "name", "difficulty", "terrain", "distanceKm", "elevationGain", "minElevation",
                          "avgElevation", "maxElevation", "estimatedMinutes", "estimatedCalories", "points"}
    assert set(route["points"][0]) == {"lat", "lng", "elevation"}
    assert len(route["points"]) <= 121


def test_harder_routes_climb_more(fake_ors):
    gains = [x["elevationGain"] for x in client.post("/api/routes/generate", json=BODY).json()["routes"]]
    assert gains == sorted(gains) and gains[0] < gains[-1]


def test_requested_length_is_corrected_for_ors_overshoot(monkeypatch, fake_ors):
    asked = []
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: asked.append(km) or fake_route(seed, km * 1.4))
    client.post("/api/routes/generate", json={**BODY, "targetTime": None})
    assert asked[0] == 10  # calibration loops ask for the target...
    assert asked[-1] < 8   # ...later ones ask for less, since ORS came back ~40% long


def test_time_only_request_is_valid(fake_ors):
    body = {**BODY, "targetDistanceKm": None}
    assert client.post("/api/routes/generate", json=body).status_code == 200


@pytest.mark.parametrize("patch", [
    {"postalCode": "12345"},
    {"minElevation": 400},  # min > avg
    {"targetDistanceKm": None, "targetTime": {"hours": 0, "minutes": 0}},  # no target at all
])
def test_validation_errors(patch):
    assert client.post("/api/routes/generate", json={**BODY, **patch}).status_code == 422


def test_unknown_postal_code(monkeypatch):
    def nope(code):
        raise ors.NotFound(code)
    monkeypatch.setattr(geocode, "geocode_postal", nope)
    assert client.post("/api/routes/generate", json=BODY).status_code == 404


def test_missing_api_key_is_503(monkeypatch):
    monkeypatch.setattr(ors, "ORS_API_KEY", None)
    assert client.post("/api/routes/generate", json=BODY).status_code == 503


@pytest.mark.parametrize("error, status", [
    (ors.ORSConfigError("bad key"), 503),
    (ors.ORSRateLimited("slow down", retry_after=30), 429),
    (ors.ORSTimeout("slow"), 504),
    (ors.NoRoutablePath("no path"), 422),
    (ors.ORSError("boom"), 502),
])
def test_ors_failures_map_to_status_codes(monkeypatch, error, status):
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: ors.Place(49.278, -122.92, "Burnaby Mountain", "Burnaby, BC"))

    def fail(*args, **kwargs):
        raise error
    monkeypatch.setattr(ors, "round_trip", fail)
    r = client.post("/api/routes/generate", json=BODY)
    assert r.status_code == status
    assert "detail" in r.json()
    if status == 429:
        assert r.headers["Retry-After"] == "30"


def test_ors_retries_transient_failures_once(monkeypatch):
    calls = []

    def flaky(method, url, **kwargs):
        calls.append(url)
        if len(calls) == 1:
            raise httpx.ConnectError("down")
        return httpx.Response(200, request=httpx.Request(method, url), json={"features": []})

    monkeypatch.setattr(ors.httpx, "request", flaky)
    monkeypatch.setattr(ors, "ORS_API_KEY", "k")
    monkeypatch.setattr(ors, "RETRY_DELAY_S", 0)
    with pytest.raises(ors.NotFound):
        ors.geocode_postal("V5A1S6")
    assert len(calls) == 2


def test_ors_429_is_not_retried(monkeypatch):
    calls = []

    def limited(method, url, **kwargs):
        calls.append(url)
        return httpx.Response(429, request=httpx.Request(method, url), headers={"Retry-After": "42"})

    monkeypatch.setattr(ors.httpx, "request", limited)
    monkeypatch.setattr(ors, "ORS_API_KEY", "k")
    with pytest.raises(ors.ORSRateLimited) as exc:
        ors.geocode_postal("V5A1S6")
    assert len(calls) == 1 and exc.value.retry_after == 42


def test_ors_404_means_no_walkable_path(monkeypatch):
    monkeypatch.setattr(ors.httpx, "request", lambda m, u, **kw: httpx.Response(404, request=httpx.Request(m, u)))
    monkeypatch.setattr(ors, "ORS_API_KEY", "k")
    with pytest.raises(ors.NoRoutablePath):
        ors.round_trip(49.0, -122.0, 5, 1)


def test_validation_failures_are_logged_without_values(caplog):
    caplog.set_level("INFO", logger="app.errors")
    r = client.post("/api/routes/generate", json={**BODY, "postalCode": "SECRET-12345"})
    assert r.status_code == 422 and r.json()["detail"]  # response is unchanged
    logged = " ".join(rec.getMessage() for rec in caplog.records)
    assert "422 on POST /api/routes/generate" in logged and "postalCode" in logged
    assert "SECRET-12345" not in logged


def test_routes_have_a_calorie_range_from_their_distance_and_climb(fake_ors):
    for r in client.post("/api/routes/generate", json=BODY).json()["routes"]:
        low, high = estimate_kcal_range(r["distanceKm"], r["elevationGain"])
        assert r["estimatedCalories"] == {"min": low, "max": high} and 0 < low < high
