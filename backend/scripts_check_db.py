"""Run `python scripts_check_db.py` from backend/ to verify the DB connection."""
from app.db import get_connection

with get_connection() as conn:
    print(conn.execute("SELECT version()").fetchone()[0])
