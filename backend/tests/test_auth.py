import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import DATABASE_URL
from app.db import get_connection
from app.main import app

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

PASSWORD = "password123"


@pytest.fixture
def email():
    """A fresh email; whatever user gets made with it is deleted afterwards."""
    addr = f"test-{uuid.uuid4()}@example.com"
    yield addr
    with get_connection() as conn:
        conn.execute("DELETE FROM users WHERE email = %s", (addr,))


def test_register_then_login(email):
    with TestClient(app) as client:
        reg = client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
        assert reg.status_code == 201, reg.text
        assert reg.json()["user"]["email"] == email
        assert "password_hash" not in reg.json()["user"]

        # emails are case-insensitive, both for duplicates and for logging in
        assert client.post("/api/auth/register", json={"email": email.upper(), "password": PASSWORD}).status_code == 409
        login = client.post("/api/auth/login", json={"email": email.upper(), "password": PASSWORD})
        assert login.status_code == 200, login.text
        assert login.json()["user"] == reg.json()["user"]


def test_password_is_hashed(email):
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    with get_connection() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE email = %s", (email,)).fetchone()[0]
    assert stored != PASSWORD and stored.startswith("$2b$")


def test_bad_login(email):
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
        wrong_pw = client.post("/api/auth/login", json={"email": email, "password": "nope12345"})
        no_user = client.post("/api/auth/login", json={"email": f"x{email}", "password": PASSWORD})
        assert wrong_pw.status_code == no_user.status_code == 401
        assert wrong_pw.json() == no_user.json()  # can't tell which one was wrong


def test_register_validation():
    with TestClient(app) as client:
        assert client.post("/api/auth/register", json={"email": "a@b.com", "password": "short"}).status_code == 422


def test_delete_account(email):
    with TestClient(app) as client:
        token = client.post("/api/auth/register", json={"email": email, "password": PASSWORD}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        assert client.delete("/api/auth/me", headers=h).status_code == 204
        assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401
        assert client.delete("/api/auth/me", headers=h).status_code == 404  # already gone


def test_delete_account_needs_valid_token():
    with TestClient(app) as client:
        assert client.delete("/api/auth/me").status_code == 401
        assert client.delete("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_change_password(email):
    new = "brandnewpass1"
    with TestClient(app) as client:
        token = client.post("/api/auth/register", json={"email": email, "password": PASSWORD}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        assert client.patch("/api/auth/password", json={"current_password": PASSWORD, "new_password": new}, headers=h).status_code == 204
        assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401  # old one is dead
        assert client.post("/api/auth/login", json={"email": email, "password": new}).status_code == 200
        with get_connection() as conn:  # stored hashed, like at sign-up
            stored = conn.execute("SELECT password_hash FROM users WHERE email = %s", (email,)).fetchone()[0]
        assert stored != new and stored.startswith("$2b$")


def test_change_password_rejects_bad_requests(email):
    with TestClient(app) as client:
        token = client.post("/api/auth/register", json={"email": email, "password": PASSWORD}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        wrong = client.patch("/api/auth/password", json={"current_password": "nope12345", "new_password": "brandnewpass1"}, headers=h)
        assert wrong.status_code == 400 and "Current password is wrong" in wrong.text
        short = client.patch("/api/auth/password", json={"current_password": PASSWORD, "new_password": "short"}, headers=h)
        assert short.status_code == 422
        assert client.patch("/api/auth/password", json={"current_password": PASSWORD}, headers=h).status_code == 422
        # nothing changed: the original password still works
        assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200


def test_change_password_needs_valid_token():
    body = {"current_password": PASSWORD, "new_password": "brandnewpass1"}
    with TestClient(app) as client:
        assert client.patch("/api/auth/password", json=body).status_code == 401
        assert client.patch("/api/auth/password", json=body, headers={"Authorization": "Bearer garbage"}).status_code == 401
