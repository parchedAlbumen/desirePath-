import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import DATABASE_URL
from app.db import get_connection
from app.main import app

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

ROUTE = {
    "name": "test", "distance": 5.2, "elevation_gain": 120, "elevation_loss": 100,
    "points": [{"lat": 49.28, "lng": -123.12, "elevation": 10},
               {"lat": 49.29, "lng": -123.13, "elevation": 25.5}],
}


@pytest.fixture
def emails():
    addrs = []
    yield addrs
    with get_connection() as conn:
        for a in addrs:
            conn.execute("DELETE FROM users WHERE email = %s", (a,))  # cascades to routes and points


def _login(client, emails):
    addr = f"test-{uuid.uuid4()}@example.com"
    emails.append(addr)
    token = client.post("/api/auth/register", json={"email": addr, "password": "password123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_routes_crud(emails):
    # `with` runs the app lifespan, which opens the DB pool
    with TestClient(app) as client:
        h = _login(client, emails)
        created = client.post("/api/routes", json=ROUTE, headers=h)
        assert created.status_code == 201, created.text
        rid = created.json()["id"]
        assert len(created.json()["points"]) == 2

        got = client.get(f"/api/routes/{rid}", headers=h).json()
        assert got["name"] == "test" and got["points"][1]["elevation"] == 25.5

        patched = client.patch(f"/api/routes/{rid}", json={"name": "renamed", "points": [{"lat": 1, "lng": 2}]}, headers=h)
        assert patched.json()["name"] == "renamed" and len(patched.json()["points"]) == 1

        assert [r["id"] for r in client.get("/api/routes", headers=h).json()] == [rid]

        assert client.delete(f"/api/routes/{rid}", headers=h).status_code == 204
        assert client.get(f"/api/routes/{rid}", headers=h).status_code == 404


def test_routes_require_login_and_are_private(emails):
    with TestClient(app) as client:
        assert client.get("/api/routes").status_code == 401
        assert client.post("/api/routes", json=ROUTE).status_code == 401

        mine, theirs = _login(client, emails), _login(client, emails)
        rid = client.post("/api/routes", json=ROUTE, headers=mine).json()["id"]

        assert client.get(f"/api/routes/{rid}", headers=theirs).status_code == 404
        assert client.patch(f"/api/routes/{rid}", json={"name": "hijacked"}, headers=theirs).status_code == 404
        # points-only update takes a different code path; it must not wipe the owner's points
        assert client.patch(f"/api/routes/{rid}", json={"points": []}, headers=theirs).status_code == 404
        assert client.delete(f"/api/routes/{rid}", headers=theirs).status_code == 404
        assert client.get("/api/routes", headers=theirs).json() == []

        still_mine = client.get(f"/api/routes/{rid}", headers=mine).json()
        assert still_mine["name"] == "test" and len(still_mine["points"]) == 2


def test_route_ignores_user_id_in_body(emails):
    with TestClient(app) as client:
        mine, theirs = _login(client, emails), _login(client, emails)
        their_id = client.post("/api/routes", json=ROUTE, headers=theirs).json()["user_id"]
        # trying to save a route as someone else just saves it as yourself
        created = client.post("/api/routes", json={**ROUTE, "user_id": their_id}, headers=mine).json()
        assert created["user_id"] != their_id
        assert client.get("/api/routes", headers=theirs).json()[0]["id"] != created["id"]


def test_route_generated_fields(emails):
    with TestClient(app) as client:
        h = _login(client, emails)
        base = {"name": "saved", "distance": 3.1}
        created = client.post("/api/routes", json={**base, "difficulty": "hard", "terrain": "hilly", "estimated_minutes": 25}, headers=h)
        assert created.status_code == 201, created.text
        got = client.get(f"/api/routes/{created.json()['id']}", headers=h).json()
        assert (got["difficulty"], got["terrain"], got["estimated_minutes"]) == ("hard", "hilly", 25)

        # all three are optional
        plain = client.post("/api/routes", json=base, headers=h).json()
        assert plain["difficulty"] is None and plain["estimated_minutes"] is None

        assert client.post("/api/routes", json={**base, "difficulty": "extreme"}, headers=h).status_code == 422
        assert client.post("/api/routes", json={**base, "estimated_minutes": -5}, headers=h).status_code == 422
