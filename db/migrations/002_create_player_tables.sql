-- 002_create_player_tables.sql
-- プレイヤーデータ系テーブル
-- users / characters / character_jobs / player_monsters / player_items / dungeon_progress

-- ======================
-- users : アカウント情報
-- ======================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    box_limit     INTEGER NOT NULL DEFAULT 20,   -- モンスターボックス上限（初期20体）
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- characters : キャラクター情報
-- ======================
CREATE TABLE IF NOT EXISTS characters (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    current_job_id INTEGER REFERENCES jobs(id),
    element        TEXT NOT NULL DEFAULT 'none',  -- fire/water/wood/light/dark/none
    hp             INTEGER NOT NULL DEFAULT 0,
    max_hp         INTEGER NOT NULL DEFAULT 0,
    mp             INTEGER NOT NULL DEFAULT 0,
    max_mp         INTEGER NOT NULL DEFAULT 0,
    attack         INTEGER NOT NULL DEFAULT 0,
    defense        INTEGER NOT NULL DEFAULT 0,
    recovery       INTEGER NOT NULL DEFAULT 0,
    speed          INTEGER NOT NULL DEFAULT 0,
    crit_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,    -- 会心率（%）
    evasion_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,    -- 回避率（%）
    charm          INTEGER NOT NULL DEFAULT 0,          -- 魅力度
    exp            INTEGER NOT NULL DEFAULT 0,
    money          INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);

-- ======================
-- character_jobs : 職業ごとのレベル・習得スキル
-- ======================
CREATE TABLE IF NOT EXISTS character_jobs (
    id           SERIAL PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level        SMALLINT NOT NULL DEFAULT 1,
    exp          INTEGER NOT NULL DEFAULT 0,
    unlocked_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (character_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_character_jobs_character_id ON character_jobs(character_id);

-- ======================
-- player_monsters : 所持モンスター個体
-- ======================
CREATE TABLE IF NOT EXISTS player_monsters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monster_id      INTEGER NOT NULL REFERENCES monsters(id),
    nickname        TEXT,                                    -- ニックネーム（nullable）
    level           SMALLINT NOT NULL DEFAULT 1,
    exp             INTEGER NOT NULL DEFAULT 0,
    evolution_stage SMALLINT NOT NULL DEFAULT 0,
    hp              INTEGER NOT NULL DEFAULT 0,
    max_hp          INTEGER NOT NULL DEFAULT 0,
    mp              INTEGER NOT NULL DEFAULT 0,
    max_mp          INTEGER NOT NULL DEFAULT 0,
    attack          INTEGER NOT NULL DEFAULT 0,
    defense         INTEGER NOT NULL DEFAULT 0,
    recovery        INTEGER NOT NULL DEFAULT 0,
    speed           INTEGER NOT NULL DEFAULT 0,
    crit_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
    evasion_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_in_party     BOOLEAN NOT NULL DEFAULT FALSE,
    party_slot      SMALLINT CHECK (party_slot BETWEEN 1 AND 3),  -- 連れ歩き時のスロット 1〜3（nullable）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_monsters_user_id ON player_monsters(user_id);

-- ======================
-- player_items : 所持アイテム
-- ======================
CREATE TABLE IF NOT EXISTS player_items (
    id         SERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    INTEGER NOT NULL REFERENCES items(id),
    quantity   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_player_items_user_id ON player_items(user_id);

-- ======================
-- dungeon_progress : ダンジョン進行状況
-- ======================
CREATE TABLE IF NOT EXISTS dungeon_progress (
    id            SERIAL PRIMARY KEY,
    character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    dungeon_id    INTEGER NOT NULL REFERENCES dungeons(id),
    current_floor SMALLINT NOT NULL DEFAULT 1,
    is_cleared    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (character_id, dungeon_id)
);
CREATE INDEX IF NOT EXISTS idx_dungeon_progress_character_id ON dungeon_progress(character_id);
