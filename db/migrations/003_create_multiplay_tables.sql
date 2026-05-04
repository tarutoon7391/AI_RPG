-- 003_create_multiplay_tables.sql
-- マルチプレイ系テーブル
-- rooms / room_players / battle_logs

-- ======================
-- rooms : 部屋情報
-- ======================
CREATE TABLE IF NOT EXISTS rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_type   TEXT NOT NULL CHECK (room_type IN ('coop', 'pvp')),  -- coop / pvp
    status      TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_battle', 'finished')), -- waiting / in_battle / finished
    max_players SMALLINT NOT NULL DEFAULT 4,
    created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON rooms(created_by);

-- ======================
-- room_players : 部屋参加プレイヤー
-- ======================
CREATE TABLE IF NOT EXISTS room_players (
    id        SERIAL PRIMARY KEY,
    room_id   UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_ready  BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);

-- ======================
-- battle_logs : バトルログ
-- ======================
CREATE TABLE IF NOT EXISTS battle_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID REFERENCES rooms(id) ON DELETE SET NULL,
    turn_number INTEGER NOT NULL,
    actor_type  TEXT NOT NULL CHECK (actor_type IN ('player', 'monster')),  -- player / monster
    actor_id    UUID NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('attack', 'skill', 'item', 'escape', 'capture')),  -- attack / skill / item / escape / capture
    target_id   UUID,                       -- 対象ID（nullable）
    skill_id    INTEGER REFERENCES skills(id),
    item_id     INTEGER REFERENCES items(id),
    damage      INTEGER,                    -- ダメージ量（nullable）
    heal        INTEGER,                    -- 回復量（nullable）
    result_json JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_battle_logs_room_id ON battle_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_battle_logs_created_at ON battle_logs(created_at DESC);
