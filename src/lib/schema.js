// 数据表结构：笔记按条、日程按天、元信息按键，避免整份状态单行读写。
// 建表语句为幂等 DDL，冷启动时批量执行一次。

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    html TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL DEFAULT 1,
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    date TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  // 解析失败的行原样留档，避免"坏一条、丢全部"
  `CREATE TABLE IF NOT EXISTS corrupt_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    raw TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes (deleted_at)`
];

let schemaReadyPromise = null;

export function ensureSchema(env) {
  if (!env?.DB) return;
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = env.DB
    .batch(STATEMENTS.map((sql) => env.DB.prepare(sql)))
    .catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });

  return schemaReadyPromise;
}
