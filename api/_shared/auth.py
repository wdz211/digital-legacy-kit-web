# -*- coding: utf-8 -*-
"""
auth.py — JWT 工具函数
"""
from datetime import datetime, timedelta
from jose import jwt, JWTError
from .config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

def create_token(user_id: int, phone: str) -> str:
    payload = {
        "sub": str(user_id),
        "phone": phone,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(authorization: str) -> dict:
    if not authorization.startswith("Bearer "):
        raise ValueError("无效的认证格式")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise ValueError("Token 无效或已过期")

def get_current_user(authorization: str) -> dict:
    if not authorization:
        raise ValueError("未提供认证信息")
    payload = verify_token(authorization)
    user_id = int(payload["sub"])
    return {"user_id": user_id, "phone": payload["phone"]}
