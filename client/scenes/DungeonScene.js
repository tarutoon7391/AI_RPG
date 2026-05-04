// DungeonScene.js
// 15×15 グリッドマップのダンジョンシーン
// 矢印キー・WASD・タッチで移動、エンカウント、階段でフロア遷移

/* global Phaser */

class DungeonScene extends Phaser.Scene {
  constructor() {
    super('DungeonScene');
  }

  init(data) {
    this.dungeonId    = data.dungeonId  || 1;
    this.dungeonName  = data.dungeonName || 'はじまりの洞窟';
    this.currentFloor = data.floor      || 1;
    this.maxFloor     = data.maxFloor   || 5;
    this.stepsSinceBattle = 7; // 入場直後はエンカウントなし
    this.noEncounterSteps = 7;
    this.startRow = (data.playerRow != null) ? data.playerRow : null;
    this.startCol = (data.playerCol != null) ? data.playerCol : null;
  }

  // ===== タイル種別 =====
  // 0: 壁  1: 床  2: 階段下り  3: 階段上り

  create() {
    window.AI_RPG.showTabBar(false);

    this.TILE   = 40;  // タイルサイズ（px）
    this.COLS   = 15;
    this.ROWS   = 15;

    this.map = this._generateMap();
    this._drawMap();
    this._spawnPlayer();
    this._setupInput();
    this._setupTouch();
    this._createHUD();

    this.scale.on('resize', this._onResize, this);
  }

  // ===== マップ生成 =====
  _generateMap() {
    const COLS = this.COLS;
    const ROWS = this.ROWS;
    const map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

    // 外周は壁、内側を床で埋める
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        map[r][c] = 1;
      }
    }

    // ランダムに壁を追加（迷路感）
    for (let r = 2; r < ROWS - 2; r += 2) {
      for (let c = 2; c < COLS - 2; c += 2) {
        if (Math.random() < 0.35) {
          map[r][c] = 0;
        }
      }
    }

    // 階段下り（右下付近）
    map[ROWS - 2][COLS - 2] = 2;
    // 階段上り（左上付近）、フロア1以外に配置
    if (this.currentFloor > 1) {
      map[1][1] = 3;
    }

    // 開始位置（左上付近）を確実に床にする
    map[1][1] = this.currentFloor > 1 ? 3 : 1;
    map[1][2] = 1;
    map[2][1] = 1;

    return map;
  }

  _drawMap() {
    if (this.mapContainer) this.mapContainer.destroy();
    this.mapContainer = this.add.container(0, 0);

    const TILE = this.TILE;

    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const tile = this.map[r][c];
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;

        if (tile === 0) {
          // 壁
          const rect = this.add.rectangle(x, y, TILE, TILE, 0x2a2050);
          this.mapContainer.add(rect);
        } else if (tile === 1) {
          // 床
          const rect = this.add.rectangle(x, y, TILE, TILE, 0x3a3040);
          this.mapContainer.add(rect);
        } else if (tile === 2) {
          // 階段下り
          const rect = this.add.rectangle(x, y, TILE, TILE, 0x3a3040);
          const stair = this.add.text(x, y, '▼', {
            fontFamily: 'sans-serif', fontSize: '18px', color: '#ffd24a',
          }).setOrigin(0.5);
          this.mapContainer.add(rect);
          this.mapContainer.add(stair);
        } else if (tile === 3) {
          // 階段上り
          const rect = this.add.rectangle(x, y, TILE, TILE, 0x3a3040);
          const stair = this.add.text(x, y, '▲', {
            fontFamily: 'sans-serif', fontSize: '18px', color: '#a0e0ff',
          }).setOrigin(0.5);
          this.mapContainer.add(rect);
          this.mapContainer.add(stair);
        }
      }
    }
  }

  _spawnPlayer() {
    const TILE = this.TILE;
    // 開始位置：復帰データがあればそれを使用、なければデフォルト (row=1, col=2)
    this.playerRow = (this.startRow != null) ? this.startRow : 1;
    this.playerCol = (this.startCol != null) ? this.startCol : 2;

    if (this.playerSprite) this.playerSprite.destroy();
    this.playerSprite = this.add.rectangle(
      this.playerCol * TILE + TILE / 2,
      this.playerRow * TILE + TILE / 2,
      TILE - 6, TILE - 6, 0x55ccff
    );
    // 目の表示
    if (this.playerEye) this.playerEye.destroy();
    this.playerEye = this.add.circle(
      this.playerCol * TILE + TILE / 2 + 6,
      this.playerRow * TILE + TILE / 2 - 4,
      4, 0x000000
    );
  }

  _movePlayerSprite() {
    const TILE = this.TILE;
    const x = this.playerCol * TILE + TILE / 2;
    const y = this.playerRow * TILE + TILE / 2;
    this.playerSprite.setPosition(x, y);
    this.playerEye.setPosition(x + 6, y - 4);
    this._adjustCamera();
  }

  _adjustCamera() {
    const TILE = this.TILE;
    const { width, height } = this.scale;
    const mapW = this.COLS * TILE;
    const mapH = this.ROWS * TILE;

    // プレイヤーを中心にカメラをクランプ
    const cx = this.playerCol * TILE + TILE / 2;
    const cy = this.playerRow * TILE + TILE / 2;

    const offsetX = Phaser.Math.Clamp(cx - width / 2, 0, Math.max(0, mapW - width));
    const offsetY = Phaser.Math.Clamp(cy - height / 2, 0, Math.max(0, mapH - height));

    this.cameras.main.setScroll(offsetX, offsetY);
  }

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this._moveBlocked = false;
  }

  _setupTouch() {
    // スワイプ操作
    this._touchStart = null;
    this.input.on('pointerdown', (p) => {
      this._touchStart = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', (p) => {
      if (!this._touchStart) return;
      const dx = p.x - this._touchStart.x;
      const dy = p.y - this._touchStart.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 20) return; // 短すぎるスワイプは無視
      if (absDx > absDy) {
        this._tryMove(0, dx > 0 ? 1 : -1);
      } else {
        this._tryMove(dy > 0 ? 1 : -1, 0);
      }
      this._touchStart = null;
    });
  }

  _createHUD() {
    // HUDはカメラに固定（setScrollFactor(0)）
    const { width } = this.scale;
    if (this.hudContainer) this.hudContainer.destroy();
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0);

    const bg = this.add.rectangle(0, 0, width, 44, 0x000000, 0.7).setOrigin(0, 0);
    const floorText = this.add.text(12, 10, `${this.dungeonName}  B${this.currentFloor}F`, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffd24a',
    });
    const backBtn = this.add.text(width - 12, 10, '← ホームへ', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#a0c0ff',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this._returnHome());

    this.hudContainer.add([bg, floorText, backBtn]);
    this._hudFloorText = floorText;
    this._hudBackBtn = backBtn;
  }

  _updateHUD() {
    if (this._hudFloorText) {
      this._hudFloorText.setText(`${this.dungeonName}  B${this.currentFloor}F`);
    }
  }

  update() {
    if (this._moveBlocked) return;

    const up    = Phaser.Input.Keyboard.JustDown(this.cursors.up)    || Phaser.Input.Keyboard.JustDown(this.wasd.up);
    const down  = Phaser.Input.Keyboard.JustDown(this.cursors.down)  || Phaser.Input.Keyboard.JustDown(this.wasd.down);
    const left  = Phaser.Input.Keyboard.JustDown(this.cursors.left)  || Phaser.Input.Keyboard.JustDown(this.wasd.left);
    const right = Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.right);

    if (up)    this._tryMove(-1,  0);
    if (down)  this._tryMove( 1,  0);
    if (left)  this._tryMove( 0, -1);
    if (right) this._tryMove( 0,  1);
  }

  _tryMove(dr, dc) {
    const nr = this.playerRow + dr;
    const nc = this.playerCol + dc;

    if (nr < 0 || nr >= this.ROWS || nc < 0 || nc >= this.COLS) return;
    if (this.map[nr][nc] === 0) return; // 壁

    this.playerRow = nr;
    this.playerCol = nc;
    this._movePlayerSprite();
    this.stepsSinceBattle++;

    const tile = this.map[nr][nc];

    // 階段タイルチェック
    if (tile === 2) {
      this._goNextFloor();
      return;
    }
    if (tile === 3 && this.currentFloor > 1) {
      this._goPrevFloor();
      return;
    }

    // エンカウント判定
    if (this.stepsSinceBattle >= this.noEncounterSteps) {
      if (Math.random() < 0.1) {
        this._startEncounter();
      }
    }
  }

  _goNextFloor() {
    if (this.currentFloor >= this.maxFloor) {
      // ボス戦 or ダンジョンクリア（今回はバトルとして扱う）
      this._startEncounter(true);
      return;
    }
    this.currentFloor++;
    this.stepsSinceBattle = 0;
    this.map = this._generateMap();
    this._drawMap();
    this._spawnPlayer();
    this._updateHUD();
    this._showMessage(`B${this.currentFloor}F に到着！`);
  }

  _goPrevFloor() {
    if (this.currentFloor <= 1) return;
    this.currentFloor--;
    this.stepsSinceBattle = 0;
    this.map = this._generateMap();
    this._drawMap();
    this._spawnPlayer();
    this._updateHUD();
    this._showMessage(`B${this.currentFloor}F に戻った`);
  }

  _startEncounter(isBoss) {
    this._moveBlocked = true;
    const msg = isBoss ? 'ボスが現れた！' : 'エンカウント！';
    this._showMessage(msg, 800, () => {
      this.scene.start('BattleScene', {
        dungeonId:   this.dungeonId,
        floor:       this.currentFloor,
        dungeonName: this.dungeonName,
        maxFloor:    this.maxFloor,
        isBoss,
        playerRow:   this.playerRow,
        playerCol:   this.playerCol,
        // 戦闘後に戻るためのデータ
        returnData: {
          dungeonId:   this.dungeonId,
          floor:       this.currentFloor,
          dungeonName: this.dungeonName,
          maxFloor:    this.maxFloor,
          playerRow:   this.playerRow,   // バトル後に元の位置へ戻るために追加
          playerCol:   this.playerCol,   // バトル後に元の位置へ戻るために追加
        },
      });
    });
  }

  _showMessage(text, duration, callback) {
    const { width, height } = this.scale;
    if (this._msgText) this._msgText.destroy();
    this._msgText = this.add.text(width / 2, height / 2, text, {
      fontFamily: 'sans-serif',
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

    this.time.delayedCall(duration || 1200, () => {
      if (this._msgText) {
        this._msgText.destroy();
        this._msgText = null;
      }
      if (callback) callback();
    });
  }

  _returnHome() {
    this.scene.start('HomeScene');
  }

  _onResize() {
    this._drawMap();
    this._spawnPlayer();
    this._createHUD();
  }

  shutdown() {
    this.scale.off('resize', this._onResize, this);
    this.input.off('pointerdown');
    this.input.off('pointerup');
  }
}

window.DungeonScene = DungeonScene;
