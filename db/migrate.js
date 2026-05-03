// シンプルなマイグレーションランナー
// db/migrations/ 配下の .sql ファイルを名前順に実行する。
// 適用済みは schema_migrations テーブルで管理する。

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map((r) => r.filename));
}

async function run() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      if (applied.has(file)) {
        // eslint-disable-next-line no-console
        console.log(`[migrate] skip   : ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[migrate] apply  : ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    // eslint-disable-next-line no-console
    console.log('[migrate] 完了');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] 失敗:', err);
  process.exit(1);
});
