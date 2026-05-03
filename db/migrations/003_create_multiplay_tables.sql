-- 003_create_multiplay_tables.sql
-- マルチプレイ系テーブル
-- rooms / room_players / battle_logs

-- ======================
-- rooms : 部屋情報
-- ======================
CREATE TABLE IF NOT EXISTS rooms (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,         -- 招待用の短いコード
    -- 'coop'(協力) / 'pvp_1v1' / 'pvp_2v2'
    mode            TEXT NOT NULL,
    max_players     SMALLINT NOT NULL DEFAULT 4,
    host_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 'waiting' / 'in_battle' / 'finished'
    status          TEXT NOT NULL DEFAULT 'waiting',
    dungeon_id      INTEGER REFERENCES dungeons(id), -- 協力モードのみ使用
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

-- ======================
-- room_players : 部屋参加プレイヤー
-- ======================
CREATE TABLE IF NOT EXISTS room_players (
    id              SERIAL PRIMARY KEY,
    room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- pvp_2v2 用のチーム分け（'a' / 'b'）。協力時は NULL でもよい。
    team            TEXT,
    -- 'joined' / 'ready' / 'spectator'(全滅後の観戦) / 'left'
    status          TEXT NOT NULL DEFAULT 'joined',
    character_id    INTEGER REFERENCES characters(id),
    -- 持ち込みモンスター（協力1体・対戦は仕様により）
    monster_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at         TIMESTAMPTZ,
    UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);

-- ======================
-- battle_logs : バトルログ
-- ======================
CREATE TABLE IF NOT EXISTS battle_logs (
    id              BIGSERIAL PRIMARY KEY,
    room_id         INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    -- 'pve' / 'coop' / 'pvp_1v1' / 'pvp_2v2'
    battle_type     TEXT NOT NULL,
    dungeon_id      INTEGER REFERENCES dungeons(id),
    -- 結果: 'win' / 'lose' / 'escape' / 'draw'
    result          TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    -- ターンごとの行動・ダメージなどを JSON 配列で保存
    log             JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 参加者・MVP・獲得経験値などのサマリ
    summary         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_battle_logs_room_id ON battle_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_battle_logs_started_at ON battle_logs(started_at DESC);
