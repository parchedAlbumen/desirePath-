"""In-memory cache for /generate responses. Lost on restart and not shared between workers (fine for one server)."""
import threading
import time
from collections import OrderedDict
from math import cos, radians

from app import config
from app.schemas.generate import GenerateRequest, RouteResponse
from app.services import ors
from app.services.route_generator import id_prefix, start_label

METRES_PER_DEG_LAT = 111_320


class TTLCache:
    """Least-recently-used cache whose entries expire `ttl` seconds after being stored."""

    def __init__(self, maxsize: int, ttl: float, clock=time.monotonic):
        self.maxsize, self.ttl, self._clock = maxsize, ttl, clock
        self._data: OrderedDict = OrderedDict()  # key -> (expires_at, value)
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= self._clock():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key, value) -> None:
        with self._lock:
            self._data[key] = (self._clock() + self.ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


def make_key(place: ors.Place, req: GenerateRequest, cell_m: float = config.ROUTE_CACHE_CELL_M) -> tuple:
    """Same grid square + same settings -> same key. Longitude cells shrink with latitude, so scale them."""
    lat_step = cell_m / METRES_PER_DEG_LAT
    lng_step = lat_step / max(cos(radians(place.lat)), 0.01)
    time_min = req.target_time.total_minutes if req.target_time else 0
    return (
        round(place.lat / lat_step),
        round(place.lng / lng_step),
        round(req.target_distance_km, 1) if req.target_distance_km else None,
        time_min,
        req.min_elevation,
        req.avg_elevation,
        req.max_elevation,
    )


def relabel(response: RouteResponse, req: GenerateRequest, place: ors.Place) -> RouteResponse:
    """A copy of a cached response, relabelled for whoever is asking. The route geometry (and area.start)
    stay those of the first person who searched, up to one grid square away."""
    out = response.model_copy(deep=True)
    out.area.start_label = start_label(req, place)
    for route in out.routes:
        route.id = f"{id_prefix(req)}-{route.difficulty}"
    return out


route_cache = TTLCache(config.ROUTE_CACHE_MAX_ENTRIES, config.ROUTE_CACHE_TTL_S)
