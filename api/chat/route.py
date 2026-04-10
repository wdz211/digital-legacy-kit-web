# api/chat/route.py — POST /api/chat/stream
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from .._shared.db import get_cursor, get_db
from .._shared.auth import get_current_user
from .._shared.services import build_dialogue_system_prompt, LLMCaller, LLMCallError
import json
from datetime import datetime

router = APIRouter()

@router.post("/chat/stream")
async def chat_stream(request: Request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    try:
        body = json.loads(request.body.decode())
    except:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    persona_id = body.get("persona_id", "")
    user_input = body.get("user_input", "").strip()
    api_type = body.get("api_type", "")
    api_key = body.get("api_key", "")
    model = body.get("model", "")

    if not persona_id or not user_input:
        return JSONResponse({"error": "persona_id 和 user_input 必填"}, status_code=400)
    if not api_type or not api_key or not model:
        return JSONResponse({"error": "api_type, api_key, model 必填（由前端提供）"}, status_code=400)

    with get_cursor() as c:
        c.execute("SELECT * FROM personas WHERE persona_id=? AND user_id=?", (persona_id, user["user_id"]))
        row = c.fetchone()
    if not row:
        return JSONResponse({"error": "persona 不存在"}, status_code=404)

    persona = dict(row)
    extracted = json.loads(persona.get("extracted_persona", "{}"))
    if not extracted:
        return JSONResponse({"error": "persona 未完成导入，无法对话"}, status_code=422)

    system_prompt = build_dialogue_system_prompt(extracted)
    now = datetime.utcnow().isoformat()

    with get_cursor() as c:
        c.execute("INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                  (persona_id, "user", user_input, now))
        c.execute("INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                  (persona_id, "assistant", "", now))
        history_id = c.lastrowid

    return StreamingResponse(
        _chat_stream(persona_id, api_type, api_key, model, system_prompt, user_input, history_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

async def _chat_stream(persona_id: str, api_type: str, api_key: str, model: str,
                        system_prompt: str, user_input: str, history_id: int):
    caller = LLMCaller(api_type, api_key, model, timeout=120.0)
    full_response = []

    try:
        async for chunk in caller.astream(system_prompt, user_input):
            full_response.append(chunk)
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"

        final_text = "".join(full_response)
        conn = get_db()
        conn.execute("UPDATE chat_history SET content=? WHERE id=?", (final_text, history_id))
        conn.commit()
        conn.close()

    except LLMCallError as e:
        yield f"data: {json.dumps({'error': f'LLM 调用失败: {str(e)}'}, ensure_ascii=False)}\n\n"
