"""Request/response for POST /api/routes/generate. JSON is camelCase to match frontend/src/types/route.ts."""
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator
from pydantic.alias_generators import to_camel

from app.services.calories import estimate_kcal_range

POSTAL_RE = re.compile(r"^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$", re.IGNORECASE)

Difficulty = Literal["easy", "medium", "hard"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TargetTime(CamelModel):
    hours: int = Field(default=0, ge=0)
    minutes: int = Field(default=0, ge=0)

    @property
    def total_minutes(self) -> int:
        return self.hours * 60 + self.minutes


class GenerateRequest(CamelModel):
    postal_code: str | None = None  # optional when the user shares their location instead
    start_lat: float | None = Field(default=None, ge=-90, le=90)
    start_lng: float | None = Field(default=None, ge=-180, le=180)
    target_distance_km: float | None = Field(default=None, gt=0)
    target_time: TargetTime | None = None
    min_elevation: float
    avg_elevation: float
    max_elevation: float

    @property
    def uses_gps(self) -> bool:
        return self.start_lat is not None and self.start_lng is not None

    @model_validator(mode="after")
    def _check(self):
        if (self.start_lat is None) != (self.start_lng is None):
            raise ValueError("startLat and startLng must be given together")
        # Coordinates win over the postal code, so a sloppy postal code can't break a GPS request.
        if not self.uses_gps:
            if not self.postal_code:
                raise ValueError("provide postalCode, or startLat and startLng")
            if not POSTAL_RE.match(self.postal_code.strip()):
                raise ValueError("postalCode must be a valid Canadian postal code, e.g. V5A 1S6")
        if not self.min_elevation <= self.avg_elevation <= self.max_elevation:
            raise ValueError("elevations must satisfy minElevation <= avgElevation <= maxElevation")
        if not self.target_distance_km and not (self.target_time and self.target_time.total_minutes > 0):
            raise ValueError("provide targetDistanceKm or a non-zero targetTime")
        return self


class LatLng(CamelModel):
    lat: float
    lng: float


class RoutePoint(LatLng):
    elevation: float


class RouteArea(CamelModel):
    name: str
    region: str
    start_label: str
    start: LatLng


class CalorieRange(CamelModel):
    """Estimated kcal for a lighter (min) and heavier (max) runner; see app/services/calories.py."""
    min: int
    max: int

    @classmethod
    def estimate(cls, distance_km: float, elevation_gain_m: float) -> "CalorieRange":
        low, high = estimate_kcal_range(distance_km, elevation_gain_m)
        return cls(min=low, max=high)


class GeneratedRoute(CamelModel):
    id: str
    name: str
    difficulty: Difficulty
    terrain: str
    distance_km: float
    elevation_gain: int
    min_elevation: int
    avg_elevation: int
    max_elevation: int
    estimated_minutes: int
    points: list[RoutePoint]

    @computed_field
    @property
    def estimated_calories(self) -> CalorieRange:
        return CalorieRange.estimate(self.distance_km, self.elevation_gain)


class RouteResponse(CamelModel):
    area: RouteArea
    routes: list[GeneratedRoute]
