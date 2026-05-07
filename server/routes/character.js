// キャラクター情報 API
// GET /api/character/me - ログイン中ユーザーのキャラクター情報（スキル含む）を返す

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function fetchSkillsByJobId(jobId) {
  if (!jobId) return [];
  const skillResult = await db.query(
    `SELECT s.* FROM skills s
     INNER JOIN job_skills js ON js.skill_id = s.id
     WHERE js.job_id = $1
     ORDER BY s.id`,
    [jobId]
  );
  return skillResult.rows;
}

// GET /api/character/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    // キャラクター本体
    const charResult = await db.query(
      `SELECT c.*, j.name AS job_name, cj.level AS job_level, u.username
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

    // スキル一覧（現在の職業のスキル）
    const skills = await fetchSkillsByJobId(char.current_job_id);

    return res.json({ character: char, skills });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[character.me] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// POST /api/character/job - 転職
router.post('/job', requireAuth, async (req, res) => {
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

    await client.query(
      `INSERT INTO character_jobs (character_id, job_id, level, exp)
       VALUES ($1, $2, 1, 0)
       ON CONFLICT (character_id, job_id) DO NOTHING`,
      [character.id, job.id]
    );

    await client.query('COMMIT');

    req.session.currentJobId = job.id;
    const skills = await fetchSkillsByJobId(job.id);

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

module.exports = router;
