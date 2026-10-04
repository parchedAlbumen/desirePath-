from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb

from app.auth import get_current_user_id
from app.db import get_db
from app.schemas.run import Run, RunCreate, RunStats, RunUpdate

router = APIRouter(prefix="/api/runs", tags=["runs"])

# Every endpoint is scoped to the logged-in user; someone else's run looks like a 404.
# All runs are kept (stats need the full history); the frontend decides how many to show.
_COLUMNS = (
    "id, route_id, route_name, started_at, duration_sec, distance_km, "
    "elevation_gain, points, planned_route, is_favorite"
)


# Shorter runs are left out of pace stats: a GPS blip (50 m in 5 s) would otherwise be a "record" pace.
MIN_PACE_KM = 0.5


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


# Declared before /{run_id}, or "stats" would be read as a run id
@router.get("/stats", response_model=RunStats, response_model_by_alias=True)
def run_stats(user_id: int = Depends(get_current_user_id), conn=Depends(get_db)):
    """Totals and records over all my runs, plus the last 7 days. Zeros (and null paces) if I have no runs."""
    paced = "distance_km >= %(min_km)s AND duration_sec > 0"
    week = "started_at >= now() - interval '7 days'"
    row = conn.execute(
        f"""SELECT count(*) AS run_count,
                   coalesce(sum(distance_km), 0) AS total_distance_km,
                   coalesce(sum(duration_sec), 0) AS total_duration_sec,
                   coalesce(sum(elevation_gain), 0) AS total_elevation_gain,
                   coalesce(max(distance_km), 0) AS longest_run_km,
                   coalesce(max(elevation_gain), 0) AS biggest_climb,
                   -- total time / total distance, so a long run counts more than a short one
                   sum(duration_sec) FILTER (WHERE {paced}) / sum(distance_km) FILTER (WHERE {paced})
                       AS avg_pace_sec_per_km,
                   min(duration_sec / distance_km) FILTER (WHERE {paced}) AS fastest_pace_sec_per_km,
                   count(*) FILTER (WHERE {week}) AS week_run_count,
                   coalesce(sum(distance_km) FILTER (WHERE {week}), 0) AS week_distance_km
            FROM runs WHERE user_id = %(user_id)s""",
        {"user_id": user_id, "min_km": MIN_PACE_KM},
    ).fetchone()
    week_runs, week_km = row.pop("week_run_count"), row.pop("week_distance_km")
    return {**row, "this_week": {"run_count": week_runs, "distance_km": week_km}}


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
    return run


@router.patch("/{run_id}", response_model=Run, response_model_by_alias=True)
def update_run(
    run_id: int, body: RunUpdate, user_id: int = Depends(get_current_user_id), conn=Depends(get_db)
):
    """Only isFavorite can change; the recorded run itself is immutable."""
    if body.is_favorite is None:
        raise HTTPException(400, "No fields to update")
    run = conn.execute(
        f"UPDATE runs SET is_favorite = %s WHERE id = %s AND user_id = %s RETURNING {_COLUMNS}",
        (body.is_favorite, run_id, user_id),
    ).fetchone()
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: int, user_id: int = Depends(get_current_user_id), conn=Depends(get_db)):
    if conn.execute("DELETE FROM runs WHERE id = %s AND user_id = %s", (run_id, user_id)).rowcount == 0:
        raise HTTPException(404, "Run not found")
