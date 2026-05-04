// 状態異常処理モジュール
// 毒・やけど・動けない・混乱・睡眠・麻痺・呪い の7種を管理する

/**
 * 状態異常の種別定数
 */
const STATUS_TYPES = {
  POISON:    'poison',    // 毒
  BURN:      'burn',      // やけど
  STUN:      'stun',      // 動けない
  CONFUSION: 'confusion', // 混乱
  SLEEP:     'sleep',     // 睡眠
  PARALYSIS: 'paralysis', // 麻痺
  CURSE:     'curse',     // 呪い
};

/**
 * 状態異常を付与する
 * @param {object} target - 付与対象の戦闘者オブジェクト（statusEffects 配列を持つ）
 * @param {string} effectType - STATUS_TYPES の値
 * @param {number} attackerAttack - 付与者の攻撃力（毒・やけど のダメージ計算用）
 * @returns {object} 付与された状態異常エントリ or null
 */
function applyStatusEffect(target, effectType, attackerAttack) {
  if (!target.statusEffects) target.statusEffects = [];

  switch (effectType) {
    case STATUS_TYPES.POISON: {
      // 同一キャラが再付与→ターン数3にリセット
      // 別キャラ付与→新しい攻撃力参照で上書き、ターン3にリセット
      const idx = target.statusEffects.findIndex((e) => e.type === STATUS_TYPES.POISON);
      const entry = {
        type: STATUS_TYPES.POISON,
        turns: 3,
        damagePerTurn: Math.floor(attackerAttack * 0.4),
      };
      if (idx >= 0) {
        target.statusEffects[idx] = entry;
      } else {
        target.statusEffects.push(entry);
      }
      return entry;
    }

    case STATUS_TYPES.BURN: {
      // 重ねがけ可能（攻撃力を上乗せ、ターン数は変わらず）
      const existing = target.statusEffects.find((e) => e.type === STATUS_TYPES.BURN);
      if (existing) {
        existing.damagePerTurn += Math.floor(attackerAttack * 0.4);
        return existing;
      }
      const entry = {
        type: STATUS_TYPES.BURN,
        turns: 3,
        damagePerTurn: Math.floor(attackerAttack * 0.4),
      };
      target.statusEffects.push(entry);
      return entry;
    }

    case STATUS_TYPES.STUN:
    case STATUS_TYPES.SLEEP:
    case STATUS_TYPES.PARALYSIS:
    case STATUS_TYPES.CURSE: {
      // 重ねがけ無効
      if (target.statusEffects.some((e) => e.type === effectType)) return null;
      const entry = { type: effectType, turns: 1 };
      target.statusEffects.push(entry);
      return entry;
    }

    case STATUS_TYPES.CONFUSION: {
      // 重ねがけ無効、2か3ターン（50%ずつ）
      if (target.statusEffects.some((e) => e.type === STATUS_TYPES.CONFUSION)) return null;
      const entry = {
        type: STATUS_TYPES.CONFUSION,
        turns: Math.random() < 0.5 ? 2 : 3,
      };
      target.statusEffects.push(entry);
      return entry;
    }

    default:
      return null;
  }
}

/**
 * ターン開始時に状態異常による行動制限を確認する
 * @param {object} combatant - 戦闘者
 * @returns {{ canAct: boolean, forceNormalAttack: boolean, selfAttack: boolean }}
 */
function checkActionRestriction(combatant) {
  const result = { canAct: true, forceNormalAttack: false, selfAttack: false };
  if (!combatant.statusEffects) return result;

  for (const e of combatant.statusEffects) {
    if ([STATUS_TYPES.STUN, STATUS_TYPES.SLEEP, STATUS_TYPES.PARALYSIS].includes(e.type)) {
      result.canAct = false;
      return result;
    }
    if (e.type === STATUS_TYPES.CONFUSION) {
      if (Math.random() < 0.5) {
        result.selfAttack = true; // 味方（自分）へのランダム通常攻撃
      }
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
 * @param {object} combatant - 戦闘者
 * @returns {Array} 処理済みイベントログ
 */
function processStatusEffectTick(combatant) {
  if (!combatant.statusEffects || combatant.statusEffects.length === 0) return [];
  const events = [];

  combatant.statusEffects = combatant.statusEffects.filter((e) => {
    // ダメージ処理
    if (e.type === STATUS_TYPES.POISON || e.type === STATUS_TYPES.BURN) {
      const dmg = Math.max(1, e.damagePerTurn);
      combatant.hp = Math.max(0, combatant.hp - dmg);
      events.push({ type: e.type, damage: dmg, combatantId: combatant.id });
    }

    // ターン数を減らし0以下なら除去
    e.turns -= 1;
    return e.turns > 0;
  });

  return events;
}

module.exports = {
  STATUS_TYPES,
  applyStatusEffect,
  checkActionRestriction,
  processStatusEffectTick,
};
