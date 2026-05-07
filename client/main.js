// アプリケーションのエントリポイント
// Phaser ゲームを生成し、各シーンを登録する

/* global Phaser, TitleScene, LoginScene, HomeScene, DungeonScene, BattleScene */

(function () {
  const getDevicePixelRatio = () => window.devicePixelRatio || 1;

  // 画面サイズに合わせて自動リサイズ
  const config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#101015',
    resolution: getDevicePixelRatio(),
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    // ピクセルアート前提でアンチエイリアスを無効化
    pixelArt: true,
    // タッチ・マウス両対応はデフォルトで有効
    input: {
      activePointers: 3,
    },
    scene: [TitleScene, LoginScene, HomeScene, DungeonScene, BattleScene],
  };

  // バージョン定数
  const VERSION = 'v0.1.0';

  // グローバル状態（最低限）
  window.AI_RPG = {
    user: null, // { id, username }
    socket: null,
    version: VERSION,
  };

  const game = new Phaser.Game(config);
  window.AI_RPG.game = game;

  // キャンバスのCSSサイズと実解像度をDPRに合わせて同期
  const syncCanvasResolution = function () {
    const canvas = game.canvas;
    if (!canvas) return;

    const parent = canvas.parentElement || document.getElementById('game');
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const dpr = getDevicePixelRatio();
    const realWidth = Math.round(cssWidth * dpr);
    const realHeight = Math.round(cssHeight * dpr);

    if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
    if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
    if (canvas.width !== realWidth) canvas.width = realWidth;
    if (canvas.height !== realHeight) canvas.height = realHeight;
  };

  syncCanvasResolution();
  window.addEventListener('resize', syncCanvasResolution);
  window.addEventListener('orientationchange', syncCanvasResolution);

  // タブUI制御
  const tabBar = document.getElementById('tab-bar');
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('.tab-button')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tabKey = btn.getAttribute('data-tab');
      // HomeScene に通知
      const homeScene = game.scene.getScene('HomeScene');
      if (homeScene && homeScene.scene.isActive()) {
        homeScene.events.emit('tab:change', tabKey);
      }
    });
  });

  // タブ表示制御ユーティリティ
  window.AI_RPG.showTabBar = function (visible) {
    if (visible) {
      tabBar.classList.remove('hidden');
      document.body.classList.add('with-tabbar');
    } else {
      tabBar.classList.add('hidden');
      document.body.classList.remove('with-tabbar');
    }
    syncCanvasResolution();
  };
})();
