// キャラクター情報 API
// GET /api/character/me - ログイン中ユーザーのキャラクター情報（スキル含む）を返す

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const {
  ensureLearnedSkillsUpToLevel,
  fetchLearnedSkills,
  syncJobProgress,
  applyJobChangeStats,
} = require('../services/skillProgression');
const {
  normalizeEquippedItems,
  calcEquipmentResourceAdjustment,
} = require('../services/equipmentStats');

const router = express.Router();
const DEFAULT_JOB_LEVEL = 1;
const characterJobRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (req) => `user:${req.session && req.session.userId ? req.session.userId : req.ip || 'unknown'}`,
});

async function fetchSkillsByCharacterJobId(characterId, jobId) {
  if (!characterId || !jobId) return [];
  return fetchLearnedSkills(db, characterId, jobId);
}

async function fetchJobLevelsByCharacterId(characterId) {
  if (!characterId) return {};
  const result = await db.query(
    `SELECT j.name AS job_name, cj.level AS job_level
     FROM character_jobs cj
     INNER JOIN jobs j ON j.id = cj.job_id
     WHERE cj.character_id = $1`,
    [characterId]
  );
  return result.rows.reduce((acc, row) => {
    if (!row || typeof row.job_name !== 'string') return acc;
    const level = Number(row.job_level);
    acc[row.job_name] = Number.isFinite(level) && level >= 0 ? Math.round(level) : DEFAULT_JOB_LEVEL;
    return acc;
  }, {});
}

// GET /api/character/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    // キャラクター本体
    const charResult = await db.query(
      `SELECT c.*, j.name AS job_name, cj.level AS job_level, COALESCE(cj.exp, 0) AS job_exp, u.username
       FROM characters c
       INNER JOIN users u ON u.id = c.user_id
       LEFT JOIN character_jobs cj ON cj.character_id = c.id AND cj.job_id = c.current_job_id
       LEFT JOIN jobs j ON j.id = c.current_job_id
       WHERE c.user_id = $1
       LIMIT 1`,
      [userId]
    );
    if (charResult.rowCount === 0) {
      return res.status(404).json({ error: 'キャラクターが見つかりません' });
    }
    const char = charResult.rows[0];
    if (!char.name || !char.name.trim()) {
      char.name = char.username;
    }
    // permanent_bonus が null の場合は空オブジェクトに正規化
    if (!char.permanent_bonus || typeof char.permanent_bonus !== 'object') {
      char.permanent_bonus = {};
    }
    char.equipped_items = normalizeEquippedItems(char.equipped_items);

    // スキル一覧（現在の職業のスキル）
    await ensureLearnedSkillsUpToLevel(
      db,
      char.id,
      char.current_job_id,
      char.job_level || 1
    );
    const skills = await fetchSkillsByCharacterJobId(char.id, char.current_job_id);
    const jobLevels = await fetchJobLevelsByCharacterId(char.id);

    return res.json({ character: char, skills, jobLevels });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[character.me] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// POST /api/character/job - 転職
router.post('/job', requireAuth, characterJobRateLimit, async (req, res) => {
  const { jobName } = req.body || {};
  if (typeof jobName !== 'string' || !jobName.trim()) {
    return res.status(400).json({ error: '職業名を指定してください' });
  }
  const trimmedJobName = jobName.trim();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const charResult = await client.query(
      `SELECT c.id, c.user_id
       FROM characters c
       WHERE c.user_id = $1
       LIMIT 1`,
      [req.session.userId]
    );
    if (charResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'キャラクターが見つかりません' });
    }
    const character = charResult.rows[0];

    const jobResult = await client.query(
      `SELECT id, name
       FROM jobs
       WHERE name = $1
       LIMIT 1`,
      [trimmedJobName]
    );
    if (jobResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '指定された職業が存在しません' });
    }
    const job = jobResult.rows[0];

    await client.query(
      `UPDATE characters
       SET current_job_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [job.id, character.id]
    );

    // 転職先職業のLv1基礎ステータス + 永続ボーナスでステータスをリセット
    await applyJobChangeStats(client, {
      characterId: character.id,
      jobId: job.id,
    });

    await syncJobProgress(client, {
      characterId: character.id,
      jobId: job.id,
      gainedExp: 0,
    });

    await client.query('COMMIT');

    req.session.currentJobId = job.id;
    await new Promise((resolve, reject) => {
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        return resolve();
      });
    });
    const skills = await fetchSkillsByCharacterJobId(character.id, job.id);

    return res.json({
      ok: true,
      currentJobId: job.id,
      currentJobName: job.name,
      skills,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // no-op
    }
    // eslint-disable-next-line no-console
    console.error('[character.job] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  } finally {
    client.release();
  }
});

// POST /api/character/equipment - 装備状態保存
router.post('/equipment', requireAuth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const requestedEquipment = normalizeEquippedItems(payload.equipment);

    const currentResult = await client.query(
      `SELECT id, hp, max_hp, mp, max_mp, equipped_items
       FROM characters
       WHERE user_id = $1
       LIMIT 1
       FOR UPDATE`,
      [req.session.userId]
    );
    if (currentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'キャラクターが見つかりません' });
    }

    const currentCharacter = currentResult.rows[0];
    const adjusted = calcEquipmentResourceAdjustment(currentCharacter, requestedEquipment);
    const result = await client.query(
      `UPDATE characters
       SET equipped_items = $2::jsonb,
           hp = $3,
           mp = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING equipped_items, hp, max_hp, mp, max_mp`,
      [
        currentCharacter.id,
        JSON.stringify(adjusted.nextEquippedItems),
        adjusted.nextStoredHp,
        adjusted.nextStoredMp,
      ]
    );
    await client.query('COMMIT');

    return res.json({
      ok: true,
      equipment: normalizeEquippedItems(result.rows[0].equipped_items),
      resources: {
        hp: adjusted.nextEffectiveHp,
        maxHp: adjusted.nextEffectiveMaxHp,
        mp: adjusted.nextEffectiveMp,
        maxMp: adjusted.nextEffectiveMaxMp,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // no-op
    }
    // eslint-disable-next-line no-console
    console.error('[character.equipment] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  } finally {
    client.release();
  }
});

module.exports = router;
