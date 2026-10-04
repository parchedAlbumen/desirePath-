from fastapi import APIRouter, Depends, HTTPException
from psycopg import errors

from app.db import get_db
from app.schemas.route import Route, RouteCreate, RouteSummary, RouteUpdate

router = APIRouter(prefix="/api/routes", tags=["routes"])


def _fetch_points(conn, route_id: int):
    return conn.execute(
        "SELECT lat, lng, elevation FROM route_points WHERE route_id = %s ORDER BY point_order",
        (route_id,),
    ).fetchall()


def _insert_points(conn, route_id: int, points):
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO route_points (route_id, point_order, lat, lng, elevation) VALUES (%s, %s, %s, %s, %s)",
            [(route_id, i, p.lat, p.lng, p.elevation) for i, p in enumerate(points)],
        )


@router.get("", response_model=list[RouteSummary])
def list_routes(user_id: int | None = None, conn=Depends(get_db)):
    """All routes (without points). Optionally filter with ?user_id=."""
    if user_id is None:
        return conn.execute("SELECT * FROM routes ORDER BY created_at DESC").fetchall()
    return conn.execute(
        "SELECT * FROM routes WHERE user_id = %s ORDER BY created_at DESC", (user_id,)
    ).fetchall()


@router.get("/{route_id}", response_model=Route)
def get_route(route_id: int, conn=Depends(get_db)):
    route = conn.execute("SELECT * FROM routes WHERE id = %s", (route_id,)).fetchone()
    if not route:
        raise HTTPException(404, "Route not found")
    route["points"] = _fetch_points(conn, route_id)
    return route


@router.post("", response_model=Route, status_code=201)
def create_route(body: RouteCreate, conn=Depends(get_db)):
    try:
        route = conn.execute(
            """INSERT INTO routes (user_id, name, distance, elevation_gain, elevation_loss,
                                   difficulty, terrain, estimated_minutes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (body.user_id, body.name, body.distance, body.elevation_gain, body.elevation_loss,
             body.difficulty, body.terrain, body.estimated_minutes),
        ).fetchone()
    except errors.ForeignKeyViolation:
        raise HTTPException(400, f"User {body.user_id} does not exist")
    _insert_points(conn, route["id"], body.points)
    route["points"] = _fetch_points(conn, route["id"])
    return route


@router.patch("/{route_id}", response_model=Route)
def update_route(route_id: int, body: RouteUpdate, conn=Depends(get_db)):
    fields = body.model_dump(exclude_unset=True, exclude={"points"})
    if not fields and body.points is None:
        raise HTTPException(400, "No fields to update")

    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)  # keys come from the schema, not user input
        route = conn.execute(
            f"UPDATE routes SET {sets} WHERE id = %s RETURNING *", (*fields.values(), route_id)
        ).fetchone()
    else:
        route = conn.execute("SELECT * FROM routes WHERE id = %s", (route_id,)).fetchone()
    if not route:
        raise HTTPException(404, "Route not found")

    if body.points is not None:
        conn.execute("DELETE FROM route_points WHERE route_id = %s", (route_id,))
        _insert_points(conn, route_id, body.points)

    route["points"] = _fetch_points(conn, route_id)
    return route


@router.delete("/{route_id}", status_code=204)
def delete_route(route_id: int, conn=Depends(get_db)):
    """Also deletes the route's points (ON DELETE CASCADE)."""
    if conn.execute("DELETE FROM routes WHERE id = %s", (route_id,)).rowcount == 0:
        raise HTTPException(404, "Route not found")
