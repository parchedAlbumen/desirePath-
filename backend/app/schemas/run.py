from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
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
