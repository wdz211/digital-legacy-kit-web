# api/persona_id/route.py — GET/PATCH/DELETE /api/persona/{id}
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from .._shared.db import get_cursor
from .._shared.auth import get_current_user
import json, re

router = APIRouter()

def _extract_id(path: str) -> str:
    m = re.search(r"/persona/([\w-]+)", path)
    return m.group(1) if m else ""

@router.get("/persona/{persona_id}")
def get_persona(persona_id: str, request: Request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    with get_cursor() as c:
        c.execute("SELECT * FROM personas WHERE persona_id=? AND user_id=?", (persona_id, user["user_id"]))
        row = c.fetchone()

    if not row:
        return JSONResponse({"error": "不存在"}, status_code=404)

    result = dict(row)
    result["extracted_persona"] = json.loads(result.get("extracted_persona", "{}"))
    result["chat_data"] = json.loads(result.get("chat_data", "{}"))
    return result

@router.patch("/persona/{persona_id}")
def patch_persona(persona_id: str, request: Request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    body = json.loads(request.body.decode())
    fields, values = [], []
    for field in ("name", "description", "extracted_persona"):
        if field in body:
            fields.append(f"{field}=?")
            val = body[field]
            if field == "extracted_persona":
                val = json.dumps(val, ensure_ascii=False)
            values.append(val)

    if not fields:
        return JSONResponse({"error": "没有要更新的字段"}, status_code=400)

    values.extend([persona_id, user["user_id"]])
    with get_cursor() as c:
        c.execute(f"UPDATE personas SET {', '.join(fields)} WHERE persona_id=? AND user_id=?", values)
        if c.rowcount == 0:
            return JSONResponse({"error": "不存在"}, status_code=404)

    return {"success": True}

@router.delete("/persona/{persona_id}")
def delete_persona(persona_id: str, request: Request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    with get_cursor() as c:
        c.execute("DELETE FROM personas WHERE persona_id=? AND user_id=?", (persona_id, user["user_id"]))
        if c.rowcount == 0:
            return JSONResponse({"error": "不存在"}, status_code=404)
        c.execute("DELETE FROM chat_history WHERE persona_id=?", (persona_id,))

    return {"success": True}
