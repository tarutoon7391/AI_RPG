// PostgreSQL 接続プールを提供するモジュール
const { Pool } = require('pg');

// DATABASE_URL が設定されている前提（Railway 等のデプロイ環境）
// ローカル開発時は .env から読み込む
const connectionString = process.env.DATABASE_URL;

// SSL 設定：本番環境（Railway 等）では SSL 必須のため有効化
const ssl =
  process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
  connectionString,
  ssl,
});

// 接続エラーが発生してもプロセスを落とさないようにロギングのみ行う
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] 予期しない PostgreSQL エラー:', err);
});

module.exports = {
  pool,
  // 簡易的なクエリヘルパー
  query: (text, params) => pool.query(text, params),
};
