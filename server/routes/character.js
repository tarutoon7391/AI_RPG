// キャラクター情報 API
// GET /api/character/me - ログイン中ユーザーのキャラクター情報（スキル含む）を返す

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/character/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    // キャラクター本体
    const charResult = await db.query(
      `SELECT c.*, j.name AS job_name, cj.level AS job_level
       FROM characters c
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

    // スキル一覧（現在の職業のスキル）
    let skills = [];
    if (char.current_job_id) {
      const skillResult = await db.query(
        `SELECT s.* FROM skills s
         INNER JOIN job_skills js ON js.skill_id = s.id
         WHERE js.job_id = $1
         ORDER BY s.id`,
        [char.current_job_id]
      );
      skills = skillResult.rows;
    }

    return res.json({ character: char, skills });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[character.me] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
