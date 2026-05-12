// バトルエンジン

const {
  checkActionRestriction,
  processStatusEffectTick,
  applyStatusEffect,
  STATUS_TYPES,
} = require('./statusEffects');

const NORMAL_ATTACK = {
  id: 0,
  name: '通常攻撃',
  element: 'none',
  skill_type: 'physical',
  power: 100,
  mp_cost: 0,
  target: 'single',
};

const ELEMENT_TABLE = {
  fire: { wood: 1.5, water: 0.5 },
  water: { fire: 1.5, wood: 0.5 },
  wood: { water: 1.5, fire: 0.5 },
  light: { dark: 1.5 },
  dark: { light: 1.5 },
};

const STATUS_LABELS = {
  [STATUS_TYPES.POISON]: '毒',
  [STATUS_TYPES.BURN]: 'やけど',
};

const EFFECT_APPLY_MESSAGES = {
  poison: (name) => `${name} は毒にかかった！`,
  speed_up: (name) => `${name} の素早さが上がった！`,
  speed_down: (name) => `${name} の素早さが下がった！`,
  defense_up: (name) => `${name} の防御力が上がった！`,
  defense_down: (name) => `${name} の防御力が下がった！`,
  attack_up: (name) => `${name} の攻撃力が上がった！`,
  attack_down: (name) => `${name} の攻撃力が下がった！`,
};

const EFFECT_EXPIRE_MESSAGES = {
  poison: (name) => `${name} の毒が解けた！`,
  speed_up: (name) => `${name} の素早さが元に戻った！`,
  speed_down: (name) => `${name} の素早さが元に戻った！`,
  defense_up: (name) => `${name} の防御力が元に戻った！`,
  defense_down: (name) => `${name} の防御力が元に戻った！`,
  attack_up: (name) => `${name} の攻撃力が元に戻った！`,
  attack_down: (name) => `${name} の攻撃力が元に戻った！`,
};

const STAT_BUFF_KEY = {
  attack: 'attack',
  defense: 'defense',
  speed: 'speed',
  crit_rate: 'crit',
  evasion_rate: 'evasion',
};

function getElementMultiplier(atkElement, defElement) {
  if (!atkElement || !defElement) return 1.0;
  const row = ELEMENT_TABLE[atkElement];
  if (!row) return 1.0;
  return row[defElement] || 1.0;
}

function processCrit(critRate) {
  const rate = Math.min(200, Math.max(0, Number(critRate) || 0));
  if (rate >= 100) {
    const superCritChance = rate - 100;
    const isSupercrit = Math.random() * 100 < superCritChance;
    return { isCrit: true, isSupercrit, multiplier: isSupercrit ? 2.0 : 1.5 };
  }
  const isCrit = Math.random() * 100 < rate;
  return { isCrit, isSupercrit: false, multiplier: isCrit ? 1.5 : 1.0 };
}

function getBuffModifierPercent(buffs, buffKey) {
  if (!Array.isArray(buffs) || !buffKey) return 0;
  return buffs.reduce((sum, b) => {
    if (!b || typeof b.type !== 'string') return sum;
    if (b.type === `${buffKey}_up`) return sum + (Number(b.value) || 0);
    if (b.type === `${buffKey}_down`) return sum - (Number(b.value) || 0);
    return sum;
  }, 0);
}

function getEffectiveStat(combatant, statKey, buffs) {
  const base = Number(combatant?.[statKey]) || 0;
  const buffKey = STAT_BUFF_KEY[statKey];
  const percent = getBuffModifierPercent(buffs || combatant?.buffs || [], buffKey);
  const adjusted = base * (1 + percent / 100);
  return Math.max(0, adjusted);
}

function isAttackIneffective(skill, target) {
  const magicImmune = !!(target?.magicImmune || target?.magic_immune);
  const elementImmune = !!(target?.elementImmune || target?.element_immune);
  if (!magicImmune && !elementImmune) return false;

  const skillType = String(skill?.skill_type || 'physical');
  const skillElement = String(skill?.element || 'none');
  const isPhysical = skillType === 'physical';
  const isNonElement = skillElement === 'none';

  return !(isPhysical && isNonElement);
}

function calculateDamage(attacker, skill, target, attackerBuffs, targetBuffs) {
  if (isAttackIneffective(skill, target)) {
    return {
      damage: 0,
      isCrit: false,
      isSupercrit: false,
      missed: false,
      ineffective: true,
    };
  }

  const effectiveEvasion = Math.max(0, Math.min(100, getEffectiveStat(target, 'evasion_rate', targetBuffs)));
  const missed = Math.random() * 100 < effectiveEvasion;
  if (missed) return {
    damage: 0,
    isCrit: false,
    isSupercrit: false,
    missed: true,
    ineffective: false,
  };

  const atkPower = getEffectiveStat(attacker, 'attack', attackerBuffs);
  const defValue = getEffectiveStat(target, 'defense', targetBuffs);
  const powerMultiplier = (Number(skill?.power) || 100) / 100;
  const elementMult = getElementMultiplier(skill?.element || 'none', target?.element || 'none');

  const effectiveCrit = getEffectiveStat(attacker, 'crit_rate', attackerBuffs);
  const { isCrit, isSupercrit, multiplier } = processCrit(effectiveCrit);

  const rawDamage = atkPower * powerMultiplier * elementMult * multiplier - defValue * 0.5;
  const damage = Math.max(1, Math.floor(rawDamage));
  return {
    damage,
    isCrit,
    isSupercrit,
    missed: false,
    ineffective: false,
  };
}

function randomChoice(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
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

function buildMonsterLogNameMap(monsters) {
  const grouped = {};
  (monsters || []).forEach((monster) => {
    if (!monster || !monster.name) return;
    grouped[monster.name] = grouped[monster.name] || [];
    grouped[monster.name].push(monster);
  });
  const result = new Map();
  Object.entries(grouped).forEach(([name, list]) => {
    if (list.length <= 1) {
      result.set(String(list[0].instance_id || list[0].id), name);
      return;
    }
    list.forEach((monster, idx) => {
      result.set(String(monster.instance_id || monster.id), `${name}${toUpperAlphabetLabel(idx)}`);
    });
  });
  return result;
}

function getCombatantLogName(combatant, monsterNameMap) {
  if (!combatant) return '';
  const id = String(combatant.instance_id || combatant.id || '');
  if (monsterNameMap && monsterNameMap.has(id)) return monsterNameMap.get(id);
  return combatant.name || '';
}

function getSkillByName(monster, name) {
  return (monster.skills || []).find((s) => s && s.name === name) || null;
}

function pickSkillByNames(monster, names) {
  const candidates = names
    .map((name) => getSkillByName(monster, name))
    .filter((s) => s && (Number(s.mp_cost) || 0) <= (Number(monster.mp) || 0));
  return randomChoice(candidates);
}

function selectEnemyAction(monster) {
  const fallback = NORMAL_ATTACK;
  const skills = Array.isArray(monster.skills)
    ? monster.skills.filter((s) => (Number(s.mp_cost) || 0) <= (Number(monster.mp) || 0))
    : [];
  if (skills.length === 0) return fallback;

  const name = monster.name;

  if (name === 'スライム') {
    return getSkillByName(monster, '体当たり') || skills[0] || fallback;
  }

  if (name === 'ポイズンスライム') {
    return pickSkillByNames(monster, ['体当たり', '毒粘液']) || skills[0] || fallback;
  }

  if (name === 'くさばな') {
    // HP50%以下かつ20%の確率でのみ光合成を使用する
    const maxHp = Number(monster.max_hp);
    const hpRatio = maxHp > 0 ? (Number(monster.hp) || 0) / maxHp : 1;
    if (hpRatio <= 0.5 && Math.random() < 0.2) {
      const photosynthesis = getSkillByName(monster, '光合成');
      if (photosynthesis && (Number(photosynthesis.mp_cost) || 0) <= (Number(monster.mp) || 0)) {
        return photosynthesis;
      }
    }
    return getSkillByName(monster, 'つるたたき') || skills[0] || fallback;
  }

  if (name === 'ちびゴブリン') {
    return pickSkillByNames(monster, ['ぶん殴る', '俊敏']) || skills[0] || fallback;
  }

  if (name === 'メタルスライム') {
    if ((monster.turnCount || 0) <= 2) {
      return getSkillByName(monster, 'メタル体当たり') || skills[0] || fallback;
    }
    if (Math.random() < 0.5) {
      return getSkillByName(monster, '逃げる') || getSkillByName(monster, 'メタル体当たり') || skills[0] || fallback;
    }
    return getSkillByName(monster, 'メタル体当たり') || skills[0] || fallback;
  }

  if (name === 'グリーンスライムキング') {
    if (!monster.aiState) monster.aiState = { specialCooldown: 3 };

    const normalSkill = pickSkillByNames(monster, ['押しつぶす', '粘液放出']) || skills[0] || fallback;
    const specialSkill = getSkillByName(monster, '全力体当たり（必殺）');

    if ((monster.aiState.specialCooldown || 0) > 0) {
      monster.aiState.specialCooldown -= 1;
      return normalSkill;
    }

    if (specialSkill && Math.random() < 0.6) {
      monster.aiState.specialCooldown = 3;
      return specialSkill;
    }

    return normalSkill;
  }

  return randomChoice(skills) || fallback;
}

function applyBuff(buffs, type, value, turns) {
  const safeTurns = Math.max(1, Math.floor(Number(turns) || 1));
  const filtered = (Array.isArray(buffs) ? buffs : []).filter((b) => b.type !== type);
  filtered.push({ type, value: Number(value) || 0, turns: safeTurns });
  return filtered;
}

function tickBuffs(buffs) {
  const expired = [];
  const active = (Array.isArray(buffs) ? buffs : [])
    .map((b) => ({ ...b, turns: (Number(b.turns) || 0) - 1 }))
    .filter((b) => {
      const isActive = b.turns > 0;
      if (!isActive) expired.push({ type: b.type });
      return isActive;
    });
  return { active, expired };
}

function checkEffectChance(skill) {
  // effect_chance が未設定の場合は 100% 扱い（既存スキル互換）
  const rawChance = Number(skill?.effect_chance);
  const chance = Number.isFinite(rawChance) ? rawChance : 100;
  return Math.random() * 100 < Math.max(0, Math.min(100, chance));
}

function getEffectCategory(effectType) {
  if (!effectType) return null;
  return (effectType.endsWith('_up') || effectType.endsWith('_down'))
    ? 'buff'
    : 'status';
}

function applySkillEffect({ attacker, target, skill }) {
  if (!skill || !target || !skill.effect_type) return null;

  const effectType = skill.effect_type;
  const value = Number(skill.effect_value) || 0;
  const duration = Math.max(1, Math.floor(Number(skill.effect_duration) || 1));
  if (!checkEffectChance(skill)) {
    return {
      type: effectType,
      value,
      turns: duration,
      category: getEffectCategory(effectType),
      applied: false,
      attempted: true,
    };
  }

  if (effectType === 'poison') {
    const applied = applyStatusEffect(target, {
      type: STATUS_TYPES.POISON,
      turns: duration,
      value,
      sourceAttack: getEffectiveStat(attacker, 'attack', attacker.buffs || []),
    });
    return {
      type: effectType,
      value,
      turns: duration,
      category: 'status',
      applied: !!applied,
      attempted: true,
    };
  }

  if (effectType.endsWith('_up') || effectType.endsWith('_down')) {
    target.buffs = applyBuff(target.buffs || [], effectType, value, duration);
    return {
      type: effectType,
      value,
      turns: duration,
      category: 'buff',
      applied: true,
      attempted: true,
    };
  }

  return {
    type: effectType,
    value,
    turns: duration,
    category: 'status',
    applied: false,
    attempted: true,
  };
}

function getEffectApplyMessage(targetName, effectType, applied) {
  if (!targetName) return null;
  if (!applied) return `${targetName} には効かなかった！`;
  const formatter = EFFECT_APPLY_MESSAGES[effectType];
  if (typeof formatter === 'function') return formatter(targetName);
  // eslint-disable-next-line no-console
  console.warn(`[battle] 未定義の状態異常付与メッセージ: ${effectType}`);
  return `${targetName} に効果が現れた！`;
}

function getEffectExpireMessage(targetName, effectType) {
  if (!targetName) return null;
  const formatter = EFFECT_EXPIRE_MESSAGES[effectType];
  if (typeof formatter === 'function') return formatter(targetName);
  return `${targetName} の${effectType}が解除された！`;
}

function pushEffectAction({
  actions,
  actorType,
  actorId,
  targetId,
  targetName,
  effectResult,
}) {
  if (!effectResult || !effectResult.attempted) return;
  actions.push({
    actorType,
    actorId,
    actionType: 'status_effect',
    targetId,
    skillName: null,
    specialSkill: false,
    damage: 0,
    heal: 0,
    statusEffect: effectResult.type || null,
    statusEffectCategory: effectResult.category || null,
    statusEffectTurns: Number(effectResult.turns) || 0,
    statusEffectValue: Number(effectResult.value) || 0,
    statusEffectApplied: !!effectResult.applied,
    removedEffects: [],
    isCrit: false,
    isSupercrit: false,
    missed: false,
    message: getEffectApplyMessage(targetName, effectResult.type, !!effectResult.applied),
  });
}

function processEndOfTurn(combatant, actorType, actions, monsterNameMap) {
  const combatantId = combatant.instance_id || combatant.id;
  const combatantName = getCombatantLogName(combatant, monsterNameMap);
  const { active, expired } = tickBuffs(combatant.buffs || []);
  combatant.buffs = active;
  const { damageEvents, expiredEffects } = processStatusEffectTick(combatant);

  for (const ev of damageEvents) {
    actions.push({
      actorType: 'system',
      actorId: null,
      actionType: 'status_damage',
      targetId: combatantId,
      skillName: null,
      specialSkill: false,
      damage: ev.damage,
      heal: 0,
      statusEffect: ev.type,
      isCrit: false,
      isSupercrit: false,
      missed: false,
      message: ev.type === STATUS_TYPES.POISON
        ? `${combatantName} は毒のダメージを受けた！（${ev.damage}）`
        : `${combatantName} は ${STATUS_LABELS[ev.type] || ev.type} のダメージ ${ev.damage}！`,
      removedEffects: [],
      statusEffectApplied: false,
    });
  }

  const removedEffects = [
    ...expired.map((e) => ({ type: e.type, category: 'buff' })),
    ...expiredEffects.map((e) => ({ type: e.type, category: 'status' })),
  ];
  removedEffects.forEach((entry) => {
    actions.push({
      actorType: 'system',
      actorId: null,
      actionType: 'status_expired',
      targetId: combatantId,
      skillName: null,
      specialSkill: false,
      damage: 0,
      heal: 0,
      statusEffect: null,
      isCrit: false,
      isSupercrit: false,
      missed: false,
      statusEffectApplied: false,
      removedEffects: [entry],
      message: getEffectExpireMessage(combatantName, entry.type),
    });
  });

  if (combatant.hp <= 0 && actorType === 'monster' && !combatant.escaped) {
    actions.push({
      actorType: 'system',
      actorId: null,
      actionType: 'defeated',
      targetId: combatantId,
      skillName: null,
      specialSkill: false,
      damage: 0,
      heal: 0,
      statusEffect: null,
      isCrit: false,
      isSupercrit: false,
      missed: false,
      message: `${combatantName} を倒した！`,
    });
  }
}

function getAliveMonsters(monsters) {
  return (monsters || []).filter((m) => m.hp > 0 && !m.escaped);
}

function resolveBattleEnd(monsters) {
  const alive = getAliveMonsters(monsters);
  if (alive.length > 0) return null;

  const hasDefeatedEnemy = (monsters || []).some((m) => m.hp <= 0 && !m.escaped);
  if (hasDefeatedEnemy) return 'win';

  const allEscaped = (monsters || []).length > 0 && (monsters || []).every((m) => m.escaped || m.hp <= 0);
  return allEscaped ? 'enemy_escape' : null;
}

function isEnemyActingFirst(battleState) {
  const player = battleState?.player;
  const aliveMonsters = getAliveMonsters(battleState?.monsters || []);
  if (!player || aliveMonsters.length === 0) return false;
  const playerSpeed = getEffectiveStat(player, 'speed', player.buffs || []);
  const fastestEnemySpeed = aliveMonsters.reduce(
    (max, monster) => Math.max(max, getEffectiveStat(monster, 'speed', monster.buffs || [])),
    0
  );
  return fastestEnemySpeed > playerSpeed;
}

function processTurn(battleState, playerAction, options = {}) {
  const { player, monsters } = battleState;
  const monsterNameMap = buildMonsterLogNameMap(monsters);
  const aliveMonsters = getAliveMonsters(monsters);
  const mode = options.mode || 'full';

  if (aliveMonsters.length === 0) {
    return { actions: [], state: getBattleState(battleState), battleOver: true, result: 'win' };
  }

  const actions = [];
  let battleOver = false;
  let result = null;

  if ((mode === 'full' || mode === 'player_only') && playerAction?.actionType === 'escape') {
    const enemySpeed = getEffectiveStat(aliveMonsters[0], 'speed', aliveMonsters[0].buffs || []);
    const playerSpeed = getEffectiveStat(player, 'speed', player.buffs || []);
    const escapeChance = Math.min(90, 30 + (playerSpeed - enemySpeed) * 2);
    if (Math.random() * 100 < escapeChance) {
      actions.push({
        actorType: 'player', actorId: player.id, actionType: 'escape', targetId: null,
        skillName: null, specialSkill: false,
        damage: 0, heal: 0, statusEffect: null,
        isCrit: false, isSupercrit: false, missed: false,
        message: '逃げ切った！',
      });
      return { actions, state: getBattleState(battleState), battleOver: true, result: 'escape' };
    }
    actions.push({
      actorType: 'player', actorId: player.id, actionType: 'escape', targetId: null,
      skillName: null, specialSkill: false,
      damage: 0, heal: 0, statusEffect: null,
      isCrit: false, isSupercrit: false, missed: false,
      message: '逃げられなかった！',
    });
  }

  const participants = [
    { type: 'player', data: player },
    ...aliveMonsters.map((m) => ({ type: 'monster', data: m })),
  ];

  participants.sort((a, b) => {
    const aSpeed = getEffectiveStat(a.data, 'speed', a.data.buffs || []);
    const bSpeed = getEffectiveStat(b.data, 'speed', b.data.buffs || []);
    const diff = bSpeed - aSpeed;
    if (diff !== 0) return diff;
    return Math.random() < 0.5 ? -1 : 1;
  });

  for (const participant of participants) {
    if (battleOver) break;
    if (mode === 'enemy_only' && participant.type === 'player') continue;
    if (mode === 'player_only' && participant.type === 'monster') continue;

    if (participant.type === 'player') {
      if (player.hp <= 0) continue;
      if (!playerAction) continue;
      if (playerAction.actionType === 'escape') {
        processEndOfTurn(player, 'player', actions);
        if (player.hp <= 0) {
          battleOver = true;
          result = 'lose';
        }
        continue;
      }

      const restriction = checkActionRestriction(player);
      if (!restriction.canAct) {
        actions.push({
          actorType: 'player', actorId: player.id,
          actionType: 'skip', targetId: null,
          skillName: null, specialSkill: false,
          damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: '行動できない！',
        });
      } else {
        const currentAliveMonsters = getAliveMonsters(monsters);
        const targetMonster = currentAliveMonsters.find(
          (m) => String(m.instance_id || m.id) === String(playerAction.targetId)
        ) || currentAliveMonsters[0];

        if (playerAction.actionType === 'skill' || playerAction.actionType === 'attack') {
          const skill = playerAction.skill || NORMAL_ATTACK;
          const actualSkill = restriction.forceNormalAttack ? NORMAL_ATTACK : skill;
          const currentMp = Number(player.mp) || 0;
          const requiredMp = Number(actualSkill.mp_cost) || 0;

          if (restriction.selfAttack) {
            const { damage } = calculateDamage(player, NORMAL_ATTACK, player, player.buffs || [], player.buffs || []);
            player.hp = Math.max(0, player.hp - damage);
            actions.push({
              actorType: 'player', actorId: player.id,
              actionType: 'attack', targetId: player.id,
              skillName: '通常攻撃（混乱）', specialSkill: false,
              damage, heal: 0, statusEffect: null,
              isCrit: false, isSupercrit: false, missed: false,
              message: `${player.name} は混乱して自分を攻撃した！ ${damage} のダメージ！`,
            });
          } else if (requiredMp > currentMp) {
            actions.push({
              actorType: 'player', actorId: player.id,
              actionType: 'skip', targetId: null,
              skillName: null, specialSkill: false,
              mpAfterAction: currentMp,
              damage: 0, heal: 0, statusEffect: null,
              isCrit: false, isSupercrit: false, missed: false,
              message: `${player.name} は MP が足りず ${actualSkill.name} を使えない！`,
            });
          } else if (!targetMonster) {
            actions.push({
              actorType: 'player', actorId: player.id,
              actionType: 'skip', targetId: null,
              skillName: null, specialSkill: false,
              damage: 0, heal: 0, statusEffect: null,
              isCrit: false, isSupercrit: false, missed: false,
              message: '対象がいない！',
            });
          } else {
            player.mp = Math.max(0, currentMp - requiredMp);

            if (actualSkill.effect_type === 'self_hp_cost') {
              const selfCost = Math.floor(player.max_hp * ((Number(actualSkill.effect_value) || 0) / 100));
              player.hp = Math.max(1, player.hp - selfCost);
            }

            if (
              (actualSkill.skill_type === 'buff'
                || actualSkill.skill_type === 'debuff'
                || actualSkill.skill_type === 'status')
              && (Number(actualSkill.power) || 0) <= 0
            ) {
              const target = actualSkill.target === 'self' ? player : targetMonster;
              const targetId = target
                ? (target === player ? player.id : (target.instance_id || target.id))
                : null;
              if (!target) {
                actions.push({
                  actorType: 'player', actorId: player.id,
                  actionType: 'skip', targetId: null,
                  skillName: null, specialSkill: false,
                  damage: 0, heal: 0, statusEffect: null,
                  isCrit: false, isSupercrit: false, missed: false,
                  message: '対象がいない！',
                });
              } else {
                const effectResult = applySkillEffect({ attacker: player, target, skill: actualSkill });
                actions.push({
                  actorType: 'player', actorId: player.id,
                  actionType: 'skill', targetId,
                  skillName: actualSkill.name,
                  specialSkill: !!actualSkill.is_special,
                  mpAfterAction: player.mp,
                  damage: 0, heal: 0, statusEffect: null,
                  isCrit: false, isSupercrit: false, missed: false,
                  removedEffects: [],
                  statusEffectApplied: false,
                  message: effectResult && effectResult.attempted
                    ? getEffectApplyMessage(getCombatantLogName(target, monsterNameMap), effectResult.type, effectResult.applied)
                    : `${player.name} は ${actualSkill.name} を使った！`,
                });
                if (effectResult && effectResult.attempted) {
                  actions[actions.length - 1].statusEffect = effectResult.type || null;
                  actions[actions.length - 1].statusEffectCategory = effectResult.category || null;
                  actions[actions.length - 1].statusEffectTurns = Number(effectResult.turns) || 0;
                  actions[actions.length - 1].statusEffectValue = Number(effectResult.value) || 0;
                  actions[actions.length - 1].statusEffectApplied = !!effectResult.applied;
                }
              }
            } else if (actualSkill.skill_type === 'heal' && actualSkill.effect_type === 'heal_max_hp_percent') {
              const healAmount = Math.floor(player.max_hp * ((Number(actualSkill.effect_value) || 0) / 100));
              player.hp = Math.min(player.max_hp, player.hp + healAmount);
              actions.push({
                actorType: 'player', actorId: player.id,
                actionType: 'heal', targetId: player.id,
                skillName: actualSkill.name,
                specialSkill: !!actualSkill.is_special,
                mpAfterAction: player.mp,
                damage: 0, heal: healAmount, statusEffect: null,
                isCrit: false, isSupercrit: false, missed: false,
                message: `${player.name} は ${actualSkill.name} で ${healAmount} 回復した！`,
              });
            } else {
              const { damage, isCrit, isSupercrit, missed, ineffective } = calculateDamage(
                player,
                actualSkill,
                targetMonster,
                player.buffs || [],
                targetMonster.buffs || []
              );
              if (!missed && !ineffective) targetMonster.hp = Math.max(0, targetMonster.hp - damage);

              const effectResult = !missed && !ineffective && actualSkill.effect_type
                ? applySkillEffect({ attacker: player, target: targetMonster, skill: actualSkill })
                : (actualSkill.effect_type
                  ? {
                    type: actualSkill.effect_type,
                    value: Number(actualSkill.effect_value) || 0,
                    turns: Math.max(1, Math.floor(Number(actualSkill.effect_duration) || 1)),
                    category: getEffectCategory(actualSkill.effect_type),
                    applied: false,
                    attempted: true,
                  }
                  : null);

              actions.push({
                actorType: 'player', actorId: player.id,
                actionType: playerAction.actionType, targetId: targetMonster.instance_id || targetMonster.id,
                skillName: actualSkill.name,
                specialSkill: !!actualSkill.is_special,
                mpAfterAction: player.mp,
                damage, heal: 0, statusEffect: null,
                isCrit, isSupercrit, missed,
                removedEffects: [],
                statusEffectApplied: false,
                message: actualSkill.is_special
                  ? null
                  : (ineffective
                    ? `${getCombatantLogName(targetMonster, monsterNameMap)} には効果がなかった！`
                    : (missed
                    ? `${getCombatantLogName(targetMonster, monsterNameMap)} はかわした！`
                    : `${player.name} は ${actualSkill.name} を使った！ ${damage} のダメージ！${isCrit ? (isSupercrit ? '超会心！' : '会心！') : ''}`)),
              });
              pushEffectAction({
                actions,
                actorType: 'player',
                actorId: player.id,
                targetId: targetMonster.instance_id || targetMonster.id,
                targetName: getCombatantLogName(targetMonster, monsterNameMap),
                effectResult,
              });

              if (targetMonster.hp <= 0 && !targetMonster.escaped) {
                actions.push({
                  actorType: 'system', actorId: null, actionType: 'defeated',
                  targetId: targetMonster.instance_id || targetMonster.id,
                  skillName: null, specialSkill: false,
                  damage: 0, heal: 0, statusEffect: null,
                  isCrit: false, isSupercrit: false, missed: false,
                  message: `${getCombatantLogName(targetMonster, monsterNameMap)} を倒した！`,
                });
              }
            }
          }
        } else if (playerAction.actionType === 'capture') {
          actions.push({
            actorType: 'player', actorId: player.id,
            actionType: 'capture', targetId: targetMonster ? (targetMonster.instance_id || targetMonster.id) : null,
            skillName: null, specialSkill: false,
            damage: 0, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: 'まだ仲間にする機能は未実装です...',
          });
        }
      }

      if (player.hp > 0) processEndOfTurn(player, 'player', actions, monsterNameMap);
      if (player.hp <= 0) {
        battleOver = true;
        result = 'lose';
        actions.push({
          actorType: 'system', actorId: null, actionType: 'defeated',
          targetId: player.id,
          skillName: null, specialSkill: false,
          damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: `${player.name} は倒れた...`,
        });
      }
    } else {
      const monster = participant.data;
      if (monster.hp <= 0 || monster.escaped) continue;
      monster.turnCount = (monster.turnCount || 0) + 1;

      const restriction = checkActionRestriction(monster);
      if (!restriction.canAct) {
          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'skip', targetId: null,
          skillName: null, specialSkill: false,
          damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: `${getCombatantLogName(monster, monsterNameMap)} は動けない！`,
        });
      } else {
        const skill = selectEnemyAction(monster);
        monster.mp = Math.max(0, monster.mp - (Number(skill.mp_cost) || 0));

        if (skill.effect_type === 'escape') {
          monster.escaped = true;
          monster.hp = 0;
          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'escape', targetId: null,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            mpAfterAction: monster.mp,
            damage: 0, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${getCombatantLogName(monster, monsterNameMap)} は逃げ出した！`,
          });
        } else if (skill.skill_type === 'heal' && skill.effect_type === 'heal_max_hp_percent') {
          const healAmount = Math.floor(monster.max_hp * ((Number(skill.effect_value) || 0) / 100));
          monster.hp = Math.min(monster.max_hp, monster.hp + healAmount);
          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'heal', targetId: monster.instance_id || monster.id,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            mpAfterAction: monster.mp,
            damage: 0, heal: healAmount, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${getCombatantLogName(monster, monsterNameMap)} は ${skill.name} で ${healAmount} 回復した！`,
          });
        } else if (skill.skill_type === 'buff') {
          const effectResult = applySkillEffect({ attacker: monster, target: monster, skill });
          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'skill', targetId: monster.instance_id || monster.id,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            mpAfterAction: monster.mp,
            damage: 0, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            removedEffects: [],
            statusEffectApplied: false,
            message: effectResult && effectResult.attempted
              ? getEffectApplyMessage(getCombatantLogName(monster, monsterNameMap), effectResult.type, effectResult.applied)
              : `${getCombatantLogName(monster, monsterNameMap)} は ${skill.name} を使った！`,
          });
          if (effectResult && effectResult.attempted) {
            actions[actions.length - 1].statusEffect = effectResult.type || null;
            actions[actions.length - 1].statusEffectCategory = effectResult.category || null;
            actions[actions.length - 1].statusEffectTurns = Number(effectResult.turns) || 0;
            actions[actions.length - 1].statusEffectValue = Number(effectResult.value) || 0;
            actions[actions.length - 1].statusEffectApplied = !!effectResult.applied;
          }
        } else {
          const { damage, isCrit, isSupercrit, missed, ineffective } = calculateDamage(
            monster,
            skill,
            player,
            monster.buffs || [],
            player.buffs || []
          );
          if (!missed && !ineffective) player.hp = Math.max(0, player.hp - damage);

          const effectResult = !missed && !ineffective && skill.effect_type
            ? applySkillEffect({ attacker: monster, target: player, skill })
            : (skill.effect_type
              ? {
                type: skill.effect_type,
                value: Number(skill.effect_value) || 0,
                turns: Math.max(1, Math.floor(Number(skill.effect_duration) || 1)),
                category: getEffectCategory(skill.effect_type),
                applied: false,
                attempted: true,
              }
              : null);

          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'attack', targetId: player.id,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            mpAfterAction: monster.mp,
            damage, heal: 0, statusEffect: null,
            isCrit, isSupercrit, missed,
            removedEffects: [],
            statusEffectApplied: false,
            message: skill.is_special
              ? null
              : (ineffective
                ? `${player.name} には効果がなかった！`
                : (missed
                ? `${player.name} はかわした！`
                : `${getCombatantLogName(monster, monsterNameMap)} の ${skill.name}！ ${damage} のダメージ！${isCrit ? (isSupercrit ? '超会心！' : '会心！') : ''}`)),
          });
          pushEffectAction({
            actions,
            actorType: 'monster',
            actorId: monster.instance_id || monster.id,
            targetId: player.id,
            targetName: player.name,
            effectResult,
          });

          if (player.hp <= 0) {
            battleOver = true;
            result = 'lose';
            actions.push({
              actorType: 'system', actorId: null, actionType: 'defeated',
              targetId: player.id,
              skillName: null, specialSkill: false,
              damage: 0, heal: 0, statusEffect: null,
              isCrit: false, isSupercrit: false, missed: false,
              message: `${player.name} は倒れた...`,
            });
          }
        }
      }

      if (!battleOver && monster.hp > 0 && !monster.escaped) {
        processEndOfTurn(monster, 'monster', actions, monsterNameMap);
      }

      if (player.hp <= 0 && !battleOver) {
        battleOver = true;
        result = 'lose';
      }
    }

    if (!battleOver) {
      const endResult = resolveBattleEnd(monsters);
      if (endResult) {
        battleOver = true;
        result = endResult;
        if (endResult === 'enemy_escape') {
          actions.push({
            actorType: 'system', actorId: null, actionType: 'enemy_escape',
            targetId: null,
            skillName: null, specialSkill: false,
            damage: 0, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: '逃げられた',
          });
        }
      }
    }
  }

  if (mode !== 'enemy_only') {
    battleState.turn += 1;
  }

  return {
    actions,
    state: getBattleState(battleState),
    battleOver,
    result,
  };
}

function getBattleState(battleState) {
  return {
    dungeonId: battleState.dungeonId,
    floor: battleState.floor,
    encounterIndex: Number(battleState.encounterIndex) || 0,
    encounterTotal: Number(battleState.encounterTotal) || 1,
    player: {
      id: battleState.player.id,
      name: battleState.player.name,
      hp: battleState.player.hp,
      maxHp: battleState.player.max_hp,
      mp: battleState.player.mp,
      maxMp: battleState.player.max_mp,
      buffs: (battleState.player.buffs || []).map((b) => ({
        type: b.type,
        value: Number(b.value) || 0,
        turns: Number(b.turns) || 0,
      })),
      statusEffects: (battleState.player.statusEffects || []).map((e) => ({
        type: e.type,
        turns: Number(e.turns) || 0,
        value: Number(e.value) || 0,
      })),
    },
    monsters: battleState.monsters.map((m) => ({
      id: m.instance_id || m.id,
      name: m.name,
      hp: m.hp,
      maxHp: m.max_hp,
      mp: m.mp,
      maxMp: m.max_mp,
      buffs: (m.buffs || []).map((b) => ({
        type: b.type,
        value: Number(b.value) || 0,
        turns: Number(b.turns) || 0,
      })),
      statusEffects: (m.statusEffects || []).map((e) => ({
        type: e.type,
        turns: Number(e.turns) || 0,
        value: Number(e.value) || 0,
      })),
      escaped: !!m.escaped,
      isAlive: m.hp > 0 && !m.escaped,
    })),
  };
}

function calculateRewards(monsters, floor) {
  const floorMult = Math.pow(1.1, (floor || 1) - 1);
  let exp = 0;
  let money = 0;

  for (const m of monsters || []) {
    if (m.escaped) continue;
    if (m.hp > 0) continue;
    const rawExpMultiplier = Number(m.expMultiplier ?? m.exp_multiplier);
    const expMultiplier = Number.isFinite(rawExpMultiplier) && rawExpMultiplier > 0
      ? rawExpMultiplier
      : 1;
    exp += Math.floor((m.base_hp / 4 + m.base_attack / 2) * floorMult) * expMultiplier;
    money += Math.floor((m.base_hp / 8 + m.base_defense / 4) * floorMult);
  }

  return { exp, money };
}

module.exports = {
  processTurn,
  isEnemyActingFirst,
  getBattleState,
  calculateRewards,
  calculateDamage,
  selectEnemyAction,
  getElementMultiplier,
};
