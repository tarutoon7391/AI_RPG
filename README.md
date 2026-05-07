# AI_RPG

HTML/CSSベースのテキストUIで動作するブラウザRPG。

## 主な機能

- ログイン / 新規登録
- 下部固定タブによる画面遷移（冒険 / モンスター / 対戦 / その他）
- シングルプレイのターン制バトル（Socket.io経由）
- セーブデータのロード時マイグレーション（欠損フィールド補完）

## 技術スタック

- フロント：HTML / CSS / JavaScript
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
│   ├── login.html / login.js
│   ├── register.html / register.js
│   ├── lobby.html / lobby.js
│   └── css/
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

ブラウザで `http://localhost:3000` を開くとログイン画面が表示されます。

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

- 下部固定タブ（冒険 / モンスター / 対戦 / その他）を提供
- 冒険タブから「はじまりの草原（推奨Lv1）」へ進行可能
- バトルはSocket.io経由でサーバー側バトルエンジンを利用
