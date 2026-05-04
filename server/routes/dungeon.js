// ダンジョン情報 API
// GET  /api/dungeons        - ダンジョン一覧
// GET  /api/dungeons/:id    - ダンジョン詳細
// GET  /api/dungeons/:id/monsters - ダンジョンに出現するモンスター一覧（全モンスター）

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dungeons
router.get('/', requireAuth, async (_req, res) => {
  try {
    const result = await db.query('SELECT * FROM dungeons ORDER BY id');
    return res.json({ dungeons: result.rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dungeons.list] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// GET /api/dungeons/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM dungeons WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'ダンジョンが見つかりません' });
    }
    return res.json({ dungeon: result.rows[0] });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dungeons.get] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// GET /api/dungeons/:id/monsters - エンカウント候補モンスター（スキル付き）
router.get('/:id/monsters', requireAuth, async (_req, res) => {
  try {
    const monstersResult = await db.query('SELECT * FROM monsters ORDER BY id');
    const monsters = monstersResult.rows;

    // 各モンスターのスキルを取得
    for (const m of monsters) {
      const skillResult = await db.query(
        `SELECT s.* FROM skills s
         INNER JOIN monster_skills ms ON ms.skill_id = s.id
         WHERE ms.monster_id = $1
         ORDER BY s.id`,
        [m.id]
      );
      m.skills = skillResult.rows;
    }

    return res.json({ monsters });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dungeons.monsters] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
