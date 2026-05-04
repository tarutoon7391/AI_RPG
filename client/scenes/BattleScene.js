// BattleScene.js
// バトル画面
// Socket.io で battle:startRequest → battle:start → battle:action → battle:turn → battle:end の流れを処理する

/* global Phaser, io */

class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    this.dungeonId   = data.dungeonId   || 1;
    this.floor       = data.floor       || 1;
    this.dungeonName = data.dungeonName || 'ダンジョン';
    this.maxFloor    = data.maxFloor    || 5;
    this.isBoss      = data.isBoss      || false;
    this.returnData  = data.returnData  || {};

    this.battleStarted  = false;
    this.waitingAction  = false;
    this.playerSkills   = [];
    this.battleState    = null;
    this.logLines       = [];
  }

  create() {
    window.AI_RPG.showTabBar(false);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x0d0d1a).setOrigin(0, 0);

    this._buildUI();
    this._setupSocket();

    // バトル開始リクエスト
    this._addLog(this.isBoss ? 'ボスが現れる予感がする...' : 'バトル開始！');
    window.AI_RPG.socket.emit('battle:startRequest', {
      dungeonId: this.dungeonId,
      floor: this.floor,
    });
  }

  // ===== UI 構築 =====
  _buildUI() {
    const { width, height } = this.scale;

    // 上半分: 敵エリア（height の45%）
    const enemyAreaH = Math.floor(height * 0.45);
    // 下半分: プレイヤー + コマンド（残り）

    this.add.rectangle(0, 0, width, enemyAreaH, 0x1a1a2e).setOrigin(0, 0);
    this.add.rectangle(0, enemyAreaH, width, height - enemyAreaH, 0x16213e).setOrigin(0, 0);

    // ===== 敵エリア =====
    // モンスター名
    this._monsterName = this.add.text(width / 2, 18, '---', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#ff8888', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // モンスター図形（簡易表示）
    this._monsterBody = this.add.rectangle(width / 2, enemyAreaH / 2 - 10, 60, 60, 0xff6666);
    this._monsterEye  = this.add.circle(width / 2 + 10, enemyAreaH / 2 - 20, 6, 0x000000);

    // モンスター HP バー背景
    const barW = Math.min(280, width - 40);
    this.add.rectangle(width / 2, enemyAreaH - 32, barW, 16, 0x333333).setOrigin(0.5, 0.5);
    this._monsterHpBar = this.add.rectangle(width / 2 - barW / 2, enemyAreaH - 40, barW, 16, 0x44cc44).setOrigin(0, 0.5);
    this._monsterHpText = this.add.text(width / 2, enemyAreaH - 32, 'HP ---/---', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5);

    // 状態異常アイコンエリア（テキスト）
    this._monsterStatus = this.add.text(width / 2, enemyAreaH - 14, '', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#ffdd55',
    }).setOrigin(0.5);

    // ===== プレイヤーエリア =====
    const py = enemyAreaH + 10;

    this._playerName = this.add.text(16, py, '---', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#88ddff', fontStyle: 'bold',
    });

    // HP バー
    this.add.text(16, py + 22, 'HP', { fontFamily: 'sans-serif', fontSize: '13px', color: '#cccccc' });
    const pBarW = Math.min(180, width / 2 - 20);
    this.add.rectangle(52, py + 30, pBarW, 12, 0x333333).setOrigin(0, 0.5);
    this._playerHpBar  = this.add.rectangle(52, py + 30, pBarW, 12, 0x44cc44).setOrigin(0, 0.5);
    this._playerHpText = this.add.text(52 + pBarW + 6, py + 30, '---', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff',
    }).setOrigin(0, 0.5);

    // MP バー
    this.add.text(16, py + 44, 'MP', { fontFamily: 'sans-serif', fontSize: '13px', color: '#cccccc' });
    this.add.rectangle(52, py + 52, pBarW, 10, 0x333333).setOrigin(0, 0.5);
    this._playerMpBar  = this.add.rectangle(52, py + 52, pBarW, 10, 0x4488ff).setOrigin(0, 0.5);
    this._playerMpText = this.add.text(52 + pBarW + 6, py + 52, '---', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#aaaaff',
    }).setOrigin(0, 0.5);

    this._playerStatus = this.add.text(16, py + 66, '', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#ffdd55',
    });

    // ===== バトルログ（下から4行）=====
    const logY = height - 90;
    this.add.rectangle(0, logY, width, 90, 0x000000, 0.6).setOrigin(0, 0);
    this._logTexts = [];
    for (let i = 0; i < 4; i++) {
      this._logTexts.push(
        this.add.text(10, logY + 4 + i * 20, '', {
          fontFamily: 'sans-serif', fontSize: '13px', color: '#e0e0e0',
          wordWrap: { width: width - 20 },
        })
      );
    }

    // ===== コマンドメニュー =====
    const cmdY = enemyAreaH + 90;
    this._cmdContainer = this.add.container(0, cmdY);
    this._skillContainer = this.add.container(0, cmdY).setVisible(false);
    this._buildCommandMenu(width, height - cmdY - 94);
  }

  _buildCommandMenu(width, menuH) {
    const commands = [
      { key: 'attack',  label: '⚔ 攻撃',    color: '#ff8888' },
      { key: 'skill',   label: '✨ スキル',  color: '#88ddff' },
      { key: 'capture', label: '🤝 仲間に', color: '#ffcc55' },
      { key: 'escape',  label: '💨 逃げる',  color: '#aaaaaa' },
    ];

    const btnW = Math.floor((width - 16) / 2);
    const btnH = Math.max(44, Math.floor(menuH / 2) - 4);

    commands.forEach((cmd, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 8 + col * (btnW + 4);
      const by = row * (btnH + 4);

      const bg = this.add.rectangle(bx + btnW / 2, by + btnH / 2, btnW, btnH, 0x222233)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(bx + btnW / 2, by + btnH / 2, cmd.label, {
        fontFamily: 'sans-serif', fontSize: '15px', color: cmd.color, fontStyle: 'bold',
      }).setOrigin(0.5);

      bg.on('pointerover',  () => bg.setFillStyle(0x3a3a55));
      bg.on('pointerout',   () => bg.setFillStyle(0x222233));
      bg.on('pointerdown',  () => this._onCommand(cmd.key));

      this._cmdContainer.add([bg, txt]);
    });
  }

  _buildSkillMenu(skills, width, menuH) {
    this._skillContainer.removeAll(true);
    const btnW = Math.min(Math.floor((width - 16) / 2), 200);
    const btnH = 40;

    // 戻るボタン
    const backBg = this.add.rectangle(8 + btnW / 2, 0, btnW, 34, 0x332222)
      .setInteractive({ useHandCursor: true });
    const backTxt = this.add.text(8 + btnW / 2, 0, '← 戻る', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5);
    backBg.on('pointerdown', () => {
      this._skillContainer.setVisible(false);
      this._cmdContainer.setVisible(true);
    });
    this._skillContainer.add([backBg, backTxt]);

    skills.forEach((skill, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 8 + col * (btnW + 4);
      const by = 40 + row * (btnH + 4);

      const bg = this.add.rectangle(bx + btnW / 2, by + btnH / 2, btnW, btnH, 0x1a1a33)
        .setInteractive({ useHandCursor: true });

      const mpLabel = skill.mp_cost > 0 ? ` [MP${skill.mp_cost}]` : '';
      const txt = this.add.text(bx + 8, by + btnH / 2, `${skill.name}${mpLabel}`, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#88ddff',
      }).setOrigin(0, 0.5);

      bg.on('pointerover',  () => bg.setFillStyle(0x2a2a55));
      bg.on('pointerout',   () => bg.setFillStyle(0x1a1a33));
      bg.on('pointerdown',  () => {
        this._skillContainer.setVisible(false);
        this._cmdContainer.setVisible(true);
        this._sendAction('skill', skill.id);
      });

      this._skillContainer.add([bg, txt]);
    });
  }

  // ===== Socket.io =====
  _setupSocket() {
    const s = window.AI_RPG.socket;
    if (!s) return;

    // 既存リスナーを除去してから再登録
    s.off('battle:start');
    s.off('battle:turn');
    s.off('battle:end');
    s.off('battle:error');

    s.on('battle:start', (data) => this._onBattleStart(data));
    s.on('battle:turn',  (data) => this._onBattleTurn(data));
    s.on('battle:end',   (data) => this._onBattleEnd(data));
    s.on('battle:error', (data) => this._addLog(`エラー: ${data.message}`));
  }

  _onBattleStart(data) {
    this.battleStarted = true;
    this.waitingAction = true;
    this.playerSkills  = data.playerSkills || [];
    this.battleState   = data.state;

    this._updateStateUI(data.state);
    this._addLog(data.message || 'バトル開始！');
    this._buildSkillMenu(this.playerSkills, this.scale.width, 200);
    this._setCommandEnabled(true);
  }

  _onBattleTurn(data) {
    this.battleState = data.state;

    // アクションログを順番に表示
    const msgs = (data.actions || [])
      .map((a) => a.message)
      .filter(Boolean);
    msgs.forEach((m) => this._addLog(m));

    this._updateStateUI(data.state);
    this.waitingAction = true;
    this._setCommandEnabled(true);
  }

  _onBattleEnd(data) {
    this.waitingAction  = false;
    this.battleStarted  = false;
    this._setCommandEnabled(false);

    const { result, rewards } = data;
    const isWin = result === 'win';
    const color  = isWin ? '#ffd24a' : (result === 'escape' ? '#aaaaaa' : '#ff4444');

    this._addLog(data.message || '戦闘終了');
    if (isWin && rewards) {
      this._addLog(`経験値 +${rewards.exp}  お金 +${rewards.money}`);
    }

    // 結果オーバーレイ
    this._showResultOverlay(result, rewards);
  }

  _showResultOverlay(result, rewards) {
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6)
      .setOrigin(0, 0).setDepth(20).setInteractive();

    const isWin = result === 'win';
    const title = isWin ? '勝利！' : (result === 'escape' ? '逃走！' : '敗北...');
    const titleColor = isWin ? '#ffd24a' : (result === 'escape' ? '#aaaaaa' : '#ff4444');

    this.add.text(width / 2, height / 2 - 60, title, {
      fontFamily: 'sans-serif', fontSize: '40px', color: titleColor, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);

    if (isWin && rewards) {
      this.add.text(width / 2, height / 2, `EXP +${rewards.exp}  GOLD +${rewards.money}`, {
        fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(21);
    }

    // ダンジョンへ戻るボタン
    const btnBg = this.add.rectangle(width / 2, height / 2 + 60, 200, 48, 0x3a3a55)
      .setDepth(21).setInteractive({ useHandCursor: true });
    const btnTxt = this.add.text(width / 2, height / 2 + 60, 'ダンジョンへ戻る', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(22);

    btnBg.on('pointerdown', () => {
      // 戦闘後はエンカウント7歩猶予
      this.scene.start('DungeonScene', {
        ...this.returnData,
        dungeonId:   this.dungeonId,
        floor:       this.floor,
        dungeonName: this.dungeonName,
        maxFloor:    this.maxFloor,
      });
    });
  }

  // ===== コマンド処理 =====
  _onCommand(key) {
    if (!this.waitingAction || !this.battleStarted) return;

    if (key === 'skill') {
      this._cmdContainer.setVisible(false);
      this._skillContainer.setVisible(true);
      return;
    }

    if (key === 'attack') {
      this._sendAction('attack', null);
      return;
    }

    if (key === 'escape') {
      this._sendAction('escape', null);
      return;
    }

    if (key === 'capture') {
      const target = this.battleState && this.battleState.monsters[0];
      if (target) {
        this._sendAction('capture', null);
      }
      return;
    }
  }

  _sendAction(actionType, skillId) {
    if (!this.waitingAction) return;

    const target = this.battleState && this.battleState.monsters.find((m) => m.isAlive);
    // 逃走・バフ系はターゲット不要、それ以外はターゲット必須
    const needsTarget = actionType !== 'escape' && actionType !== 'skill_buff';
    if (needsTarget && !target && actionType !== 'capture') return;

    this.waitingAction = false;
    this._setCommandEnabled(false);

    window.AI_RPG.socket.emit('battle:action', {
      actionType,
      skillId: skillId || null,
      targetId: target ? target.id : null,
    });
  }

  _setCommandEnabled(enabled) {
    const alpha = enabled ? 1.0 : 0.4;
    this._cmdContainer.setAlpha(alpha);
  }

  // ===== UI 更新 =====
  _updateStateUI(state) {
    if (!state) return;
    const { player, monsters } = state;
    const monster = monsters && monsters[0];

    // プレイヤー
    if (player) {
      this._playerName.setText(player.name || 'プレイヤー');
      const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 0;
      const pBarW = Math.min(180, this.scale.width / 2 - 20);
      this._playerHpBar.setSize(Math.max(0, pBarW * hpRatio), 12);
      this._playerHpBar.setFillStyle(hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xffcc00 : 0xff4444);
      this._playerHpText.setText(`${player.hp}/${player.maxHp}`);

      const mpRatio = player.maxMp > 0 ? player.mp / player.maxMp : 0;
      this._playerMpBar.setSize(Math.max(0, pBarW * mpRatio), 10);
      this._playerMpText.setText(`${player.mp}/${player.maxMp}`);

      const statusStr = (player.statusEffects || []).join(' ');
      this._playerStatus.setText(statusStr ? `状態: ${statusStr}` : '');
    }

    // モンスター
    if (monster) {
      this._monsterName.setText(monster.name || 'モンスター');
      const hpRatio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 0;
      const { width } = this.scale;
      const barW = Math.min(280, width - 40);
      this._monsterHpBar.setSize(Math.max(0, barW * hpRatio), 16);
      this._monsterHpBar.setFillStyle(hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xffcc00 : 0xff4444);
      this._monsterHpText.setText(`HP ${monster.hp}/${monster.maxHp}`);

      const statusStr = (monster.statusEffects || []).join(' ');
      this._monsterStatus.setText(statusStr ? `[${statusStr}]` : '');

      // 死亡時に表示を暗くする
      if (!monster.isAlive) {
        this._monsterBody.setFillStyle(0x444444);
        this._monsterEye.setFillStyle(0x333333);
      }
    }
  }

  // ===== バトルログ =====
  _addLog(msg) {
    if (!msg) return;
    this.logLines.push(msg);
    if (this.logLines.length > 4) this.logLines.shift();
    this._logTexts.forEach((t, i) => {
      t.setText(this.logLines[i] || '');
    });
  }

  shutdown() {
    const s = window.AI_RPG.socket;
    if (s) {
      s.off('battle:start');
      s.off('battle:turn');
      s.off('battle:end');
      s.off('battle:error');
    }
  }
}

window.BattleScene = BattleScene;
