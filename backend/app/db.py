from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import DATABASE_URL

_pool: ConnectionPool | None = None


def get_connection():
    """One-off connection (used by scripts and tests)."""
    import psycopg

    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    return psycopg.connect(DATABASE_URL)


def open_pool():
    global _pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    _pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=True)


def close_pool():
    if _pool:
        _pool.close()


def get_db():
    """FastAPI dependency: yields a connection from the pool, commits on success."""
    with _pool.connection() as conn:
        yield conn
