"""Thin client for openrouteservice (geocoding + round-trip walking routes with elevation)."""
import logging
import time
from dataclasses import dataclass

import httpx

from app.config import ORS_API_KEY

BASE = "https://api.openrouteservice.org"
RETRY_DELAY_S = 0.5

log = logging.getLogger(__name__)


class ORSError(Exception):
    """ORS unreachable, rejected the request, or returned something unexpected (-> 502)."""


class ORSConfigError(ORSError):
    """Our API key is missing or ORS rejected it (-> 503)."""


class ORSRateLimited(ORSError):
    """ORS quota or per-minute limit hit (-> 429)."""

    def __init__(self, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class NoRoutablePath(ORSError):
    """ORS found no walkable path near the start point (-> 422)."""


class ORSTimeout(ORSError):
    """ORS took too long to answer (-> 504)."""


class NotFound(Exception):
    """Geocoder has no match for the postal code."""


@dataclass
class Place:
    lat: float
    lng: float
    name: str
    region: str
    approximate: bool = False  # True when the point is a guess (e.g. the middle of the city), not the exact address


@dataclass
class RawRoute:
    coords: list[tuple[float, float, float]]  # (lat, lng, elevation)
    distance_km: float
    ascent: float
    descent: float


def _headers() -> dict:
    if not ORS_API_KEY:
        raise ORSConfigError("ORS_API_KEY is not set in backend/.env")
    return {"Authorization": ORS_API_KEY}


def _translate(e: httpx.HTTPError) -> ORSError:
    """Turns an httpx failure into the matching ORSError subclass."""
    if isinstance(e, httpx.TimeoutException):
        return ORSTimeout("openrouteservice timed out")
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        if code == 429:
            retry_after = e.response.headers.get("Retry-After", "")
            return ORSRateLimited("openrouteservice rate limit reached", int(retry_after) if retry_after.isdigit() else None)
        if code == 404:  # ORS error 2010: "Could not find routable point" near the start
            return NoRoutablePath("no walkable path near the start point")
        if code == 403 and "quota" in e.response.text.lower():  # ORS answers an exhausted quota with 403, not 429
            return ORSRateLimited("openrouteservice quota exceeded")
        if code in (401, 403):
            return ORSConfigError("openrouteservice rejected the API key")
        return ORSError(f"openrouteservice returned HTTP {code}")
    return ORSError("couldn't reach openrouteservice")


def _send(method: str, path: str, retries: int = 1, **kwargs) -> httpx.Response:
    """One ORS request. Retries timeouts, connection errors and 5xx once; never retries 429/4xx."""
    for attempt in range(retries + 1):
        try:
            r = httpx.request(method, f"{BASE}{path}", headers=_headers(), **kwargs)
            r.raise_for_status()
            return r
        except httpx.HTTPError as e:
            err = _translate(e)
            transient = isinstance(e, httpx.TransportError) or (
                isinstance(e, httpx.HTTPStatusError) and e.response.status_code >= 500
            )
            log.warning("ORS %s %s failed (attempt %d): %r", method, path, attempt + 1, e)
            if transient and attempt < retries:
                time.sleep(RETRY_DELAY_S)
                continue
            raise err from e


def geocode_postal(postal_code: str, postal_layer: bool = False) -> Place:
    r = _send(
        "GET",
        "/geocode/search",
        params={"text": postal_code, "boundary.country": "CA", "size": 1, **({"layers": "postalcode"} if postal_layer else {})},
        timeout=15,
    )
    features = r.json().get("features", [])
    if not features:
        raise NotFound(postal_code)
    props = features[0]["properties"]
    lng, lat = features[0]["geometry"]["coordinates"][:2]
    name = props.get("neighbourhood") or props.get("locality") or props.get("name") or postal_code
    region = ", ".join(filter(None, [props.get("locality"), props.get("region_a") or props.get("region")]))
    return Place(lat=lat, lng=lng, name=name, region=region or "Canada")


def round_trip(lat: float, lng: float, length_km: float, seed: int, points: int = 3) -> RawRoute:
    """One loop starting and ending at (lat, lng). Different seeds give different loops."""
    body = {
        "coordinates": [[lng, lat]],
        "elevation": True,
        "options": {"round_trip": {"length": int(length_km * 1000), "points": points, "seed": seed}},
    }
    r = _send("POST", "/v2/directions/foot-walking/geojson", json=body, timeout=30)
    try:
        feature = r.json()["features"][0]
        props = feature["properties"]
        coords = [(c[1], c[0], c[2]) for c in feature["geometry"]["coordinates"]]
        return RawRoute(
            coords=coords,
            distance_km=props["summary"]["distance"] / 1000,
            ascent=props.get("ascent", 0),
            descent=props.get("descent", 0),
        )
    except (ValueError, KeyError, IndexError) as e:
        raise ORSError("openrouteservice returned an unexpected response") from e
