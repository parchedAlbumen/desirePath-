"""Postal code -> start point. Nominatim (OpenStreetMap) is usually precise for full postal codes;
ORS's geocoder often returns the middle of the city, so it's only the fallback."""
from dataclasses import replace
from functools import lru_cache

import httpx

from app.schemas.generate import GenerateRequest
from app.services import ors

NOMINATIM = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
# Nominatim's usage policy requires an identifying User-Agent (and max 1 req/sec; the cache below helps).
USER_AGENT = "desirePath-stormhacks2026"


def _nominatim(postal_code: str) -> ors.Place | None:
    try:
        r = httpx.get(
            NOMINATIM,
            params={"postalcode": postal_code, "country": "Canada", "format": "json", "limit": 1, "addressdetails": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        r.raise_for_status()
        hits = r.json()
    except httpx.HTTPError:
        return None  # fall back to ORS rather than failing the whole request
    if not hits:
        return None
    name, region = _name_region(hits[0].get("address", {}), postal_code)
    return ors.Place(lat=float(hits[0]["lat"]), lng=float(hits[0]["lon"]), name=name, region=region)


def _name_region(addr: dict, fallback_name: str) -> tuple[str, str]:
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality")
    name = addr.get("suburb") or addr.get("neighbourhood") or city or fallback_name
    return name, ", ".join(filter(None, [city, addr.get("state")])) or "Canada"


@lru_cache(maxsize=256)
def geocode_postal(postal_code: str) -> ors.Place:
    """Raises ors.NotFound / ors.ORSError like the ORS geocoder does. Only successes are cached."""
    found = _nominatim(postal_code)
    if found:
        return found
    # ORS usually only knows the middle of the city, so mark it as a guess for the UI label.
    return replace(ors.geocode_postal(postal_code, postal_layer=True), approximate=True)


def locate(req: GenerateRequest) -> ors.Place:
    """Where the loops should start: the user's coordinates if shared, otherwise the geocoded postal code.
    A GPS place has no name yet; call describe() on it once we know we need one."""
    if req.uses_gps:
        return ors.Place(lat=req.start_lat, lng=req.start_lng, name="", region="")
    return geocode_postal(req.postal_code.strip().upper())


@lru_cache(maxsize=256)
def _reverse_names(lat: float, lng: float) -> tuple[str, str]:
    r = httpx.get(
        NOMINATIM_REVERSE,
        params={"lat": lat, "lon": lng, "format": "json", "zoom": 16, "addressdetails": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=5,
    )
    r.raise_for_status()
    addr = r.json().get("address")
    if not addr:
        raise LookupError("no address here")
    return _name_region(addr, "Your location")


def describe(place: ors.Place) -> ors.Place:
    """Gives a GPS place a neighbourhood name for route titles. Best effort: never fails the request."""
    if place.name:
        return place
    try:
        name, region = _reverse_names(round(place.lat, 3), round(place.lng, 3))  # ~100 m, so nearby users share it
    except (httpx.HTTPError, LookupError, ValueError):
        name, region = "Your location", "Canada"
    return replace(place, name=name, region=region)
