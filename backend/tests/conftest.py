import pytest

from app.cache import route_cache
from app.ratelimit import generate_limiter


@pytest.fixture(autouse=True)
def _fresh_state():
    generate_limiter.reset()
    route_cache.clear()
    yield
    generate_limiter.reset()
    route_cache.clear()
