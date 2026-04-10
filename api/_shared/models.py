# -*- coding: utf-8 -*-
"""
models.py — Pydantic 模型（用于请求验证）
"""
from typing import Optional, List
from pydantic import BaseModel

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
