"""Thin client for openrouteservice (geocoding + round-trip walking routes with elevation)."""
from dataclasses import dataclass

import httpx

from app.config import ORS_API_KEY

BASE = "https://api.openrouteservice.org"


class ORSError(Exception):
    """ORS unreachable, rejected the request, or returned something unexpected."""


class NotFound(Exception):
    """Geocoder has no match for the postal code."""


@dataclass
class Place:
    lat: float
    lng: float
    name: str
    region: str


@dataclass
class RawRoute:
    coords: list[tuple[float, float, float]]  # (lat, lng, elevation)
    distance_km: float
    ascent: float
    descent: float


def _headers() -> dict:
    if not ORS_API_KEY:
        raise ORSError("ORS_API_KEY is not set in backend/.env")
    return {"Authorization": ORS_API_KEY}


def geocode_postal(postal_code: str, postal_layer: bool = False) -> Place:
    try:
        r = httpx.get(
            f"{BASE}/geocode/search",
            params={"text": postal_code, "boundary.country": "CA", "size": 1, **({"layers": "postalcode"} if postal_layer else {})},
            headers=_headers(),
            timeout=15,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise ORSError(f"geocoding failed: {e}") from e

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
    try:
        r = httpx.post(f"{BASE}/v2/directions/foot-walking/geojson", json=body, headers=_headers(), timeout=30)
        r.raise_for_status()
        feature = r.json()["features"][0]
        props = feature["properties"]
        coords = [(c[1], c[0], c[2]) for c in feature["geometry"]["coordinates"]]
        return RawRoute(
            coords=coords,
            distance_km=props["summary"]["distance"] / 1000,
            ascent=props.get("ascent", 0),
            descent=props.get("descent", 0),
        )
    except (httpx.HTTPError, KeyError, IndexError) as e:
        raise ORSError(f"route request failed: {e!r}") from e
