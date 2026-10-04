import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import DATABASE_URL
from app.db import get_connection
from app.main import app

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")


@pytest.fixture
def user_id():
    """Creates a throwaway user; deleting it cascades to its routes and points."""
    with get_connection() as conn:
        uid = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, 'x') RETURNING id",
            (f"test-{uuid.uuid4()}@example.com",),
        ).fetchone()[0]
    yield uid
    with get_connection() as conn:
        conn.execute("DELETE FROM users WHERE id = %s", (uid,))


def test_routes_crud(user_id):
    # `with` runs the app lifespan, which opens the DB pool
    with TestClient(app) as client:
        created = client.post("/api/routes", json={
            "user_id": user_id, "name": "test", "distance": 5.2,
            "elevation_gain": 120, "elevation_loss": 100,
            "points": [{"lat": 49.28, "lng": -123.12, "elevation": 10},
                       {"lat": 49.29, "lng": -123.13, "elevation": 25.5}],
        })
        assert created.status_code == 201, created.text
        rid = created.json()["id"]
        assert len(created.json()["points"]) == 2

        got = client.get(f"/api/routes/{rid}").json()
        assert got["name"] == "test" and got["points"][1]["elevation"] == 25.5

        patched = client.patch(f"/api/routes/{rid}", json={"name": "renamed", "points": [{"lat": 1, "lng": 2}]})
        assert patched.json()["name"] == "renamed" and len(patched.json()["points"]) == 1

        assert any(r["id"] == rid for r in client.get(f"/api/routes?user_id={user_id}").json())

        assert client.delete(f"/api/routes/{rid}").status_code == 204
        assert client.get(f"/api/routes/{rid}").status_code == 404


def test_create_route_unknown_user():
    with TestClient(app) as client:
        r = client.post("/api/routes", json={"user_id": -1, "name": "x", "distance": 1})
        assert r.status_code == 400


def test_route_generated_fields(user_id):
    with TestClient(app) as client:
        base = {"user_id": user_id, "name": "saved", "distance": 3.1}
        created = client.post("/api/routes", json={**base, "difficulty": "hard", "terrain": "hilly", "estimated_minutes": 25})
        assert created.status_code == 201, created.text
        got = client.get(f"/api/routes/{created.json()['id']}").json()
        assert (got["difficulty"], got["terrain"], got["estimated_minutes"]) == ("hard", "hilly", 25)

        # all three are optional
        plain = client.post("/api/routes", json=base).json()
        assert plain["difficulty"] is None and plain["estimated_minutes"] is None

        assert client.post("/api/routes", json={**base, "difficulty": "extreme"}).status_code == 422
        assert client.post("/api/routes", json={**base, "estimated_minutes": -5}).status_code == 422
