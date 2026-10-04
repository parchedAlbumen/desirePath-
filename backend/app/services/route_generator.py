"""Turns a GenerateRequest into up to three routes (easy / medium / hard)."""
from concurrent.futures import ThreadPoolExecutor
from math import ceil

from app.schemas.generate import (
    Difficulty,
    GenerateRequest,
    GeneratedRoute,
    LatLng,
    RouteArea,
    RoutePoint,
    RouteResponse,
)
from app.services import geocode, ors

PACE_MIN_PER_KM = 5.8  # same pace model as frontend/src/services/mockRoutes.ts
MIN_PER_METRE_GAIN = 1 / 100
N_CANDIDATES = 6
CALIBRATION_LOOPS = 3
MAX_POINTS = 120  # enough for the elevation chart without a huge payload

LABELS: dict[Difficulty, tuple[str, str]] = {  # (route name suffix, terrain blurb)
    "easy": ("Easy Loop", "Gentle paths"),
    "medium": ("Steady Loop", "Rolling paths"),
    "hard": ("Hill Loop", "Hilly paths"),
}


def _downsample(coords, max_points=MAX_POINTS):
    step = max(1, ceil(len(coords) / max_points))
    out = coords[::step]
    if out[-1] != coords[-1]:
        out.append(coords[-1])
    return out


def _estimated_minutes(km: float, gain: float) -> int:
    return round(km * PACE_MIN_PER_KM + gain * MIN_PER_METRE_GAIN)


def target_length_km(req: GenerateRequest) -> float:
    if req.target_distance_km:
        return req.target_distance_km
    return max(0.5, req.target_time.total_minutes / PACE_MIN_PER_KM)


def _score(route: ors.RawRoute, req: GenerateRequest, target_km: float) -> float:
    """Lower is better: how badly a loop misses the requested elevation window, average and length."""
    eles = [c[2] for c in route.coords]
    span = max(req.max_elevation - req.min_elevation, 1)
    outside = sum(1 for e in eles if e < req.min_elevation or e > req.max_elevation) / len(eles)
    avg_err = abs(sum(eles) / len(eles) - req.avg_elevation) / span
    length_err = abs(route.distance_km - target_km) / target_km
    overshoot = 0.0
    if req.target_time and req.target_time.total_minutes > 0:
        mins = _estimated_minutes(route.distance_km, route.ascent)
        overshoot = max(0, mins - req.target_time.total_minutes) / req.target_time.total_minutes
    return 2 * outside + avg_err + length_err + overshoot


def pick(candidates: list[ors.RawRoute], req: GenerateRequest) -> list[tuple[Difficulty, ors.RawRoute]]:
    """Keep the best-fitting distinct loops, then label them easy/medium/hard by climb per km."""
    target = target_length_km(req)
    seen, viable = set(), []
    for c in sorted(candidates, key=lambda c: _score(c, req, target)):
        key = (round(c.distance_km, 1), round(c.ascent))
        if key not in seen:
            seen.add(key)
            viable.append(c)
    viable = sorted(viable[:N_CANDIDATES], key=lambda c: c.ascent / c.distance_km)

    n = len(viable)
    if n == 0:
        return []
    if n == 1:
        return [("medium", viable[0])]
    if n == 2:
        return [("easy", viable[0]), ("hard", viable[1])]
    return [("easy", viable[0]), ("medium", viable[n // 2]), ("hard", viable[-1])]


def _fetch_loops(place, km: float, seeds: range) -> list[ors.RawRoute]:
    """Requests one loop per seed in parallel; skips failures, raises only if all fail."""
    with ThreadPoolExecutor(max_workers=len(seeds)) as pool:
        futures = [pool.submit(ors.round_trip, place.lat, place.lng, km, s, 3 + s % 2) for s in seeds]
        loops, errors = [], []
        for f in futures:
            try:
                loops.append(f.result())
            except ors.ORSError as e:
                errors.append(e)
    if not loops:
        # Most actionable error first: a bad key or quota problem explains more than a generic failure.
        for kind in (ors.ORSConfigError, ors.ORSRateLimited, ors.NoRoutablePath, ors.ORSTimeout):
            for e in errors:
                if isinstance(e, kind):
                    raise e
        raise errors[0] if errors else ors.ORSError("no routes returned")
    return loops


def start_label(req: GenerateRequest, place: ors.Place) -> str:
    """Honest about where the loops start: a guessed point is labelled by area, not by the postal code."""
    if req.uses_gps:
        return "Your location"
    if place.approximate:
        return f"Near {place.name}"
    return f"Near {req.postal_code.strip().upper()}"


def id_prefix(req: GenerateRequest) -> str:
    return "gps" if req.uses_gps else req.postal_code.replace(" ", "").upper()


def generate(req: GenerateRequest, place: ors.Place | None = None) -> RouteResponse:
    place = geocode.describe(place or geocode.locate(req))
    target = target_length_km(req)

    # ORS treats the requested length as a rough guide (real loops often come out 15-45% long).
    # Calibrate with a few loops, then re-request at a corrected length and choose from everything.
    probe = _fetch_loops(place, target, range(1, CALIBRATION_LOOPS + 1))
    actual = sorted(c.distance_km for c in probe)[len(probe) // 2]  # median
    corrected = target * min(max(target / actual, 0.4), 1.5)
    candidates = probe + _fetch_loops(place, corrected, range(CALIBRATION_LOOPS + 1, CALIBRATION_LOOPS + 1 + N_CANDIDATES))

    code = id_prefix(req)
    routes = []
    for difficulty, c in pick(candidates, req):
        pts = _downsample(c.coords)
        eles = [p[2] for p in c.coords]
        suffix, terrain = LABELS[difficulty]
        routes.append(
            GeneratedRoute(
                id=f"{code}-{difficulty}",
                name=f"{place.name} {suffix}",
                difficulty=difficulty,
                terrain=terrain,
                distance_km=round(c.distance_km, 1),
                elevation_gain=round(c.ascent),
                min_elevation=round(min(eles)),
                avg_elevation=round(sum(eles) / len(eles)),
                max_elevation=round(max(eles)),
                estimated_minutes=_estimated_minutes(c.distance_km, c.ascent),
                points=[RoutePoint(lat=p[0], lng=p[1], elevation=round(p[2], 1)) for p in pts],
            )
        )

    return RouteResponse(
        area=RouteArea(
            name=place.name,
            region=place.region,
            start_label=start_label(req, place),
            start=LatLng(lat=place.lat, lng=place.lng),
        ),
        routes=routes,
    )
