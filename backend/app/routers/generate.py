from fastapi import APIRouter, Depends, Request

from app.auth import get_optional_user_id

from app.cache import make_key, relabel, route_cache
from app.ratelimit import client_ip, generate_limiter
from app.schemas.generate import GenerateRequest, RouteResponse
from app.services import geocode
from app.services.route_generator import generate

router = APIRouter(prefix="/api/routes", tags=["generate"])


@router.post("/generate", response_model=RouteResponse)
def generate_routes(body: GenerateRequest, request: Request, user_id: int | None = Depends(get_optional_user_id)):
    """Generates (does not save) up to three loop routes near a postal code, or near startLat/startLng
    if the user shared their location (those win over the postal code). No DB needed.

    Errors (see app/errors.py): 404 unknown postal code, 429 ORS busy, 502/504 ORS failed or slow, 503 key problem,
    429 if the caller (or the whole app) is generating too fast.

    Nearby postal codes with the same settings share cached routes for an hour (see app/cache.py).
    Login is optional: logged-in callers are rate limited per account (with higher limits), others per IP."""
    ip = client_ip(request)
    generate_limiter.check_lookup(ip)
    place = geocode.locate(body)  # postal code lookups are cached; 404 if unknown. GPS needs no lookup.

    key = make_key(place, body)
    cached = route_cache.get(key)
    if cached:
        return relabel(cached, body, place)  # free: doesn't count against the ORS limits

    generate_limiter.check(ip, user_id=user_id)  # only requests that will actually hit ORS are counted
    response = generate(body, place)
    route_cache.set(key, response)
    return response
