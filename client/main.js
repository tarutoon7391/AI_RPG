(function () {
  const SAVE_KEY = 'ai_rpg_save';

  const defaultSave = {
    version: 2,
    ui: {
      activeTab: 'adventure',
      lastScreen: 'dungeonList',
    },
    progress: {
      lastDungeonId: 1,
      lastDungeonName: 'はじまりの草原',
      lastFloor: 1,
    },
    battle: {
      autoScrollLog: true,
      preferredCommand: 'attack',
    },
  };

  const state = {
    user: null,
    socket: null,
    battleState: null,
    playerSkills: [],
    waitingAction: false,
    save: null,
    turnSequence: Promise.resolve(),
    pendingBattleEnd: false,
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
    homeView: document.getElementById('home-view'),
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
    enemyName: document.getElementById('enemy-name'),
    enemyVisual: document.getElementById('enemy-visual'),
    enemyHpText: document.getElementById('enemy-hp-text'),
    enemyHpBar: document.getElementById('enemy-hp-bar'),
    playerName: document.getElementById('player-name'),
    playerHpText: document.getElementById('player-hp-text'),
    playerHpBar: document.getElementById('player-hp-bar'),
    playerMpText: document.getElementById('player-mp-text'),
    playerMpBar: document.getElementById('player-mp-bar'),
    battleLog: document.getElementById('battle-log'),
    backToHomeBtn: document.getElementById('back-to-home-btn'),
    commandButtons: document.querySelectorAll('.cmd-btn'),
  };

  function cloneDefaultSave() {
    return JSON.parse(JSON.stringify(defaultSave));
  }

  function getObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function migrateSaveData(raw) {
    const defaults = cloneDefaultSave();
    const src = getObject(raw);
    const uiSrc = getObject(src.ui);
    const progressSrc = getObject(src.progress);
    const battleSrc = getObject(src.battle);

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
      },
      battle: {
        autoScrollLog: typeof battleSrc.autoScrollLog === 'boolean'
          ? battleSrc.autoScrollLog
          : defaults.battle.autoScrollLog,
        preferredCommand: typeof battleSrc.preferredCommand === 'string'
          ? battleSrc.preferredCommand
          : defaults.battle.preferredCommand,
      },
    };

    const tabs = ['adventure', 'monsters', 'versus', 'others'];
    if (!tabs.includes(migrated.ui.activeTab)) migrated.ui.activeTab = defaults.ui.activeTab;
    if (migrated.progress.lastDungeonId < 1) migrated.progress.lastDungeonId = defaults.progress.lastDungeonId;
    if (migrated.progress.lastFloor < 1) migrated.progress.lastFloor = defaults.progress.lastFloor;

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

  function setActiveTab(tab) {
    els.tabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    state.save.ui.activeTab = tab;
    persistSave();

    const map = {
      adventure: { title: '冒険', message: '冒険タブを押すとダンジョン一覧を表示します。' },
      monsters: { title: 'モンスター', message: '未実装です' },
      versus: { title: '対戦', message: '未実装です' },
      others: { title: 'その他', message: '未実装です' },
    };

    const content = map[tab] || map.adventure;
    els.placeholderTitle.textContent = content.title;
    els.placeholderMessage.textContent = content.message;

    if (tab === 'adventure') {
      els.dungeonList.classList.remove('hidden');
      els.mainDungeonList.classList.add('hidden');
      els.placeholderView.classList.add('hidden');
      state.save.ui.lastScreen = 'dungeonList';
    } else {
      els.dungeonList.classList.add('hidden');
      els.mainDungeonList.classList.add('hidden');
      els.placeholderView.classList.remove('hidden');
      state.save.ui.lastScreen = 'placeholder';
    }
    persistSave();
  }

  function showMainDungeonList() {
    els.dungeonList.classList.add('hidden');
    els.mainDungeonList.classList.remove('hidden');
    els.placeholderView.classList.add('hidden');
    state.save.ui.lastScreen = 'mainDungeonList';
    persistSave();
  }

  function showDungeonCategoryList() {
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
      state.battleState = data.state || null;
      state.playerSkills = data.playerSkills || [];
      state.waitingAction = true;
      state.pendingBattleEnd = false;
      state.turnSequence = Promise.resolve();
      updateBattleState();
      setCommandEnabled(true);
      addBattleLog(data.message || 'バトル開始');
      setBattleVisible(true);
    });

    state.socket.on('battle:turn', (data) => {
      state.turnSequence = state.turnSequence.then(() => processBattleTurn(data));
    });

    state.socket.on('battle:end', (data) => {
      state.turnSequence = state.turnSequence.then(() => processBattleEnd(data));
    });

    state.socket.on('battle:error', (data) => {
      addBattleLog(`エラー: ${data.message || '不明なエラー'}`);
      state.waitingAction = true;
      setCommandEnabled(true);
    });
  }

  function addBattleLog(message) {
    const line = document.createElement('div');
    line.textContent = message;
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
    if (action.actorType === 'player') {
      await playShake([els.enemyVisual, els.enemyHpText], 'shake-target');
      return;
    }
    if (action.actorType === 'monster') {
      await Promise.all([
        playShake([els.playerHpText], 'shake-target'),
        playShake([els.app], 'shake-screen'),
      ]);
    }
  }

  function splitTurnActions(actions) {
    const queue = Array.isArray(actions) ? actions.filter(Boolean) : [];
    const playerAction = queue.find((x) => x.actorType === 'player') || null;
    const enemyAction = queue.find((x) => x.actorType === 'monster') || null;
    const extras = queue.filter((x) => x !== playerAction && x !== enemyAction);
    return { playerAction, enemyAction, extras };
  }

  function isBattleContinuable() {
    const battle = state.battleState;
    if (!battle || state.pendingBattleEnd) return false;
    const playerAlive = (battle.player?.hp || 0) > 0;
    const hasAliveEnemy = (battle.monsters || []).some((m) => m && m.isAlive);
    return playerAlive && hasAliveEnemy;
  }

  async function processBattleTurn(data) {
    state.pendingBattleEnd = false;
    state.battleState = data.state || null;
    updateBattleState();
    state.waitingAction = false;
    setCommandEnabled(false);

    const { playerAction, enemyAction, extras } = splitTurnActions(data.actions);

    if (playerAction) addBattleLog(playerAction.message || 'プレイヤーが行動した。');
    await wait(1000);
    await playDamageEffect(playerAction);
    await wait(1000);

    if (isBattleContinuable()) {
      addBattleLog('敵のターン');
      await wait(1000);
    }

    if (enemyAction && isBattleContinuable()) {
      addBattleLog(enemyAction.message || '敵が行動した。');
      await wait(1000);
      await playDamageEffect(enemyAction);
      await wait(1000);
    }

    extras.forEach((x) => {
      if (x.message) addBattleLog(x.message);
    });

    if (!isBattleContinuable()) return;
    addBattleLog('あなたのターン');
    state.waitingAction = true;
    setCommandEnabled(true);
  }

  async function processBattleEnd(data) {
    state.pendingBattleEnd = true;
    state.waitingAction = false;
    setCommandEnabled(false);
    addBattleLog(data.message || '戦闘終了');
    if (data.result === 'win' && data.rewards) {
      addBattleLog(`経験値 +${data.rewards.exp} / お金 +${data.rewards.money}`);
    }
    addBattleLog('「冒険へ戻る」を押すとダンジョン一覧に戻ります。');
  }

  function ratio(value, max) {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(1, value / max));
  }

  function updateBar(barEl, current, max) {
    barEl.style.width = `${Math.floor(ratio(current, max) * 100)}%`;
  }

  function updateBattleState() {
    const battle = state.battleState;
    if (!battle) return;

    const player = battle.player || {};
    const enemy = (battle.monsters || [])[0] || {};

    els.enemyName.textContent = enemy.name || '---';
    els.enemyHpText.textContent = `HP ${enemy.hp ?? '---'}/${enemy.maxHp ?? '---'}`;
    updateBar(els.enemyHpBar, enemy.hp || 0, enemy.maxHp || 1);

    els.playerName.textContent = player.name || '---';
    els.playerHpText.textContent = `HP ${player.hp ?? '---'}/${player.maxHp ?? '---'}`;
    updateBar(els.playerHpBar, player.hp || 0, player.maxHp || 1);

    els.playerMpText.textContent = `MP ${player.mp ?? '---'}/${player.maxMp ?? '---'}`;
    updateBar(els.playerMpBar, player.mp || 0, player.maxMp || 1);
  }

  function setCommandEnabled(enabled) {
    els.commandButtons.forEach((btn) => {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.5';
    });
  }

  function sendBattleAction(actionType, skillId) {
    if (!state.socket || !state.waitingAction || !state.battleState) return;
    const target = (state.battleState.monsters || []).find((m) => m.isAlive);
    state.waitingAction = false;
    setCommandEnabled(false);
    state.save.battle.preferredCommand = actionType;
    persistSave();

    state.socket.emit('battle:action', {
      actionType,
      skillId: skillId || null,
      targetId: target ? target.id : null,
    });
  }

  function openSkillPicker() {
    if (!state.playerSkills.length) {
      sendBattleAction('attack', null);
      return;
    }
    const aliveTarget = (state.battleState?.monsters || []).find((m) => m.isAlive);
    if (!aliveTarget) {
      sendBattleAction('attack', null);
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
        button.addEventListener('click', () => {
          hideSkillModal();
          sendBattleAction('skill', skill.id);
        });
        els.skillList.appendChild(button);
      });
    els.skillModal.classList.remove('hidden');
  }

  function setBattleVisible(visible) {
    els.battleView.classList.toggle('hidden', !visible);
    els.homeView.classList.toggle('hidden', visible);
    els.tabBar.classList.toggle('hidden', visible);
  }

  async function requestBattleStart() {
    if (!state.socket) return;
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
    persistSave();
  }

  async function auth(endpoint) {
    els.authError.textContent = '';
    const username = els.authUser.value.trim();
    const password = els.authPass.value;
    if (!username || !password) {
      els.authError.textContent = 'ユーザー名とパスワードを入力してください';
      return;
    }

    try {
      const res = await fetch(`/api/auth/${endpoint}`, {
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
      state.user = data.user;
      els.statusText.textContent = `${state.user.username} でログイン中`;
      els.authPanel.classList.add('hidden');
      els.homeView.classList.remove('hidden');
      els.tabBar.classList.remove('hidden');
      connectSocket();
      setActiveTab(state.save.ui.activeTab);
    } catch (_e) {
      els.authError.textContent = 'ネットワークエラーが発生しました';
    }
  }

  function bindEvents() {
    els.loginBtn.addEventListener('click', () => auth('login'));
    els.registerBtn.addEventListener('click', () => auth('register'));

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
      btn.addEventListener('click', () => {
        if (!state.waitingAction) return;
        const cmd = btn.dataset.command;
        if (cmd === 'skill') {
          openSkillPicker();
          return;
        }
        sendBattleAction(cmd, null);
      });
    });

    els.backToHomeBtn.addEventListener('click', () => {
      setBattleVisible(false);
      state.battleState = null;
      state.waitingAction = false;
      setCommandEnabled(false);
      setActiveTab('adventure');
    });
  }

  function init() {
    state.save = loadSaveData();
    bindEvents();
    setBattleVisible(false);
    setCommandEnabled(false);
  }

  init();
})();
