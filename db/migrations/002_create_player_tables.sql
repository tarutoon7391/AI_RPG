-- 002_create_player_tables.sql
-- プレイヤーデータ系テーブル
-- users / characters / character_jobs / player_monsters / player_items / dungeon_progress

-- ======================
-- users : アカウント情報
-- ======================
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    email           TEXT UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

-- ======================
-- characters : キャラクター情報
-- ======================
CREATE TABLE IF NOT EXISTS characters (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- プレイヤーのデフォルト属性は無
    element         TEXT NOT NULL DEFAULT 'none',
    -- 現在装備中の職業
    current_job_id  INTEGER REFERENCES jobs(id),
    -- 現在ステータス（ダンジョン内で継続するため保持）
    current_hp      INTEGER NOT NULL DEFAULT 0,
    current_mp      INTEGER NOT NULL DEFAULT 0,
    -- ステータス成長値（永続ボーナス含む）
    base_stats      JSONB NOT NULL DEFAULT '{}'::jsonb,
    charm           INTEGER NOT NULL DEFAULT 0,    -- 魅力度
    money           INTEGER NOT NULL DEFAULT 0,
    box_capacity    INTEGER NOT NULL DEFAULT 20,   -- ボックス上限（初期20、ショップで拡張）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);

-- ======================
-- character_jobs : 職業ごとのレベル・習得スキル
-- ======================
CREATE TABLE IF NOT EXISTS character_jobs (
    id              SERIAL PRIMARY KEY,
    character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level           SMALLINT NOT NULL DEFAULT 1,   -- 上限99
    exp             INTEGER NOT NULL DEFAULT 0,
    learned_skills  JSONB NOT NULL DEFAULT '[]'::jsonb, -- 習得済みスキルID配列
    unlocked        BOOLEAN NOT NULL DEFAULT TRUE, -- 上級職以上は解放条件を満たすと TRUE
    UNIQUE (character_id, job_id)
);

-- ======================
-- player_monsters : 所持モンスター個体
-- ======================
CREATE TABLE IF NOT EXISTS player_monsters (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monster_id      INTEGER NOT NULL REFERENCES monsters(id),
    nickname        TEXT,
    level           SMALLINT NOT NULL DEFAULT 1,   -- 上限99
    exp             INTEGER NOT NULL DEFAULT 0,
    evolution_stage SMALLINT NOT NULL DEFAULT 0,   -- 現在の進化段階
    current_hp      INTEGER NOT NULL DEFAULT 0,
    current_mp      INTEGER NOT NULL DEFAULT 0,
    stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
    learned_skills  JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 'box'(ボックス内) / 'party'(連れ歩き) / 'released'(逃がした)
    location        TEXT NOT NULL DEFAULT 'box',
    party_slot      SMALLINT,                      -- 連れ歩き時のスロット 1〜3
    obtained_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_monsters_user_id ON player_monsters(user_id);
CREATE INDEX IF NOT EXISTS idx_player_monsters_location ON player_monsters(user_id, location);

-- ======================
-- player_items : 所持アイテム
-- ======================
CREATE TABLE IF NOT EXISTS player_items (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id         INTEGER NOT NULL REFERENCES items(id),
    quantity        INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_player_items_user_id ON player_items(user_id);

-- ======================
-- dungeon_progress : ダンジョン進行状況
-- ======================
CREATE TABLE IF NOT EXISTS dungeon_progress (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dungeon_id      INTEGER NOT NULL REFERENCES dungeons(id),
    current_floor   SMALLINT NOT NULL DEFAULT 1,
    cleared         BOOLEAN NOT NULL DEFAULT FALSE,
    cleared_at      TIMESTAMPTZ,
    state           JSONB NOT NULL DEFAULT '{}'::jsonb, -- 現在位置・残HP/MP等の探索状態
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, dungeon_id)
);
CREATE INDEX IF NOT EXISTS idx_dungeon_progress_user_id ON dungeon_progress(user_id);
