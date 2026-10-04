from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb

from app.auth import get_current_user_id
from app.db import get_db
from app.schemas.run import Run, RunCreate, RunUpdate

router = APIRouter(prefix="/api/runs", tags=["runs"])

# Each user keeps their newest runs plus any favorites; older non-favorite runs are deleted on save.
MAX_RECENT_RUNS = 2

# Every endpoint is scoped to the logged-in user; someone else's run looks like a 404.
_COLUMNS = (
    "id, route_id, route_name, started_at, duration_sec, distance_km, "
    "elevation_gain, points, planned_route, is_favorite"
)


def _prune_old_runs(conn, user_id: int):
    """Deletes the user's non-favorite runs beyond the newest MAX_RECENT_RUNS. Favorites are never deleted."""
    conn.execute(
        """DELETE FROM runs
           WHERE user_id = %s AND NOT is_favorite AND id NOT IN (
               SELECT id FROM runs WHERE user_id = %s AND NOT is_favorite
               ORDER BY started_at DESC, id DESC LIMIT %s)""",
        (user_id, user_id, MAX_RECENT_RUNS),
    )


@router.get("", response_model=list[Run], response_model_by_alias=True)
def list_runs(
    favorite: bool | None = None,
    limit: int = 50,
    user_id: int = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    """My runs, newest first. ?favorite=true for favorites only; ?limit= caps the count (max 200)."""
    limit = max(1, min(limit, 200))
    where, params = "user_id = %s", [user_id]
    if favorite is not None:
        where += " AND is_favorite = %s"
        params.append(favorite)
    return conn.execute(
        f"SELECT {_COLUMNS} FROM runs WHERE {where} ORDER BY started_at DESC LIMIT %s",
        (*params, limit),
    ).fetchall()


@router.get("/{run_id}", response_model=Run, response_model_by_alias=True)
def get_run(run_id: int, user_id: int = Depends(get_current_user_id), conn=Depends(get_db)):
    run = conn.execute(
        f"SELECT {_COLUMNS} FROM runs WHERE id = %s AND user_id = %s", (run_id, user_id)
    ).fetchone()
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.post("", response_model=Run, response_model_by_alias=True, status_code=201)
def create_run(body: RunCreate, user_id: int = Depends(get_current_user_id), conn=Depends(get_db)):
    run = conn.execute(
        f"""INSERT INTO runs (user_id, route_id, route_name, started_at, duration_sec,
                              distance_km, elevation_gain, points, planned_route, is_favorite)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {_COLUMNS}""",
        (
            user_id, body.route_id, body.route_name, body.started_at, body.duration_sec,
            body.distance_km, body.elevation_gain,
            Jsonb([p.model_dump() for p in body.points]),
            Jsonb(body.planned_route) if body.planned_route is not None else None,
            body.is_favorite,
        ),
    ).fetchone()
    _prune_old_runs(conn, user_id)
    return run


@router.patch("/{run_id}", response_model=Run, response_model_by_alias=True)
def update_run(
    run_id: int, body: RunUpdate, user_id: int = Depends(get_current_user_id), conn=Depends(get_db)
):
    """Only isFavorite can change; the recorded run itself is immutable. Un-starring may delete an old run."""
    if body.is_favorite is None:
        raise HTTPException(400, "No fields to update")
    run = conn.execute(
        f"UPDATE runs SET is_favorite = %s WHERE id = %s AND user_id = %s RETURNING {_COLUMNS}",
        (body.is_favorite, run_id, user_id),
    ).fetchone()
    if not run:
        raise HTTPException(404, "Run not found")
    _prune_old_runs(conn, user_id)  # un-starring an old run can push it out of the recent runs
    return run


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: int, user_id: int = Depends(get_current_user_id), conn=Depends(get_db)):
    if conn.execute("DELETE FROM runs WHERE id = %s AND user_id = %s", (run_id, user_id)).rowcount == 0:
        raise HTTPException(404, "Run not found")
