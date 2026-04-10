# api/import/route.py — POST /api/import
from fastapi import APIRouter, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from .._shared.db import get_cursor
from .._shared.auth import get_current_user
from .._shared.services import parse, sample_messages, extract, ExtractionError
import json, os, re, uuid
from datetime import datetime

router = APIRouter()

@router.post("/import")
async def import_file(request: Request):
    try:
        auth = request.headers.get("authorization", "")
        user = get_current_user(auth)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=401)

    content_type = request.headers.get("content-type", "")

    # Handle multipart form data
    try:
        body_bytes = await request.body()
        if "multipart/form-data" in content_type:
            boundary = None
            for part in content_type.split(";"):
                part = part.strip()
                if part.startswith("boundary="):
                    boundary = part[9:].strip('"')
            if not boundary:
                return JSONResponse({"error": "missing boundary"}, status_code=400)
            parts = _parse_multipart(body_bytes.decode("utf-8", errors="replace"), boundary)
            file_content = parts.get("file", b"")
            api_type = parts.get("api_type", "dashscope")
            api_key = parts.get("api_key", "")
            model = parts.get("model", "qwen-plus")
        else:
            # JSON mode
            body = json.loads(body_bytes.decode())
            api_type = body.get("api_type", "dashscope")
            api_key = body.get("api_key", "")
            model = body.get("model", "qwen-plus")
            messages_data = body.get("messages", [])
    except Exception as e:
        return JSONResponse({"error": f"解析请求失败: {str(e)}"}, status_code=400)

    if not api_key:
        return JSONResponse({"error": "api_key 必填"}, status_code=400)

    # JSON mode: use provided messages directly
    if "messages_data" in dir() and messages_data:
        contact_name = body.get("contact_name", "未知联系人")
        messages = messages_data
        message_count = len(messages)
        import hashlib
        file_hash = hashlib.sha256(str(messages).encode()).hexdigest()
        extracted = body.get("extracted_persona", {})
    else:
        if not file_content:
            return JSONResponse({"error": "未找到上传文件"}, status_code=400)

        # Save to /tmp
        tmp_dir = "/tmp" if os.path.exists("/tmp") else os.environ.get("TEMP", "/tmp")
        tmp_path = os.path.join(tmp_dir, f"upload_{uuid.uuid4().hex}.xlsx")
        with open(tmp_path, "wb") as f:
            f.write(file_content)

        try:
            parse_result = parse(tmp_path, filename="upload.xlsx")
            contact_name = parse_result.contact_name
            messages = parse_result.messages
            file_hash = parse_result.file_hash
            message_count = parse_result.message_count

            with get_cursor() as c:
                c.execute("SELECT id, contact_name FROM import_records WHERE user_id=? AND file_hash=?", (user["user_id"], file_hash))
                existing = c.fetchone()
                if existing:
                    return JSONResponse({"error": "duplicate", "message": f"该文件已导入（联系人：{existing['contact_name']}）"}, status_code=409)

            messages_text = sample_messages(messages, max_count=500)
            try:
                extracted = extract(messages_text=messages_text, contact_name=contact_name, api_type=api_type, api_key=api_key, model=model)
            except ExtractionError as e:
                return JSONResponse({"error": "extraction_failed", "message": str(e)}, status_code=422)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    # Save persona
    persona_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    with get_cursor() as c:
        c.execute(
            "INSERT INTO import_records (user_id, file_hash, file_name, contact_name, message_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user["user_id"], file_hash, "upload.xlsx", contact_name, message_count, now)
        )
        import_id = c.lastrowid
        c.execute(
            "INSERT INTO personas (user_id, persona_id, name, description, chat_data, extracted_persona, message_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user["user_id"], persona_id, extracted.get("name", contact_name), extracted.get("description", ""),
             json.dumps({"messages": messages[:100]}, ensure_ascii=False),
             json.dumps(extracted, ensure_ascii=False), message_count, now)
        )

    return {
        "success": True,
        "import_id": import_id,
        "persona_id": persona_id,
        "contact_name": contact_name,
        "message_count": message_count,
        "extracted_persona": extracted,
    }

def _parse_multipart(body_str: str, boundary: str) -> dict:
    result = {}
    b = "--" + boundary
    for section in body_str.split(b):
        section = section.strip("\r\n")
        if not section or section.startswith("--"):
            continue
        idx = section.find("\r\n\r\n")
        if idx == -1:
            continue
        header_block = section[:idx]
        content_bytes = section[idx+4:].encode("utf-8")
        name = filename = None
        for line in header_block.split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                for part in line.split(";"):
                    part = part.strip()
                    if part.startswith("name="):
                        name = part[5:].strip('"')
                    elif part.startswith("filename="):
                        filename = part[9:].strip('"')
        if filename:
            content_bytes = re.sub(rb"\\r\\n", b"\r\n", content_bytes)
            content_bytes = re.sub(rb"\\n", b"\n", content_bytes)
            content_bytes = re.sub(rb"\\r", b"\r", content_bytes)
            result[name or filename] = content_bytes.strip(b"\r\n")
        elif name:
            try:
                result[name] = content_bytes.decode("utf-8")
            except:
                result[name] = content_bytes
    return result
