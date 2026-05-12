// Socket.io イベントハンドラ
//
// 受け口として用意しているイベント：
//   クライアント → サーバー
//     - room:create         : 部屋作成リクエスト
//     - room:join           : 部屋参加リクエスト
//     - room:leave          : 部屋退出リクエスト
//     - battle:startRequest : バトル開始リクエスト（シングルプレイ）
//     - battle:action       : バトル中の行動送信
//     - battle:sync         : 再接続後のバトル状態同期リクエスト
//     - battle:ready        : バトル準備完了通知
//
//   サーバー → クライアント
//     - room:updated        : 部屋情報の更新
//     - battle:start        : バトル開始
//     - battle:turn         : ターン進行通知
//     - battle:end          : バトル終了
//     - battle:syncResult   : battle:sync の応答（バトル状態の存在確認）
//     - player:joined       : プレイヤー参加通知
//     - player:left         : プレイヤー退出通知

const db = require('../db');
const {
  processTurn,
  getBattleState,
  calculateRewards,
  isEnemyActingFirst,
} = require('../battle/engine');
const {
  ensureLearnedSkillsUpToLevel,
  fetchLearnedSkills,
  syncJobProgress,
} = require('../services/skillProgression');

// userId → battleState のインメモリストア（ソケット再接続後もバトル状態を保持するために userId をキーとして使用）
const activeBattles = new Map();
// userId → ダンジョン進行状態
const activeDungeonRuns = new Map();

// バトル終了通知の遅延（ms）
const BATTLE_END_DELAY = 300;
const BEGINNER_MEADOW_ENCOUNTER_TOTAL = 5;
const BEGINNER_MEADOW_BOSS_MONSTER_ID = 6;
const BEGINNER_MEADOW_NORMAL_MONSTER_IDS = [1, 2, 3, 4, 5];
let monsterInstanceCounter = 0;

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

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
        statGrowth: progress.statGrowth || null,
        permanentBonusGained: (progress.statGrowth && progress.statGrowth.permanentBonusGained) || null,
      };

      // レベルアップ時はHP・MPが applyLevelGrowthToCharacter 内で全回復済み
      // 戦闘終了時（勝利・逃走問わず）に必ずHPを最大値まで全回復してからロビーに戻る
      await client.query(
        `UPDATE characters
         SET hp = max_hp, mp = max_mp, updated_at = NOW()
         WHERE id = $1`,
        [char.id]
      );
    } else {
      // 職業なしの場合も戦闘終了時はHP全回復
      await client.query(
        `UPDATE characters
         SET hp = max_hp, mp = max_mp, updated_at = NOW()
         WHERE id = $1`,
        [char.id]
      );
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
async function fetchMonsterWithSkills(monsterId) {
  const result = await db.query('SELECT * FROM monsters WHERE id = $1 LIMIT 1', [monsterId]);
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
  return monster;
}

function createMonsterInstance(baseMonster, floor, instanceSuffix) {
  if (!baseMonster) return null;
  const monster = JSON.parse(JSON.stringify(baseMonster));
  const mult = Math.pow(1.1, (floor || 1) - 1);
  // id はマスターモンスタIDを維持し、instance_id を戦闘中の個体識別子として使う
  monster.instance_id = `${baseMonster.id}:${instanceSuffix}`;
  monster.hp = Math.ceil(monster.base_hp * mult);
  monster.max_hp = monster.hp;
  monster.mp = monster.base_max_mp;
  monster.max_mp = monster.base_max_mp;
  monster.attack = Math.ceil(monster.base_attack * mult);
  monster.defense = Math.ceil(monster.base_defense * mult);
  monster.speed = Math.ceil(monster.base_speed * mult);
  monster.crit_rate = parseFloat(monster.crit_rate) || 0;
  monster.evasion_rate = parseFloat(monster.evasion_rate) || 0;
  monster.element = monster.base_element;
  monster.buffs = [];
  monster.statusEffects = [];
  monster.turnCount = 0;
  monster.escaped = false;
  monster.aiState = { specialCooldown: 3 };
  return monster;
}

function randomFrom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function nextInstanceSuffix(prefix) {
  monsterInstanceCounter += 1;
  return `${prefix}-${monsterInstanceCounter}`;
}

function toLabelSuffix(index) {
  let n = Math.max(0, Number(index) || 0);
  let result = '';
  do {
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

function toUpperAlphabetLabel(index) {
  let n = Math.max(0, Number(index) || 0);
  let result = '';
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

function buildMonsterNameMap(monsters) {
  const grouped = {};
  (monsters || []).forEach((monster) => {
    if (!monster || !monster.name) return;
    grouped[monster.name] = grouped[monster.name] || [];
    grouped[monster.name].push(monster);
  });
  const nameMap = new Map();
  Object.entries(grouped).forEach(([name, list]) => {
    if (list.length <= 1) {
      nameMap.set(String(list[0].instance_id || list[0].id), name);
      return;
    }
    list.forEach((monster, idx) => {
      nameMap.set(String(monster.instance_id || monster.id), `${name}${toUpperAlphabetLabel(idx)}`);
    });
  });
  return nameMap;
}

function formatMonsterNames(monsters) {
  const nameMap = buildMonsterNameMap(monsters);
  return (monsters || [])
    .filter(Boolean)
    .map((monster) => nameMap.get(String(monster.instance_id || monster.id)) || monster.name)
    .filter(Boolean);
}

async function pickMonster(dungeonId, floor, options = {}) {
  const isBeginnerMeadow = Number(dungeonId) === 1;
  const excludedMonsterIds = Array.isArray(options.excludedMonsterIds) ? options.excludedMonsterIds : [];
  if (isBeginnerMeadow) {
    const candidates = BEGINNER_MEADOW_NORMAL_MONSTER_IDS.filter(
      (id) => !excludedMonsterIds.includes(id)
    );
    const pickedMonsterId = randomFrom(candidates);
    if (!pickedMonsterId) return null;
    const baseMonster = await fetchMonsterWithSkills(pickedMonsterId);
    return createMonsterInstance(baseMonster, floor, nextInstanceSuffix('single'));
  }
  const result = await db.query('SELECT id FROM monsters ORDER BY RANDOM() LIMIT 1');
  if (result.rowCount === 0) return null;
  const baseMonster = await fetchMonsterWithSkills(result.rows[0].id);
  return createMonsterInstance(baseMonster, floor, nextInstanceSuffix('single'));
}

async function buildBeginnerMeadowEncounter(encounterIndex) {
  const idx = Number(encounterIndex) || 0;
  if (idx === 0) {
    const slime = await fetchMonsterWithSkills(1);
    return [createMonsterInstance(slime, 1, 'e1-a')].filter(Boolean);
  }
  if (idx === 1) {
    const monster = await pickMonster(1, 1, { excludedMonsterIds: [BEGINNER_MEADOW_BOSS_MONSTER_ID] });
    return monster ? [monster] : [];
  }
  if (idx === 2 || idx === 3) {
    const firstId = randomFrom(BEGINNER_MEADOW_NORMAL_MONSTER_IDS);
    const secondId = randomFrom(BEGINNER_MEADOW_NORMAL_MONSTER_IDS);
    const bases = await Promise.all([
      fetchMonsterWithSkills(firstId),
      fetchMonsterWithSkills(secondId),
    ]);
    return bases
      .map((base, i) => createMonsterInstance(base, 1, `e${idx + 1}-${toLabelSuffix(i)}`))
      .filter(Boolean);
  }
  const king = await fetchMonsterWithSkills(BEGINNER_MEADOW_BOSS_MONSTER_ID);
  return [createMonsterInstance(king, 1, 'e5-a')].filter(Boolean);
}

async function buildEncounterMonsters(dungeonId, encounterIndex, floor) {
  if (Number(dungeonId) === 1) {
    return buildBeginnerMeadowEncounter(encounterIndex);
  }
  const monster = await pickMonster(dungeonId, floor || 1);
  return monster ? [monster] : [];
}

function createBattleState({ dungeonId, floor, character, monsters, encounterIndex }) {
  return {
    turn: 1,
    dungeonId,
    floor,
    encounterIndex: encounterIndex || 0,
    encounterTotal: Number(dungeonId) === 1 ? BEGINNER_MEADOW_ENCOUNTER_TOTAL : 1,
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
    monsters,
  };
}

function getBattleEndMessage(result) {
  if (result === 'win') return '勝利！';
  if (result === 'lose') return '敗北...';
  if (result === 'escape') return '逃走した！';
  if (result === 'enemy_escape') return '逃げられた';
  return '戦闘終了';
}

function buildBattleVictoryMessage(monsters, rewards) {
  const defeatedMonsters = (monsters || [])
    .filter((m) => m && m.hp <= 0 && !m.escaped);
  const names = formatMonsterNames(defeatedMonsters);
  const enemyLabel = names.length ? names.join('、') : '敵';
  return `${enemyLabel} を倒した！ 経験値 ${rewards.exp} 獲得！ ${rewards.money}G 獲得！`;
}

async function finalizeBattleResult({
  socket,
  userId,
  battleState,
  result,
}) {
  const rewards = result === 'win'
    ? calculateRewards(battleState.monsters, battleState.floor)
    : { exp: 0, money: 0 };

  let rewardResult = null;
  if (result === 'win' && userId && (rewards.exp > 0 || rewards.money > 0)) {
    try {
      rewardResult = await applyBattleRewards(userId, rewards);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[socket] 報酬更新エラー:', err);
    }
  }

  // 戦闘終了時（勝利・逃走・敗北問わず）にHPを最大値まで全回復する
  // ※ applyBattleRewards（勝利でレポート付き）の中で既にHP回復している場合はスキップしても問題なし
  if (userId && !rewardResult) {
    try {
      await db.query(
        `UPDATE characters SET hp = max_hp, mp = max_mp, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[socket] HP全回復エラー:', err);
    }
  }

  const runState = activeDungeonRuns.get(userId);
  const baseRun = runState || {
    dungeonId: battleState.dungeonId,
    floor: battleState.floor,
    encounterIndex: battleState.encounterIndex || 0,
    encounterTotal: battleState.encounterTotal || 1,
    totalExp: 0,
    totalMoney: 0,
  };
  if (result === 'win') {
    baseRun.totalExp = (Number(baseRun.totalExp) || 0) + rewards.exp;
    baseRun.totalMoney = (Number(baseRun.totalMoney) || 0) + rewards.money;
    activeDungeonRuns.set(userId, baseRun);
  }

  const shouldAdvanceEncounter = result === 'win'
    && baseRun
    && Number(baseRun.dungeonId) === 1
    && baseRun.encounterIndex + 1 < BEGINNER_MEADOW_ENCOUNTER_TOTAL;

  if (shouldAdvanceEncounter) {
    const nextEncounterIndex = baseRun.encounterIndex + 1;
    const monsters = await buildEncounterMonsters(baseRun.dungeonId, nextEncounterIndex, baseRun.floor);
    if (!monsters.length) {
      activeBattles.delete(userId);
      activeDungeonRuns.delete(userId);
      socket.emit('battle:end', {
        result: 'win',
        rewards,
        cumulativeRewards: { exp: baseRun.totalExp, money: baseRun.totalMoney },
        message: '次の戦闘生成に失敗したため終了しました',
        playerSkills: rewardResult && Array.isArray(rewardResult.skills)
          ? rewardResult.skills
          : battleState.player.skills || [],
        levelUp: rewardResult ? rewardResult.levelUp : null,
        reachedEncounter: nextEncounterIndex,
      });
      return;
    }

    const refreshedCharacter = await loadCharacter(userId);
    if (refreshedCharacter) {
      battleState.player.skills = refreshedCharacter.skills || battleState.player.skills;
    }
    // 次の戦闘用にキャラクター情報を最新化（レベルアップ後のステータスを反映）
    // ターン状態（バフ・状態異常）は新しい戦闘でリセットする
    const nextCharacter = refreshedCharacter || battleState.player;
    const nextBattleState = createBattleState({
      dungeonId: baseRun.dungeonId,
      floor: baseRun.floor,
      encounterIndex: nextEncounterIndex,
      monsters,
      character: {
        ...nextCharacter,
        id: nextCharacter.id || battleState.player.id,
        name: nextCharacter.name || battleState.player.name,
        // applyBattleRewards でHP/MPは既に全回復済みのためDBから取得したmax値を使う
        hp: toInt(nextCharacter.max_hp || battleState.player.max_hp),
        max_hp: toInt(nextCharacter.max_hp || battleState.player.max_hp),
        mp: toInt(nextCharacter.max_mp || battleState.player.max_mp),
        max_mp: toInt(nextCharacter.max_mp || battleState.player.max_mp),
        skills: nextCharacter.skills || battleState.player.skills,
      },
    });
    // バフ・状態異常は新しい戦闘でリセット（ターン状態の引き継ぎを防ぐ）
    nextBattleState.player.buffs = [];
    nextBattleState.player.statusEffects = [];
    activeBattles.set(userId, nextBattleState);
    activeDungeonRuns.set(userId, {
      ...baseRun,
      encounterIndex: nextEncounterIndex,
    });

    const playerActsFirst = !isEnemyActingFirst(nextBattleState);
    socket.emit('battle:start', {
      turn: nextBattleState.turn,
      state: getBattleState(nextBattleState),
      playerSkills: nextBattleState.player.skills || [],
      previousVictoryLog: buildBattleVictoryMessage(battleState.monsters, rewards),
      message: `第${nextEncounterIndex + 1}戦/${BEGINNER_MEADOW_ENCOUNTER_TOTAL}：${formatMonsterNames(monsters).join('、')} が現れた！`,
      awaitingPlayerAction: playerActsFirst,
    });

    if (!playerActsFirst) {
      const enemyOpening = processTurn(nextBattleState, null, { mode: 'enemy_only' });
      socket.emit('battle:turn', {
        turn: nextBattleState.turn,
        actions: enemyOpening.actions,
        state: enemyOpening.state,
        awaitingPlayerAction: !enemyOpening.battleOver,
      });
      if (enemyOpening.battleOver) {
        await finalizeBattleResult({
          socket,
          userId,
          battleState: nextBattleState,
          result: enemyOpening.result,
        });
      }
    }
    return;
  }

  activeBattles.delete(userId);
  activeDungeonRuns.delete(userId);
  const endPayload = {
    result,
    rewards,
    cumulativeRewards: {
      exp: Number(baseRun.totalExp) || 0,
      money: Number(baseRun.totalMoney) || 0,
    },
    reachedEncounter: (Number(baseRun.encounterIndex) || 0) + 1,
    message: result === 'win' && Number(baseRun.dungeonId) === 1
      ? 'はじまりの草原を踏破した！'
      : getBattleEndMessage(result),
    playerSkills: rewardResult && Array.isArray(rewardResult.skills)
      ? rewardResult.skills
      : battleState.player.skills || [],
    levelUp: rewardResult ? rewardResult.levelUp : null,
    victoryMessage: result === 'win' ? buildBattleVictoryMessage(battleState.monsters, rewards) : null,
  };

  if (result === 'escape') {
    socket.emit('battle:end', endPayload);
  } else {
    setTimeout(() => {
      socket.emit('battle:end', endPayload);
    }, BATTLE_END_DELAY);
  }
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
        const safeDungeonId = Number(dungeonId) || 1;
        const safeFloor = Number(floor) || 1;
        const character = await loadCharacter(userId);
        if (!character) {
          socket.emit('battle:error', { message: 'キャラクターが見つかりません' });
          return;
        }

        const encounterIndex = 0;
        const monsters = await buildEncounterMonsters(safeDungeonId, encounterIndex, safeFloor);
        if (!monsters.length) {
          socket.emit('battle:error', { message: 'モンスターデータが見つかりません' });
          return;
        }

        const battleState = createBattleState({
          dungeonId: safeDungeonId,
          floor: safeFloor,
          character,
          monsters,
          encounterIndex,
        });
        // 新しい戦闘開始時はターン状態をリセットしてから素早さ比較を行う
        battleState.player.buffs = [];
        battleState.player.statusEffects = [];

        activeBattles.set(userId, battleState);
        activeDungeonRuns.set(userId, {
          dungeonId: safeDungeonId,
          floor: safeFloor,
          encounterIndex,
          encounterTotal: battleState.encounterTotal,
          totalExp: 0,
          totalMoney: 0,
        });

        const playerActsFirst = !isEnemyActingFirst(battleState);
        socket.emit('battle:start', {
          turn: battleState.turn,
          state: getBattleState(battleState),
          playerSkills: character.skills,
          message: Number(safeDungeonId) === 1
            ? `第1戦/${BEGINNER_MEADOW_ENCOUNTER_TOTAL}：${formatMonsterNames(monsters).join('、')} が現れた！`
            : `${formatMonsterNames(monsters).join('、')} が現れた！`,
          awaitingPlayerAction: playerActsFirst,
        });

        if (!playerActsFirst) {
          const enemyOpening = processTurn(battleState, null, { mode: 'enemy_only' });
          socket.emit('battle:turn', {
            turn: battleState.turn,
            actions: enemyOpening.actions,
            state: enemyOpening.state,
            awaitingPlayerAction: !enemyOpening.battleOver,
          });
          if (enemyOpening.battleOver) {
            await finalizeBattleResult({
              socket,
              userId,
              battleState,
              result: enemyOpening.result,
            });
          }
        }
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

      const battleState = activeBattles.get(userId);
      if (!battleState) {
        // バトル状態が存在しない場合はエラーを通知してボタンを復旧できるようにする
        socket.emit('battle:error', { message: 'バトルセッションが切れました。「冒険へ戻る」を押してください。' });
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
        targetId: payload.targetId
          || (battleState.monsters[0] && (battleState.monsters[0].instance_id || battleState.monsters[0].id)),
        skill,
      };

      const enemyFirst = isEnemyActingFirst(battleState);
      if (enemyFirst) {
        const playerResult = processTurn(battleState, playerAction, { mode: 'player_only' });
        socket.emit('battle:turn', {
          turn: battleState.turn,
          actions: playerResult.actions,
          state: playerResult.state,
          awaitingPlayerAction: false,
        });

        if (playerResult.battleOver) {
          await finalizeBattleResult({
            socket,
            userId,
            battleState,
            result: playerResult.result,
          });
          if (typeof ack === 'function') ack({ ok: true });
          return;
        }

        const enemyResult = processTurn(battleState, null, { mode: 'enemy_only' });
        socket.emit('battle:turn', {
          turn: battleState.turn,
          actions: enemyResult.actions,
          state: enemyResult.state,
          awaitingPlayerAction: !enemyResult.battleOver,
        });
        if (enemyResult.battleOver) {
          await finalizeBattleResult({
            socket,
            userId,
            battleState,
            result: enemyResult.result,
          });
        }
      } else {
        const turnResult = processTurn(battleState, playerAction);
        socket.emit('battle:turn', {
          turn: battleState.turn,
          actions: turnResult.actions,
          state: turnResult.state,
          awaitingPlayerAction: !turnResult.battleOver,
        });
        if (turnResult.battleOver) {
          await finalizeBattleResult({
            socket,
            userId,
            battleState,
            result: turnResult.result,
          });
        }
      }

      if (typeof ack === 'function') ack({ ok: true });
    });

    // ソケット再接続後のバトル状態同期リクエスト
    socket.on('battle:sync', (payload, ack) => {
      // eslint-disable-next-line no-console
      console.log('[socket] battle:sync userId=', userId);
      const currentBattle = activeBattles.get(userId);
      if (!currentBattle) {
        socket.emit('battle:syncResult', { exists: false });
      } else {
        socket.emit('battle:syncResult', { exists: true });
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
      // userId キーで管理しているためソケット切断時に即座に削除しない
      // （再接続時にバトル状態を引き継げるようにする）
      // eslint-disable-next-line no-console
      console.log(`[socket] 切断: socketId=${socket.id} userId=${userId || '匿名'} reason=${reason}`);
    });
  });
}

module.exports = registerSocketHandlers;
