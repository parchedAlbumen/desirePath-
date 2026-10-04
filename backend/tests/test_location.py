"""GPS start points and honest start labels."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import geocode, ors
from tests.test_generate import BODY, fake_route

client = TestClient(app)

GPS = {"startLat": 49.2780, "startLng": -122.9200}
NO_POSTAL = {k: v for k, v in BODY.items() if k != "postalCode"}


@pytest.fixture
def fake_world(monkeypatch):
    seen = {"round_trip_at": [], "reverse": 0}
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: ors.Place(49.2780, -122.9200, "Burnaby Mountain", "Burnaby, BC"))

    def reverse(lat, lng):
        seen["reverse"] += 1
        return "Burnaby Mountain", "Burnaby, BC"
    monkeypatch.setattr(geocode, "_reverse_names", reverse)
    monkeypatch.setattr(ors, "round_trip", lambda lat, lng, km, seed, points=3: seen["round_trip_at"].append((lat, lng)) or fake_route(seed, km * 1.4))
    return seen


def gps_post(**patch):
    return client.post("/api/routes/generate", json={**NO_POSTAL, **GPS, **patch})


def test_gps_request_needs_no_postal_code(fake_world):
    r = gps_post()
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["area"]["startLabel"] == "Your location"
    assert data["area"]["name"] == "Burnaby Mountain"  # named by reverse geocoding
    assert data["area"]["start"] == {"lat": 49.2780, "lng": -122.9200}
    assert data["routes"][0]["id"] == "gps-easy"
    assert data["routes"][0]["name"].startswith("Burnaby Mountain")
    assert set(fake_world["round_trip_at"]) == {(49.2780, -122.9200)}  # loops start exactly where the user is


def test_gps_wins_over_a_sloppy_postal_code(fake_world):
    assert gps_post(postalCode="not a postal code").status_code == 200


def test_reverse_geocoding_failure_falls_back_to_generic_name(monkeypatch, fake_world):
    def boom(lat, lng):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(geocode, "_reverse_names", boom)
    r = gps_post()
    assert r.status_code == 200
    assert r.json()["area"]["name"] == "Your location"


def test_reverse_geocoding_only_runs_on_a_cache_miss(fake_world):
    gps_post()
    gps_post()
    assert fake_world["reverse"] == 1


def test_gps_and_postal_code_in_the_same_square_share_routes(fake_world):
    gps = gps_post().json()
    n = len(fake_world["round_trip_at"])
    postal = client.post("/api/routes/generate", json=BODY).json()  # geocodes to the same spot
    assert len(fake_world["round_trip_at"]) == n
    assert postal["area"]["startLabel"] == "Near V5A 1S6"
    assert postal["routes"][0]["id"] == "V5A1S6-easy"
    assert postal["routes"][0]["points"] == gps["routes"][0]["points"]


@pytest.mark.parametrize("patch", [
    {},                                          # neither postal code nor coordinates
    {"startLat": 49.2},                          # only half of a coordinate pair
    {"startLng": -122.9},
    {"startLat": 91, "startLng": -122.9},        # out of range
    {"startLat": 49.2, "startLng": -181},
])
def test_location_validation(patch):
    assert client.post("/api/routes/generate", json={**NO_POSTAL, **patch}).status_code == 422


def test_bad_postal_code_without_gps_is_still_rejected():
    assert client.post("/api/routes/generate", json={**BODY, "postalCode": "12345"}).status_code == 422


def test_guessed_start_is_labelled_by_area_not_postal_code(monkeypatch, fake_world):
    monkeypatch.setattr(geocode, "geocode_postal", lambda code: ors.Place(49.2576, -122.9375, "Burnaby", "Burnaby, BC", approximate=True))
    first = client.post("/api/routes/generate", json=BODY).json()
    assert first["area"]["startLabel"] == "Near Burnaby"
    cached = client.post("/api/routes/generate", json=BODY).json()
    assert cached["area"]["startLabel"] == "Near Burnaby"


def test_ors_fallback_geocode_is_marked_approximate(monkeypatch):
    geocode.geocode_postal.cache_clear()
    monkeypatch.setattr(geocode, "_nominatim", lambda code: None)
    monkeypatch.setattr(ors, "geocode_postal", lambda code, postal_layer=False: ors.Place(49.2576, -122.9375, "Burnaby", "Burnaby, BC"))
    assert geocode.geocode_postal("V5A 1S7").approximate is True
    geocode.geocode_postal.cache_clear()
    monkeypatch.setattr(geocode, "_nominatim", lambda code: ors.Place(49.2782, -122.9138, "Burnaby Mountain", "Burnaby, BC"))
    assert geocode.geocode_postal("V5A 1S6").approximate is False
    geocode.geocode_postal.cache_clear()
