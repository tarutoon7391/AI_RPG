(function () {
  const SAVE_KEY = 'ai_rpg_save';
  const DEFAULT_JOB_LEVEL = 1;
  const LOCKED_JOB_LEVEL_DISPLAY = 'Lv-';
  const BEGINNER_JOB_OPTIONS = ['戦士', '魔法使い', '僧侶', '盗賊', '狩人', '格闘家', 'まものつかい'];
  const ADVANCED_JOB_OPTIONS = ['未実装'];
  const SPECIAL_JOB_OPTIONS = ['未実装'];
  const JOB_TAB_DEFINITIONS = [
    { key: 'beginner', label: '基本職', jobs: BEGINNER_JOB_OPTIONS, selectable: true },
    {
      key: 'advanced',
      label: '上級職',
      jobs: ADVANCED_JOB_OPTIONS,
      selectable: false,
      unlockMessage: '解放条件: 上級職は未実装のため現在は選択できません',
    },
    {
      key: 'special',
      label: '特級職',
      jobs: SPECIAL_JOB_OPTIONS,
      selectable: false,
      unlockMessage: '解放条件: 特級職は未実装のため現在は選択できません',
    },
  ];
  const EQUIP_SLOT_LABELS = {
    head: '頭',
    body: '体',
    legs: '足',
    shoes: '靴',
    accessory: 'アクセサリー',
  };
  const DEFAULT_EQUIP_INVENTORY = {
    head: [
      { id: 'head_1', name: '革の帽子', bonus: { defense: 3, evasionRate: 2 } },
      { id: 'head_2', name: '鉄の兜', bonus: { defense: 15, maxHp: 30 } },
    ],
    body: [
      { id: 'body_1', name: '旅人の服', bonus: { defense: 5, recovery: 3 } },
      { id: 'body_2', name: '鋼の鎧', bonus: { defense: 20, maxHp: 40, speed: -3 } },
    ],
    legs: [
      { id: 'legs_1', name: '革の脚衣', bonus: { defense: 4, speed: 2 } },
      { id: 'legs_2', name: '守りの脚当て', bonus: { defense: 12, maxHp: 20 } },
    ],
    shoes: [
      { id: 'shoes_1', name: '俊足の靴', bonus: { speed: 8, evasionRate: 3 } },
      { id: 'shoes_2', name: '鉄底ブーツ', bonus: { defense: 6, speed: -2 } },
    ],
    accessory: [
      { id: 'acc_1', name: '力の指輪', bonus: { attack: 10 } },
      { id: 'acc_2', name: '祈りの首飾り', bonus: { maxMp: 20, recovery: 8 } },
      { id: 'acc_3', name: '魅了のブローチ', bonus: { charm: 10, critRate: 2 } },
    ],
  };
  const DEFAULT_EQUIPPED = {
    head: null,
    body: null,
    legs: null,
    shoes: null,
    accessory: null,
  };
  const DEFAULT_CHARACTER_UI = {
    selectedJobName: '戦士',
    beginnerJobs: BEGINNER_JOB_OPTIONS,
    jobLevels: {},
    lastGrowthJobName: null,
    equipment: DEFAULT_EQUIPPED,
    equipmentInventory: DEFAULT_EQUIP_INVENTORY,
  };
  const POPUP_HEIGHT_BUFFER = 200;
  const POPUP_WIDTH_BUFFER = 270;
  const POPUP_MIN_MARGIN = 8;
  const DEFAULT_ACTION_DELAY_MS = 700;
  const DEFEAT_LOG_DELAY_MS = 1000;
  const EFFECT_ICON_MAP = {
    poison: '🟣',
    speed_up: '⚡',
    speed_down: '⬇️',
    defense_up: '🛡️',
    attack_up: '⚔️',
    defense_down: '🛡️⬇️',
    attack_down: '⚔️⬇️',
    sleep: '💤',
  };
  const EFFECT_NAME_MAP = {
    poison: '毒',
    speed_up: '素早さアップ',
    speed_down: '素早さダウン',
    defense_up: '防御アップ',
    attack_up: '攻撃アップ',
    defense_down: '防御ダウン',
    attack_down: '攻撃ダウン',
    sleep: '眠り',
  };
  const JOB_GROWTH_TABLE = {
    戦士: { hp: 15, mp: 2, attack: 4, defense: 4, recovery: 1, speed: 2, charm: 1 },
    魔法使い: { hp: 8, mp: 8, attack: 5, defense: 2, recovery: 2, speed: 2, charm: 1 },
    僧侶: { hp: 10, mp: 6, attack: 2, defense: 3, recovery: 5, speed: 1, charm: 2 },
    盗賊: { hp: 10, mp: 3, attack: 3, defense: 2, recovery: 1, speed: 5, charm: 2 },
    狩人: { hp: 10, mp: 3, attack: 3, defense: 2, recovery: 1, speed: 4, charm: 3 },
    格闘家: { hp: 12, mp: 1, attack: 6, defense: 3, recovery: 1, speed: 3, charm: 1 },
    まものつかい: { hp: 10, mp: 4, attack: 3, defense: 2, recovery: 2, speed: 2, charm: 5 },
  };

  const defaultSave = {
    version: 5,
    ui: {
      activeTab: 'adventure',
      lastScreen: 'dungeonList',
    },
    progress: {
      lastDungeonId: 1,
      lastDungeonName: 'はじまりの草原',
      lastFloor: 1,
      beginnerMeadowEncounterIndex: 0,
      beginnerMeadowEncounterTotal: 5,
    },
    battle: {
      autoScrollLog: true,
      preferredCommand: 'attack',
      targetSelectionEnabled: true,
    },
    character: DEFAULT_CHARACTER_UI,
  };

  const state = {
    user: null,
    socket: null,
    battleState: null,
    playerSkills: [],
    waitingAction: false,
    save: null,
    characterData: null,
    popup: {
      type: null,
      slot: null,
      jobTab: 'beginner',
    },
    turnSequence: Promise.resolve(),
    pendingBattleEnd: false,
    pendingAction: null,
    battleSessionId: 0,
    enemyUiMap: new Map(),
  };

  const els = {
    app: document.getElementById('app'),
    statusText: document.getElementById('status-text'),
    authPanel: document.getElementById('auth-panel'),
    authUser: document.getElementById('auth-username'),
    authPass: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    homeView: document.getElementById('home-view'),
    characterView: document.getElementById('character-view'),
    charName: document.getElementById('char-name'),
    charJob: document.getElementById('char-job'),
    charLevel: document.getElementById('char-level'),
    charNextExp: document.getElementById('char-next-exp'),
    charGold: document.getElementById('char-gold'),
    charHp: document.getElementById('char-hp'),
    charMaxHp: document.getElementById('char-max-hp'),
    charMp: document.getElementById('char-mp'),
    charMaxMp: document.getElementById('char-max-mp'),
    charAtk: document.getElementById('char-atk'),
    charDef: document.getElementById('char-def'),
    charRec: document.getElementById('char-rec'),
    charSpd: document.getElementById('char-spd'),
    charCrit: document.getElementById('char-crit'),
    charEva: document.getElementById('char-eva'),
    charCharm: document.getElementById('char-charm'),
    jobChangeBtn: document.getElementById('job-change-btn'),
    growthInfoBtn: document.getElementById('growth-info-btn'),
    equipHeadName: document.getElementById('equip-head-name'),
    equipBodyName: document.getElementById('equip-body-name'),
    equipLegsName: document.getElementById('equip-legs-name'),
    equipShoesName: document.getElementById('equip-shoes-name'),
    equipAccessoryName: document.getElementById('equip-accessory-name'),
    equipHeadEffect: document.getElementById('equip-head-effect'),
    equipBodyEffect: document.getElementById('equip-body-effect'),
    equipLegsEffect: document.getElementById('equip-legs-effect'),
    equipShoesEffect: document.getElementById('equip-shoes-effect'),
    equipAccessoryEffect: document.getElementById('equip-accessory-effect'),
    equipSlotButtons: document.querySelectorAll('.equip-slot-btn'),
    dungeonList: document.getElementById('dungeon-list'),
    mainDungeonList: document.getElementById('main-dungeon-list'),
    placeholderView: document.getElementById('placeholder-view'),
    placeholderTitle: document.getElementById('placeholder-title'),
    placeholderMessage: document.getElementById('placeholder-message'),
    battleView: document.getElementById('battle-view'),
    mainDungeonCategoryBtn: document.getElementById('main-dungeon-category-btn'),
    mainDungeonBtn: document.getElementById('main-dungeon-btn'),
    backToDungeonListBtn: document.getElementById('back-to-dungeon-list-btn'),
    tabBar: document.getElementById('tab-bar'),
    tabs: document.querySelectorAll('.tab-button'),
    notImplementedButtons: document.querySelectorAll('.not-implemented'),
    modal: document.getElementById('modal'),
    modalMessage: document.getElementById('modal-message'),
    modalClose: document.getElementById('modal-close'),
    skillModal: document.getElementById('skill-modal'),
    skillList: document.getElementById('skill-list'),
    skillCancel: document.getElementById('skill-cancel'),
    enemyList: document.getElementById('enemy-list'),
    playerName: document.getElementById('player-name'),
    playerEffects: document.getElementById('player-effects'),
    playerHpText: document.getElementById('player-hp-text'),
    playerHpBar: document.getElementById('player-hp-bar'),
    playerMpText: document.getElementById('player-mp-text'),
    playerMpBar: document.getElementById('player-mp-bar'),
    battleLog: document.getElementById('battle-log'),
    backToHomeBtn: document.getElementById('back-to-home-btn'),
    commandButtons: document.querySelectorAll('.cmd-btn'),
    miniPopup: document.getElementById('mini-popup'),
    battleResultOverlay: document.getElementById('battle-result-overlay'),
    battleResultTitle: document.getElementById('battle-result-title'),
    battleResultSubtitle: document.getElementById('battle-result-subtitle'),
    battleResultExp: document.getElementById('battle-result-exp'),
    battleResultGold: document.getElementById('battle-result-gold'),
    battleResultLobbyBtn: document.getElementById('battle-result-lobby-btn'),
  };

  function cloneDefaultSave() {
    return JSON.parse(JSON.stringify(defaultSave));
  }

  function getObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function sanitizeBeginnerJobs(value, fallback) {
    const source = getArray(value)
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x) => BEGINNER_JOB_OPTIONS.includes(x));
    if (!source.length) return fallback;
    return [...new Set(source)];
  }

  function firstString(...values) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
  }

  function sanitizeEquipmentInventory(value, defaults) {
    const src = getObject(value);
    const normalized = {};
    Object.keys(EQUIP_SLOT_LABELS).forEach((slot) => {
      const candidates = getArray(src[slot]);
      const sanitized = candidates
        .map((item) => {
          const obj = getObject(item);
          if (typeof obj.id !== 'string' || typeof obj.name !== 'string') return null;
          return {
            id: obj.id,
            name: obj.name,
            bonus: getObject(obj.bonus),
          };
        })
        .filter(Boolean);
      normalized[slot] = sanitized.length ? sanitized : defaults[slot];
    });
    return normalized;
  }

  function migrateSaveData(raw) {
    const defaults = cloneDefaultSave();
    const src = getObject(raw);
    const sourceVersion = Number(src.version) || 0;
    const uiSrc = getObject(src.ui);
    const progressSrc = getObject(src.progress);
    const battleSrc = getObject(src.battle);
    const characterSrc = getObject(src.character);
    const equipmentSrc = getObject(characterSrc.equipment);
    const inventorySrc = getObject(characterSrc.equipmentInventory);
    const legacyEquipmentSrc = getObject(src.equipment);

    const migrated = {
      version: defaults.version,
      ui: {
        activeTab: typeof uiSrc.activeTab === 'string'
          ? uiSrc.activeTab
          : (typeof src.activeTab === 'string' ? src.activeTab : defaults.ui.activeTab),
        lastScreen: typeof uiSrc.lastScreen === 'string'
          ? uiSrc.lastScreen
          : defaults.ui.lastScreen,
      },
      progress: {
        lastDungeonId: Number.isInteger(progressSrc.lastDungeonId)
          ? progressSrc.lastDungeonId
          : (Number.isInteger(src.dungeonId) ? src.dungeonId : defaults.progress.lastDungeonId),
        lastDungeonName: typeof progressSrc.lastDungeonName === 'string'
          ? progressSrc.lastDungeonName
          : (typeof src.dungeonName === 'string' ? src.dungeonName : defaults.progress.lastDungeonName),
        lastFloor: Number.isInteger(progressSrc.lastFloor)
          ? progressSrc.lastFloor
          : (Number.isInteger(src.floor) ? src.floor : defaults.progress.lastFloor),
        beginnerMeadowEncounterIndex: Number.isInteger(progressSrc.beginnerMeadowEncounterIndex)
          ? progressSrc.beginnerMeadowEncounterIndex
          : defaults.progress.beginnerMeadowEncounterIndex,
        beginnerMeadowEncounterTotal: Number.isInteger(progressSrc.beginnerMeadowEncounterTotal)
          ? progressSrc.beginnerMeadowEncounterTotal
          : defaults.progress.beginnerMeadowEncounterTotal,
      },
      battle: {
        autoScrollLog: typeof battleSrc.autoScrollLog === 'boolean'
          ? battleSrc.autoScrollLog
          : defaults.battle.autoScrollLog,
        preferredCommand: typeof battleSrc.preferredCommand === 'string'
          ? battleSrc.preferredCommand
          : defaults.battle.preferredCommand,
        targetSelectionEnabled: typeof battleSrc.targetSelectionEnabled === 'boolean'
          ? battleSrc.targetSelectionEnabled
          : defaults.battle.targetSelectionEnabled,
      },
      character: {
        selectedJobName: firstString(
          characterSrc.selectedJobName,
          src.selectedJobName,
          defaults.character.selectedJobName
        ),
        beginnerJobs: sanitizeBeginnerJobs(characterSrc.beginnerJobs, defaults.character.beginnerJobs),
        jobLevels: getObject(characterSrc.jobLevels),
        lastGrowthJobName: typeof characterSrc.lastGrowthJobName === 'string'
          ? characterSrc.lastGrowthJobName
          : defaults.character.lastGrowthJobName,
        equipment: {
          head: typeof equipmentSrc.head === 'string'
            ? equipmentSrc.head
            : (typeof legacyEquipmentSrc.head === 'string' ? legacyEquipmentSrc.head : defaults.character.equipment.head),
          body: typeof equipmentSrc.body === 'string'
            ? equipmentSrc.body
            : (typeof legacyEquipmentSrc.body === 'string' ? legacyEquipmentSrc.body : defaults.character.equipment.body),
          legs: typeof equipmentSrc.legs === 'string'
            ? equipmentSrc.legs
            : (typeof legacyEquipmentSrc.legs === 'string' ? legacyEquipmentSrc.legs : defaults.character.equipment.legs),
          shoes: typeof equipmentSrc.shoes === 'string'
            ? equipmentSrc.shoes
            : (typeof legacyEquipmentSrc.shoes === 'string' ? legacyEquipmentSrc.shoes : defaults.character.equipment.shoes),
          accessory: typeof equipmentSrc.accessory === 'string'
            ? equipmentSrc.accessory
            : (typeof legacyEquipmentSrc.accessory === 'string' ? legacyEquipmentSrc.accessory : defaults.character.equipment.accessory),
        },
        equipmentInventory: sanitizeEquipmentInventory(inventorySrc, defaults.character.equipmentInventory),
      },
    };

    const tabs = ['adventure', 'monsters', 'versus', 'others'];
    if (!tabs.includes(migrated.ui.activeTab)) migrated.ui.activeTab = defaults.ui.activeTab;
    if (migrated.progress.lastDungeonId < 1) migrated.progress.lastDungeonId = defaults.progress.lastDungeonId;
    if (migrated.progress.lastFloor < 1) migrated.progress.lastFloor = defaults.progress.lastFloor;
    if (migrated.progress.beginnerMeadowEncounterIndex < 0) {
      migrated.progress.beginnerMeadowEncounterIndex = defaults.progress.beginnerMeadowEncounterIndex;
    }
    if (migrated.progress.beginnerMeadowEncounterTotal < 1) {
      migrated.progress.beginnerMeadowEncounterTotal = defaults.progress.beginnerMeadowEncounterTotal;
    }
    if (!migrated.character.beginnerJobs.includes(migrated.character.selectedJobName)) {
      migrated.character.selectedJobName = defaults.character.selectedJobName;
    }
    if (sourceVersion < 4) {
      if (!Number.isInteger(progressSrc.beginnerMeadowEncounterIndex)) {
        migrated.progress.beginnerMeadowEncounterIndex = defaults.progress.beginnerMeadowEncounterIndex;
      }
      if (!Number.isInteger(progressSrc.beginnerMeadowEncounterTotal)) {
        migrated.progress.beginnerMeadowEncounterTotal = defaults.progress.beginnerMeadowEncounterTotal;
      }
      if (typeof battleSrc.targetSelectionEnabled !== 'boolean') {
        migrated.battle.targetSelectionEnabled = defaults.battle.targetSelectionEnabled;
      }
    }
    if (sourceVersion < 5) {
      if (typeof characterSrc.lastGrowthJobName !== 'string') {
        migrated.character.lastGrowthJobName = defaults.character.lastGrowthJobName;
      }
    }

    return migrated;
  }

  function loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const migrated = migrateSaveData(parsed);
      localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (_e) {
      const fallback = cloneDefaultSave();
      localStorage.setItem(SAVE_KEY, JSON.stringify(fallback));
      return fallback;
    }
  }

  function persistSave() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
  }

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function toInt(value, fallback = 0) {
    return Math.round(toNumber(value, fallback));
  }

  function toRate(value, fallback = 0) {
    return Math.max(0, toNumber(value, fallback));
  }

  function calcNextLevelExp(totalExp, level) {
    const safeLevel = Math.max(1, toInt(level, 1));
    const required = safeLevel * 100;
    return Math.max(0, required - Math.max(0, toInt(totalExp, 0)));
  }

  function getBaseCharacterData() {
    const char = state.characterData || {};
    return {
      name: char.name || state.user?.username || '---',
      level: toInt(char.job_level, 1),
      totalExp: toInt(char.exp, 0),
      money: toInt(char.money, 0),
      hp: toInt(char.hp, 0),
      maxHp: toInt(char.max_hp, 0),
      mp: toInt(char.mp, 0),
      maxMp: toInt(char.max_mp, 0),
      attack: toInt(char.attack, 0),
      defense: toInt(char.defense, 0),
      recovery: toInt(char.recovery, 0),
      speed: toInt(char.speed, 0),
      critRate: toRate(char.crit_rate, 0),
      evasionRate: toRate(char.evasion_rate, 0),
      charm: toInt(char.charm, 0),
    };
  }

  function getEquippedItem(slot) {
    const equipment = state.save.character.equipment;
    const itemId = equipment[slot];
    if (!itemId) return null;
    const items = state.save.character.equipmentInventory[slot] || [];
    return items.find((item) => item.id === itemId) || null;
  }

  function getTotalEquipmentBonus() {
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
    Object.keys(EQUIP_SLOT_LABELS).forEach((slot) => {
      const item = getEquippedItem(slot);
      if (!item) return;
      const bonus = getObject(item.bonus);
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

  function formatSigned(value) {
    const n = toNumber(value, 0);
    if (n === 0) return null;
    return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(2)}`;
  }

  function formatRate(value) {
    return toNumber(value, 0).toFixed(2).replace(/\.00$/, '');
  }

  function formatItemEffect(item) {
    if (!item) return '-';
    const bonus = getObject(item.bonus);
    const chunks = [];
    if (formatSigned(bonus.attack)) chunks.push(`ATK${formatSigned(bonus.attack)}`);
    if (formatSigned(bonus.defense)) chunks.push(`DEF${formatSigned(bonus.defense)}`);
    if (formatSigned(bonus.maxHp)) chunks.push(`HP${formatSigned(bonus.maxHp)}`);
    if (formatSigned(bonus.maxMp)) chunks.push(`MP${formatSigned(bonus.maxMp)}`);
    if (formatSigned(bonus.recovery)) chunks.push(`REC${formatSigned(bonus.recovery)}`);
    if (formatSigned(bonus.speed)) chunks.push(`SPD${formatSigned(bonus.speed)}`);
    if (formatSigned(bonus.critRate)) chunks.push(`CRI${formatSigned(bonus.critRate)}%`);
    if (formatSigned(bonus.evasionRate)) chunks.push(`EVA${formatSigned(bonus.evasionRate)}%`);
    if (formatSigned(bonus.charm)) chunks.push(`CHARM${formatSigned(bonus.charm)}`);
    return chunks.length ? chunks.join(' / ') : '-';
  }

  function renderEquipmentRows() {
    const equipRows = [
      { slot: 'head', nameEl: els.equipHeadName, effectEl: els.equipHeadEffect },
      { slot: 'body', nameEl: els.equipBodyName, effectEl: els.equipBodyEffect },
      { slot: 'legs', nameEl: els.equipLegsName, effectEl: els.equipLegsEffect },
      { slot: 'shoes', nameEl: els.equipShoesName, effectEl: els.equipShoesEffect },
      { slot: 'accessory', nameEl: els.equipAccessoryName, effectEl: els.equipAccessoryEffect },
    ];
    equipRows.forEach(({ slot, nameEl, effectEl }) => {
      const item = getEquippedItem(slot);
      nameEl.textContent = item ? item.name : '未装備';
      effectEl.textContent = formatItemEffect(item);
    });
  }

  function renderCharacterView() {
    if (!els.characterView || state.save.ui.activeTab !== 'monsters') return;
    const base = getBaseCharacterData();
    const bonus = getTotalEquipmentBonus();
    const selectedJob = state.save.character.selectedJobName;
    const level = base.level;
    const nextExp = calcNextLevelExp(base.totalExp, level);

    els.charName.textContent = base.name;
    els.charJob.textContent = selectedJob;
    els.charLevel.textContent = String(level);
    els.charNextExp.textContent = String(nextExp);
    els.charGold.textContent = String(base.money);

    els.charHp.textContent = String(Math.max(0, base.hp + bonus.hp));
    els.charMaxHp.textContent = String(Math.max(0, base.maxHp + bonus.maxHp));
    els.charMp.textContent = String(Math.max(0, base.mp + bonus.mp));
    els.charMaxMp.textContent = String(Math.max(0, base.maxMp + bonus.maxMp));
    els.charAtk.textContent = String(Math.max(0, base.attack + bonus.attack));
    els.charDef.textContent = String(Math.max(0, base.defense + bonus.defense));
    els.charRec.textContent = String(Math.max(0, base.recovery + bonus.recovery));
    els.charSpd.textContent = String(Math.max(0, base.speed + bonus.speed));
    els.charCrit.textContent = formatRate(base.critRate + bonus.critRate);
    els.charEva.textContent = formatRate(base.evasionRate + bonus.evasionRate);
    els.charCharm.textContent = String(Math.max(0, base.charm + bonus.charm));

    renderEquipmentRows();
  }

  function closeMiniPopup() {
    state.popup.type = null;
    state.popup.slot = null;
    state.popup.jobTab = 'beginner';
    els.miniPopup.classList.add('hidden');
    els.miniPopup.setAttribute('aria-hidden', 'true');
    els.miniPopup.textContent = '';
  }

  function openMiniPopup(anchorEl, type, slot) {
    const rect = anchorEl.getBoundingClientRect();
    state.popup.type = type;
    state.popup.slot = slot || null;
    els.miniPopup.classList.remove('hidden');
    els.miniPopup.setAttribute('aria-hidden', 'false');
    const maxTop = Math.max(POPUP_MIN_MARGIN, window.innerHeight - POPUP_HEIGHT_BUFFER);
    const maxLeft = Math.max(POPUP_MIN_MARGIN, window.innerWidth - POPUP_WIDTH_BUFFER);
    const top = Math.min(maxTop, Math.max(POPUP_MIN_MARGIN, rect.bottom + 4));
    const left = Math.min(maxLeft, Math.max(POPUP_MIN_MARGIN, rect.left));
    els.miniPopup.style.top = `${top}px`;
    els.miniPopup.style.left = `${left}px`;
  }

  function equipItem(slot, itemId) {
    state.save.character.equipment[slot] = itemId || null;
    persistSave();
    renderCharacterView();
    closeMiniPopup();
  }

  function openEquipmentPopup(slot, anchorEl) {
    const items = state.save.character.equipmentInventory[slot] || [];
    const currentItemId = state.save.character.equipment[slot];
    els.miniPopup.textContent = '';
    openMiniPopup(anchorEl, 'equipment', slot);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '外す';
    removeButton.classList.toggle('active', !currentItemId);
    removeButton.addEventListener('click', () => equipItem(slot, null));
    els.miniPopup.appendChild(removeButton);

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.toggle('active', item.id === currentItemId);
      btn.textContent = `${item.name}　${formatItemEffect(item)}`;
      btn.addEventListener('click', () => equipItem(slot, item.id));
      els.miniPopup.appendChild(btn);
    });
  }

  function changeJob(jobName) {
    return changeJobOnServer(jobName);
  }

  function getJobLevelByName(jobName) {
    const char = state.characterData || {};
    const jobLevels = {
      ...getObject(state.save?.character?.jobLevels),
      ...getObject(char.job_levels),
    };
    const levelFromMap = toInt(jobLevels[jobName], 0);
    if (levelFromMap > 0) return levelFromMap;
    if (char.job_name === jobName) return toInt(char.job_level, DEFAULT_JOB_LEVEL);
    return DEFAULT_JOB_LEVEL;
  }

  function getCurrentJobName() {
    const char = state.characterData || {};
    if (typeof char.job_name === 'string' && char.job_name.trim()) return char.job_name.trim();
    if (typeof state.save.character.selectedJobName === 'string' && state.save.character.selectedJobName.trim()) {
      return state.save.character.selectedJobName.trim();
    }
    return '戦士';
  }

  function getJobGrowth(jobName) {
    return getObject(JOB_GROWTH_TABLE[jobName]);
  }

  function openGrowthInfoModal() {
    const currentJobName = getCurrentJobName();
    const growth = getJobGrowth(currentJobName);
    if (!Object.keys(growth).length) {
      showModal('この職業の成長値データが見つかりません');
      return;
    }
    state.save.character.lastGrowthJobName = currentJobName;
    persistSave();
    const line = `HP +${toInt(growth.hp, 0)} / 攻撃力 +${toInt(growth.attack, 0)} / 防御力 +${toInt(growth.defense, 0)} / MP +${toInt(growth.mp, 0)} / 素早さ +${toInt(growth.speed, 0)} / 回復力 +${toInt(growth.recovery, 0)} / 魅力度 +${toInt(growth.charm, 0)}`;
    showModal(`${currentJobName}の成長値（1レベルあたり）\n${line}`);
  }

  function renderJobPopup() {
    const current = state.save.character.selectedJobName;
    const tab = JOB_TAB_DEFINITIONS.find((item) => item.key === state.popup.jobTab) || JOB_TAB_DEFINITIONS[0];
    const jobs = tab.key === 'beginner' ? state.save.character.beginnerJobs : tab.jobs;
    els.miniPopup.textContent = '';

    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'job-popup-tabs';
    JOB_TAB_DEFINITIONS.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'job-popup-tab-btn';
      btn.textContent = item.label;
      btn.classList.toggle('active', item.key === tab.key);
      btn.addEventListener('click', () => {
        state.popup.jobTab = item.key;
        renderJobPopup();
      });
      tabsWrap.appendChild(btn);
    });
    els.miniPopup.appendChild(tabsWrap);

    const listWrap = document.createElement('div');
    listWrap.className = 'job-popup-list';
    jobs.forEach((jobName) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'job-popup-job-btn';
      const level = tab.selectable ? getJobLevelByName(jobName) : null;
      const nameEl = document.createElement('span');
      nameEl.className = 'job-name';
      nameEl.textContent = jobName;
      const levelEl = document.createElement('span');
      levelEl.className = 'job-level';
      levelEl.textContent = tab.selectable ? `Lv${level}` : LOCKED_JOB_LEVEL_DISPLAY;
      btn.appendChild(nameEl);
      btn.appendChild(levelEl);
      btn.classList.toggle('active', tab.selectable && jobName === current);
      if (tab.selectable) {
        btn.addEventListener('click', () => changeJob(jobName));
      } else {
        btn.disabled = true;
        btn.title = tab.unlockMessage;
      }
      listWrap.appendChild(btn);
    });
    els.miniPopup.appendChild(listWrap);
  }

  function openJobPopup(anchorEl) {
    openMiniPopup(anchorEl, 'job', null);
    state.popup.jobTab = 'beginner';
    renderJobPopup();
  }

  function showModal(message) {
    els.modalMessage.textContent = message;
    els.modal.classList.remove('hidden');
  }

  function hideModal() {
    els.modal.classList.add('hidden');
  }

  function hideSkillModal() {
    els.skillModal.classList.add('hidden');
    els.skillList.textContent = '';
  }

  function hideBattleResultOverlay() {
    els.battleResultOverlay.classList.add('hidden');
  }

  function returnToLobbyFromBattle() {
    hideBattleResultOverlay();
    setBattleVisible(false);
    state.battleState = null;
    state.waitingAction = false;
    state.pendingBattleEnd = false;
    setCommandEnabled(false);
    setActiveTab('adventure');
  }

  function showBattleResultOverlay(result, payload = {}) {
    const totals = payload.cumulativeRewards || { exp: 0, money: 0 };
    if (result === 'win') {
      els.battleResultTitle.textContent = 'ダンジョンクリア！';
      els.battleResultSubtitle.textContent = '';
    } else {
      const reached = toInt(payload.reachedEncounter, 1);
      els.battleResultTitle.textContent = '敗北...';
      els.battleResultSubtitle.textContent = `${reached}戦目で敗北`;
    }
    els.battleResultExp.textContent = `総経験値: ${toInt(totals.exp, 0)}`;
    els.battleResultGold.textContent = `総ゴールド: ${toInt(totals.money, 0)}G`;
    els.battleResultOverlay.classList.remove('hidden');
  }

  function setActiveTab(tab) {
    closeMiniPopup();
    els.tabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    state.save.ui.activeTab = tab;
    persistSave();

    const map = {
      adventure: { title: '冒険', message: '冒険タブを押すとダンジョン一覧を表示します。' },
      monsters: { title: 'キャラ・モンスター', message: '' },
      versus: { title: '対戦', message: '未実装です' },
      others: { title: 'その他', message: '未実装です' },
    };

    const content = map[tab] || map.adventure;
    els.placeholderTitle.textContent = content.title;
    els.placeholderMessage.textContent = content.message;

    if (tab === 'adventure') {
      els.characterView.classList.add('hidden');
      els.dungeonList.classList.remove('hidden');
      els.mainDungeonList.classList.add('hidden');
      els.placeholderView.classList.add('hidden');
      state.save.ui.lastScreen = 'dungeonList';
    } else if (tab === 'monsters') {
      els.characterView.classList.remove('hidden');
      els.dungeonList.classList.add('hidden');
      els.mainDungeonList.classList.add('hidden');
      els.placeholderView.classList.add('hidden');
      state.save.ui.lastScreen = 'character';
      renderCharacterView();
    } else {
      els.characterView.classList.add('hidden');
      els.dungeonList.classList.add('hidden');
      els.mainDungeonList.classList.add('hidden');
      els.placeholderView.classList.remove('hidden');
      state.save.ui.lastScreen = 'placeholder';
    }
    persistSave();
  }

  function showMainDungeonList() {
    closeMiniPopup();
    els.characterView.classList.add('hidden');
    els.dungeonList.classList.add('hidden');
    els.mainDungeonList.classList.remove('hidden');
    els.placeholderView.classList.add('hidden');
    state.save.ui.lastScreen = 'mainDungeonList';
    persistSave();
  }

  function showDungeonCategoryList() {
    closeMiniPopup();
    els.characterView.classList.add('hidden');
    els.mainDungeonList.classList.add('hidden');
    els.dungeonList.classList.remove('hidden');
    els.placeholderView.classList.add('hidden');
    state.save.ui.lastScreen = 'dungeonList';
    persistSave();
  }

  function connectSocket() {
    if (state.socket) return;
    state.socket = io({ withCredentials: true });

    state.socket.on('battle:start', (data) => {
      const nextSessionId = state.battleSessionId + 1;
      state.battleSessionId = nextSessionId;
      closeMiniPopup();
      hideSkillModal();
      hideBattleResultOverlay();
      state.turnSequence = Promise.resolve().then(() => {
        if (nextSessionId !== state.battleSessionId) return;
        state.battleState = data.state || null;
        state.playerSkills = data.playerSkills || [];
        const awaitingPlayerAction = data.awaitingPlayerAction !== false;
        state.waitingAction = awaitingPlayerAction;
        state.pendingBattleEnd = false;
        if (state.battleState && Number(state.battleState.dungeonId) === 1) {
          state.save.progress.beginnerMeadowEncounterIndex = toInt(state.battleState.encounterIndex, 0);
          state.save.progress.beginnerMeadowEncounterTotal = toInt(state.battleState.encounterTotal, 5);
          persistSave();
        }
        updateBattleState();
        setCommandEnabled(awaitingPlayerAction);
        if (typeof data.previousVictoryLog === 'string' && data.previousVictoryLog) {
          addBattleLog(data.previousVictoryLog);
        }
        addBattleLog(data.message || 'バトル開始');
        if (awaitingPlayerAction) {
          addBattleLog('あなたのターン');
        }
        setBattleVisible(true);
      });
    });

    state.socket.on('battle:turn', (data) => {
      const sessionId = state.battleSessionId;
      state.turnSequence = state.turnSequence
        .then(() => processBattleTurn(data, sessionId))
        .catch((err) => {
          console.error('[battle:turn] 処理失敗:', err);
          addBattleLog('バトル処理でエラーが発生しました');
          if (isBattleContinuable()) {
            state.waitingAction = true;
            setCommandEnabled(true);
          }
        });
    });

    state.socket.on('battle:end', (data) => {
      const sessionId = state.battleSessionId;
      state.turnSequence = state.turnSequence
        .then(() => processBattleEnd(data, sessionId))
        .catch((err) => {
          console.error('[battle:end] 処理失敗:', err);
          addBattleLog('終了処理でエラーが発生しました');
        });
    });

    state.socket.on('battle:error', (data) => {
      addBattleLog(`エラー: ${data.message || '不明なエラー'}`);
      state.waitingAction = true;
      setCommandEnabled(true);
    });
  }

  function disconnectSocket() {
    if (!state.socket) return;
    state.socket.disconnect();
    state.socket = null;
  }

  function resetSessionState() {
    state.user = null;
    state.battleState = null;
    state.playerSkills = [];
    state.waitingAction = false;
    state.characterData = null;
    state.battleSessionId = 0;
    closeMiniPopup();
    hideBattleResultOverlay();
    disconnectSocket();
    setBattleVisible(false);
    setCommandEnabled(false);
  }

  function addBattleLog(message, options = {}) {
    const line = document.createElement('div');
    line.textContent = message;
    if (options.className) line.classList.add(options.className);
    els.battleLog.appendChild(line);
    if (state.save.battle.autoScrollLog) {
      els.battleLog.scrollTop = els.battleLog.scrollHeight;
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playShake(targets, className, duration = 300) {
    const list = targets.filter(Boolean);
    if (!list.length) return;
    list.forEach((el) => {
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
    });
    await wait(duration);
    list.forEach((el) => el.classList.remove(className));
  }

  async function playDamageEffect(action) {
    if (!action || action.missed || !action.damage || action.damage <= 0) return;
    const isPlayerTarget = String(action.targetId) === String(state.battleState?.player?.id);
    const enemyTargets = getEnemyShakeTargets(action.targetId);
    if (action.actorType === 'player' && !isPlayerTarget) {
      await playShake(enemyTargets, 'shake-target');
      return;
    }
    if (action.actorType === 'monster') {
      await Promise.all([
        playShake([els.playerHpText], 'shake-target'),
        playShake([els.app], 'shake-screen'),
      ]);
      return;
    }
    if (action.actionType === 'status_damage') {
      const isPlayer = String(action.targetId) === String(state.battleState?.player?.id);
      if (isPlayer) {
        await playShake([els.playerHpText], 'shake-target');
      } else {
        await playShake(enemyTargets, 'shake-target');
      }
    }
  }

  function upsertEffectEntry(entries, next) {
    const baseEntries = Array.isArray(entries) ? entries : [];
    if (!next || !next.type) return baseEntries;
    const filtered = baseEntries.filter((e) => e && e.type !== next.type);
    filtered.push({
      type: next.type,
      turns: Number(next.turns) || 1,
      value: Number(next.value) || 0,
    });
    return filtered;
  }

  function removeEffectEntries(entries, removeTypes) {
    if (!Array.isArray(entries)) return [];
    const removeSet = new Set((removeTypes || []).map((type) => String(type)));
    if (removeSet.size === 0) return entries;
    return entries.filter((entry) => entry && !removeSet.has(String(entry.type)));
  }

  function getEnemyUiEntry(targetId) {
    const id = String(targetId || '');
    if (!id || !(state.enemyUiMap instanceof Map)) return null;
    return state.enemyUiMap.get(id) || null;
  }

  function getEnemyShakeTargets(targetId) {
    const aliveEnemies = getAliveEnemies();
    const fallbackEnemy = aliveEnemies[0] || (state.battleState?.monsters || [])[0] || null;
    const entry = getEnemyUiEntry(targetId || fallbackEnemy?.id);
    return [entry?.visual, entry?.hpText, entry?.card].filter(Boolean);
  }

  function cloneBattleState(battle) {
    if (!battle) return null;
    if (typeof structuredClone === 'function') {
      return structuredClone(battle);
    }
    return JSON.parse(JSON.stringify(battle));
  }

  function applyActionToBattleState(battle, action) {
    if (!battle || !action || action.targetId == null) return;

    const isPlayer = String(action.targetId) === String(battle.player?.id);
    const removedEffects = Array.isArray(action.removedEffects) ? action.removedEffects : [];
    const removedStatusTypes = removedEffects
      .filter((entry) => entry && entry.category === 'status')
      .map((entry) => entry.type);
    const removedBuffTypes = removedEffects
      .filter((entry) => entry && entry.category === 'buff')
      .map((entry) => entry.type);
    if (isPlayer) {
      if (action.heal && action.heal > 0) {
        battle.player.hp = Math.min(battle.player.maxHp || battle.player.hp || 0, (battle.player.hp || 0) + action.heal);
      } else if (!action.missed && action.damage && action.damage > 0) {
        battle.player.hp = Math.max(0, (battle.player.hp || 0) - action.damage);
      }
      if (action.statusEffectApplied && action.statusEffect) {
        if (action.statusEffectCategory === 'status') {
          battle.player.statusEffects = upsertEffectEntry(battle.player.statusEffects || [], {
            type: action.statusEffect,
            turns: action.statusEffectTurns,
            value: action.statusEffectValue,
          });
        } else if (action.statusEffectCategory === 'buff') {
          battle.player.buffs = upsertEffectEntry(battle.player.buffs || [], {
            type: action.statusEffect,
            turns: action.statusEffectTurns,
            value: action.statusEffectValue,
          });
        }
      }
      battle.player.statusEffects = removeEffectEntries(battle.player.statusEffects || [], removedStatusTypes);
      battle.player.buffs = removeEffectEntries(battle.player.buffs || [], removedBuffTypes);
      return;
    }

    const targetMonster = (battle.monsters || []).find(
      (m) => m && String(m.id) === String(action.targetId)
    );
    if (!targetMonster) return;
    if (action.heal && action.heal > 0) {
      targetMonster.hp = Math.min(targetMonster.maxHp || targetMonster.hp || 0, (targetMonster.hp || 0) + action.heal);
    } else if (!action.missed && action.damage && action.damage > 0) {
      targetMonster.hp = Math.max(0, (targetMonster.hp || 0) - action.damage);
    }
    if (action.statusEffectApplied && action.statusEffect) {
      if (action.statusEffectCategory === 'status') {
        targetMonster.statusEffects = upsertEffectEntry(targetMonster.statusEffects || [], {
          type: action.statusEffect,
          turns: action.statusEffectTurns,
          value: action.statusEffectValue,
        });
      } else if (action.statusEffectCategory === 'buff') {
        targetMonster.buffs = upsertEffectEntry(targetMonster.buffs || [], {
          type: action.statusEffect,
          turns: action.statusEffectTurns,
          value: action.statusEffectValue,
        });
      }
    }
    targetMonster.statusEffects = removeEffectEntries(targetMonster.statusEffects || [], removedStatusTypes);
    targetMonster.buffs = removeEffectEntries(targetMonster.buffs || [], removedBuffTypes);
    targetMonster.isAlive = !targetMonster.escaped && targetMonster.hp > 0;
  }

  function isBattleContinuable() {
    const battle = state.battleState;
    if (!battle || !battle.player || state.pendingBattleEnd) return false;
    const playerAlive = battle.player.hp > 0;
    const hasAliveEnemy = (battle.monsters || []).some((m) => m && m.isAlive);
    return playerAlive && hasAliveEnemy;
  }

  async function processBattleTurn(data, sessionId) {
    if (sessionId !== state.battleSessionId) return;
    state.pendingBattleEnd = false;
    const nextState = data.state || null;
    const visualState = cloneBattleState(state.battleState) || cloneBattleState(nextState);
    state.battleState = visualState;
    updateBattleState();
    state.waitingAction = false;
    setCommandEnabled(false);

    const actions = Array.isArray(data.actions) ? data.actions.filter(Boolean) : [];
    let enemyTurnShown = false;

    for (const action of actions) {
      if (sessionId !== state.battleSessionId) return;
      if (action.actorType === 'monster' && !enemyTurnShown) {
        addBattleLog('敵のターン');
        enemyTurnShown = true;
        await wait(600);
      }

      if (action.specialSkill && action.skillName) {
        addBattleLog(action.skillName, { className: 'battle-log-special' });
      } else if (action.message) {
        addBattleLog(action.message);
      }

      applyActionToBattleState(visualState, action);
      state.battleState = visualState;
      updateBattleState();

      await playDamageEffect(action);
      if (action.actionType === 'defeated') {
        await wait(DEFEAT_LOG_DELAY_MS);
      } else {
        await wait(DEFAULT_ACTION_DELAY_MS);
      }
    }

    if (sessionId !== state.battleSessionId) return;
    state.battleState = nextState;
    updateBattleState();

    if (!isBattleContinuable()) return;
    const awaitingPlayerAction = data.awaitingPlayerAction !== false;
    state.waitingAction = awaitingPlayerAction;
    if (awaitingPlayerAction) {
      addBattleLog('あなたのターン');
    }
    setCommandEnabled(awaitingPlayerAction);
  }

  async function processBattleEnd(data, sessionId) {
    if (sessionId !== state.battleSessionId) return;
    state.pendingBattleEnd = true;
    state.waitingAction = false;
    setCommandEnabled(false);
    closeMiniPopup();
    hideSkillModal();
    addBattleLog(data.message || '戦闘終了');
    if (Array.isArray(data.playerSkills)) {
      state.playerSkills = data.playerSkills;
    }
    if (data.levelUp && typeof data.levelUp === 'object') {
      const before = toInt(data.levelUp.levelBefore, 1);
      const after = toInt(data.levelUp.levelAfter, before);
      if (after > before) {
        addBattleLog(`レベルアップ！ Lv${before} → Lv${after}`);
        const growth = getObject(data.levelUp.statGrowth);
        const totalGrowth = getObject(growth.total);
        const hpGain = toInt(totalGrowth.hp, 0);
        const attackGain = toInt(totalGrowth.attack, 0);
        const defenseGain = toInt(totalGrowth.defense, 0);
        const mpGain = toInt(totalGrowth.mp, 0);
        const speedGain = toInt(totalGrowth.speed, 0);
        const recoveryGain = toInt(totalGrowth.recovery, 0);
        const charmGain = toInt(totalGrowth.charm, 0);
        addBattleLog(`HP +${hpGain} / 攻撃力 +${attackGain} / 防御力 +${defenseGain} / MP +${mpGain} / 素早さ +${speedGain} / 回復力 +${recoveryGain} / 魅力度 +${charmGain}`);
      }
      const learnedSkillNames = Array.isArray(data.levelUp.learnedSkillNames)
        ? data.levelUp.learnedSkillNames.filter((x) => typeof x === 'string' && x.trim())
        : [];
      learnedSkillNames.forEach((name) => {
        addBattleLog(`スキル習得: ${name}`);
      });
    }
    if (data.result === 'win' && data.victoryMessage) {
      addBattleLog(data.victoryMessage);
    } else if (data.result === 'win' && data.rewards) {
      addBattleLog(`経験値 +${data.rewards.exp} / お金 +${data.rewards.money}`);
    }
    if (data.result === 'win') await loadCharacterProfile();
    state.save.progress.beginnerMeadowEncounterIndex = 0;
    persistSave();
    if (data.result === 'win' || data.result === 'lose') {
      showBattleResultOverlay(data.result, data);
      return;
    }
    addBattleLog('「冒険へ戻る」を押すとダンジョン一覧に戻ります。');
  }


  function buildEffectEntries(entity) {
    const entries = [];
    const buffs = Array.isArray(entity?.buffs) ? entity.buffs : [];
    const statuses = Array.isArray(entity?.statusEffects) ? entity.statusEffects : [];

    buffs.forEach((b) => {
      if (!b || !b.type) return;
      entries.push({ type: b.type, turns: b.turns || 0 });
    });

    statuses.forEach((e) => {
      if (!e || !e.type) return;
      entries.push({ type: e.type, turns: e.turns || 0 });
    });

    return entries;
  }

  function renderStatusIcons(container, entity) {
    if (!container) return;
    container.textContent = '';
    const entries = buildEffectEntries(entity);
    entries.forEach((entry) => {
      const icon = EFFECT_ICON_MAP[entry.type];
      if (!icon) return;
      const name = EFFECT_NAME_MAP[entry.type] || entry.type;
      const item = document.createElement('span');
      item.className = 'status-icon';
      item.title = `${name}（残り${entry.turns}ターン）`;
      item.setAttribute('aria-label', `${name} 残り${entry.turns}ターン`);

      const iconSpan = document.createElement('span');
      iconSpan.textContent = icon;
      const turnSpan = document.createElement('span');
      turnSpan.className = 'status-turn';
      turnSpan.textContent = String(entry.turns);

      item.appendChild(iconSpan);
      item.appendChild(turnSpan);
      container.appendChild(item);
    });
  }

  function hasStatusEffect(entity, statusType) {
    return Array.isArray(entity?.statusEffects)
      && entity.statusEffects.some((e) => e && e.type === statusType);
  }

  function hasPoison(entity) {
    return hasStatusEffect(entity, 'poison');
  }

  function ratio(value, max) {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(1, value / max));
  }

  function updateBar(barEl, current, max) {
    barEl.style.width = `${Math.floor(ratio(current, max) * 100)}%`;
  }

  function getAliveEnemies() {
    return (state.battleState?.monsters || []).filter((m) => m && m.isAlive);
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

  function buildEnemyNameMap(monsters) {
    const grouped = {};
    (monsters || []).forEach((enemy) => {
      if (!enemy || !enemy.name) return;
      grouped[enemy.name] = grouped[enemy.name] || [];
      grouped[enemy.name].push(enemy);
    });
    const nameMap = new Map();
    Object.entries(grouped).forEach(([name, list]) => {
      if (list.length <= 1) {
        nameMap.set(String(list[0].id), name);
        return;
      }
      list.forEach((enemy, idx) => {
        nameMap.set(String(enemy.id), `${name}${toUpperAlphabetLabel(idx)}`);
      });
    });
    return nameMap;
  }

  function getEnemyDisplayName(enemy, nameMap) {
    if (!enemy) return '---';
    return nameMap.get(String(enemy.id)) || enemy.name || '---';
  }

  function renderEnemyList(monsters) {
    if (!els.enemyList) return;
    els.enemyList.textContent = '';
    state.enemyUiMap = new Map();
    const enemyCount = (monsters || []).filter(Boolean).length;
    els.enemyList.classList.toggle('single', enemyCount === 1);
    const nameMap = buildEnemyNameMap(monsters);
    (monsters || []).forEach((enemy) => {
      if (!enemy) return;
      const card = document.createElement('div');
      card.className = `enemy-card${enemy.isAlive ? '' : ' defeated'}`;

      const nameLine = document.createElement('div');
      nameLine.className = 'enemy-card-name';
      nameLine.textContent = getEnemyDisplayName(enemy, nameMap);

      const visual = document.createElement('div');
      visual.className = 'enemy-card-visual';
      visual.textContent = 'ENEMY';

      const hpRow = document.createElement('div');
      hpRow.className = 'enemy-card-hp-row';

      const hpMain = document.createElement('div');
      hpMain.className = 'enemy-card-hp-main';
      const hpText = document.createElement('div');
      hpText.className = 'enemy-card-hp-text';
      hpText.textContent = `HP ${enemy.hp ?? '---'}/${enemy.maxHp ?? '---'}`;
      const barBg = document.createElement('div');
      barBg.className = 'bar-bg';
      const hpBar = document.createElement('div');
      hpBar.className = 'bar hp';
      updateBar(hpBar, enemy.hp || 0, enemy.maxHp || 1);
      hpBar.classList.toggle('poisoned', hasPoison(enemy));
      barBg.appendChild(hpBar);
      hpMain.appendChild(hpText);
      hpMain.appendChild(barBg);

      const effects = document.createElement('div');
      effects.className = 'status-icons enemy-card-effects';
      effects.setAttribute('aria-label', '敵の状態異常・バフデバフ');
      renderStatusIcons(effects, enemy);

      hpRow.appendChild(hpMain);
      hpRow.appendChild(effects);
      card.appendChild(nameLine);
      card.appendChild(visual);
      card.appendChild(hpRow);
      els.enemyList.appendChild(card);
      state.enemyUiMap.set(String(enemy.id), {
        card,
        visual,
        hpText,
      });
    });
    return nameMap;
  }

  function updateBattleState() {
    const battle = state.battleState;
    if (!battle) return;

    const player = battle.player || {};
    const monsters = battle.monsters || [];
    renderEnemyList(monsters);

    els.playerName.textContent = player.name || '---';
    els.playerHpText.textContent = `HP ${player.hp ?? '---'}/${player.maxHp ?? '---'}`;
    updateBar(els.playerHpBar, player.hp || 0, player.maxHp || 1);
    els.playerHpBar.classList.toggle('poisoned', hasPoison(player));

    els.playerMpText.textContent = `MP ${player.mp ?? '---'}/${player.maxMp ?? '---'}`;
    updateBar(els.playerMpBar, player.mp || 0, player.maxMp || 1);
    renderStatusIcons(els.playerEffects, player);
  }

  function setCommandEnabled(enabled) {
    els.commandButtons.forEach((btn) => {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.5';
    });
  }

  function emitBattleAction(actionType, skillId, targetId) {
    if (!state.socket || !state.waitingAction || !state.battleState) return;
    state.waitingAction = false;
    setCommandEnabled(false);
    state.save.battle.preferredCommand = actionType;
    persistSave();

    state.socket.emit('battle:action', {
      actionType,
      skillId: skillId || null,
      targetId: targetId || null,
    });
  }

  function openTargetSelectionPopup(anchorEl, actionType, skillId) {
    const aliveEnemies = getAliveEnemies();
    if (!aliveEnemies.length) {
      addBattleLog('対象となるモンスターがいません');
      return;
    }
    const nameMap = buildEnemyNameMap(state.battleState?.monsters || []);
    els.miniPopup.textContent = '';
    openMiniPopup(anchorEl, 'battle-target', null);
    aliveEnemies.forEach((enemy) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${getEnemyDisplayName(enemy, nameMap)}（HP ${enemy.hp}/${enemy.maxHp}）`;
      btn.addEventListener('click', () => {
        closeMiniPopup();
        emitBattleAction(actionType, skillId, enemy.id);
      });
      els.miniPopup.appendChild(btn);
    });
  }

  function requestBattleAction(actionType, skillId, anchorEl) {
    if (!state.socket || !state.waitingAction || !state.battleState) return;
    const aliveEnemies = getAliveEnemies();
    if (!aliveEnemies.length) {
      addBattleLog('対象となるモンスターがいません');
      return;
    }
    if (aliveEnemies.length === 1) {
      emitBattleAction(actionType, skillId, aliveEnemies[0].id);
      return;
    }
    openTargetSelectionPopup(anchorEl, actionType, skillId);
  }

  function openSkillPicker() {
    if (!state.playerSkills.length) {
      addBattleLog('スキルがありません');
      return;
    }
    const aliveTarget = (state.battleState?.monsters || []).find((m) => m.isAlive);
    if (!aliveTarget) {
      addBattleLog('対象となるモンスターがいません');
      return;
    }
    els.skillList.textContent = '';
    state.playerSkills
      .filter((skill) => skill && typeof skill.name === 'string')
      .forEach((skill) => {
        const button = document.createElement('button');
        const mpCost = skill.mp_cost > 0 ? `（MP${skill.mp_cost}）` : '';
        button.type = 'button';
        button.textContent = `${skill.name}${mpCost}`;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          hideSkillModal();
          requestBattleAction('skill', skill.id, els.commandButtons[1] || els.skillList);
        });
        els.skillList.appendChild(button);
      });
    els.skillModal.classList.remove('hidden');
  }

  function setBattleVisible(visible) {
    els.battleView.classList.toggle('hidden', !visible);
    els.homeView.classList.toggle('hidden', visible);
    els.tabBar.classList.toggle('hidden', visible);
    if (visible) hideBattleResultOverlay();
  }

  async function requestBattleStart() {
    if (!state.socket) return;
    hideBattleResultOverlay();
    els.battleLog.textContent = '';
    addBattleLog('はじまりの草原に入った。');
    addBattleLog('モンスターを探しています...');
    setBattleVisible(true);
    setCommandEnabled(false);

    state.socket.emit('battle:startRequest', {
      dungeonId: 1,
      floor: 1,
    });

    state.save.progress.lastDungeonId = 1;
    state.save.progress.lastDungeonName = 'はじまりの草原';
    state.save.progress.lastFloor = 1;
    state.save.progress.beginnerMeadowEncounterIndex = 0;
    state.save.progress.beginnerMeadowEncounterTotal = 5;
    persistSave();
  }

  function showLoginView() {
    resetSessionState();
    els.authPanel.classList.remove('hidden');
    els.homeView.classList.add('hidden');
    els.tabBar.classList.add('hidden');
    els.statusText.textContent = 'ログイン状態: 未ログイン';
  }

  async function showLobbyView(user) {
    state.user = user;
    const displayName = state.user.name || state.user.username;
    els.statusText.textContent = `ログイン状態: ${displayName} でログイン中`;
    els.authPanel.classList.add('hidden');
    els.homeView.classList.remove('hidden');
    els.tabBar.classList.remove('hidden');
    connectSocket();
    await loadCharacterProfile();
    setActiveTab(state.save.ui.activeTab);
  }

  async function fetchCurrentUser() {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    try {
      const data = await res.json();
      return data && data.user ? data.user : null;
    } catch (_e) {
      return null;
    }
  }

  async function fetchCharacterProfile() {
    const res = await fetch('/api/character/me', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    try {
      const data = await res.json();
      if (!data || !data.character) return null;
      return {
        character: {
          ...data.character,
          job_levels: getObject(data.jobLevels),
        },
        skills: Array.isArray(data.skills) ? data.skills : [],
      };
    } catch (_e) {
      return null;
    }
  }

  async function loadCharacterProfile() {
    try {
      const profile = await fetchCharacterProfile();
      if (!profile) return;
      const character = profile.character;
      state.characterData = character;
      state.playerSkills = profile.skills;
      let shouldPersist = false;
      const incomingJobLevels = getObject(character.job_levels);
      if (Object.keys(incomingJobLevels).length) {
        state.save.character.jobLevels = incomingJobLevels;
        shouldPersist = true;
      }
      if (character.job_name && typeof character.job_name === 'string') {
        const incomingJobName = character.job_name.trim();
        if (state.save.character.beginnerJobs.includes(incomingJobName)) {
          state.save.character.selectedJobName = incomingJobName;
          shouldPersist = true;
        }
      }
      if (shouldPersist) persistSave();
      const displayName = character.name || state.user?.name || state.user?.username;
      if (displayName) {
        els.statusText.textContent = `ログイン状態: ${displayName} でログイン中`;
      }
      renderCharacterView();
    } catch (_e) {
      state.characterData = null;
    }
  }

  async function changeJobOnServer(jobName) {
    try {
      const res = await fetch('/api/character/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ jobName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showModal(data.error || '転職に失敗しました');
        return;
      }
      state.save.character.selectedJobName = data.currentJobName || jobName;
      state.playerSkills = Array.isArray(data.skills) ? data.skills : [];
      persistSave();
      await loadCharacterProfile();
      renderCharacterView();
      closeMiniPopup();
    } catch (_e) {
      showModal('転職に失敗しました');
    }
  }

  async function auth() {
    els.authError.textContent = '';
    const username = els.authUser.value.trim();
    const password = els.authPass.value;
    if (!username || !password) {
      els.authError.textContent = 'ユーザー名とパスワードを入力してください';
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        els.authError.textContent = data.error || '通信エラーが発生しました';
        return;
      }
      await showLobbyView(data.user);
    } catch (_e) {
      els.authError.textContent = 'ネットワークエラーが発生しました';
    }
  }

  async function logout() {
    els.authError.textContent = '';
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_e) {
        data = null;
      }
      if (!res.ok) {
        showModal((data && data.error) || 'ログアウトに失敗しました');
        return;
      }
      showLoginView();
    } catch (_e) {
      showModal('ネットワークエラーが発生しました');
    }
  }

  function bindEvents() {
    els.loginBtn.addEventListener('click', auth);
    if (els.registerBtn) {
      els.registerBtn.addEventListener('click', () => {
        location.href = '/register.html';
      });
    }
    els.logoutBtn.addEventListener('click', logout);

    els.mainDungeonCategoryBtn.addEventListener('click', showMainDungeonList);
    els.mainDungeonBtn.addEventListener('click', requestBattleStart);
    els.backToDungeonListBtn.addEventListener('click', showDungeonCategoryList);
    els.notImplementedButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        showModal('未実装です');
      });
    });

    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });

    els.jobChangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.popup.type === 'job') {
        closeMiniPopup();
        return;
      }
      openJobPopup(els.jobChangeBtn);
    });
    if (els.growthInfoBtn) {
      els.growthInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openGrowthInfoModal();
      });
    }

    els.equipSlotButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = btn.dataset.slot;
        if (!slot) return;
        if (state.popup.type === 'equipment' && state.popup.slot === slot) {
          closeMiniPopup();
          return;
        }
        openEquipmentPopup(slot, btn);
      });
    });

    els.modalClose.addEventListener('click', hideModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) hideModal();
    });

    els.skillCancel.addEventListener('click', () => {
      hideSkillModal();
      setCommandEnabled(true);
      state.waitingAction = true;
    });
    els.skillModal.addEventListener('click', (e) => {
      if (e.target === els.skillModal) {
        hideSkillModal();
        setCommandEnabled(true);
        state.waitingAction = true;
      }
    });

    els.commandButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!state.waitingAction) return;
        const cmd = btn.dataset.command;
        if (cmd === 'skill') {
          openSkillPicker();
          return;
        }
        if (cmd === 'attack' || cmd === 'capture') {
          requestBattleAction(cmd, null, btn);
          return;
        }
        emitBattleAction(cmd, null, null);
      });
    });

    els.backToHomeBtn.addEventListener('click', returnToLobbyFromBattle);
    els.battleResultLobbyBtn.addEventListener('click', returnToLobbyFromBattle);

    document.addEventListener('click', (e) => {
      if (els.miniPopup.classList.contains('hidden')) return;
      if (els.miniPopup.contains(e.target)) return;
      closeMiniPopup();
    });

    window.addEventListener('resize', closeMiniPopup);
    window.addEventListener('scroll', closeMiniPopup, true);
  }

  async function init() {
    state.save = loadSaveData();
    bindEvents();
    els.statusText.textContent = 'ログイン状態: 認証確認中...';

    try {
      const user = await fetchCurrentUser();
      if (user) {
        await showLobbyView(user);
        return;
      }
      showLoginView();
    } catch (_e) {
      showLoginView();
    }
  }

  init();
})();
