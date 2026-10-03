# desirePath-
Elevation-based running route generator, for StormHacks 2026.

## Structure
```
frontend/   React (Vite) app
backend/    Python (FastAPI) API
```

## Getting started

**Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

**Backend** (see `backend/README.md`)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend proxies `/api/*` to the backend in dev.
