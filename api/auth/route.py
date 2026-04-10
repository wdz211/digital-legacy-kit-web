# api/auth/route.py — All auth endpoints: POST /api/auth
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from .._shared.db import get_cursor
from .._shared.auth import create_token
import json, random, re
from datetime import datetime, timedelta

router = APIRouter()

def _json(body: bytes):
    return json.loads(body.decode())

@router.post("/auth")
def auth_endpoint(request: Request):
    body = json.loads(request.body.decode())
    action = body.get("action", "")

    if action == "send_code":
        return _send_code(body)
    elif action == "login":
        return _login(body)
    elif action == "login_password":
        return _login_password(body)
    elif action == "register_password":
        return _register_password(body)
    return JSONResponse({"error": "unknown action"}, status_code=400)

def _send_code(body: dict):
    phone = body.get("phone", "")
    if not re.match(r"^1[3-9]\d{9}$", phone):
        return JSONResponse({"error": "手机号格式错误"}, status_code=400)
    code = "".join(random.choices("0123456789", k=6))
    now = datetime.utcnow()
    expires = now + timedelta(minutes=5)
    with get_cursor() as c:
        c.execute("DELETE FROM verification_codes WHERE phone=?", (phone,))
        c.execute("INSERT INTO verification_codes (phone, code, created_at, expires_at) VALUES (?, ?, ?, ?)",
                   (phone, code, now.isoformat(), expires.isoformat()))
    print(f"[DEV] Verification code for {phone}: {code}")
    return {"success": True, "dev_code": code}

def _login(body: dict):
    phone = body.get("phone", "")
    code = body.get("code", "")
    if not phone or not code:
        return JSONResponse({"error": "手机号和验证码必填"}, status_code=400)
    with get_cursor() as c:
        c.execute("SELECT * FROM verification_codes WHERE phone=? AND used=0 ORDER BY created_at DESC LIMIT 1", (phone,))
        row = c.fetchone()
    if not row:
        return JSONResponse({"error": "未找到有效验证码"}, status_code=400)
    if datetime.utcnow() > datetime.fromisoformat(row["expires_at"]):
        return JSONResponse({"error": "验证码已过期，请重新获取"}, status_code=400)
    if row["code"] != code:
        return JSONResponse({"error": "验证码错误"}, status_code=400)
    with get_cursor() as c:
        c.execute("UPDATE verification_codes SET used=1 WHERE id=?", (row["id"],))
        c.execute("SELECT id FROM users WHERE phone=?", (phone,))
        user = c.fetchone()
        if not user:
            c.execute("INSERT INTO users (phone, created_at) VALUES (?, ?)", (phone, datetime.utcnow().isoformat()))
            user_id = c.lastrowid
        else:
            user_id = user["id"]
    token = create_token(user_id, phone)
    return {"token": token, "user_id": user_id}

def _login_password(body: dict):
    import hashlib
    phone = body.get("phone", "")
    password = body.get("password", "")
    if not phone or not password:
        return JSONResponse({"error": "手机号和密码必填"}, status_code=400)
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    with get_cursor() as c:
        c.execute("SELECT id FROM users WHERE phone=? AND password_hash=?", (phone, pw_hash))
        user = c.fetchone()
        if not user:
            return JSONResponse({"error": "手机号或密码错误"}, status_code=401)
        user_id = user["id"]
    token = create_token(user_id, phone)
    return {"token": token, "user_id": user_id}

def _register_password(body: dict):
    import hashlib
    phone = body.get("phone", "")
    password = body.get("password", "")
    if not re.match(r"^1[3-9]\d{9}$", phone):
        return JSONResponse({"error": "手机号格式错误"}, status_code=400)
    if len(password) < 6:
        return JSONResponse({"error": "密码至少6位"}, status_code=400)
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    with get_cursor() as c:
        c.execute("SELECT id FROM users WHERE phone=?", (phone,))
        if c.fetchone():
            return JSONResponse({"error": "该手机号已注册，请直接登录"}, status_code=409)
        c.execute("INSERT INTO users (phone, password_hash, created_at) VALUES (?, ?, ?)",
                   (phone, pw_hash, datetime.utcnow().isoformat()))
        user_id = c.lastrowid
    token = create_token(user_id, phone)
    return {"token": token, "user_id": user_id}
