from fastapi import APIRouter, HTTPException

from app.schemas.generate import GenerateRequest, RouteResponse
from app.services import ors
from app.services.route_generator import generate

router = APIRouter(prefix="/api/routes", tags=["generate"])


@router.post("/generate", response_model=RouteResponse)
def generate_routes(body: GenerateRequest):
    """Generates (does not save) up to three loop routes near a postal code. No DB needed."""
    try:
        return generate(body)
    except ors.NotFound:
        raise HTTPException(404, f"Couldn't find postal code {body.postal_code}")
    except ors.ORSError as e:
        raise HTTPException(503 if "ORS_API_KEY" in str(e) else 502, str(e))
