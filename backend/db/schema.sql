-- Digital Legacy Kit Web 数据库 Schema

-- 复用现有表（见 server.py init_db）
-- 仅新增以下扩展和表

-- personas 表新增字段
ALTER TABLE personas ADD COLUMN extracted_persona TEXT;
ALTER TABLE personas ADD COLUMN chat_data TEXT;

-- 导入去重记录
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
);
