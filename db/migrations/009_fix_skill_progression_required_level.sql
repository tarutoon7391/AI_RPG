-- 009_fix_skill_progression_required_level.sql
-- 職業スキルの必要レベルと、キャラクターごとの習得済みスキル管理を追加する

-- ======================
-- job_skills.required_level の追加と補完
-- ======================
ALTER TABLE job_skills
  ADD COLUMN IF NOT EXISTS required_level SMALLINT;

UPDATE job_skills js
SET required_level = jsl.required_level
FROM job_skill_learns jsl
-- job_skill_learns は 008_insert_beginner_job_skills.sql で作成済みを前提とする
WHERE js.job_id = jsl.job_id
  AND js.skill_id = jsl.skill_id
  AND (js.required_level IS NULL OR js.required_level <> jsl.required_level);

UPDATE job_skills
SET required_level = 1
WHERE required_level IS NULL;

ALTER TABLE job_skills
  ALTER COLUMN required_level SET DEFAULT 1;

ALTER TABLE job_skills
  ALTER COLUMN required_level SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_skills_job_required_level
  ON job_skills(job_id, required_level, skill_id);

-- ======================
-- character_job_skills : キャラクター職業ごとの習得済みスキル
-- ======================
CREATE TABLE IF NOT EXISTS character_job_skills (
    id           SERIAL PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id     INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    learned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (character_id, job_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_character_job_skills_character_job
  ON character_job_skills(character_id, job_id);

-- 既存キャラクターの現在レベルに応じて習得済みスキルを補完
INSERT INTO character_job_skills (character_id, job_id, skill_id)
SELECT cj.character_id, cj.job_id, js.skill_id
FROM character_jobs cj
INNER JOIN job_skills js
  ON js.job_id = cj.job_id
 AND js.required_level <= COALESCE(cj.level, 1)
ON CONFLICT (character_id, job_id, skill_id) DO NOTHING;
