# api/main.py — Unified FastAPI app for Vercel Serverless
from fastapi import FastAPI
from ._shared.db import init_db

# Import route handlers (import is a reserved keyword)
from .health.route import router as health_router
from .auth.route import router as auth_router
from .personas.route import router as personas_router
from .persona_id.route import router as persona_id_router
from .import_x.route import router as import_router
from .chat.route import router as chat_router

app = FastAPI(title="Digital Legacy Kit API")

# Init DB on cold start
init_db()

# Mount routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(personas_router)
app.include_router(persona_id_router)
app.include_router(import_router)
app.include_router(chat_router)

@app.get("/health")
def root_health():
    return {"status": "ok", "version": "2.0.0"}
