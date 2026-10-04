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
