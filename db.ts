// main/db.ts
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';


let db: InstanceType<typeof Database>;

export function getDbPath() {
  // 数据库存放在用户数据目录
  const dir = app.getPath('userData');
  return path.join(dir, 'app.db');
}

export function initDatabase() {
  const dbPath = getDbPath();

  // 可选：确保目录存在（通常 userData 已存在）
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');        // 提升并发安全
  db.pragma('foreign_keys = ON');

  // 建表（示例）
  db.exec(`
    CREATE TABLE IF NOT EXISTS marks_freeText (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id      TEXT NOT NULL,
        page        INTEGER NOT NULL,
        type        TEXT NOT NULL,
        payload     TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now')),
        CHECK (json_valid(payload))
    );
    CREATE INDEX IF NOT EXISTS idx_marks_doc_page ON marks_freeText (doc_id, page);
    CREATE INDEX IF NOT EXISTS idx_marks_doc_type ON marks_freeText (doc_id, type);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marks_highlight (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,          -- 数字主键
        doc_id      TEXT    NOT NULL,                           -- 文档ID
        page        INTEGER NOT NULL,                           -- 页码(1-based)
        type        TEXT    NOT NULL CHECK (type='highlight'),  -- 固定 highlight
        payload     TEXT    NOT NULL CHECK (json_valid(payload)), -- {rects:[{x,y,w,h}...], color, opacity, ...}
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_hl_doc_page ON marks_highlight (doc_id, page);
    `);

//   // 可选：版本化迁移
//   db.exec(`
//     CREATE TABLE IF NOT EXISTS __meta (
//       key TEXT PRIMARY KEY,
//       value TEXT
//     );
//   `);
  // migrateIfNeeded();

  return db;
}

function getDB() {
  if (!db) throw new Error('DB not initialized');
  return db;
}
