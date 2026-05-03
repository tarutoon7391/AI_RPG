# AI_RPG

2Dピクセルアートのブラウザマルチ RPG（初期実装）。

## 技術スタック

- フロント：Phaser.js（CDN 読み込み）
- バック：Node.js + Express + Socket.io
- DB：PostgreSQL
- デプロイ：Railway 想定

## ディレクトリ構成

```
AI_RPG/
├── server/          Express + Socket.io サーバー
│   ├── index.js
│   ├── routes/      REST API
│   ├── socket/      Socket.io ハンドラ
│   └── middleware/
├── client/          ブラウザ向け資産（静的配信）
│   ├── index.html
│   ├── main.js
│   ├── css/
│   └── scenes/      Phaser シーン群
├── db/
│   ├── migrate.js   マイグレーションランナー
│   └── migrations/  SQL マイグレーション
└── package.json
```

## セットアップ

```bash
# 1) 依存導入
npm install

# 2) 環境変数を設定
cp .env.example .env
# DATABASE_URL / SESSION_SECRET を編集

# 3) DB マイグレーション
npm run migrate

# 4) サーバー起動
npm start
```

ブラウザで `http://localhost:3000` を開くとタイトル画面が表示されます。

## 提供 API（初期実装分）

- `POST /api/auth/register` 新規登録
- `POST /api/auth/login` ログイン
- `POST /api/auth/logout` ログアウト
- `GET  /api/auth/me` 自分のユーザー情報
- `GET  /api/health` ヘルスチェック

## Socket.io イベント（骨格のみ）

クライアント → サーバー : `room:create` / `room:join` / `room:leave` / `battle:action` / `battle:ready`

サーバー → クライアント : `room:updated` / `battle:start` / `battle:turn` / `battle:end` / `player:joined` / `player:left`

## 注意

本コミットは「初期実装」であり、ゲームロジック（戦闘・育成・進化等）は未実装です。
今後、設計資料に基づいて段階的に実装していきます。
