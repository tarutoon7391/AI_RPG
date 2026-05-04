-- 001_create_master_tables.sql
-- マスターデータ系テーブルの作成
-- monsters / jobs / skills / dungeons / items / status_effects

-- 属性は 'fire'(火) / 'water'(水) / 'wood'(木) / 'light'(光) / 'dark'(闇) / 'none'(無) の6種
-- 属性相性: 火→木に1.5倍・水に0.5倍 / 水→火に1.5倍・木に0.5倍 / 木→水に1.5倍・火に0.5倍
--          光→闇に1.5倍（相互） / 無→等倍（1.0倍）

-- ======================
-- monsters : モンスター種族定義
-- ======================
CREATE TABLE IF NOT EXISTS monsters (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    base_element        TEXT NOT NULL DEFAULT 'none', -- fire/water/wood/light/dark/none
    base_hp             INTEGER NOT NULL DEFAULT 0,
    base_attack         INTEGER NOT NULL DEFAULT 0,
    base_defense        INTEGER NOT NULL DEFAULT 0,
    base_recovery       INTEGER NOT NULL DEFAULT 0,
    base_speed          INTEGER NOT NULL DEFAULT 0,
    base_max_mp         INTEGER NOT NULL DEFAULT 0,
    crit_rate           NUMERIC(5,2) NOT NULL DEFAULT 0,    -- 会心率（%）
    evasion_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,    -- 回避率（%）
    capture_base_rate   INTEGER NOT NULL DEFAULT 30,        -- 仲間化ベース確率（%）
    max_evolution_stage SMALLINT NOT NULL DEFAULT 0,        -- 最大進化段階
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- jobs : 職業定義
-- ======================
CREATE TABLE IF NOT EXISTS jobs (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    tier        TEXT NOT NULL,   -- beginner（初級）/ advanced（上級）/ special（特級）
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- skills : スキル定義
-- ======================
CREATE TABLE IF NOT EXISTS skills (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    element         TEXT NOT NULL DEFAULT 'none',   -- fire/water/wood/light/dark/none
    skill_type      TEXT NOT NULL,                  -- physical/magical/heal/buff/debuff/status
    power           INTEGER NOT NULL DEFAULT 0,
    mp_cost         INTEGER NOT NULL DEFAULT 0,
    target          TEXT NOT NULL,                  -- single/all/self/ally_single/ally_all
    effect_type     TEXT,                           -- 状態異常種別など（nullable）
    effect_value    INTEGER,                        -- 効果値（nullable）
    effect_duration SMALLINT,                       -- 効果ターン数（nullable）
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- dungeons : ダンジョン定義
-- ======================
CREATE TABLE IF NOT EXISTS dungeons (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    dungeon_type TEXT NOT NULL,   -- main/element/event
    element      TEXT,            -- 属性ダンジョンの場合の属性（nullable）
    floor_count  SMALLINT NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- items : アイテム定義
-- ======================
CREATE TABLE IF NOT EXISTS items (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    item_type   TEXT NOT NULL,       -- hp_recovery/mp_recovery/revive/status_cure/buff/box_expansion
    effect_value INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    price       INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- status_effects : 状態異常定義
-- ======================
CREATE TABLE IF NOT EXISTS status_effects (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    effect_type    TEXT NOT NULL,
    duration_turns SMALLINT NOT NULL DEFAULT 1,
    stackable      BOOLEAN NOT NULL DEFAULT FALSE,
    description    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
