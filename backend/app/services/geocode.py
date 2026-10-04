"""Postal code -> start point. Nominatim (OpenStreetMap) is usually precise for full postal codes;
ORS's geocoder often returns the middle of the city, so it's only the fallback."""
from functools import lru_cache

import httpx

from app.services import ors

NOMINATIM = "https://nominatim.openstreetmap.org/search"
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
    hit, addr = hits[0], hits[0].get("address", {})
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality")
    name = addr.get("suburb") or addr.get("neighbourhood") or city or postal_code
    region = ", ".join(filter(None, [city, addr.get("state")]))
    return ors.Place(lat=float(hit["lat"]), lng=float(hit["lon"]), name=name, region=region or "Canada")


@lru_cache(maxsize=256)
def geocode_postal(postal_code: str) -> ors.Place:
    """Raises ors.NotFound / ors.ORSError like the ORS geocoder does. Only successes are cached."""
    return _nominatim(postal_code) or ors.geocode_postal(postal_code, postal_layer=True)
