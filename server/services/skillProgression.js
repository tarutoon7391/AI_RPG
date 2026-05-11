const EXP_PER_LEVEL = 100;
const EMPTY_GROWTH = Object.freeze({
  hp: 0,
  mp: 0,
  attack: 0,
  defense: 0,
  recovery: 0,
  speed: 0,
  charm: 0,
});
const JOB_LEVEL_GROWTH_TABLE = Object.freeze({
  戦士: Object.freeze({ hp: 15, mp: 2, attack: 4, defense: 4, recovery: 1, speed: 2, charm: 1 }),
  魔法使い: Object.freeze({ hp: 8, mp: 8, attack: 5, defense: 2, recovery: 2, speed: 2, charm: 1 }),
  僧侶: Object.freeze({ hp: 10, mp: 6, attack: 2, defense: 3, recovery: 5, speed: 1, charm: 2 }),
  盗賊: Object.freeze({ hp: 10, mp: 3, attack: 3, defense: 2, recovery: 1, speed: 5, charm: 2 }),
  狩人: Object.freeze({ hp: 10, mp: 3, attack: 3, defense: 2, recovery: 1, speed: 4, charm: 3 }),
  格闘家: Object.freeze({ hp: 12, mp: 1, attack: 6, defense: 3, recovery: 1, speed: 3, charm: 1 }),
  まものつかい: Object.freeze({ hp: 10, mp: 4, attack: 3, defense: 2, recovery: 2, speed: 2, charm: 5 }),
});

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function calcLevelFromExp(totalExp) {
  // レベル式: 累計職業EXPを一定値ごとに1レベル上昇（例: 0-99=>Lv1, 100-199=>Lv2）
  const safeExp = Math.max(0, toInt(totalExp, 0));
  return Math.max(1, Math.floor(safeExp / EXP_PER_LEVEL) + 1);
}

function getGrowthByJobName(jobName) {
  if (typeof jobName !== 'string') return EMPTY_GROWTH;
  return JOB_LEVEL_GROWTH_TABLE[jobName] || EMPTY_GROWTH;
}

function multiplyGrowth(baseGrowth, levelsGained) {
  const lv = Math.max(0, toInt(levelsGained, 0));
  return {
    hp: toInt(baseGrowth.hp, 0) * lv,
    mp: toInt(baseGrowth.mp, 0) * lv,
    attack: toInt(baseGrowth.attack, 0) * lv,
    defense: toInt(baseGrowth.defense, 0) * lv,
    recovery: toInt(baseGrowth.recovery, 0) * lv,
    speed: toInt(baseGrowth.speed, 0) * lv,
    charm: toInt(baseGrowth.charm, 0) * lv,
  };
}

async function applyLevelGrowthToCharacter(executor, { characterId, jobId, levelsGained }) {
  const safeLevelsGained = Math.max(0, toInt(levelsGained, 0));
  if (!characterId || !jobId || safeLevelsGained <= 0) {
    return {
      levelsGained: safeLevelsGained,
      jobName: null,
      perLevel: EMPTY_GROWTH,
      total: EMPTY_GROWTH,
    };
  }

  const characterResult = await executor.query(
    `SELECT c.hp, c.max_hp, c.mp, c.max_mp, c.attack, c.defense, c.recovery, c.speed, c.charm, j.name AS job_name
     FROM characters c
     INNER JOIN jobs j ON j.id = $2
     WHERE c.id = $1
     LIMIT 1`,
    [characterId, jobId]
  );
  if (characterResult.rowCount === 0) {
    return {
      levelsGained: safeLevelsGained,
      jobName: null,
      perLevel: EMPTY_GROWTH,
      total: EMPTY_GROWTH,
    };
  }

  const character = characterResult.rows[0];
  const perLevelGrowth = getGrowthByJobName(character.job_name);
  const totalGrowth = multiplyGrowth(perLevelGrowth, safeLevelsGained);

  const nextMaxHp = Math.max(1, toInt(character.max_hp, 0) + totalGrowth.hp);
  const nextMaxMp = Math.max(0, toInt(character.max_mp, 0) + totalGrowth.mp);
  const nextHp = Math.max(0, Math.min(nextMaxHp, toInt(character.hp, 0) + totalGrowth.hp));
  const nextMp = Math.max(0, Math.min(nextMaxMp, toInt(character.mp, 0) + totalGrowth.mp));

  await executor.query(
    `UPDATE characters
     SET hp = $2,
         max_hp = $3,
         mp = $4,
         max_mp = $5,
         attack = $6,
         defense = $7,
         recovery = $8,
         speed = $9,
         charm = $10,
         updated_at = NOW()
     WHERE id = $1`,
    [
      characterId,
      nextHp,
      nextMaxHp,
      nextMp,
      nextMaxMp,
      Math.max(0, toInt(character.attack, 0) + totalGrowth.attack),
      Math.max(0, toInt(character.defense, 0) + totalGrowth.defense),
      Math.max(0, toInt(character.recovery, 0) + totalGrowth.recovery),
      Math.max(0, toInt(character.speed, 0) + totalGrowth.speed),
      Math.max(0, toInt(character.charm, 0) + totalGrowth.charm),
    ]
  );

  return {
    levelsGained: safeLevelsGained,
    jobName: character.job_name || null,
    perLevel: perLevelGrowth,
    total: totalGrowth,
  };
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
    // まず職業進行レコードの存在を保証し、その後のSELECT/UPDATEで現在値を確定させる
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
  const levelsGained = Math.max(0, levelAfter - levelBefore);

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
  const statGrowth = await applyLevelGrowthToCharacter(executor, {
    characterId,
    jobId,
    levelsGained,
  });

  return {
    levelBefore,
    levelAfter,
    expAfter: nextExp,
    newlyLearnedSkills,
    statGrowth,
  };
}

module.exports = {
  calcLevelFromExp,
  ensureLearnedSkillsUpToLevel,
  fetchLearnedSkills,
  syncJobProgress,
};
