// アプリケーションのエントリポイント
// Express + Socket.io サーバーを起動する

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const authRouter = require('./routes/auth');
const registerSocketHandlers = require('./socket');

const app = express();
const server = http.createServer(app);

// ====== ミドルウェア ======
app.use(express.json());
app.use(cookieParser());

// セッション設定（認証セッション保持用）
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'ai_rpg_dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7日
  },
});
app.use(sessionMiddleware);

// ====== API ルーティング ======
app.use('/api/auth', authRouter);

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ====== 静的ファイル（クライアント） ======
app.use(express.static(path.join(__dirname, '..', 'client')));

// ====== Socket.io 初期化 ======
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

// セッションを Socket.io でも共有
io.engine.use(sessionMiddleware);

registerSocketHandlers(io);

// ====== 起動 ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] AI_RPG サーバーがポート ${PORT} で起動しました`);
});

module.exports = { app, server, io };
