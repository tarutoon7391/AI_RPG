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

    // タブ別タイトル＋仮コンテンツ
    const titles = {
      adventure: '冒険',
      monsters: 'モンスター',
      versus: '対戦',
      others: 'その他',
    };
    const messages = {
      adventure: 'ダンジョンに挑もう！（ここに一覧が並びます）',
      monsters: '所持モンスター・パーティ編成（実装予定）',
      versus: '対戦・協力モードへの参加（実装予定）',
      others: '設定・ショップ・その他メニュー（実装予定）',
    };

    this.add
      .text(width / 2, height / 2 - 30, titles[tabKey] || '', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 20, messages[tabKey] || '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#f0f0f0',
        align: 'center',
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5);
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
