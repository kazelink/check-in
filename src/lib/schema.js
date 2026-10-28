
const TABLES = [
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
  `CREATE TABLE IF NOT EXISTS corrupt_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    raw TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes (deleted_at)`
];

const COLUMNS = {
  notes: [
    ['title', "TEXT NOT NULL DEFAULT ''"],
    ['html', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', 'INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'INTEGER NOT NULL DEFAULT 0'],
    ['rev', 'INTEGER NOT NULL DEFAULT 1'],
    ['deleted_at', 'INTEGER']
  ],
  plans: [
    ['payload', "TEXT NOT NULL DEFAULT '[]'"],
    ['updated_at', 'INTEGER NOT NULL DEFAULT 0'],
    ['rev', 'INTEGER NOT NULL DEFAULT 1']
  ],
  app_meta: [
    ['value', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', 'INTEGER NOT NULL DEFAULT 0']
  ],
  corrupt_rows: [
    ['scope', "TEXT NOT NULL DEFAULT ''"],
    ['raw', "TEXT NOT NULL DEFAULT ''"],
    ['created_at', "TEXT NOT NULL DEFAULT ''"]
  ]
};

async function addMissingColumns(DB) {
  const extra = [];
  for (const [table, columns] of Object.entries(COLUMNS)) {
    const info = await DB.prepare(`PRAGMA table_info(${table})`).all();
    const have = new Set((info.results || []).map((row) => row.name));
    for (const [name, ddl] of columns) {
      if (!have.has(name)) extra.push(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    }
  }
  if (extra.length) {
    console.warn('schema upgrade applied:', extra.length, 'column(s)');
    await DB.batch(extra.map((sql) => DB.prepare(sql)));
  }
}

let schemaReady = null;

export function ensureSchema(env) {
  if (!env?.DB) return Promise.resolve();
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await env.DB.batch(TABLES.map((sql) => env.DB.prepare(sql)));
    await addMissingColumns(env.DB);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}
