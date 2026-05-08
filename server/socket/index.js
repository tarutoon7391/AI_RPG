// Socket.io イベントハンドラ
//
// 受け口として用意しているイベント：
//   クライアント → サーバー
//     - room:create         : 部屋作成リクエスト
//     - room:join           : 部屋参加リクエスト
//     - room:leave          : 部屋退出リクエスト
//     - battle:startRequest : バトル開始リクエスト（シングルプレイ）
//     - battle:action       : バトル中の行動送信
//     - battle:ready        : バトル準備完了通知
//
//   サーバー → クライアント
//     - room:updated        : 部屋情報の更新
//     - battle:start        : バトル開始
//     - battle:turn         : ターン進行通知
//     - battle:end          : バトル終了
//     - player:joined       : プレイヤー参加通知
//     - player:left         : プレイヤー退出通知

const db = require('../db');
const { processTurn, getBattleState, calculateRewards } = require('../battle/engine');
const {
  ensureLearnedSkillsUpToLevel,
  fetchLearnedSkills,
  syncJobProgress,
} = require('../services/skillProgression');

// socketId → battleState のインメモリストア
const activeBattles = new Map();

// バトル終了通知の遅延（ms）
const BATTLE_END_DELAY = 300;

/**
 * キャラクターとスキルをDBから読み込む
 */
async function loadCharacter(userId) {
  const charResult = await db.query(
    `SELECT c.*, u.username, COALESCE(cj.level, 1) AS job_level
     FROM characters c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN character_jobs cj ON cj.character_id = c.id AND cj.job_id = c.current_job_id
     WHERE c.user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (charResult.rowCount === 0) return null;
  const char = charResult.rows[0];
  if (!char.name || !char.name.trim()) {
    char.name = char.username;
  }

  let skills = [];
  if (char.current_job_id) {
    const progress = await syncJobProgress(db, {
      characterId: char.id,
      jobId: char.current_job_id,
      gainedExp: 0,
    });
    await ensureLearnedSkillsUpToLevel(
      db,
      char.id,
      char.current_job_id,
      progress.levelAfter || char.job_level || 1
    );
    skills = await fetchLearnedSkills(db, char.id, char.current_job_id);
    char.job_level = progress.levelAfter || char.job_level || 1;
  }
  char.skills = skills;
  return char;
}

async function applyBattleRewards(userId, rewards) {
  if (!userId || !rewards || (rewards.exp <= 0 && rewards.money <= 0)) {
    return null;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const charResult = await client.query(
      `SELECT id, current_job_id
       FROM characters
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (charResult.rowCount === 0) {
      await client.query('COMMIT');
      return null;
    }

    const char = charResult.rows[0];

    await client.query(
      `UPDATE characters
       SET exp = exp + $1, money = money + $2, updated_at = NOW()
       WHERE id = $3`,
      [rewards.exp, rewards.money, char.id]
    );

    let levelUp = null;
    let skills = [];
    if (char.current_job_id) {
      const progress = await syncJobProgress(client, {
        characterId: char.id,
        jobId: char.current_job_id,
        gainedExp: rewards.exp,
      });
      skills = await fetchLearnedSkills(client, char.id, char.current_job_id);
      levelUp = {
        levelBefore: progress.levelBefore,
        levelAfter: progress.levelAfter,
        learnedSkillNames: (progress.newlyLearnedSkills || []).map((s) => s.name),
      };
    }

    await client.query('COMMIT');
    return { levelUp, skills };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // eslint-disable-next-line no-console
      console.error('[socket] 報酬更新ロールバックエラー:', rollbackError);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * ダンジョンのモンスターをランダムに選択してエンカウント用に準備する
 */
async function pickMonster(dungeonId, floor) {
  const isBeginnerMeadow = Number(dungeonId) === 1;
  const result = isBeginnerMeadow
    ? await db.query('SELECT * FROM monsters WHERE id BETWEEN 1 AND 6 ORDER BY RANDOM() LIMIT 1')
    : await db.query('SELECT * FROM monsters ORDER BY RANDOM() LIMIT 1');
  if (result.rowCount === 0) return null;
  const monster = result.rows[0];

  const skillResult = await db.query(
    `SELECT s.* FROM skills s
     INNER JOIN monster_skills ms ON ms.skill_id = s.id
     WHERE ms.monster_id = $1
     ORDER BY s.id`,
    [monster.id]
  );
  monster.skills = skillResult.rows;

  // フロアに応じてステータスを強化（10%/フロア）
  const mult = Math.pow(1.1, (floor || 1) - 1);
  monster.hp      = Math.ceil(monster.base_hp * mult);
  monster.max_hp  = monster.hp;
  monster.mp      = monster.base_max_mp;
  monster.max_mp  = monster.base_max_mp;
  monster.attack  = Math.ceil(monster.base_attack * mult);
  monster.defense = Math.ceil(monster.base_defense * mult);
  monster.speed   = Math.ceil(monster.base_speed * mult);
  monster.crit_rate    = parseFloat(monster.crit_rate) || 0;
  monster.evasion_rate = parseFloat(monster.evasion_rate) || 0;
  monster.element = monster.base_element;
  monster.buffs = [];
  monster.statusEffects = [];
  monster.turnCount = 0;
  monster.escaped = false;
  monster.aiState = { specialCooldown: 3 };

  return monster;
}

function getBattleEndMessage(result) {
  if (result === 'win') return '勝利！';
  if (result === 'lose') return '敗北...';
  if (result === 'escape') return '逃走した！';
  if (result === 'enemy_escape') return '逃げられた';
  return '戦闘終了';
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const session = socket.request.session;
    const userId = session && session.userId;
    // eslint-disable-next-line no-console
    console.log(`[socket] 接続: socketId=${socket.id} userId=${userId || '匿名'}`);

    // ===== 部屋関連 =====
    socket.on('room:create', (payload, ack) => {
      // eslint-disable-next-line no-console
      console.log('[socket] room:create', payload);
      if (typeof ack === 'function') {
        ack({ ok: true, roomId: null, message: '未実装：room:create を受信しました' });
      }
    });

    socket.on('room:join', (payload, ack) => {
      // eslint-disable-next-line no-console
      console.log('[socket] room:join', payload);
      if (payload && payload.roomId) {
        socket.join(`room:${payload.roomId}`);
        io.to(`room:${payload.roomId}`).emit('player:joined', {
          userId: userId || null,
          socketId: socket.id,
        });
        io.to(`room:${payload.roomId}`).emit('room:updated', {
          roomId: payload.roomId,
          message: '未実装：room:join 後の部屋情報更新',
        });
      }
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：room:join を受信しました' });
      }
    });

    socket.on('room:leave', (payload, ack) => {
      // eslint-disable-next-line no-console
      console.log('[socket] room:leave', payload);
      if (payload && payload.roomId) {
        socket.leave(`room:${payload.roomId}`);
        io.to(`room:${payload.roomId}`).emit('player:left', {
          userId: userId || null,
          socketId: socket.id,
        });
        io.to(`room:${payload.roomId}`).emit('room:updated', {
          roomId: payload.roomId,
          message: '未実装：room:leave 後の部屋情報更新',
        });
      }
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：room:leave を受信しました' });
      }
    });

    // ===== バトル関連 =====

    // バトル開始リクエスト（シングルプレイ）
    socket.on('battle:startRequest', async (payload) => {
      if (!userId) {
        socket.emit('battle:error', { message: 'ログインが必要です' });
        return;
      }
      try {
        const { dungeonId, floor } = payload || {};
        const character = await loadCharacter(userId);
        if (!character) {
          socket.emit('battle:error', { message: 'キャラクターが見つかりません' });
          return;
        }

        const monster = await pickMonster(dungeonId || 1, floor || 1);
        if (!monster) {
          socket.emit('battle:error', { message: 'モンスターデータが見つかりません' });
          return;
        }

        const battleState = {
          turn: 1,
          dungeonId: dungeonId || 1,
          floor: floor || 1,
          player: {
            id: character.id,
            name: character.name,
            hp: character.hp,
            max_hp: character.max_hp,
            mp: character.mp,
            max_mp: character.max_mp,
            attack: character.attack,
            defense: character.defense,
            speed: character.speed,
            crit_rate: parseFloat(character.crit_rate) || 0,
            evasion_rate: parseFloat(character.evasion_rate) || 0,
            element: character.element || 'none',
            skills: character.skills,
            buffs: [],
            statusEffects: [],
          },
          monsters: [monster],
        };

        activeBattles.set(socket.id, battleState);

        socket.emit('battle:start', {
          turn: battleState.turn,
          state: getBattleState(battleState),
          playerSkills: character.skills,
          message: `${monster.name} が現れた！`,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[socket] battle:startRequest エラー:', err);
        socket.emit('battle:error', { message: 'バトル開始に失敗しました' });
      }
    });

    // バトル行動処理
    socket.on('battle:action', async (payload, ack) => {
      // eslint-disable-next-line no-console
      console.log('[socket] battle:action', payload);

      const battleState = activeBattles.get(socket.id);
      if (!battleState) {
        if (typeof ack === 'function') ack({ ok: false, message: 'バトルが開始されていません' });
        return;
      }

      // スキル情報を解決
      let skill = null;
      if (payload.skillId != null) {
        skill = battleState.player.skills.find(
          (s) => String(s.id) === String(payload.skillId)
        );
      }
      if (!skill) {
        skill = { id: 0, name: '通常攻撃', element: 'none', skill_type: 'physical', power: 100, mp_cost: 0 };
      }

      const playerAction = {
        actionType: payload.actionType || 'attack',
        targetId: payload.targetId || (battleState.monsters[0] && battleState.monsters[0].id),
        skill,
      };

      const { actions, state, battleOver, result } = processTurn(battleState, playerAction);

      socket.emit('battle:turn', {
        turn: battleState.turn,
        actions,
        state,
      });

      if (battleOver) {
        const rewards = result === 'win'
          ? calculateRewards(battleState.monsters, battleState.floor)
          : { exp: 0, money: 0 };

        activeBattles.delete(socket.id);

        let rewardResult = null;
        if (result === 'win' && userId && (rewards.exp > 0 || rewards.money > 0)) {
          try {
            rewardResult = await applyBattleRewards(userId, rewards);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[socket] 報酬更新エラー:', err);
          }
        }

        const endPayload = {
          result,
          rewards,
          message: getBattleEndMessage(result),
          playerSkills: rewardResult && Array.isArray(rewardResult.skills)
            ? rewardResult.skills
            : battleState.player.skills || [],
          levelUp: rewardResult ? rewardResult.levelUp : null,
        };

        if (result === 'escape') {
          socket.emit('battle:end', endPayload);
        } else {
          setTimeout(() => {
            socket.emit('battle:end', endPayload);
          }, BATTLE_END_DELAY);
        }
      }

      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('battle:ready', (payload, ack) => {
      // eslint-disable-next-line no-console
      console.log('[socket] battle:ready', payload);
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：battle:ready を受信しました' });
      }
    });

    socket.on('disconnect', (reason) => {
      activeBattles.delete(socket.id);
      // eslint-disable-next-line no-console
      console.log(`[socket] 切断: socketId=${socket.id} reason=${reason}`);
    });
  });
}

module.exports = registerSocketHandlers;
