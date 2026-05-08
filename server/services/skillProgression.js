function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function calcLevelFromExp(totalExp) {
  // レベル式: 累計職業EXPを100ごとに1レベル上昇（例: 0-99=>Lv1, 100-199=>Lv2）
  const safeExp = Math.max(0, toInt(totalExp, 0));
  return Math.max(1, Math.floor(safeExp / 100) + 1);
}

async function ensureLearnedSkillsUpToLevel(executor, characterId, jobId, level) {
  if (!characterId || !jobId) return [];
  const safeLevel = Math.max(1, toInt(level, 1));
  const insertResult = await executor.query(
    `WITH inserted AS (
       INSERT INTO character_job_skills (character_id, job_id, skill_id)
       SELECT $1, $2, js.skill_id
       FROM job_skills js
       WHERE js.job_id = $2
         AND js.required_level <= $3
       ON CONFLICT (character_id, job_id, skill_id) DO NOTHING
       RETURNING skill_id
     )
     SELECT s.*
     FROM inserted i
     INNER JOIN skills s ON s.id = i.skill_id
     ORDER BY s.id`,
    [characterId, jobId, safeLevel]
  );
  return insertResult.rows;
}

async function fetchLearnedSkills(executor, characterId, jobId) {
  if (!characterId || !jobId) return [];
  const result = await executor.query(
    `SELECT s.*
     FROM skills s
     INNER JOIN character_job_skills cjs
       ON cjs.skill_id = s.id
      AND cjs.character_id = $1
      AND cjs.job_id = $2
     INNER JOIN job_skills js
       ON js.job_id = cjs.job_id
      AND js.skill_id = cjs.skill_id
     ORDER BY js.required_level ASC, s.id ASC`,
    [characterId, jobId]
  );
  return result.rows;
}

async function syncJobProgress(executor, { characterId, jobId, gainedExp = 0 }) {
  if (!characterId || !jobId) {
    return {
      levelBefore: 1,
      levelAfter: 1,
      expAfter: 0,
      newlyLearnedSkills: [],
    };
  }

  await executor.query(
    `INSERT INTO character_jobs (character_id, job_id, level, exp)
     VALUES ($1, $2, 1, 0)
     ON CONFLICT (character_id, job_id) DO NOTHING`,
    [characterId, jobId]
  );

  const progressResult = await executor.query(
    `SELECT level, exp
     FROM character_jobs
     WHERE character_id = $1
       AND job_id = $2
     LIMIT 1`,
    [characterId, jobId]
  );

  const current = progressResult.rows[0] || { level: 1, exp: 0 };
  const currentExp = Math.max(0, toInt(current.exp, 0));
  const gain = Math.max(0, toInt(gainedExp, 0));
  const nextExp = currentExp + gain;
  const levelBefore = Math.max(1, toInt(current.level, 1));
  const levelAfter = calcLevelFromExp(nextExp);

  await executor.query(
    `UPDATE character_jobs
     SET exp = $3, level = $4
     WHERE character_id = $1
       AND job_id = $2`,
    [characterId, jobId, nextExp, levelAfter]
  );

  const newlyLearnedSkills = await ensureLearnedSkillsUpToLevel(
    executor,
    characterId,
    jobId,
    levelAfter
  );

  return {
    levelBefore,
    levelAfter,
    expAfter: nextExp,
    newlyLearnedSkills,
  };
}

module.exports = {
  calcLevelFromExp,
  ensureLearnedSkillsUpToLevel,
  fetchLearnedSkills,
  syncJobProgress,
};
