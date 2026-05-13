const EQUIP_SLOT_KEYS = ['head', 'body', 'legs', 'shoes', 'accessory'];

const EQUIPMENT_MASTER = Object.freeze({
  head: Object.freeze([
    Object.freeze({ id: 'head_1', bonus: Object.freeze({ defense: 3, evasionRate: 2 }) }),
    Object.freeze({ id: 'head_2', bonus: Object.freeze({ defense: 15, maxHp: 30 }) }),
  ]),
  body: Object.freeze([
    Object.freeze({ id: 'body_1', bonus: Object.freeze({ defense: 5, recovery: 3 }) }),
    Object.freeze({ id: 'body_2', bonus: Object.freeze({ defense: 20, maxHp: 40, speed: -3 }) }),
  ]),
  legs: Object.freeze([
    Object.freeze({ id: 'legs_1', bonus: Object.freeze({ defense: 4, speed: 2 }) }),
    Object.freeze({ id: 'legs_2', bonus: Object.freeze({ defense: 12, maxHp: 20 }) }),
  ]),
  shoes: Object.freeze([
    Object.freeze({ id: 'shoes_1', bonus: Object.freeze({ speed: 8, evasionRate: 3 }) }),
    Object.freeze({ id: 'shoes_2', bonus: Object.freeze({ defense: 6, speed: -2 }) }),
  ]),
  accessory: Object.freeze([
    Object.freeze({ id: 'acc_1', bonus: Object.freeze({ attack: 10 }) }),
    Object.freeze({ id: 'acc_2', bonus: Object.freeze({ maxMp: 20, recovery: 8 }) }),
    Object.freeze({ id: 'acc_3', bonus: Object.freeze({ charm: 10, critRate: 2 }) }),
  ]),
});

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInt(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, toInt(value, min)));
}

function normalizeEquippedItems(source) {
  const normalized = {};
  const base = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  EQUIP_SLOT_KEYS.forEach((slot) => {
    normalized[slot] = (typeof base[slot] === 'string' && base[slot].trim()) || null;
  });
  return normalized;
}

function getMasterItem(slot, itemId) {
  if (!slot || !itemId) return null;
  const list = EQUIPMENT_MASTER[slot];
  if (!Array.isArray(list)) return null;
  return list.find((item) => item && item.id === itemId) || null;
}

function calcEquipmentBonus(equippedItems) {
  const equipment = normalizeEquippedItems(equippedItems);
  const result = {
    hp: 0,
    maxHp: 0,
    mp: 0,
    maxMp: 0,
    attack: 0,
    defense: 0,
    recovery: 0,
    speed: 0,
    critRate: 0,
    evasionRate: 0,
    charm: 0,
  };

  EQUIP_SLOT_KEYS.forEach((slot) => {
    const item = getMasterItem(slot, equipment[slot]);
    if (!item || !item.bonus || typeof item.bonus !== 'object') return;
    const bonus = item.bonus;
    result.hp += toInt(bonus.hp, 0);
    result.maxHp += toInt(bonus.maxHp, 0);
    result.mp += toInt(bonus.mp, 0);
    result.maxMp += toInt(bonus.maxMp, 0);
    result.attack += toInt(bonus.attack, 0);
    result.defense += toInt(bonus.defense, 0);
    result.recovery += toInt(bonus.recovery, 0);
    result.speed += toInt(bonus.speed, 0);
    result.critRate += toNumber(bonus.critRate, 0);
    result.evasionRate += toNumber(bonus.evasionRate, 0);
    result.charm += toInt(bonus.charm, 0);
  });

  return result;
}

function applyEquipmentBonusToCharacter(character) {
  if (!character || typeof character !== 'object') return character;
  const equippedItems = normalizeEquippedItems(character.equipped_items);
  const bonus = calcEquipmentBonus(equippedItems);
  const maxHp = Math.max(1, toInt(character.max_hp, 0) + bonus.maxHp);
  const maxMp = Math.max(0, toInt(character.max_mp, 0) + bonus.maxMp);
  const hp = clampInt(toInt(character.hp, 0) + bonus.hp, 0, maxHp);
  const mp = clampInt(toInt(character.mp, 0) + bonus.mp, 0, maxMp);

  return {
    ...character,
    equipped_items: equippedItems,
    hp,
    max_hp: maxHp,
    mp,
    max_mp: maxMp,
    attack: Math.max(0, toInt(character.attack, 0) + bonus.attack),
    defense: Math.max(0, toInt(character.defense, 0) + bonus.defense),
    recovery: Math.max(0, toInt(character.recovery, 0) + bonus.recovery),
    speed: Math.max(0, toInt(character.speed, 0) + bonus.speed),
    crit_rate: Math.max(0, toNumber(character.crit_rate, 0) + bonus.critRate),
    evasion_rate: Math.max(0, toNumber(character.evasion_rate, 0) + bonus.evasionRate),
    charm: Math.max(0, toInt(character.charm, 0) + bonus.charm),
  };
}

function calcEquipmentResourceAdjustment(character, nextEquippedItemsRaw) {
  const characterRow = character && typeof character === 'object' ? character : {};
  const prevEquippedItems = normalizeEquippedItems(characterRow.equipped_items);
  const nextEquippedItems = normalizeEquippedItems(nextEquippedItemsRaw);
  const prevBonus = calcEquipmentBonus(prevEquippedItems);
  const nextBonus = calcEquipmentBonus(nextEquippedItems);

  const baseMaxHp = Math.max(1, toInt(characterRow.max_hp, 1));
  const baseMaxMp = Math.max(0, toInt(characterRow.max_mp, 0));
  const prevEffectiveMaxHp = Math.max(1, baseMaxHp + prevBonus.maxHp);
  const prevEffectiveMaxMp = Math.max(0, baseMaxMp + prevBonus.maxMp);
  const nextEffectiveMaxHp = Math.max(1, baseMaxHp + nextBonus.maxHp);
  const nextEffectiveMaxMp = Math.max(0, baseMaxMp + nextBonus.maxMp);

  const prevEffectiveHp = clampInt(toInt(characterRow.hp, 0) + prevBonus.hp, 0, prevEffectiveMaxHp);
  const prevEffectiveMp = clampInt(toInt(characterRow.mp, 0) + prevBonus.mp, 0, prevEffectiveMaxMp);
  // 最大値が上がった場合は新最大まで全回復、下がった場合は新最大までクランプする
  const nextEffectiveHp = nextEffectiveMaxHp > prevEffectiveMaxHp
    ? nextEffectiveMaxHp
    : Math.min(prevEffectiveHp, nextEffectiveMaxHp);
  const nextEffectiveMp = nextEffectiveMaxMp > prevEffectiveMaxMp
    ? nextEffectiveMaxMp
    : Math.min(prevEffectiveMp, nextEffectiveMaxMp);

  const nextStoredHp = Math.max(0, toInt(nextEffectiveHp - nextBonus.hp, 0));
  const nextStoredMp = Math.max(0, toInt(nextEffectiveMp - nextBonus.mp, 0));

  return {
    nextEquippedItems,
    nextStoredHp,
    nextStoredMp,
    nextEffectiveHp,
    nextEffectiveMp,
    nextEffectiveMaxHp,
    nextEffectiveMaxMp,
  };
}

module.exports = {
  EQUIP_SLOT_KEYS,
  normalizeEquippedItems,
  calcEquipmentBonus,
  applyEquipmentBonusToCharacter,
  calcEquipmentResourceAdjustment,
};
