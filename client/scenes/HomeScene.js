// ホーム画面（タブUI）
// 下部固定の4タブに対応するコンテンツを上部に表示する。
// 初期タブは「冒険」。

/* global Phaser, io */

class HomeScene extends Phaser.Scene {
  constructor() {
    super('HomeScene');
    this.currentTab = 'adventure';
  }

  create() {
    window.AI_RPG.showTabBar(true);

    // Socket.io 接続（既に接続済みなら再利用）
    if (!window.AI_RPG.socket) {
      window.AI_RPG.socket = io({ withCredentials: true });
      // 受信用イベントの最低限の登録（骨格のみ）
      const s = window.AI_RPG.socket;
      s.on('connect', () => console.log('[socket] connected', s.id));
      s.on('room:updated', (p) => console.log('[socket] room:updated', p));
      s.on('battle:start', (p) => console.log('[socket] battle:start', p));
      s.on('battle:turn', (p) => console.log('[socket] battle:turn', p));
      s.on('battle:end', (p) => console.log('[socket] battle:end', p));
      s.on('player:joined', (p) => console.log('[socket] player:joined', p));
      s.on('player:left', (p) => console.log('[socket] player:left', p));
    }

    this.renderTab(this.currentTab);

    // タブ切替を main.js から受け取る
    this.events.on('tab:change', (tabKey) => {
      this.currentTab = tabKey;
      this.renderTab(tabKey);
    });

    this.scale.on('resize', this.handleResize, this);
  }

  handleResize() {
    this.cameras.resize(this.scale.width, this.scale.height);
    this.renderTab(this.currentTab);
  }

  renderTab(tabKey) {
    // 既存表示物をクリア
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x101015).setOrigin(0, 0);

    const username =
      (window.AI_RPG.user && window.AI_RPG.user.username) || 'ゲスト';

    // ヘッダー
    this.add
      .text(16, 16, `ようこそ、${username} さん`, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#b0b0c0',
      })
      .setOrigin(0, 0);

    // ログアウトボタン
    const logoutText = this.add
      .text(width - 16, 16, 'ログアウト', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#ffd24a',
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    logoutText.on('pointerdown', () => this.handleLogout());

    // タブ別タイトル＋コンテンツ
    const titles = {
      adventure: '冒険',
      monsters: 'モンスター',
      versus: '対戦',
      others: 'その他',
    };

    this.add
      .text(width / 2, 60, titles[tabKey] || '', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    // バージョン表示（右下）
    this.add
      .text(width - 8, height - 8, window.AI_RPG.version || 'v0.1.0', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#666666',
      })
      .setOrigin(1, 1);

    if (tabKey === 'adventure') {
      this._renderAdventureTab(width, height);
    } else {
      const messages = {
        monsters: '所持モンスター・パーティ編成（実装予定）',
        versus: '対戦・協力モードへの参加（実装予定）',
        others: '設定・ショップ・その他メニュー（実装予定）',
      };
      this.add
        .text(width / 2, height / 2, messages[tabKey] || '', {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: '#f0f0f0',
          align: 'center',
          wordWrap: { width: width - 40 },
        })
        .setOrigin(0.5);
    }
  }

  _renderAdventureTab(width, height) {
    // ダンジョン一覧ラベル
    this.add
      .text(16, 110, 'ダンジョン一覧', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#b0b0c0',
      })
      .setOrigin(0, 0);

    // 「はじまりの洞窟」ボタン
    const btnW = Math.min(320, width - 32);
    const btnH = 64;
    const btnX = width / 2;
    const btnY = 160;

    const btnBg = this.add
      .rectangle(btnX, btnY, btnW, btnH, 0x2a2050)
      .setInteractive({ useHandCursor: true });

    const btnLabel = this.add
      .text(btnX, btnY - 10, 'はじまりの洞窟', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const btnSub = this.add
      .text(btnX, btnY + 14, '推奨Lv1〜  フロア数：5',  {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#a0a0c0',
      })
      .setOrigin(0.5);

    btnBg.on('pointerover',  () => btnBg.setFillStyle(0x3a3068));
    btnBg.on('pointerout',   () => btnBg.setFillStyle(0x2a2050));
    btnBg.on('pointerdown',  () => {
      this.scene.start('DungeonScene', {
        dungeonId:   1,
        dungeonName: 'はじまりの洞窟',
        floor:       1,
        maxFloor:    5,
      });
    });
  }

  async handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch (e) {
      // 失敗しても画面は戻す
    }
    window.AI_RPG.user = null;
    if (window.AI_RPG.socket) {
      window.AI_RPG.socket.disconnect();
      window.AI_RPG.socket = null;
    }
    window.AI_RPG.showTabBar(false);
    this.scene.start('TitleScene');
  }

  shutdown() {
    this.scale.off('resize', this.handleResize, this);
    this.events.off('tab:change');
  }
}

window.HomeScene = HomeScene;
