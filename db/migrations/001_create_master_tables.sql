-- 001_create_master_tables.sql
-- マスターデータ系テーブルの作成
-- monsters / jobs / skills / dungeons / items / status_effects

-- 属性は 'fire'(火) / 'water'(水) / 'wood'(木) / 'light'(光) / 'dark'(闇) / 'none'(無) の6種
-- 文字列で管理し、アプリ側でバリデーションする

-- ======================
-- jobs : 職業定義
-- ======================
CREATE TABLE IF NOT EXISTS jobs (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,         -- 例: 'warrior', 'mage'
    name            TEXT NOT NULL,                -- 表示名（日本語）
    tier            SMALLINT NOT NULL,            -- 1=初級, 2=上級, 3=特級
    category        TEXT,                         -- 上級職の分類: 'cross' / 'element' / 'pure'
    description     TEXT,
    -- 上級職以上の解放条件（必要な前提職と必要レベル等を JSON で保持）
    unlock_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- レベルアップごとの成長テーブル
    growth_table    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- skills : スキル定義
-- ======================
CREATE TABLE IF NOT EXISTS skills (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    element         TEXT NOT NULL DEFAULT 'none', -- スキル属性
    category        TEXT NOT NULL,                -- 'attack_physical' / 'attack_magic' / 'heal' / 'buff' / 'debuff' / 'status' など
    target_type     TEXT NOT NULL,                -- 'enemy_single' / 'enemy_all' / 'ally_single' / 'ally_all' / 'self' / 'random'
    power           INTEGER NOT NULL DEFAULT 0,   -- 基礎威力
    mp_cost         INTEGER NOT NULL DEFAULT 0,
    accuracy        INTEGER NOT NULL DEFAULT 100, -- 命中率（%）
    extra           JSONB NOT NULL DEFAULT '{}'::jsonb, -- 追加効果（状態異常付与等）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 職業ごとの習得スキル定義（職業10スキル等）
CREATE TABLE IF NOT EXISTS job_skills (
    id              SERIAL PRIMARY KEY,
    job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id        INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    slot            SMALLINT NOT NULL,            -- 1〜10 のスロット位置
    learn_level     SMALLINT NOT NULL,            -- 習得レベル
    UNIQUE (job_id, slot)
);

-- ======================
-- monsters : モンスター種族定義
-- ======================
CREATE TABLE IF NOT EXISTS monsters (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    element         TEXT NOT NULL DEFAULT 'none', -- 種族固有属性
    rarity          TEXT NOT NULL DEFAULT 'normal', -- 'normal' / 'rare' / 'boss'
    base_capture_rate INTEGER NOT NULL DEFAULT 30,   -- 仲間化ベース確率（%）
    base_stats      JSONB NOT NULL DEFAULT '{}'::jsonb, -- HP/攻撃/防御/回復/素早さ/MP/会心/回避 等
    growth_table    JSONB NOT NULL DEFAULT '{}'::jsonb, -- レベルアップ時の上昇値
    skills          JSONB NOT NULL DEFAULT '[]'::jsonb, -- Lv10/20/30/40/50 で習得するスキル定義
    evolutions      JSONB NOT NULL DEFAULT '[]'::jsonb, -- 進化段階・条件・ステ/スキル変化
    permanent_buff  JSONB NOT NULL DEFAULT '{}'::jsonb, -- 所持中に発動する永続バフ
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- items : アイテム定義
-- ======================
CREATE TABLE IF NOT EXISTS items (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    -- 種類: 'heal_hp' / 'heal_mp' / 'revive' / 'cure_status' / 'buff' / 'box_expand' 等
    category        TEXT NOT NULL,
    effect          JSONB NOT NULL DEFAULT '{}'::jsonb,
    price           INTEGER NOT NULL DEFAULT 0,
    sellable        BOOLEAN NOT NULL DEFAULT TRUE,
    usable_in_battle BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- dungeons : ダンジョン定義
-- ======================
CREATE TABLE IF NOT EXISTS dungeons (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    -- 種別: 'main' / 'element' / 'event'
    category        TEXT NOT NULL,
    element         TEXT,                         -- 属性ダンジョンの場合の属性
    floor_count     SMALLINT NOT NULL DEFAULT 1,
    encounter_table JSONB NOT NULL DEFAULT '[]'::jsonb, -- 出現モンスター一覧
    boss_monster_id INTEGER REFERENCES monsters(id),
    rewards         JSONB NOT NULL DEFAULT '{}'::jsonb,
    available_from  TIMESTAMPTZ,                  -- イベントダンジョン用
    available_to    TIMESTAMPTZ,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- status_effects : 状態異常定義
-- ======================
CREATE TABLE IF NOT EXISTS status_effects (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,         -- 'poison' / 'burn' / 'immobile' / 'confuse' / 'sleep' / 'paralysis' / 'curse'
    name            TEXT NOT NULL,
    description     TEXT,
    -- 重ねがけ規則 'reset_turn' / 'stack_power' / 'none'
    stack_rule      TEXT NOT NULL DEFAULT 'none',
    default_duration SMALLINT NOT NULL DEFAULT 1,
    extra           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
