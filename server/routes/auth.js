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

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  const validationError = validateCredentials(username, password);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    // 既存ユーザーチェック
    const existing = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    }

    // パスワードをハッシュ化（コスト10）
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at`,
      [username, passwordHash]
    );

    const user = result.rows[0];

    // 登録成功時にそのままログイン状態にする
    req.session.userId = user.id;
    req.session.username = user.username;

    return res.status(201).json({ user });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth.register] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
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
      'SELECT id, username, password_hash FROM users WHERE username = $1',
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

    return res.json({
      user: { id: user.id, username: user.username },
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
    },
  });
});

module.exports = router;
