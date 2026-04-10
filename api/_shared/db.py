# -*- coding: utf-8 -*-
"""
db.py — SQLite 数据库（/tmp 版本，供 Vercel Serverless Functions 使用）

注意：在 Vercel 环境中数据库存储在 /tmp，每次冷启动会清空。
生产环境应换用 @vercel/postgres 或 Turso。
"""
import sqlite3
import os
from contextlib import contextmanager
from .config import DB_PATH

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
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

# 每次容器启动时初始化（Vercel 冷启动会重新初始化）
init_db()

@contextmanager
def get_cursor():
    conn = get_db()
    try:
        yield conn.cursor()
        conn.commit()
    finally:
        conn.close()
