# api/health/route.py — GET /api/health
from fastapi import APIRouter
from .._shared.db import init_db

router = APIRouter()

@router.get("/health")
def get_health():
    init_db()
    return {"status": "ok", "version": "2.0.0"}
