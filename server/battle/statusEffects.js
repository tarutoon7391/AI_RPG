// 状態異常処理モジュール

const STATUS_TYPES = {
  POISON: 'poison',
  BURN: 'burn',
  STUN: 'stun',
  CONFUSION: 'confusion',
  SLEEP: 'sleep',
  PARALYSIS: 'paralysis',
  CURSE: 'curse',
};

function normalizeDuration(turns, fallback = 1) {
  const n = Number(turns);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function decrementTurns(turns) {
  return Math.max(0, Math.floor(Number(turns) || 0) - 1);
}

function normalizePercent(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

/**
 * 状態異常を付与する（同種は上書き）
 * @param {object} target
 * @param {{type:string, turns?:number, value?:number, sourceAttack?:number}} config
 * @returns {object|null}
 */
function applyStatusEffect(target, config) {
  if (!target || !config || !config.type) return null;
  if (!target.statusEffects) target.statusEffects = [];

  const type = String(config.type);
  const turns = normalizeDuration(config.turns, 1);
  const value = normalizePercent(config.value, 0);
  const sourceAttack = Math.max(0, Number(config.sourceAttack) || 0);

  const entry = {
    type,
    turns,
  };

  if (type === STATUS_TYPES.POISON || type === STATUS_TYPES.BURN) {
    entry.value = value;
    entry.damagePerTurn = Math.max(1, Math.floor(sourceAttack * (value / 100)));
  }

  const idx = target.statusEffects.findIndex((e) => e.type === type);
  if (idx >= 0) {
    target.statusEffects[idx] = entry;
  } else {
    target.statusEffects.push(entry);
  }

  return entry;
}

/**
 * ターン開始時に状態異常による行動制限を確認する
 * @param {object} combatant
 * @returns {{ canAct: boolean, forceNormalAttack: boolean, selfAttack: boolean }}
 */
function checkActionRestriction(combatant) {
  const result = { canAct: true, forceNormalAttack: false, selfAttack: false };
  if (!combatant || !Array.isArray(combatant.statusEffects)) return result;

  for (const e of combatant.statusEffects) {
    if ([STATUS_TYPES.STUN, STATUS_TYPES.SLEEP, STATUS_TYPES.PARALYSIS].includes(e.type)) {
      result.canAct = false;
      return result;
    }
    if (e.type === STATUS_TYPES.CONFUSION) {
      if (Math.random() < 0.5) result.selfAttack = true;
      return result;
    }
    if (e.type === STATUS_TYPES.CURSE) {
      result.forceNormalAttack = true;
    }
  }

  return result;
}

/**
 * ターン終了時に状態異常のダメージ処理とターン経過を行う
 * @param {object} combatant
 * @returns {{damageEvents:Array<{type:string, damage:number, combatantId:any}>, expiredEffects:Array<{type:string}>}}
 */
function processStatusEffectTick(combatant) {
  if (!combatant || !Array.isArray(combatant.statusEffects) || combatant.statusEffects.length === 0) {
    return { damageEvents: [], expiredEffects: [] };
  }

  const damageEvents = [];
  const expiredEffects = [];

  combatant.statusEffects = combatant.statusEffects.filter((e) => {
    if ((e.type === STATUS_TYPES.POISON || e.type === STATUS_TYPES.BURN) && combatant.hp > 0) {
      const dmg = Math.max(1, Number(e.damagePerTurn) || 1);
      combatant.hp = Math.max(0, combatant.hp - dmg);
      damageEvents.push({ type: e.type, damage: dmg, combatantId: combatant.id });
    }

    e.turns = decrementTurns(e.turns || 1);
    const isActive = e.turns > 0;
    if (!isActive) {
      expiredEffects.push({ type: e.type });
    }
    return isActive;
  });

  return { damageEvents, expiredEffects };
}

module.exports = {
  STATUS_TYPES,
  applyStatusEffect,
  checkActionRestriction,
  processStatusEffectTick,
};
