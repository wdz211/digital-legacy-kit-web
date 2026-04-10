# api/personas/route.py — GET /api/personas, POST /api/personas
import json
from datetime import datetime
from starlette.responses import JSONResponse
from .._shared.db import get_cursor
from .._shared.auth import get_current_user

def GET(request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    with get_cursor() as c:
        c.execute(
            "SELECT persona_id, name, description, message_count, created_at FROM personas WHERE user_id=? ORDER BY created_at DESC",
            (user["user_id"],)
        )
        rows = c.fetchall()

    personas = [dict(row) for row in rows]
    return JSONResponse({"personas": personas})

def POST(request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    try:
        body = json.loads(request.body.decode())
    except:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    name = body.get("name", "").strip()
    if not name:
        return JSONResponse({"error": "name 必填"}, status_code=400)

    import uuid
    persona_id = str(uuid.uuid4())
    description = body.get("description", "")
    extracted_persona = body.get("extracted_persona", {})
    chat_data = body.get("chat_data", {})

    with get_cursor() as c:
        c.execute(
            "INSERT INTO personas (user_id, persona_id, name, description, extracted_persona, chat_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user["user_id"], persona_id, name, description,
             json.dumps(extracted_persona, ensure_ascii=False),
             json.dumps(chat_data, ensure_ascii=False),
             datetime.utcnow().isoformat())
        )

    return JSONResponse({"persona_id": persona_id, "name": name}, status_code=201)
