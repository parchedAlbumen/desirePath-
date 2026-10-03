# Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check it works: http://localhost:8000/api/health  (docs at /docs)

## Layout
- `app/routers/`  – API endpoints (auth, routes, sharing...)
- `app/models/`   – database models
- `app/schemas/`  – request/response validation
- `app/services/` – business logic (elevation, route generation)
- `tests/`        – pytest
