# -*- coding: utf-8 -*-
"""
Digital Legacy Kit Web — API Server

启动: python server.py
端口: 8080

新增功能（相比原版）:
- POST /api/v1/import          xlsx 上传 + LLM 提取
- POST /api/v1/chat/stream     SSE 流式对话
- GET  /api/v1/import/:job_id/status  导入状态
"""

import os
import sys
import io
import json
import re
import secrets
import hashlib
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# ── 依赖检查 ──────────────────────────────────────────────
def ensure_deps():
    missing = []
    for mod in ["fastapi", "openpyxl", "httpx", "python_multipart"]:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod.replace("_", "-"))
    if missing:
        print(f"[ERROR] 缺少依赖: {', '.join(missing)}")
        print(f"安装: pip install -r requirements.txt")
        sys.exit(1)

ensure_deps()

from fastapi import FastAPI, HTTPException, Depends, Header, Body, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from jose import jwt, JWTError

# ── 本地模块 ──────────────────────────────────────────────
from services import (
    parse as parse_xlsx,
    sample_messages,
    LLMCaller,
    LLMCallError,
    extract,
    build_dialogue_system_prompt,
    ExtractionError,
)

# ══════════════════════════════════════════════════════════
# 配置
# ══════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_PATH = os.environ.get("DATABASE_PATH", str(DATA_DIR / "digital_legacy.db"))
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 30
MAX_UPLOAD_MB = 100
MAX_MESSAGES_FOR_EXTRACT = 500
IMPORT_TIMEOUT_SEC = 180

os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)

# ══════════════════════════════════════════════════════════
# 数据库
# ══════════════════════════════════════════════════════════

def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            created_at TEXT NOT NULL
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS personas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            persona_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            chat_data TEXT,
            extracted_persona TEXT,
            message_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            persona_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS import_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            file_hash TEXT NOT NULL,
            file_name TEXT,
            contact_name TEXT,
            message_count INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, file_hash)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ══════════════════════════════════════════════════════════
# JWT 工具
# ══════════════════════════════════════════════════════════

def create_token(user_id: int, phone: str) -> str:
    payload = {
        "sub": str(user_id),
        "phone": phone,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(authorization: str) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="无效的认证格式")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")

def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="未提供认证信息")
    payload = verify_token(authorization)
    user_id = int(payload["sub"])
    return {"user_id": user_id, "phone": payload["phone"]}

# ══════════════════════════════════════════════════════════
# FastAPI 应用
# ══════════════════════════════════════════════════════════

app = FastAPI(title="Digital Legacy Kit API", version="2.0.0")

# Serve built frontend — API routes take priority, catch-all serves SPA
DIST_DIR = BASE_DIR.parent / "frontend" / "dist"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════
# Pydantic 模型
# ══════════════════════════════════════════════════════════

class SendCodeRequest(BaseModel):
    phone: str

class LoginRequest(BaseModel):
    phone: str
    code: str

class PasswordLoginRequest(BaseModel):
    phone: str
    password: str

class ChatRequest(BaseModel):
    persona_id: str
    user_input: str
    api_type: str
    api_key: str
    model: str

class CreatePersonaRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    extracted_persona: Optional[dict] = None
    chat_data: Optional[dict] = None

class PatchPersonaRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    extracted_persona: Optional[dict] = None

# ══════════════════════════════════════════════════════════
# 认证接口
# ══════════════════════════════════════════════════════════

@app.post("/api/v1/auth/send_code")
async def send_code(req: SendCodeRequest):
    phone = re.sub(r"\D", "", req.phone)
    if len(phone) < 11:
        raise HTTPException(status_code=400, detail="手机号格式不正确")

    code = str(secrets.randbelow(9000) + 1000)
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE verification_codes SET used=1 WHERE phone=?", (phone,))
    c.execute(
        "INSERT INTO verification_codes (phone, code, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (phone, code, datetime.utcnow().isoformat(), expires_at.isoformat())
    )
    conn.commit()
    conn.close()

    print(f"[验证码] {phone} -> {code}")
    return {"success": True, "message": "验证码已发送", "code": code}  # DEBUG

@app.post("/api/v1/auth/login")
async def login(req: LoginRequest):
    phone = re.sub(r"\D", "", req.phone)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM verification_codes WHERE phone=? AND used=0 ORDER BY id DESC LIMIT 1",
        (phone,)
    )
    record = c.fetchone()
    if not record:
        conn.close()
        raise HTTPException(status_code=400, detail="请先获取验证码")
    if record["code"] != req.code:
        conn.close()
        raise HTTPException(status_code=400, detail="验证码错误")
    if datetime.utcnow() > datetime.fromisoformat(record["expires_at"]):
        conn.close()
        raise HTTPException(status_code=400, detail="验证码已过期")

    c.execute("UPDATE verification_codes SET used=1 WHERE id=?", (record["id"],))
    c.execute("SELECT * FROM users WHERE phone=?", (phone,))
    user = c.fetchone()
    if not user:
        c.execute("INSERT INTO users (phone, created_at) VALUES (?, ?)",
                  (phone, datetime.utcnow().isoformat()))
        user_id = c.lastrowid
    else:
        user_id = user["id"]
    conn.commit()
    conn.close()

    token = create_token(user_id, phone)
    return {"token": token, "user_id": user_id}

@app.post("/api/v1/auth/login_password")
async def login_password(req: PasswordLoginRequest):
    phone = re.sub(r"\D", "", req.phone)
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE phone=?", (phone,))
    user = c.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=400, detail="用户不存在，请先注册")
    password_hash = hashlib.sha256(req.password.encode()).hexdigest()
    if password_hash != user["password_hash"]:
        raise HTTPException(status_code=400, detail="密码错误")

    token = create_token(user["id"], phone)
    return {"token": token, "user_id": user["id"]}

@app.post("/api/v1/auth/register_password")
async def register_password(req: PasswordLoginRequest):
    phone = re.sub(r"\D", "", req.phone)
    if len(phone) < 11:
        raise HTTPException(status_code=400, detail="手机号格式不正确")

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE phone=?", (phone,))
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="该手机号已注册")

    password_hash = hashlib.sha256(req.password.encode()).hexdigest()
    c.execute("INSERT INTO users (phone, password_hash, created_at) VALUES (?, ?, ?)",
              (phone, password_hash, datetime.utcnow().isoformat()))
    user_id = c.lastrowid
    conn.commit()
    conn.close()

    token = create_token(user_id, phone)
    return {"token": token, "user_id": user_id}

# ══════════════════════════════════════════════════════════
# 克隆体接口
# ══════════════════════════════════════════════════════════

@app.get("/api/v1/personas")
async def list_personas(user=Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT persona_id, name, description, message_count, created_at, chat_data, extracted_persona "
        "FROM personas WHERE user_id=? ORDER BY created_at DESC",
        (user["user_id"],)
    )
    rows = c.fetchall()
    conn.close()
    personas = []
    for row in rows:
        p = dict(row)
        if p.get("chat_data"):
            try:
                p["chat_data"] = json.loads(p["chat_data"])
            except:
                pass
        if p.get("extracted_persona"):
            try:
                p["extracted_persona"] = json.loads(p["extracted_persona"])
            except:
                pass
        personas.append(p)
    return {"personas": personas}

@app.post("/api/v1/personas")
async def create_persona(req: CreatePersonaRequest, user=Depends(get_current_user)):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="名字不能为空")

    persona_id = secrets.token_hex(16)
    created_at = datetime.utcnow().isoformat()

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO personas (user_id, persona_id, name, description, chat_data, extracted_persona, message_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user["user_id"],
            persona_id,
            name,
            req.description or "",
            json.dumps(req.chat_data, ensure_ascii=False) if req.chat_data else None,
            json.dumps(req.extracted_persona, ensure_ascii=False) if req.extracted_persona else None,
            req.chat_data.get("message_count", 0) if req.chat_data else 0,
            created_at,
        )
    )
    conn.commit()
    conn.close()

    return {
        "persona_id": persona_id,
        "name": name,
        "description": req.description or "",
        "extracted_persona": req.extracted_persona,
        "created_at": created_at,
    }

@app.get("/api/v1/personas/{persona_id}")
async def get_persona(persona_id: str, user=Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM personas WHERE persona_id=? AND user_id=?",
        (persona_id, user["user_id"])
    )
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="克隆体不存在")
    p = dict(row)
    if p.get("chat_data"):
        try:
            p["chat_data"] = json.loads(p["chat_data"])
        except:
            pass
    if p.get("extracted_persona"):
        try:
            p["extracted_persona"] = json.loads(p["extracted_persona"])
        except:
            pass
    return p

@app.patch("/api/v1/personas/{persona_id}")
async def patch_persona(persona_id: str, req: PatchPersonaRequest, user=Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM personas WHERE persona_id=? AND user_id=?", (persona_id, user["user_id"]))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="克隆体不存在")

    updates = []
    params = []
    if req.name is not None:
        updates.append("name=?")
        params.append(req.name.strip())
    if req.description is not None:
        updates.append("description=?")
        params.append(req.description)
    if req.extracted_persona is not None:
        updates.append("extracted_persona=?")
        params.append(json.dumps(req.extracted_persona, ensure_ascii=False))

    if updates:
        params.append(persona_id)
        c.execute(f"UPDATE personas SET {', '.join(updates)} WHERE persona_id=?", params)
        conn.commit()
    conn.close()
    return {"success": True}

@app.delete("/api/v1/personas/{persona_id}")
async def delete_persona(persona_id: str, user=Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM personas WHERE persona_id=? AND user_id=?", (persona_id, user["user_id"]))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="克隆体不存在")
    c.execute("DELETE FROM personas WHERE persona_id=? AND user_id=?", (persona_id, user["user_id"]))
    c.execute("DELETE FROM chat_history WHERE persona_id=?", (persona_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# ══════════════════════════════════════════════════════════
# 导入接口（xlsx → LLM 提取）
# ══════════════════════════════════════════════════════════

@app.post("/api/v1/import")
async def import_xlsx(
    file: UploadFile = File(...),
    api_type: str = Form(...),
    api_key: str = Form(...),
    model: str = Form(...),
    user=Depends(get_current_user),
):
    """
    上传 xlsx → 解析 → LLM 提取人物特征 → 返回预览。

    同步处理，超时 IMPORT_TIMEOUT_SEC。
    """
    # ── 文件校验 ──────────────────────────────────────────
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="文件格式不对，请上传微信导出的xlsx")

    size = 0
    chunk_size = 1024 * 1024  # 1MB
    chunks = []

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"文件超过 {MAX_UPLOAD_MB}MB 限制")
        chunks.append(chunk)

    file_content = b"".join(chunks)

    # ── 解析 xlsx ─────────────────────────────────────────
    try:
        wb_stream = io.BytesIO(file_content)
        parse_result = parse_xlsx(wb_stream, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件读取失败: {str(e)}") from e

    if parse_result.message_count < 10:
        raise HTTPException(
            status_code=400,
            detail=f"聊天记录太少（{parse_result.message_count}条），至少需要10条"
        )

    # ── 去重检查 ──────────────────────────────────────────
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM import_records WHERE user_id=? AND file_hash=?",
        (user["user_id"], parse_result.file_hash)
    )
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="该文件已导入过，请勿重复上传")
    conn.close()

    # ── 格式化消息 ────────────────────────────────────────
    messages_text = sample_messages(parse_result.messages, MAX_MESSAGES_FOR_EXTRACT)

    # ── LLM 提取 ─────────────────────────────────────────
    try:
        extracted = extract(
            messages_text=messages_text,
            contact_name=parse_result.contact_name,
            api_type=api_type,
            api_key=api_key,
            model=model,
        )
    except ExtractionError as e:
        raise HTTPException(status_code=502, detail=f"LLM 提取失败：{str(e)}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM API 调用失败：{str(e)}") from e

    # ── 记录导入 ──────────────────────────────────────────
    job_id = secrets.token_hex(8)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO import_records (user_id, file_hash, file_name, contact_name, message_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            user["user_id"],
            parse_result.file_hash,
            file.filename,
            parse_result.contact_name,
            parse_result.message_count,
            datetime.utcnow().isoformat(),
        )
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "job_id": job_id,
        "preview": {
            "contact_name": parse_result.contact_name,
            "message_count": parse_result.message_count,
            "extracted_persona": extracted,
        },
    }

@app.get("/api/v1/import/status/{job_id}")
async def import_status(job_id: str, user=Depends(get_current_user)):
    """
    当前版本导入是同步的，status 始终返回 done。
    保留此接口为未来异步改造预留。
    """
    # job_id 在当前版本仅作占位，真实实现在 /import POST 返回
    return {
        "job_id": job_id,
        "status": "done",
        "message": "同步导入已完成，结果在 POST /import 的响应中",
    }

# ══════════════════════════════════════════════════════════
# 对话接口
# ══════════════════════════════════════════════════════════

@app.post("/api/v1/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    """非流式对话（备用）"""
    persona_id = req.persona_id
    user_input = req.user_input

    conn = get_db()
    c = conn.cursor()

    # 保存用户消息
    c.execute(
        "INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (persona_id, "user", user_input, datetime.utcnow().isoformat())
    )

    # 获取克隆体信息
    c.execute(
        "SELECT name, description, extracted_persona FROM personas WHERE persona_id=? AND user_id=?",
        (persona_id, user["user_id"])
    )
    persona = c.fetchone()
    conn.close()

    if not persona:
        raise HTTPException(status_code=404, detail="克隆体不存在")

    extracted_persona = {}
    if persona["extracted_persona"]:
        try:
            extracted_persona = json.loads(persona["extracted_persona"])
        except:
            pass

    system_prompt = build_dialogue_system_prompt(extracted_persona) if extracted_persona else (
        f"你是一个名为「{persona['name']}」的数字克隆体。"
        f"简介：{persona['description'] or '暂无'}"
    )

    caller = LLMCaller(req.api_type, req.api_key, req.model, timeout=60.0)
    try:
        reply = caller.call(system_prompt, user_input)
    except LLMCallError as e:
        raise HTTPException(status_code=502, detail=f"LLM 调用失败：{str(e)}") from e

    # 保存 AI 回复
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (persona_id, "assistant", reply, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

    return {"reply": reply}


@app.post("/api/v1/chat/stream")
async def chat_stream(req: ChatRequest, user=Depends(get_current_user)):
    """SSE 流式对话"""
    persona_id = req.persona_id
    user_input = req.user_input

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (persona_id, "user", user_input, datetime.utcnow().isoformat())
    )
    c.execute(
        "SELECT name, description, extracted_persona FROM personas WHERE persona_id=? AND user_id=?",
        (persona_id, user["user_id"])
    )
    persona = c.fetchone()
    conn.close()

    if not persona:
        raise HTTPException(status_code=404, detail="克隆体不存在")

    extracted_persona = {}
    if persona["extracted_persona"]:
        try:
            extracted_persona = json.loads(persona["extracted_persona"])
        except:
            pass

    system_prompt = build_dialogue_system_prompt(extracted_persona) if extracted_persona else (
        f"你是一个名为「{persona['name']}」的数字克隆体。"
        f"简介：{persona['description'] or '暂无'}"
    )

    caller = LLMCaller(req.api_type, req.api_key, req.model, timeout=60.0)

    full_reply = []

    async def event_generator():
        nonlocal full_reply
        try:
            async for chunk in caller.astream(system_prompt, user_input):
                full_reply.append(chunk)
                yield f"event: message\ndata: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
            yield f"event: done\ndata: {json.dumps({'finish_reason': 'stop'})}\n\n"
        except LLMCallError as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

        # 保存完整回复到数据库
        if full_reply:
            conn = get_db()
            c = conn.cursor()
            c.execute(
                "INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (persona_id, "assistant", "".join(full_reply), datetime.utcnow().isoformat())
            )
            conn.commit()
            conn.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/v1/chat/history/{persona_id}")
async def get_chat_history(
    persona_id: str,
    limit: int = 50,
    before_id: Optional[int] = None,
    user=Depends(get_current_user),
):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM personas WHERE persona_id=? AND user_id=?",
        (persona_id, user["user_id"])
    )
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="克隆体不存在")

    if before_id:
        c.execute(
            "SELECT id, role, content, created_at FROM chat_history "
            "WHERE persona_id=? AND id<? ORDER BY id DESC LIMIT ?",
            (persona_id, before_id, limit)
        )
    else:
        c.execute(
            "SELECT id, role, content, created_at FROM chat_history "
            "WHERE persona_id=? ORDER BY id DESC LIMIT ?",
            (persona_id, limit)
        )
    rows = c.fetchall()
    conn.close()

    messages = [dict(row) for row in reversed(rows)]
    return {"messages": messages}


@app.delete("/api/v1/chat/history/{persona_id}")
async def clear_chat_history(persona_id: str, user=Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM personas WHERE persona_id=? AND user_id=?",
        (persona_id, user["user_id"])
    )
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="克隆体不存在")
    c.execute("DELETE FROM chat_history WHERE persona_id=?", (persona_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# ══════════════════════════════════════════════════════════
# 健康检查
# ══════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}

# ══════════════════════════════════════════════════════════
# 启动
# ══════════════════════════════════════════════════════════


# Catch-all: serve SPA for any non-API route
if DIST_DIR.exists():
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        from fastapi.responses import FileResponse
        index_path = DIST_DIR / "index.html"
        return FileResponse(str(index_path))


if __name__ == "__main__":
    import uvicorn
    print("[Digital Legacy Kit Web] API Server v2.0.0")
    print(f"[DB] {DATABASE_PATH}")
    print(f"[CORS] allow all origins")
    print()
    print("主要端点:")
    print("  POST /api/v1/auth/send_code    发送验证码")
    print("  POST /api/v1/auth/login         验证码登录")
    print("  POST /api/v1/auth/login_password 密码登录")
    print("  GET  /api/v1/personas           列表")
    print("  POST /api/v1/personas           创建")
    print("  POST /api/v1/import             导入 xlsx")
    print("  POST /api/v1/chat/stream        流式对话")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=False)
