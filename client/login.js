(function () {
  const els = {
    authUser: document.getElementById('auth-username'),
    authPass: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    loginBtn: document.getElementById('login-btn'),
  };

  async function checkSessionAndRedirect() {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
      });
      if (res.ok) {
        location.replace('/lobby.html');
      }
    } catch (_e) {
      // no-op
    }
  }

  async function login() {
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
      location.replace('/lobby.html');
    } catch (_e) {
      els.authError.textContent = 'ネットワークエラーが発生しました';
    }
  }

  function bindEvents() {
    els.loginBtn.addEventListener('click', login);
  }

  async function init() {
    bindEvents();
    await checkSessionAndRedirect();
  }

  init();
})();
