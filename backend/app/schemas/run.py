from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """JSON uses camelCase to match the frontend's RunRecord; Python uses snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RunPoint(BaseModel):
    lat: float
    lng: float


class RunCreate(_CamelModel):
    route_id: str | None = None  # the generated route's id (a string, not a routes.id)
    route_name: str = Field(min_length=1)
    started_at: datetime
    duration_sec: int = Field(ge=0)
    distance_km: float = Field(ge=0)
    elevation_gain: int = Field(default=0, ge=0)
    points: list[RunPoint] = []
    planned_route: dict | None = None  # the GeneratedRoute JSON, stored as-is
    is_favorite: bool = False


class RunUpdate(_CamelModel):
    is_favorite: bool | None = None


class Run(RunCreate):
    id: int


class WeekStats(_CamelModel):
    run_count: int
    distance_km: float

    @field_validator("distance_km", mode="before")
    @classmethod
    def _two_decimals(cls, v):
        return round(float(v), 2)


class RunStats(_CamelModel):
    run_count: int
    total_distance_km: float
    total_duration_sec: int
    total_elevation_gain: int
    avg_pace_sec_per_km: int | None  # seconds per km; null until there's a run long enough to time
    longest_run_km: float
    fastest_pace_sec_per_km: int | None
    biggest_climb: int
    this_week: WeekStats  # the last 7 days, not since Monday

    @field_validator("avg_pace_sec_per_km", "fastest_pace_sec_per_km", mode="before")
    @classmethod
    def _whole_seconds(cls, v):
        return None if v is None else round(v)

    @field_validator("total_distance_km", "longest_run_km", mode="before")
    @classmethod
    def _two_decimals(cls, v):
        return round(float(v), 2)
