// タイトル画面
// タップ/クリックでログイン画面へ遷移する

/* global Phaser */

class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    window.AI_RPG.showTabBar(false);

    const { width, height } = this.scale;

    // 背景（仮：純色）
    this.add.rectangle(0, 0, width, height, 0x101015).setOrigin(0, 0);

    // タイトルロゴ（仮テキスト）
    this.add
      .text(width / 2, height / 2 - 60, 'AI_RPG', {
        fontFamily: 'sans-serif',
        fontSize: Math.min(width, height) * 0.12 + 'px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 10, 'タップしてはじめる', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#f0f0f0',
      })
      .setOrigin(0.5);

    // 入力（マウスもタッチも pointerdown で統一）
    this.input.once('pointerdown', () => {
      this.scene.start('LoginScene');
    });

    // リサイズ対応
    this.scale.on('resize', this.handleResize, this);
  }

  handleResize() {
    // RESIZE モードなのでカメラサイズだけ更新
    this.cameras.resize(this.scale.width, this.scale.height);
  }

  shutdown() {
    this.scale.off('resize', this.handleResize, this);
  }
}

window.TitleScene = TitleScene;
