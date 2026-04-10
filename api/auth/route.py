# api/auth/route.py — POST /api/auth/send_code, POST /api/auth/login, POST /api/auth/login_password, POST /api/auth/register_password
import json
import random
import re
from datetime import datetime, timedelta
from starlette.responses import JSONResponse
from .._shared.db import get_cursor
from .._shared.models import SendCodeRequest, LoginRequest, PasswordLoginRequest
from .._shared.auth import create_token

def POST(request):
    path = request.headers.get("x-path", request.headers.get("path", ""))
    # Vercel passes full path; handle both /api/auth/send_code and /api/auth
    sub = path.rsplit("/auth/", 1)[-1] if "/auth/" in path else ""

    if sub == "send_code" or path == "/api/auth/send_code":
        return _send_code(request)
    elif sub == "login" or path == "/api/auth/login":
        return _login(request)
    elif sub == "login_password" or path == "/api/auth/login_password":
        return _login_password(request)
    elif sub == "register_password" or path == "/api/auth/register_password":
        return _register_password(request)
    return JSONResponse({"error": "not found"}, status_code=404)

def _send_code(request):
    try:
        body = json.loads(request.body.decode())
        phone = body.get("phone", "")
    except:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    if not re.match(r"^1[3-9]\d{9}$", phone):
        return JSONResponse({"error": "手机号格式错误"}, status_code=400)

    code = "".join(random.choices("0123456789", k=6))
    now = datetime.utcnow()
    expires = now + timedelta(minutes=5)

    with get_cursor() as c:
        c.execute("DELETE FROM verification_codes WHERE phone=?", (phone,))
        c.execute(
            "INSERT INTO verification_codes (phone, code, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (phone, code, now.isoformat(), expires.isoformat())
        )

    # In production, integrate with SMS provider (e.g., twilio, aliyun)
    print(f"[DEV] Verification code for {phone}: {code}")
    return JSONResponse({
        "success": True,
        "message": "验证码已发送（开发环境打印到日志）",
        "dev_code": code  # 移除！
    })

def _login(request):
    try:
        body = json.loads(request.body.decode())
        phone = body.get("phone", "")
        code = body.get("code", "")
    except:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    if not phone or not code:
        return JSONResponse({"error": "手机号和验证码必填"}, status_code=400)

    with get_cursor() as c:
        c.execute(
            "SELECT * FROM verification_codes WHERE phone=? AND used=0 ORDER BY created_at DESC LIMIT 1",
            (phone,)
        )
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
    return JSONResponse({"token": token, "user_id": user_id})

def _login_password(request):
    try:
        body = json.loads(request.body.decode())
        phone = body.get("phone", "")
        password = body.get("password", "")
    except:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    if not phone or not password:
        return JSONResponse({"error": "手机号和密码必填"}, status_code=400)

    import hashlib
    pw_hash = hashlib.sha256(password.encode()).hexdigest()

    with get_cursor() as c:
        c.execute("SELECT id FROM users WHERE phone=? AND password_hash=?", (phone, pw_hash))
        user = c.fetchone()
        if not user:
            return JSONResponse({"error": "手机号或密码错误"}, status_code=401)
        user_id = user["id"]

    token = create_token(user_id, phone)
    return JSONResponse({"token": token, "user_id": user_id})

def _register_password(request):
    try:
        body = json.loads(request.body.decode())
        phone = body.get("phone", "")
        password = body.get("password", "")
    except:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    if not re.match(r"^1[3-9]\d{9}$", phone):
        return JSONResponse({"error": "手机号格式错误"}, status_code=400)
    if len(password) < 6:
        return JSONResponse({"error": "密码至少6位"}, status_code=400)

    import hashlib
    pw_hash = hashlib.sha256(password.encode()).hexdigest()

    with get_cursor() as c:
        c.execute("SELECT id FROM users WHERE phone=?", (phone,))
        if c.fetchone():
            return JSONResponse({"error": "该手机号已注册，请直接登录"}, status_code=409)
        c.execute(
            "INSERT INTO users (phone, password_hash, created_at) VALUES (?, ?, ?)",
            (phone, pw_hash, datetime.utcnow().isoformat())
        )
        user_id = c.lastrowid

    token = create_token(user_id, phone)
    return JSONResponse({"token": token, "user_id": user_id}, status_code=201)
