"""One place that turns service errors into HTTP responses, so routers don't repeat try/except."""
import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.ratelimit import RateLimited
from app.services import ors

log = logging.getLogger(__name__)


def _json(status: int, detail: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status, headers=headers)


def register(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        # Log which fields failed and why (never the submitted values, which can include passwords).
        problems = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        log.info("422 on %s %s: %s", request.method, request.url.path, "; ".join(problems))
        return await request_validation_exception_handler(request, exc)

    @app.exception_handler(RateLimited)
    async def _rate_limited(request: Request, exc: RateLimited):
        who = "Everyone's" if exc.scope == "global" else "You're"
        hint = " Log in for a higher limit." if exc.scope == "ip" else ""
        return _json(429, f"{who} generating routes too fast. Try again in {exc.retry_after}s.{hint}",
                     {"Retry-After": str(exc.retry_after)})

    @app.exception_handler(ors.NotFound)
    async def _not_found(request: Request, exc: ors.NotFound):
        return _json(404, f"Couldn't find postal code {exc.args[0]}")

    @app.exception_handler(ors.ORSConfigError)
    async def _config(request: Request, exc: ors.ORSConfigError):
        log.error("ORS config problem: %s", exc)
        return _json(503, "Route service isn't configured correctly. Try again later.")

    @app.exception_handler(ors.ORSRateLimited)
    async def _limited(request: Request, exc: ors.ORSRateLimited):
        headers = {"Retry-After": str(exc.retry_after or 60)}
        return _json(429, "The route service is busy right now. Try again in a minute.", headers)

    @app.exception_handler(ors.NoRoutablePath)
    async def _no_path(request: Request, exc: ors.NoRoutablePath):
        return _json(422, "Couldn't find walkable paths near that location. Try a different one.")

    @app.exception_handler(ors.ORSTimeout)
    async def _timeout(request: Request, exc: ors.ORSTimeout):
        return _json(504, "The route service took too long to respond. Try again.")

    @app.exception_handler(ors.ORSError)
    async def _ors(request: Request, exc: ors.ORSError):
        log.error("ORS error: %s", exc)
        return _json(502, "The route service failed. Try again shortly.")

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _json(500, "Something went wrong on our side.")
