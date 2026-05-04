// バトルエンジン
// ダメージ計算・ターン処理・敵AIロジックを担当する

const { checkActionRestriction, processStatusEffectTick } = require('./statusEffects');

// ===== 通常攻撃スキル定数 =====
const NORMAL_ATTACK = {
  id: 0, name: '通常攻撃', element: 'none', skill_type: 'physical', power: 100, mp_cost: 0,
};

// ===== 属性相性テーブル =====
const ELEMENT_TABLE = {
  fire:  { wood: 1.5, water: 0.5 },
  water: { fire: 1.5, wood:  0.5 },
  wood:  { water: 1.5, fire: 0.5 },
  light: { dark: 1.5 },
  dark:  { light: 1.5 },
};

/**
 * 属性相性補正値を返す
 * @param {string} atkElement - 攻撃側属性
 * @param {string} defElement - 防御側属性
 * @returns {number}
 */
function getElementMultiplier(atkElement, defElement) {
  if (!atkElement || !defElement) return 1.0;
  const row = ELEMENT_TABLE[atkElement];
  if (!row) return 1.0;
  return row[defElement] || 1.0;
}

/**
 * 会心判定を行う
 * @param {number} critRate - 会心率（%、0〜200）
 * @returns {{ isCrit: boolean, isSupercrit: boolean, multiplier: number }}
 */
function processCrit(critRate) {
  const rate = Math.min(200, Math.max(0, critRate));
  if (rate >= 100) {
    // 会心確定
    const superCritChance = rate - 100;
    const isSupercrit = Math.random() * 100 < superCritChance;
    return { isCrit: true, isSupercrit, multiplier: isSupercrit ? 2.0 : 1.5 };
  }
  const isCrit = Math.random() * 100 < rate;
  return { isCrit, isSupercrit: false, multiplier: isCrit ? 1.5 : 1.0 };
}

/**
 * ダメージを計算する
 * 式: 攻撃力 × (スキル倍率) × 属性相性補正 - 防御力 × 0.5
 * 最低1ダメージ保証
 * @param {object} attacker - 攻撃者ステータス
 * @param {object} skill    - スキルデータ（power: 倍率×100）
 * @param {object} target   - 防御者ステータス
 * @param {object} buffs    - attacker のバフ情報
 * @returns {{ damage: number, isCrit: boolean, isSupercrit: boolean, missed: boolean }}
 */
function calculateDamage(attacker, skill, target, buffs) {
  // 回避判定
  const missed = Math.random() * 100 < (target.evasion_rate || 0);
  if (missed) return { damage: 0, isCrit: false, isSupercrit: false, missed: true };

  // 実際の攻撃力（バフ適用）
  let atkPower = attacker.attack;
  const defenseBuff = (buffs || []).find((b) => b.type === 'defense_up');
  const defValue = defenseBuff
    ? target.defense * (1 + defenseBuff.value / 100)
    : target.defense;

  const powerMultiplier = (skill.power || 100) / 100;
  const elementMult = getElementMultiplier(skill.element || 'none', target.element || 'none');

  // 会心判定（バフ適用）
  const critBuff = (buffs || []).find((b) => b.type === 'crit_up');
  const effectiveCrit = (attacker.crit_rate || 0) + (critBuff ? critBuff.value : 0);
  const { isCrit, isSupercrit, multiplier } = processCrit(effectiveCrit);

  const rawDamage =
    atkPower * powerMultiplier * elementMult * multiplier - defValue * 0.5;

  const damage = Math.max(1, Math.floor(rawDamage));
  return { damage, isCrit, isSupercrit, missed: false };
}

/**
 * 敵AIが行動するスキルを選択する
 * - 通常時: ランダム選択（MP不足なら通常攻撃）
 * - HP50%以下: スキルリスト後半を2倍の重みで選択
 * @param {object} monster - モンスター戦闘状態
 * @returns {object} 選択されたスキル
 */
function selectEnemyAction(monster) {
  const skills = monster.skills || [];

  if (skills.length === 0) return NORMAL_ATTACK;

  // MP足りるスキルのみ候補に
  const usable = skills.filter((s) => (s.mp_cost || 0) <= monster.mp);
  if (usable.length === 0) return NORMAL_ATTACK;

  const isLowHp = monster.hp <= monster.max_hp * 0.5;

  if (!isLowHp) {
    return usable[Math.floor(Math.random() * usable.length)];
  }

  // HP50%以下: 後半スキルを2倍重み
  const half = Math.ceil(usable.length / 2);
  const weights = usable.map((_, i) => (i >= half ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let rnd = Math.random() * total;
  for (let i = 0; i < usable.length; i++) {
    rnd -= weights[i];
    if (rnd <= 0) return usable[i];
  }
  return usable[usable.length - 1];
}

/**
 * バフ/デバフを適用する
 * 同じバフ・デバフは新しい方で上書き、異なるものは共存
 * @param {Array} buffs - 既存バフ配列
 * @param {string} type - バフ種別
 * @param {number} value - 効果値
 * @param {number} turns - 持続ターン数（バフ3 / デバフ2）
 * @returns {Array} 更新後のバフ配列
 */
function applyBuff(buffs, type, value, turns) {
  const filtered = buffs.filter((b) => b.type !== type);
  filtered.push({ type, value, turns });
  return filtered;
}

/**
 * ターン終了時にバフ/デバフのターン数を減らす
 * @param {Array} buffs - バフ配列
 * @returns {Array} 更新後のバフ配列
 */
function tickBuffs(buffs) {
  return buffs
    .map((b) => ({ ...b, turns: b.turns - 1 }))
    .filter((b) => b.turns > 0);
}

/**
 * 1ターンを処理する
 * @param {object} battleState - 現在のバトル状態
 * @param {object} playerAction - プレイヤーの行動
 * @returns {{ actions: Array, state: object, battleOver: boolean, result: string }}
 */
function processTurn(battleState, playerAction) {
  const { player, monsters } = battleState;
  // 生存モンスターのみ対象
  const aliveMonsters = monsters.filter((m) => m.hp > 0);
  if (aliveMonsters.length === 0) {
    return { actions: [], state: getBattleState(battleState), battleOver: true, result: 'win' };
  }

  const actions = [];
  let battleOver = false;
  let result = null;

  // 逃走処理
  if (playerAction.actionType === 'escape') {
    const escapeChance = Math.min(90, 30 + (player.speed - aliveMonsters[0].speed) * 2);
    if (Math.random() * 100 < escapeChance) {
      actions.push({
        actorType: 'player', actorId: player.id,
        actionType: 'escape', targetId: null,
        damage: 0, heal: 0, statusEffect: null,
        isCrit: false, isSupercrit: false, missed: false,
        message: '逃げ切った！',
      });
      return { actions, state: getBattleState(battleState), battleOver: true, result: 'escape' };
    } else {
      actions.push({
        actorType: 'player', actorId: player.id,
        actionType: 'escape', targetId: null,
        damage: 0, heal: 0, statusEffect: null,
        isCrit: false, isSupercrit: false, missed: false,
        message: '逃げられなかった！',
      });
    }
  }

  // 行動順決定（素早さ順、同値は50%ランダム）
  const participants = [
    { type: 'player', data: player },
    ...aliveMonsters.map((m) => ({ type: 'monster', data: m })),
  ];
  participants.sort((a, b) => {
    const diff = b.data.speed - a.data.speed;
    if (diff !== 0) return diff;
    return Math.random() < 0.5 ? -1 : 1;
  });

  for (const participant of participants) {
    // 既に戦闘が終わっているなら残りの行動をスキップ
    if (battleOver) break;

    if (participant.type === 'player') {
      // プレイヤーターン（逃走以外）
      if (playerAction.actionType === 'escape') continue;

      const restriction = checkActionRestriction(player);
      if (!restriction.canAct) {
        actions.push({
          actorType: 'player', actorId: player.id,
          actionType: 'skip', targetId: null,
          damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: '行動できない！',
        });
        continue;
      }

      // 対象モンスター
      const targetMonster = aliveMonsters.find(
        (m) => String(m.id) === String(playerAction.targetId)
      ) || aliveMonsters[0];

      if (playerAction.actionType === 'skill' || playerAction.actionType === 'attack') {
        const skill = playerAction.skill || NORMAL_ATTACK;

        // 呪い状態なら通常攻撃に強制
        const actualSkill = restriction.forceNormalAttack ? NORMAL_ATTACK : skill;

        // 混乱：自分自身へのダメージ（通常攻撃）
        if (restriction.selfAttack) {
          const { damage } = calculateDamage(player, NORMAL_ATTACK, player, []);
          player.hp = Math.max(0, player.hp - damage);
          actions.push({
            actorType: 'player', actorId: player.id,
            actionType: 'attack', targetId: player.id,
            skillName: '通常攻撃（混乱）',
            damage, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${player.name} は混乱して自分を攻撃した！ ${damage} のダメージ！`,
          });
          if (player.hp <= 0) {
            battleOver = true;
            result = 'lose';
          }
          continue;
        }

        // MP消費
        player.mp = Math.max(0, player.mp - (actualSkill.mp_cost || 0));

        // 捨て身斬り：自HP20%消費
        if (actualSkill.effect_type === 'self_hp_cost') {
          const selfCost = Math.floor(player.max_hp * (actualSkill.effect_value / 100));
          player.hp = Math.max(1, player.hp - selfCost);
        }

        if (actualSkill.skill_type === 'buff') {
          // バフスキル
          player.buffs = applyBuff(
            player.buffs || [],
            actualSkill.effect_type,
            actualSkill.effect_value,
            actualSkill.effect_duration || 3
          );
          actions.push({
            actorType: 'player', actorId: player.id,
            actionType: 'skill', targetId: player.id,
            skillName: actualSkill.name,
            damage: 0, heal: 0, statusEffect: actualSkill.effect_type,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${player.name} は ${actualSkill.name} を使った！`,
          });
        } else {
          // 攻撃スキル
          const { damage, isCrit, isSupercrit, missed } = calculateDamage(
            player, actualSkill, targetMonster, player.buffs || []
          );
          if (!missed) targetMonster.hp = Math.max(0, targetMonster.hp - damage);

          actions.push({
            actorType: 'player', actorId: player.id,
            actionType: playerAction.actionType, targetId: targetMonster.id,
            skillName: actualSkill.name,
            damage, heal: 0, statusEffect: null,
            isCrit, isSupercrit, missed,
            message: missed
              ? `${targetMonster.name} はかわした！`
              : `${player.name} は ${actualSkill.name} を使った！ ${damage} のダメージ！` +
                (isCrit ? (isSupercrit ? '超会心！' : '会心！') : ''),
          });

          if (targetMonster.hp <= 0) {
            actions.push({
              actorType: 'system', actorId: null, actionType: 'defeated',
              targetId: targetMonster.id,
              damage: 0, heal: 0, statusEffect: null,
              isCrit: false, isSupercrit: false, missed: false,
              message: `${targetMonster.name} を倒した！`,
            });
          }
        }
      } else if (playerAction.actionType === 'capture') {
        // 仲間にする（今回はUIのみ）
        actions.push({
          actorType: 'player', actorId: player.id,
          actionType: 'capture', targetId: targetMonster.id,
          damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: 'まだ仲間にする機能は未実装です...',
        });
      }

    } else {
      // モンスターターン
      const monster = participant.data;
      if (monster.hp <= 0) continue;

      const restriction = checkActionRestriction(monster);
      if (!restriction.canAct) {
        actions.push({
          actorType: 'monster', actorId: monster.id,
          actionType: 'skip', targetId: null,
          damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: `${monster.name} は動けない！`,
        });
        continue;
      }

      const skill = selectEnemyAction(monster);
      monster.mp = Math.max(0, monster.mp - (skill.mp_cost || 0));

      if (skill.skill_type === 'debuff') {
        // デバフ攻撃
        player.buffs = applyBuff(player.buffs || [], skill.effect_type, -(skill.effect_value || 0), 2);
        actions.push({
          actorType: 'monster', actorId: monster.id,
          actionType: 'skill', targetId: player.id,
          skillName: skill.name,
          damage: 0, heal: 0, statusEffect: skill.effect_type,
          isCrit: false, isSupercrit: false, missed: false,
          message: `${monster.name} は ${skill.name} を使った！`,
        });
      } else {
        // 通常攻撃・物理スキル
        const { damage, isCrit, isSupercrit, missed } = calculateDamage(
          monster, skill, player, []
        );
        if (!missed) player.hp = Math.max(0, player.hp - damage);

        actions.push({
          actorType: 'monster', actorId: monster.id,
          actionType: 'attack', targetId: player.id,
          skillName: skill.name,
          damage, heal: 0, statusEffect: null,
          isCrit, isSupercrit, missed,
          message: missed
            ? `${player.name} はかわした！`
            : `${monster.name} の ${skill.name}！ ${damage} のダメージ！` +
              (isCrit ? (isSupercrit ? '超会心！' : '会心！') : ''),
        });

        if (player.hp <= 0) {
          battleOver = true;
          result = 'lose';
          actions.push({
            actorType: 'system', actorId: null, actionType: 'defeated',
            targetId: player.id,
            damage: 0, heal: 0, statusEffect: null,
            isCrit: false, isSupercrit: false, missed: false,
            message: `${player.name} は倒れた...`,
          });
        }
      }
    }
  }

  // ターン終了処理: バフ・デバフ・状態異常のターン経過
  player.buffs = tickBuffs(player.buffs || []);
  for (const m of monsters) {
    m.buffs = tickBuffs(m.buffs || []);
  }

  const playerStatusEvents = processStatusEffectTick(player);
  for (const ev of playerStatusEvents) {
    actions.push({
      actorType: 'system', actorId: null, actionType: 'status_damage',
      targetId: player.id, damage: ev.damage, heal: 0, statusEffect: ev.type,
      isCrit: false, isSupercrit: false, missed: false,
      message: `${player.name} は ${ev.type === 'poison' ? '毒' : 'やけど'} のダメージ ${ev.damage}！`,
    });
    if (player.hp <= 0 && !battleOver) {
      battleOver = true;
      result = 'lose';
    }
  }

  for (const m of aliveMonsters) {
    const events = processStatusEffectTick(m);
    for (const ev of events) {
      actions.push({
        actorType: 'system', actorId: null, actionType: 'status_damage',
        targetId: m.id, damage: ev.damage, heal: 0, statusEffect: ev.type,
        isCrit: false, isSupercrit: false, missed: false,
        message: `${m.name} は ${ev.type === 'poison' ? '毒' : 'やけど'} のダメージ ${ev.damage}！`,
      });
      if (m.hp <= 0) {
        actions.push({
          actorType: 'system', actorId: null, actionType: 'defeated',
          targetId: m.id, damage: 0, heal: 0, statusEffect: null,
          isCrit: false, isSupercrit: false, missed: false,
          message: `${m.name} を倒した！`,
        });
      }
    }
  }

  // 全モンスターが倒れたか確認
  if (!battleOver && monsters.every((m) => m.hp <= 0)) {
    battleOver = true;
    result = 'win';
  }

  battleState.turn += 1;

  return {
    actions,
    state: getBattleState(battleState),
    battleOver,
    result,
  };
}

/**
 * バトル状態のスナップショットを返す（送信用）
 */
function getBattleState(battleState) {
  return {
    player: {
      id: battleState.player.id,
      name: battleState.player.name,
      hp: battleState.player.hp,
      maxHp: battleState.player.max_hp,
      mp: battleState.player.mp,
      maxMp: battleState.player.max_mp,
      buffs: battleState.player.buffs || [],
      statusEffects: (battleState.player.statusEffects || []).map((e) => e.type),
    },
    monsters: battleState.monsters.map((m) => ({
      id: m.id,
      name: m.name,
      hp: m.hp,
      maxHp: m.max_hp,
      mp: m.mp,
      maxMp: m.max_mp,
      buffs: m.buffs || [],
      statusEffects: (m.statusEffects || []).map((e) => e.type),
      isAlive: m.hp > 0,
    })),
  };
}

/**
 * 勝利時の経験値・お金を計算する
 * @param {Array} monsters - 倒したモンスター配列
 * @param {number} floor - ダンジョンフロア
 * @returns {{ exp: number, money: number }}
 */
function calculateRewards(monsters, floor) {
  const floorMult = Math.pow(1.1, (floor || 1) - 1);
  let exp = 0;
  let money = 0;
  for (const m of monsters) {
    exp   += Math.floor((m.base_hp / 4 + m.base_attack / 2) * floorMult);
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
