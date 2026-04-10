# api/health/route.py — GET /api/health
from starlette.responses import JSONResponse
from .._shared.db import init_db

def GET(request):
    init_db()
    return JSONResponse({"status": "ok", "version": "2.0.0-serverless"})
