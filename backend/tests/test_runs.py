import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import DATABASE_URL
from app.db import get_connection
from app.main import app

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

RUN = {
    "routeId": "route-1", "routeName": "Campus Loop", "startedAt": "2026-10-02T07:12:00Z",
    "durationSec": 1538, "distanceKm": 4.2, "elevationGain": 65,
    "points": [{"lat": 49.28, "lng": -123.12}, {"lat": 49.29, "lng": -123.13}],
    "plannedRoute": {"id": "route-1", "name": "Campus Loop"},
    "paceSamples": [{"t": 0, "km": 0}, {"t": 36.5, "km": 0.1}, {"t": 1538, "km": 4.2}],
}


@pytest.fixture
def emails():
    addrs = []
    yield addrs
    with get_connection() as conn:
        for a in addrs:
            conn.execute("DELETE FROM users WHERE email = %s", (a,))  # cascades to runs


def _login(client, emails):
    addr = f"test-{uuid.uuid4()}@example.com"
    emails.append(addr)
    token = client.post("/api/auth/register", json={"email": addr, "password": "password123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_runs_crud(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        created = client.post("/api/runs", json=RUN, headers=h)
        assert created.status_code == 201, created.text
        run = created.json()
        assert run["routeName"] == "Campus Loop" and run["isFavorite"] is False
        assert run["points"][1]["lng"] == -123.13 and run["plannedRoute"]["id"] == "route-1"
        assert run["paceSamples"] == RUN["paceSamples"]

        assert client.get(f"/api/runs/{run['id']}", headers=h).json()["durationSec"] == 1538
        assert [r["id"] for r in client.get("/api/runs", headers=h).json()] == [run["id"]]
        assert client.get("/api/runs?favorite=true", headers=h).json() == []

        fav = client.patch(f"/api/runs/{run['id']}", json={"isFavorite": True}, headers=h)
        assert fav.json()["isFavorite"] is True
        assert len(client.get("/api/runs?favorite=true", headers=h).json()) == 1

        assert client.delete(f"/api/runs/{run['id']}", headers=h).status_code == 204
        assert client.get(f"/api/runs/{run['id']}", headers=h).status_code == 404


def test_runs_require_login_and_are_private(emails):
    with TestClient(app) as client:
        assert client.get("/api/runs").status_code == 401
        mine, theirs = _login(client, emails), _login(client, emails)
        rid = client.post("/api/runs", json=RUN, headers=mine).json()["id"]
        assert client.get(f"/api/runs/{rid}", headers=theirs).status_code == 404
        assert client.patch(f"/api/runs/{rid}", json={"isFavorite": True}, headers=theirs).status_code == 404
        assert client.delete(f"/api/runs/{rid}", headers=theirs).status_code == 404
        assert client.get("/api/runs", headers=theirs).json() == []


def _run(**overrides):
    return {**RUN, **overrides}


def test_list_is_newest_first_and_filterable(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        old = client.post("/api/runs", json=_run(startedAt="2026-09-01T07:00:00Z", routeName="old"), headers=h).json()
        new = client.post("/api/runs", json=_run(startedAt="2026-10-01T07:00:00Z", routeName="new", isFavorite=True), headers=h).json()
        mid = client.post("/api/runs", json=_run(startedAt="2026-09-15T07:00:00Z", routeName="mid"), headers=h).json()

        # ordered by when the run happened, not by when it was saved
        assert [r["id"] for r in client.get("/api/runs", headers=h).json()] == [new["id"], mid["id"], old["id"]]
        assert [r["id"] for r in client.get("/api/runs?favorite=true", headers=h).json()] == [new["id"]]
        assert [r["id"] for r in client.get("/api/runs?favorite=false", headers=h).json()] == [mid["id"], old["id"]]


def test_limit_is_applied_and_clamped(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        for i in range(3):
            # favorites, so the 2-recent-runs cap doesn't delete any of them
            client.post("/api/runs", json=_run(startedAt=f"2026-10-0{i + 1}T07:00:00Z", isFavorite=True), headers=h)
        assert len(client.get("/api/runs?limit=2", headers=h).json()) == 2
        assert len(client.get("/api/runs?limit=0", headers=h).json()) == 1  # clamped up to 1
        assert len(client.get("/api/runs?limit=9999", headers=h).json()) == 3  # clamped down to 200
        assert client.get("/api/runs?limit=abc", headers=h).status_code == 422


def test_create_applies_defaults_and_stores_json_as_is(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        minimal = {"routeName": "Quick", "startedAt": "2026-10-02T07:12:00Z", "durationSec": 0, "distanceKm": 0}
        run = client.post("/api/runs", json=minimal, headers=h).json()
        assert run["routeId"] is None and run["plannedRoute"] is None
        assert run["points"] == [] and run["elevationGain"] == 0 and run["isFavorite"] is False

        planned = {"id": "r", "name": "x", "points": [{"lat": 1, "lng": 2, "elevation": 3.5}], "extra": {"a": [1, 2]}}
        run = client.post("/api/runs", json=_run(plannedRoute=planned), headers=h).json()
        assert client.get(f"/api/runs/{run['id']}", headers=h).json()["plannedRoute"] == planned


def test_started_at_round_trips_as_the_same_instant(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        run = client.post("/api/runs", json=_run(startedAt="2026-10-02T07:12:00-07:00"), headers=h).json()
        assert run["startedAt"].startswith("2026-10-02T14:12:00")  # 07:12 at UTC-7 is 14:12 UTC


@pytest.mark.parametrize("bad", [
    {"routeName": ""},
    {"durationSec": -1},
    {"distanceKm": -0.1},
    {"elevationGain": -5},
    {"startedAt": "not a date"},
    {"points": [{"lat": 1}]},
    {"durationSec": "fast"},
])
def test_create_rejects_invalid_bodies(emails, bad):
    with TestClient(app) as client:
        h = _login(client, emails)
        assert client.post("/api/runs", json=_run(**bad), headers=h).status_code == 422
        assert client.get("/api/runs", headers=h).json() == []  # nothing half-saved


@pytest.mark.parametrize("missing", ["routeName", "startedAt", "durationSec", "distanceKm"])
def test_create_requires_core_fields(emails, missing):
    with TestClient(app) as client:
        h = _login(client, emails)
        body = {k: v for k, v in RUN.items() if k != missing}
        assert client.post("/api/runs", json=body, headers=h).status_code == 422


def test_user_id_in_body_is_ignored(emails):
    """The owner always comes from the token; a client can't save a run for someone else."""
    with TestClient(app) as client:
        mine, theirs = _login(client, emails), _login(client, emails)
        rid = client.post("/api/runs", json=_run(userId=1), headers=mine).json()["id"]
        assert client.get(f"/api/runs/{rid}", headers=mine).status_code == 200
        assert client.get("/api/runs", headers=theirs).json() == []


def test_patch_validation_and_unknown_runs(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        rid = client.post("/api/runs", json=RUN, headers=h).json()["id"]
        assert client.patch(f"/api/runs/{rid}", json={}, headers=h).status_code == 400
        assert client.patch(f"/api/runs/{rid}", json={"isFavorite": "maybe"}, headers=h).status_code == 422
        # other fields are ignored: a run's recorded data can't be rewritten
        out = client.patch(f"/api/runs/{rid}", json={"isFavorite": True, "distanceKm": 99}, headers=h).json()
        assert out["isFavorite"] is True and out["distanceKm"] == 4.2

        assert client.patch("/api/runs/999999999", json={"isFavorite": True}, headers=h).status_code == 404
        assert client.get("/api/runs/999999999", headers=h).status_code == 404
        assert client.delete("/api/runs/999999999", headers=h).status_code == 404
        assert client.get("/api/runs/abc", headers=h).status_code == 422


def test_bad_tokens_are_rejected(emails):
    with TestClient(app) as client:
        for headers in ({"Authorization": "Bearer garbage"}, {"Authorization": "Basic abc"}, {}):
            assert client.get("/api/runs", headers=headers).status_code == 401
            assert client.post("/api/runs", json=RUN, headers=headers).status_code == 401
            assert client.patch("/api/runs/1", json={"isFavorite": True}, headers=headers).status_code == 401
            assert client.delete("/api/runs/1", headers=headers).status_code == 401


def test_deleting_a_user_deletes_their_runs(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        rid = client.post("/api/runs", json=RUN, headers=h).json()["id"]
        assert client.delete("/api/auth/me", headers=h).status_code == 204
        with get_connection() as conn:
            assert conn.execute("SELECT count(*) FROM runs WHERE id = %s", (rid,)).fetchone()[0] == 0


def _ids(client, h):
    return [r["id"] for r in client.get("/api/runs", headers=h).json()]


def test_only_the_two_newest_runs_are_kept(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        first = client.post("/api/runs", json=_run(startedAt="2026-10-01T07:00:00Z"), headers=h).json()
        second = client.post("/api/runs", json=_run(startedAt="2026-10-02T07:00:00Z"), headers=h).json()
        assert set(_ids(client, h)) == {first["id"], second["id"]}

        third = client.post("/api/runs", json=_run(startedAt="2026-10-03T07:00:00Z"), headers=h).json()
        assert _ids(client, h) == [third["id"], second["id"]]  # the oldest was deleted
        assert client.get(f"/api/runs/{first['id']}", headers=h).status_code == 404


def test_favorites_are_not_counted_or_deleted_by_the_cap(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        starred = client.post("/api/runs", json=_run(startedAt="2026-09-01T07:00:00Z", isFavorite=True), headers=h).json()
        for day in (1, 2, 3):
            client.post("/api/runs", json=_run(startedAt=f"2026-10-0{day}T07:00:00Z"), headers=h)
        ids = _ids(client, h)
        assert len(ids) == 3 and starred["id"] in ids  # old favorite + the 2 newest others


def test_unstarring_an_old_run_deletes_it_when_over_the_cap(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        old = client.post("/api/runs", json=_run(startedAt="2026-09-01T07:00:00Z", isFavorite=True), headers=h).json()
        a = client.post("/api/runs", json=_run(startedAt="2026-10-01T07:00:00Z"), headers=h).json()
        b = client.post("/api/runs", json=_run(startedAt="2026-10-02T07:00:00Z"), headers=h).json()
        assert client.patch(f"/api/runs/{old['id']}", json={"isFavorite": False}, headers=h).status_code == 200
        assert set(_ids(client, h)) == {a["id"], b["id"]}


def test_the_cap_is_per_user(emails):
    with TestClient(app) as client:
        mine, theirs = _login(client, emails), _login(client, emails)
        client.post("/api/runs", json=_run(startedAt="2026-10-01T07:00:00Z"), headers=theirs)
        for day in (1, 2, 3):
            client.post("/api/runs", json=_run(startedAt=f"2026-10-0{day}T07:00:00Z"), headers=mine)
        assert len(_ids(client, theirs)) == 1 and len(_ids(client, mine)) == 2
