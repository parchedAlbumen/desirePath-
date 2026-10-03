import pytest

from app.config import DATABASE_URL
from app.db import get_connection

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set in backend/.env")


def test_database_connection():
    with get_connection() as conn:
        assert conn.execute("SELECT 1").fetchone()[0] == 1


def test_read_write_roundtrip():
    """Uses a TEMP table, so nothing is left in the database."""
    with get_connection() as conn:
        conn.execute("CREATE TEMP TABLE _conn_test (msg text)")
        conn.execute("INSERT INTO _conn_test VALUES ('hello')")
        assert conn.execute("SELECT msg FROM _conn_test").fetchone()[0] == "hello"
