// 認証関連 API ルーター
// - POST /api/auth/register : 新規登録
// - POST /api/auth/login    : ログイン
// - POST /api/auth/logout   : ログアウト
// - GET  /api/auth/me       : 現在のログインユーザー情報

const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ユーザー名・パスワードのバリデーション
function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return 'ユーザー名とパスワードは文字列で指定してください';
  }
  if (username.length < 3 || username.length > 32) {
    return 'ユーザー名は3〜32文字で指定してください';
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(username)) {
    return 'ユーザー名は半角英数字・アンダースコア・ハイフンのみ使用できます';
  }
  if (password.length < 8 || password.length > 128) {
    return 'パスワードは8〜128文字で指定してください';
  }
  return null;
}

// キャラクター名のバリデーション
function validateCharacterName(characterName) {
  if (typeof characterName !== 'string') {
    return 'キャラクター名は文字列で指定してください';
  }
  const trimmed = characterName.trim();
  if (trimmed.length < 1 || trimmed.length > 32) {
    return 'キャラクター名は1〜32文字で指定してください';
  }
  return null;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password, characterName } = req.body || {};
  const validationError = validateCredentials(username, password);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  const characterNameError = validateCharacterName(characterName);
  if (characterNameError) {
    return res.status(400).json({ error: characterNameError });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // 既存ユーザーチェック
    const existing = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    }

    // パスワードをハッシュ化（コスト10）
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at`,
      [username, passwordHash]
    );
    const user = result.rows[0];

    await client.query(
      `INSERT INTO characters (
        user_id, name, current_job_id, element, hp, max_hp, mp, max_mp, attack, defense, recovery, speed, crit_rate, evasion_rate, charm
      ) VALUES (
        $1, $2, 1, 'none', 200, 200, 50, 50, 60, 30, 20, 40, 5.00, 5.00, 10
      )`,
      [user.id, characterName.trim()]
    );

    await client.query(
      `INSERT INTO character_jobs (character_id, job_id, level, exp)
       SELECT c.id, 1, 1, 0
       FROM characters c
       WHERE c.user_id = $1
       ON CONFLICT (character_id, job_id) DO NOTHING`,
      [user.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({ user });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // no-op
    }
    // eslint-disable-next-line no-console
    console.error('[auth.register] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'ユーザー名とパスワードを指定してください' });
  }

  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.password_hash, c.current_job_id, c.name AS character_name
       FROM users u
       LEFT JOIN characters c ON c.user_id = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [username]
    );
    if (result.rowCount === 0) {
      // 列挙攻撃対策のためメッセージは共通化
      return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.currentJobId = user.current_job_id || 1;

    return res.json({
      user: { id: user.id, username: user.username, name: user.character_name || user.username },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth.login] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ ok: true });
  }
  req.session.destroy((err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error('[auth.logout] エラー:', err);
      return res.status(500).json({ error: 'ログアウトに失敗しました' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      currentJobId: req.session.currentJobId || 1,
    },
  });
});

module.exports = router;
