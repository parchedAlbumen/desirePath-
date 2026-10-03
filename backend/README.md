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

## Database (Tiger Data / Postgres)
1. `cp .env.example .env`
2. Paste your connection string into `DATABASE_URL` in `.env` (gitignored, never commit it)
3. `python scripts_check_db.py` to verify the connection

## Testing
```bash
pytest -v                      # DB tests auto-skip if DATABASE_URL isn't set
```
Or with the server running, open http://localhost:8000/api/health/db
