import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config, errors
from app.db import close_pool, get_connection, open_pool
from app.routers import auth, generate, routes, runs


# Show our own log lines (rate limits, ORS failures, validation errors) in the uvicorn terminal.
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
log = logging.getLogger("app")


def _warn_about_missing_config() -> None:
    """Names only, never values. A missing value here is the usual cause of confusing 5xx errors."""
    for name in ("DATABASE_URL", "ORS_API_KEY", "JWT_SECRET"):
        if not getattr(config, name):
            log.warning("%s is not set in backend/.env", name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warn_about_missing_config()
    open_pool()
    yield
    close_pool()


app = FastAPI(title="desirePath API", lifespan=lifespan)

errors.register(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(generate.router)  # before routes: keeps /generate clear of /{route_id}
app.include_router(routes.router)
app.include_router(runs.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
