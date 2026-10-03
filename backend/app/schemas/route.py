from datetime import datetime

from pydantic import BaseModel, Field


class RoutePoint(BaseModel):
    lat: float
    lng: float
    elevation: float | None = None


class RouteBase(BaseModel):
    name: str = Field(min_length=1)
    distance: float = Field(gt=0)
    elevation_gain: int = Field(default=0, ge=0)
    elevation_loss: int = Field(default=0, ge=0)


class RouteCreate(RouteBase):
    user_id: int  # TODO: take from the logged-in user once auth exists
    points: list[RoutePoint] = []  # in order along the route


class RouteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    distance: float | None = Field(default=None, gt=0)
    elevation_gain: int | None = Field(default=None, ge=0)
    elevation_loss: int | None = Field(default=None, ge=0)
    points: list[RoutePoint] | None = None  # if given, replaces all points


class RouteSummary(RouteBase):
    id: int
    user_id: int
    created_at: datetime


class Route(RouteSummary):
    points: list[RoutePoint] = []
