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

// socketId → battleState のインメモリストア
const activeBattles = new Map();

/**
 * キャラクターとスキルをDBから読み込む
 */
async function loadCharacter(userId) {
  const charResult = await db.query(
    `SELECT c.* FROM characters c WHERE c.user_id = $1 LIMIT 1`,
    [userId]
  );
  if (charResult.rowCount === 0) return null;
  const char = charResult.rows[0];

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
  char.skills = skills;
  return char;
}

/**
 * ダンジョンのモンスターをランダムに選択してエンカウント用に準備する
 */
async function pickMonster(floor) {
  const result = await db.query('SELECT * FROM monsters ORDER BY RANDOM() LIMIT 1');
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

  return monster;
}

function getBattleEndMessage(result) {
  if (result === 'win')    return '勝利！';
  if (result === 'lose')   return '敗北...';
  if (result === 'escape') return '逃走した！';
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

        const monster = await pickMonster(floor || 1);
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
    socket.on('battle:action', (payload, ack) => {
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

        if (result === 'win' && userId && (rewards.exp > 0 || rewards.money > 0)) {
          db.query(
            `UPDATE characters SET exp = exp + $1, money = money + $2, updated_at = NOW()
             WHERE user_id = $3`,
            [rewards.exp, rewards.money, userId]
          ).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[socket] 報酬更新エラー:', err);
          });
        }

        setTimeout(() => {
          socket.emit('battle:end', { result, rewards, message: getBattleEndMessage(result) });
        }, 300);
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
