// app/api/_shared/db.ts — SQLite via better-sqlite3
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = '/tmp/digital_legacy.db'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    initDb(_db)
  }
  return _db
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      persona_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      chat_data TEXT,
      extracted_persona TEXT,
      message_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      file_name TEXT,
      contact_name TEXT,
      message_count INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, file_hash)
    );
  `)
}

export function getCursor() {
  const db = getDb()
  return db.prepare('')
}
