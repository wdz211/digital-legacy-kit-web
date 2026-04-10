# -*- coding: utf-8 -*-
"""
config.py — Vercel Serverless 环境配置
"""
import os

# Vercel Serverless: /var/task is read-only, use /tmp for temp files
TASK_DIR = os.environ.get("VERCEL", "0") == "1"
DB_PATH = "/tmp/digital_legacy.db" if TASK_DIR else "backend/data/digital_legacy.db"
JWT_SECRET = os.environ.get("JWT_SECRET", os.environ.get("SECRET_KEY", "dev-secret-change-in-production"))
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 30
MAX_UPLOAD_MB = 100
MAX_MESSAGES_FOR_EXTRACT = 500
IMPORT_TIMEOUT_SEC = 180
