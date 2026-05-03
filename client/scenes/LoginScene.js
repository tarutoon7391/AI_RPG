// ログイン画面
// HTML フォームを Phaser キャンバス上にオーバーレイして実装する
// （Phaser のテキスト入力は標準で扱いにくいため、DOM を併用）

/* global Phaser */

class LoginScene extends Phaser.Scene {
  constructor() {
    super('LoginScene');
  }

  create() {
    window.AI_RPG.showTabBar(false);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x101015).setOrigin(0, 0);
    this.add
      .text(width / 2, 60, 'ログイン / 新規登録', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.createForm();
  }

  createForm() {
    // 既存の重複オーバーレイを除去（シーン再入場対策）
    const old = document.getElementById('login-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.style.cssText = `
      position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(360px, 90vw);
      background: #1c1c24; border: 1px solid #2a2a35; border-radius: 12px;
      padding: 20px; z-index: 20; color: #f0f0f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif;
    `;
    overlay.innerHTML = `
      <label style="display:block; margin-bottom: 12px;">
        <div style="font-size:12px; color:#b0b0c0; margin-bottom:4px;">ユーザー名</div>
        <input id="login-username" type="text" autocomplete="username" maxlength="32"
          style="width:100%; padding:10px; background:#101015; border:1px solid #333; border-radius:6px; color:#fff; font-size:16px;" />
      </label>
      <label style="display:block; margin-bottom: 16px;">
        <div style="font-size:12px; color:#b0b0c0; margin-bottom:4px;">パスワード（8文字以上）</div>
        <input id="login-password" type="password" autocomplete="current-password" maxlength="128"
          style="width:100%; padding:10px; background:#101015; border:1px solid #333; border-radius:6px; color:#fff; font-size:16px;" />
      </label>
      <div id="login-error" style="color:#ff6b6b; font-size:13px; min-height:18px; margin-bottom:8px;"></div>
      <div style="display:flex; gap:8px;">
        <button id="login-submit" type="button"
          style="flex:1; padding:12px; background:#ffd24a; color:#101015; border:none; border-radius:6px; font-weight:bold; font-size:15px; cursor:pointer;">ログイン</button>
        <button id="register-submit" type="button"
          style="flex:1; padding:12px; background:#3a3a48; color:#fff; border:none; border-radius:6px; font-weight:bold; font-size:15px; cursor:pointer;">新規登録</button>
      </div>
    `;
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const usernameInput = overlay.querySelector('#login-username');
    const passwordInput = overlay.querySelector('#login-password');
    const errorEl = overlay.querySelector('#login-error');

    const submit = async (endpoint) => {
      errorEl.textContent = '';
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) {
        errorEl.textContent = 'ユーザー名とパスワードを入力してください';
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
          errorEl.textContent = data.error || '通信エラーが発生しました';
          return;
        }
        window.AI_RPG.user = data.user;
        this.removeForm();
        this.scene.start('HomeScene');
      } catch (e) {
        errorEl.textContent = 'ネットワークエラーが発生しました';
      }
    };

    overlay
      .querySelector('#login-submit')
      .addEventListener('click', () => submit('login'));
    overlay
      .querySelector('#register-submit')
      .addEventListener('click', () => submit('register'));
  }

  removeForm() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  shutdown() {
    this.removeForm();
  }
}

window.LoginScene = LoginScene;
