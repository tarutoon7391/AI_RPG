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

function calculateDamage(attacker, skill, target, attackerBuffs, targetBuffs) {
  const effectiveEvasion = Math.max(0, Math.min(100, getEffectiveStat(target, 'evasion_rate', targetBuffs)));
  const missed = Math.random() * 100 < effectiveEvasion;
  if (missed) return { damage: 0, isCrit: false, isSupercrit: false, missed: true };

  const atkPower = getEffectiveStat(attacker, 'attack', attackerBuffs);
  const defValue = getEffectiveStat(target, 'defense', targetBuffs);
  const powerMultiplier = (Number(skill?.power) || 100) / 100;
  const elementMult = getElementMultiplier(skill?.element || 'none', target?.element || 'none');

  const effectiveCrit = getEffectiveStat(attacker, 'crit_rate', attackerBuffs);
  const { isCrit, isSupercrit, multiplier } = processCrit(effectiveCrit);

  const rawDamage = atkPower * powerMultiplier * elementMult * multiplier - defValue * 0.5;
  const damage = Math.max(1, Math.floor(rawDamage));
  return { damage, isCrit, isSupercrit, missed: false };
}

function randomChoice(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
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
    return pickSkillByNames(monster, ['つるたたき', '光合成']) || skills[0] || fallback;
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
  return (Array.isArray(buffs) ? buffs : [])
    .map((b) => ({ ...b, turns: (Number(b.turns) || 0) - 1 }))
    .filter((b) => b.turns > 0);
}

function checkEffectChance(skill) {
  // effect_chance が未設定の場合は 100% 扱い（既存スキル互換）
  const rawChance = Number(skill?.effect_chance);
  const chance = Number.isFinite(rawChance) ? rawChance : 100;
  return Math.random() * 100 < Math.max(0, Math.min(100, chance));
}

function applySkillEffect({ attacker, target, skill }) {
  if (!skill || !target || !skill.effect_type) return null;
  if (!checkEffectChance(skill)) return null;

  const effectType = skill.effect_type;
  const value = Number(skill.effect_value) || 0;
  const duration = Math.max(1, Math.floor(Number(skill.effect_duration) || 1));

  if (effectType === 'poison') {
    const applied = applyStatusEffect(target, {
      type: STATUS_TYPES.POISON,
      turns: duration,
      value,
      sourceAttack: getEffectiveStat(attacker, 'attack', attacker.buffs || []),
    });
    return applied ? effectType : null;
  }

  if (effectType.endsWith('_up') || effectType.endsWith('_down')) {
    target.buffs = applyBuff(target.buffs || [], effectType, value, duration);
    return effectType;
  }

  return null;
}

function processEndOfTurn(combatant, actorType, actions) {
  const combatantId = combatant.instance_id || combatant.id;
  combatant.buffs = tickBuffs(combatant.buffs || []);
  const statusEvents = processStatusEffectTick(combatant);

  for (const ev of statusEvents) {
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
      message: `${combatant.name} は ${STATUS_LABELS[ev.type] || ev.type} のダメージ ${ev.damage}！`,
    });
  }

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
      message: `${combatant.name} を倒した！`,
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

function processTurn(battleState, playerAction) {
  const { player, monsters } = battleState;
  const aliveMonsters = getAliveMonsters(monsters);

  if (aliveMonsters.length === 0) {
    return { actions: [], state: getBattleState(battleState), battleOver: true, result: 'win' };
  }

  const actions = [];
  let battleOver = false;
  let result = null;

  if (playerAction.actionType === 'escape') {
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

    if (participant.type === 'player') {
      if (player.hp <= 0) continue;
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
            player.mp = Math.max(0, player.mp - (Number(actualSkill.mp_cost) || 0));

            if (actualSkill.effect_type === 'self_hp_cost') {
              const selfCost = Math.floor(player.max_hp * ((Number(actualSkill.effect_value) || 0) / 100));
              player.hp = Math.max(1, player.hp - selfCost);
            }

            if (actualSkill.skill_type === 'buff') {
              player.buffs = applyBuff(
                player.buffs || [],
                actualSkill.effect_type,
                Number(actualSkill.effect_value) || 0,
                actualSkill.effect_duration || 1
              );
              actions.push({
                actorType: 'player', actorId: player.id,
                actionType: 'skill', targetId: player.id,
                skillName: actualSkill.name,
                specialSkill: !!actualSkill.is_special,
                damage: 0, heal: 0, statusEffect: actualSkill.effect_type,
                isCrit: false, isSupercrit: false, missed: false,
                message: `${player.name} は ${actualSkill.name} を使った！`,
              });
            } else if (actualSkill.skill_type === 'heal' && actualSkill.effect_type === 'heal_max_hp_percent') {
              const healAmount = Math.floor(player.max_hp * ((Number(actualSkill.effect_value) || 0) / 100));
              player.hp = Math.min(player.max_hp, player.hp + healAmount);
              actions.push({
                actorType: 'player', actorId: player.id,
                actionType: 'heal', targetId: player.id,
                skillName: actualSkill.name,
                specialSkill: !!actualSkill.is_special,
                damage: 0, heal: healAmount, statusEffect: null,
                isCrit: false, isSupercrit: false, missed: false,
                message: `${player.name} は ${actualSkill.name} で ${healAmount} 回復した！`,
              });
            } else {
              const { damage, isCrit, isSupercrit, missed } = calculateDamage(
                player,
                actualSkill,
                targetMonster,
                player.buffs || [],
                targetMonster.buffs || []
              );
              if (!missed) targetMonster.hp = Math.max(0, targetMonster.hp - damage);

              const statusEffect = !missed
                ? applySkillEffect({ attacker: player, target: targetMonster, skill: actualSkill })
                : null;

              actions.push({
                actorType: 'player', actorId: player.id,
                actionType: playerAction.actionType, targetId: targetMonster.instance_id || targetMonster.id,
                skillName: actualSkill.name,
                specialSkill: !!actualSkill.is_special,
                damage, heal: 0, statusEffect,
                isCrit, isSupercrit, missed,
                message: actualSkill.is_special
                  ? null
                  : (missed
                    ? `${targetMonster.name} はかわした！`
                    : `${player.name} は ${actualSkill.name} を使った！ ${damage} のダメージ！${isCrit ? (isSupercrit ? '超会心！' : '会心！') : ''}`),
              });

              if (targetMonster.hp <= 0 && !targetMonster.escaped) {
                actions.push({
                  actorType: 'system', actorId: null, actionType: 'defeated',
                  targetId: targetMonster.instance_id || targetMonster.id,
                  skillName: null, specialSkill: false,
                  damage: 0, heal: 0, statusEffect: null,
                  isCrit: false, isSupercrit: false, missed: false,
                  message: `${targetMonster.name} を倒した！`,
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

      if (player.hp > 0) processEndOfTurn(player, 'player', actions);
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
          message: `${monster.name} は動けない！`,
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
            damage: 0, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${monster.name} は逃げ出した！`,
          });
        } else if (skill.skill_type === 'heal' && skill.effect_type === 'heal_max_hp_percent') {
          const healAmount = Math.floor(monster.max_hp * ((Number(skill.effect_value) || 0) / 100));
          monster.hp = Math.min(monster.max_hp, monster.hp + healAmount);
          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'heal', targetId: monster.instance_id || monster.id,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            damage: 0, heal: healAmount, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${monster.name} は ${skill.name} で ${healAmount} 回復した！`,
          });
        } else if (skill.skill_type === 'buff') {
          monster.buffs = applyBuff(
            monster.buffs || [],
            skill.effect_type,
            Number(skill.effect_value) || 0,
            skill.effect_duration || 1
          );
          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'skill', targetId: monster.instance_id || monster.id,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            damage: 0, heal: 0, statusEffect: skill.effect_type,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${monster.name} は ${skill.name} を使った！`,
          });
        } else {
          const { damage, isCrit, isSupercrit, missed } = calculateDamage(
            monster,
            skill,
            player,
            monster.buffs || [],
            player.buffs || []
          );
          if (!missed) player.hp = Math.max(0, player.hp - damage);

          const statusEffect = !missed
            ? applySkillEffect({ attacker: monster, target: player, skill })
            : null;

          actions.push({
            actorType: 'monster', actorId: monster.instance_id || monster.id,
            actionType: 'attack', targetId: player.id,
            skillName: skill.name,
            specialSkill: !!skill.is_special,
            damage, heal: 0, statusEffect,
            isCrit, isSupercrit, missed,
            message: skill.is_special
              ? null
              : (missed
                ? `${player.name} はかわした！`
                : `${monster.name} の ${skill.name}！ ${damage} のダメージ！${isCrit ? (isSupercrit ? '超会心！' : '会心！') : ''}`),
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
        processEndOfTurn(monster, 'monster', actions);
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

  battleState.turn += 1;

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
    exp += Math.floor((m.base_hp / 4 + m.base_attack / 2) * floorMult);
    money += Math.floor((m.base_hp / 8 + m.base_defense / 4) * floorMult);
  }

  return { exp, money };
}

module.exports = {
  processTurn,
  getBattleState,
  calculateRewards,
  calculateDamage,
  selectEnemyAction,
  getElementMultiplier,
};
