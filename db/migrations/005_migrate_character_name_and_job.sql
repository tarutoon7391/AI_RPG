-- 005_migrate_character_name_and_job.sql
-- 旧データ互換: characters.name / current_job_id の欠損を補完する

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS current_job_id INTEGER;

UPDATE characters c
SET name = u.username
FROM users u
WHERE c.user_id = u.id
  AND (c.name IS NULL OR btrim(c.name) = '');

UPDATE characters
SET current_job_id = 1
WHERE current_job_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'characters_current_job_id_fkey'
  ) THEN
    ALTER TABLE characters
      ADD CONSTRAINT characters_current_job_id_fkey
      FOREIGN KEY (current_job_id) REFERENCES jobs(id);
  END IF;
END $$;

ALTER TABLE characters
  ALTER COLUMN current_job_id SET DEFAULT 1;

INSERT INTO character_jobs (character_id, job_id, level, exp)
SELECT c.id, c.current_job_id, 1, 0
FROM characters c
WHERE c.current_job_id IS NOT NULL
ON CONFLICT (character_id, job_id) DO NOTHING;
