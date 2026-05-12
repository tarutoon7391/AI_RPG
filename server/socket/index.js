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
  calculateMonsterReward,
  isEnemyActingFirst,
} = require('../battle/engine');
const {
  calcLevelFromExp,
  ensureLearnedSkillsUpToLevel,
  fetchLearnedSkills,
  syncJobProgress,
  JOB_LEVEL_GROWTH_TABLE,
} = require('../services/skillProgression');

// userId → battleState のインメモリストア（ソケット再接続後もバトル状態を保持するために userId をキーとして使用）
const activeBattles = new Map();
// userId → ダンジョン進行状態
const activeDungeonRuns = new Map();

// バトル終了通知の遅延（ms）
const BATTLE_END_DELAY = 300;
const BEGINNER_MEADOW_ENCOUNTER_TOTAL = 5;
const BEGINNER_MEADOW_BOSS_MONSTER_ID = 6;
const BEGINNER_MEADOW_METAL_SLIME_MONSTER_ID = 5;
const BEGINNER_MEADOW_METAL_SLIME_RATE = 5;
const BEGINNER_MEADOW_NORMAL_MONSTER_IDS = [1, 2, 3, 4, 5];
// 永続ボーナス付与のレベル間隔（Lv5, Lv10, ...）
const PERMANENT_BONUS_INTERVAL = 5;
let monsterInstanceCounter = 0;

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function normalizeGrowthMap(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    hp: toInt(src.hp, 0),
    mp: toInt(src.mp, 0),
    attack: toInt(src.attack, 0),
    defense: toInt(src.defense, 0),
    recovery: toInt(src.recovery, 0),
    speed: toInt(src.speed, 0),
    charm: toInt(src.charm, 0),
  };
}

function addGrowthMap(base, delta) {
  const b = normalizeGrowthMap(base);
  const d = normalizeGrowthMap(delta);
  return {
    hp: b.hp + d.hp,
    mp: b.mp + d.mp,
    attack: b.attack + d.attack,
    defense: b.defense + d.defense,
    recovery: b.recovery + d.recovery,
    speed: b.speed + d.speed,
    charm: b.charm + d.charm,
  };
}

function multiplyGrowth(growth, levels) {
  const src = normalizeGrowthMap(growth);
  const lv = Math.max(0, toInt(levels, 0));
  return {
    hp: src.hp * lv,
    mp: src.mp * lv,
    attack: src.attack * lv,
    defense: src.defense * lv,
    recovery: src.recovery * lv,
    speed: src.speed * lv,
    charm: src.charm * lv,
  };
}

function formatGrowthLogLine(prefix, growth) {
  const g = normalizeGrowthMap(growth);
  const chunks = [];
  if (g.hp) chunks.push(`HP+${g.hp}`);
  if (g.attack) chunks.push(`攻撃力+${g.attack}`);
  if (g.defense) chunks.push(`防御力+${g.defense}`);
  if (g.mp) chunks.push(`MP+${g.mp}`);
  if (g.speed) chunks.push(`素早さ+${g.speed}`);
  if (g.recovery) chunks.push(`回復力+${g.recovery}`);
  if (g.charm) chunks.push(`魅力度+${g.charm}`);
  return chunks.length ? `${prefix}${chunks.join(', ')}` : null;
}

/**
 * キャラクターとスキルをDBから読み込む
 */
async function loadCharacter(userId) {
  const charResult = await db.query(
    `SELECT c.*, u.username, COALESCE(cj.level, 1) AS job_level, j.name AS job_name
     FROM characters c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN character_jobs cj ON cj.character_id = c.id AND cj.job_id = c.current_job_id
     LEFT JOIN jobs j ON j.id = c.current_job_id
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
    char.job_exp = progress.expAfter || 0;
  }
  char.skills = skills;
  return char;
}

async function fetchJobSkills(jobId) {
  if (!jobId) return [];
  const result = await db.query(
    `SELECT s.*, js.required_level
     FROM job_skills js
     INNER JOIN skills s ON s.id = js.skill_id
     WHERE js.job_id = $1
     ORDER BY js.required_level ASC, s.id ASC`,
    [jobId]
  );
  return result.rows || [];
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
  monster.magicImmune = !!monster.magic_immune;
  monster.elementImmune = !!monster.element_immune;
  monster.expMultiplier = Math.max(1, Number(monster.exp_multiplier) || 1);
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

function weightedRandomFrom(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const validEntries = entries.filter((entry) => entry && Number(entry.weight) > 0);
  if (validEntries.length === 0) return null;
  const totalWeight = validEntries.reduce((sum, entry) => sum + Number(entry.weight), 0);
  let threshold = Math.random() * totalWeight;
  for (const entry of validEntries) {
    threshold -= Number(entry.weight);
    if (threshold <= 0) return entry.value;
  }
  return validEntries[validEntries.length - 1].value;
}

function pickBeginnerMeadowNormalMonsterId(excludedMonsterIds = []) {
  const candidates = BEGINNER_MEADOW_NORMAL_MONSTER_IDS.filter((id) => !excludedMonsterIds.includes(id));
  if (candidates.length === 0) return null;

  const includesMetal = candidates.includes(BEGINNER_MEADOW_METAL_SLIME_MONSTER_ID);
  const canApplyMetalRate = includesMetal && candidates.length > 1;
  const weightedCandidates = candidates.map((id) => {
    if (!canApplyMetalRate) {
      return { value: id, weight: 100 / candidates.length };
    }
    if (id === BEGINNER_MEADOW_METAL_SLIME_MONSTER_ID) {
      return { value: id, weight: BEGINNER_MEADOW_METAL_SLIME_RATE };
    }
    return {
      value: id,
      weight: (100 - BEGINNER_MEADOW_METAL_SLIME_RATE) / (candidates.length - 1),
    };
  });

  return weightedRandomFrom(weightedCandidates);
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
    const pickedMonsterId = pickBeginnerMeadowNormalMonsterId(excludedMonsterIds);
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
    const firstId = pickBeginnerMeadowNormalMonsterId();
    const secondId = pickBeginnerMeadowNormalMonsterId();
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
  const jobId = toInt(character.current_job_id, 0);
  const initialJobLevel = Math.max(1, toInt(character.job_level, 1));
  const initialJobExp = Math.max(0, toInt(character.job_exp, 0));
  const perLevelGrowth = normalizeGrowthMap(
    JOB_LEVEL_GROWTH_TABLE[character.job_name] || {}
  );
  const learnedSkillIds = new Set(
    (character.skills || [])
      .map((skill) => Number(skill && skill.id))
      .filter((id) => Number.isFinite(id))
  );

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
      recovery: character.recovery,
      speed: character.speed,
      charm: character.charm,
      crit_rate: parseFloat(character.crit_rate) || 0,
      evasion_rate: parseFloat(character.evasion_rate) || 0,
      element: character.element || 'none',
      skills: character.skills,
      permanent_bonus: normalizeGrowthMap(character.permanent_bonus || {}),
      buffs: [],
      statusEffects: [],
    },
    monsters,
    rewardProgress: {
      pendingExp: 0,
      pendingMoney: 0,
      rewardedMonsterIds: new Set(),
      progression: {
        enabled: !!jobId,
        jobId: jobId || null,
        level: initialJobLevel,
        jobExp: initialJobExp,
        perLevelGrowth,
        knownSkillIds: learnedSkillIds,
        jobSkills: [],
      },
    },
  };
}

function isMonsterRewardTriggerAction(action) {
  if (!action || typeof action !== 'object') return false;
  if (action.actionType === 'defeated' && action.actorType === 'system') return true;
  return false;
}

function getRewardTargetMonster(action, monsters) {
  if (!isMonsterRewardTriggerAction(action)) return null;
  const sourceId = String(action.targetId);
  return (monsters || []).find(
    (monster) => String(monster.instance_id || monster.id) === sourceId
  ) || null;
}

function applyLevelUpGrowthToBattlePlayer(player, totalGrowth, permanentBonusGain) {
  const growth = normalizeGrowthMap(totalGrowth);
  const permGain = normalizeGrowthMap(permanentBonusGain);
  const maxHpGain = growth.hp + permGain.hp;
  const maxMpGain = growth.mp + permGain.mp;
  player.max_hp = Math.max(1, toInt(player.max_hp, 1) + maxHpGain);
  player.max_mp = Math.max(0, toInt(player.max_mp, 0) + maxMpGain);
  player.hp = player.max_hp;
  player.mp = player.max_mp;
  player.attack = Math.max(0, toInt(player.attack, 0) + growth.attack + permGain.attack);
  player.defense = Math.max(0, toInt(player.defense, 0) + growth.defense + permGain.defense);
  player.recovery = Math.max(0, toInt(player.recovery, 0) + growth.recovery + permGain.recovery);
  player.speed = Math.max(0, toInt(player.speed, 0) + growth.speed + permGain.speed);
  player.charm = Math.max(0, toInt(player.charm, 0) + growth.charm + permGain.charm);
  player.permanent_bonus = addGrowthMap(player.permanent_bonus || {}, permGain);
}

function buildRealtimeRewardActions({ battleState, triggerAction, reward }) {
  const actions = [];
  const safeExp = Math.max(0, toInt(reward.exp, 0));
  const safeMoney = Math.max(0, toInt(reward.money, 0));
  if (safeExp <= 0 && safeMoney <= 0) return actions;

  actions.push({
    actorType: 'system',
    actorId: null,
    actionType: 'reward_gain',
    targetId: triggerAction.targetId || triggerAction.actorId || null,
    skillName: null,
    specialSkill: false,
    damage: 0,
    heal: 0,
    statusEffect: null,
    isCrit: false,
    isSupercrit: false,
    missed: false,
    reward: { exp: safeExp, money: safeMoney },
    message: `経験値${safeExp}を獲得！ゴールド${safeMoney}を獲得！`,
  });

  const progression = battleState?.rewardProgress?.progression;
  if (!progression || !progression.enabled || safeExp <= 0) return actions;

  const levelBefore = Math.max(1, toInt(progression.level, 1));
  const expAfter = Math.max(0, toInt(progression.jobExp, 0) + safeExp);
  const levelAfter = Math.max(levelBefore, calcLevelFromExp(expAfter));
  progression.jobExp = expAfter;

  if (levelAfter <= levelBefore) return actions;

  const levelsGained = levelAfter - levelBefore;
  const totalGrowth = multiplyGrowth(progression.perLevelGrowth, levelsGained);
  // 5レベル到達ごとのマイルストーン（Lv5, Lv10, ...）で永続ボーナスを加算する
  const milestoneCount = Math.max(
    0,
    Math.floor(levelAfter / PERMANENT_BONUS_INTERVAL) - Math.floor(levelBefore / PERMANENT_BONUS_INTERVAL)
  );
  const permanentBonusGain = milestoneCount > 0
    ? multiplyGrowth(progression.perLevelGrowth, milestoneCount)
    : normalizeGrowthMap({});
  progression.level = levelAfter;
  applyLevelUpGrowthToBattlePlayer(battleState.player, totalGrowth, permanentBonusGain);

  actions.push({
    actorType: 'system',
    actorId: null,
    actionType: 'level_up',
    targetId: battleState.player.id,
    message: `レベルアップ！ Lv${levelBefore} → Lv${levelAfter}`,
  });

  const growthLine = formatGrowthLogLine('ステータス上昇：', totalGrowth);
  if (growthLine) {
    actions.push({
      actorType: 'system',
      actorId: null,
      actionType: 'level_up_stats',
      targetId: battleState.player.id,
      message: growthLine,
    });
  }

  const permLine = formatGrowthLogLine('永続ボーナス上昇：', permanentBonusGain);
  if (permLine) {
    actions.push({
      actorType: 'system',
      actorId: null,
      actionType: 'permanent_bonus_up',
      targetId: battleState.player.id,
      message: permLine,
    });
  }

  const learnedSkillActions = [];
  for (const skill of progression.jobSkills || []) {
    if (!skill) continue;
    const requiredLevel = Math.max(1, toInt(skill.required_level, 1));
    if (requiredLevel > levelAfter) continue;
    const skillId = Number(skill.id);
    if (!Number.isFinite(skillId)) continue;
    if (progression.knownSkillIds.has(skillId)) continue;
    progression.knownSkillIds.add(skillId);
    battleState.player.skills = Array.isArray(battleState.player.skills)
      ? [...battleState.player.skills, skill]
      : [skill];
    learnedSkillActions.push({
      actorType: 'system',
      actorId: null,
      actionType: 'skill_learned',
      targetId: battleState.player.id,
      message: `スキル『${skill.name}』を習得した！`,
    });
  }
  actions.push(...learnedSkillActions);
  return actions;
}

function applyRealtimeBattleRewards(battleState, actions) {
  if (!battleState || !Array.isArray(actions) || !actions.length) return actions;
  const rewardProgress = battleState.rewardProgress;
  if (!rewardProgress) return actions;

  const enriched = [];
  const battleMonsters = Array.isArray(battleState.monsters) ? battleState.monsters : [];
  const isSingleEncounter = battleMonsters.length <= 1;
  for (const action of actions) {
    enriched.push(action);
    const monster = getRewardTargetMonster(action, battleState.monsters || []);
    if (!monster) continue;
    const monsterId = String(monster.instance_id || monster.id);
    if (rewardProgress.rewardedMonsterIds.has(monsterId)) continue;
    rewardProgress.rewardedMonsterIds.add(monsterId);

    const reward = calculateMonsterReward(monster, battleState.floor, { includeEscaped: true });
    const safeExp = Math.max(0, toInt(reward.exp, 0));
    const safeMoney = Math.max(0, toInt(reward.money, 0));
    rewardProgress.pendingExp += safeExp;
    rewardProgress.pendingMoney += safeMoney;
    const allDefeated = battleMonsters.length > 0
      && battleMonsters.every((m) => m && m.hp <= 0 && !m.escaped);
    const shouldDistributeRewardNow = isSingleEncounter || allDefeated;
    if (!shouldDistributeRewardNow) {
      continue;
    }
    const totalReward = {
      exp: Math.max(0, toInt(rewardProgress.pendingExp, 0)),
      money: Math.max(0, toInt(rewardProgress.pendingMoney, 0)),
    };
    if (totalReward.exp <= 0 && totalReward.money <= 0) {
      continue;
    }
    rewardProgress.pendingExp = 0;
    rewardProgress.pendingMoney = 0;
    const rewardActions = buildRealtimeRewardActions({
      battleState,
      triggerAction: action,
      reward: totalReward,
    });
    enriched.push(...rewardActions);
  }
  return enriched;
}

function buildTurnPayloadWithRewards(battleState, turnResult) {
  const actions = applyRealtimeBattleRewards(battleState, turnResult.actions || []);
  return {
    turn: battleState.turn,
    actions,
    state: getBattleState(battleState),
    playerSkills: battleState.player.skills || [],
    awaitingPlayerAction: !turnResult.battleOver,
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
  const pendingRewards = battleState?.rewardProgress
    ? {
      exp: toInt(battleState.rewardProgress.pendingExp, 0),
      money: toInt(battleState.rewardProgress.pendingMoney, 0),
    }
    : { exp: 0, money: 0 };
  const allMonstersDefeated = (battleState?.monsters || []).length > 0
    && (battleState?.monsters || []).every((m) => m && m.hp <= 0 && !m.escaped);
  const rewards = (result === 'win' && allMonstersDefeated)
    ? pendingRewards
    : { exp: 0, money: 0 };

  let rewardResult = null;
  if (result === 'win' && userId && (rewards.exp > 0 || rewards.money > 0)) {
    try {
      rewardResult = await applyBattleRewards(userId, rewards);
      // レベルアップ/習得ログは戦闘中リアルタイムで表示済みのため、battle:end では再表示しない
      if (rewardResult) {
        rewardResult = { ...rewardResult, levelUp: null };
      }
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
      monsters,
    });
    if (nextBattleState.rewardProgress?.progression?.enabled) {
      nextBattleState.rewardProgress.progression.jobSkills = await fetchJobSkills(
        nextBattleState.rewardProgress.progression.jobId
      );
    }
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
      socket.emit('battle:turn', buildTurnPayloadWithRewards(nextBattleState, enemyOpening));
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
        if (battleState.rewardProgress?.progression?.enabled) {
          battleState.rewardProgress.progression.jobSkills = await fetchJobSkills(
            battleState.rewardProgress.progression.jobId
          );
        }
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
          socket.emit('battle:turn', buildTurnPayloadWithRewards(battleState, enemyOpening));
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
        const playerTurnPayload = buildTurnPayloadWithRewards(battleState, playerResult);
        playerTurnPayload.awaitingPlayerAction = false;
        socket.emit('battle:turn', playerTurnPayload);

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
        socket.emit('battle:turn', buildTurnPayloadWithRewards(battleState, enemyResult));
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
        socket.emit('battle:turn', buildTurnPayloadWithRewards(battleState, turnResult));
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

    socket.on('battle:abandon', (payload, ack) => {
      if (userId) {
        activeBattles.delete(userId);
        activeDungeonRuns.delete(userId);
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
