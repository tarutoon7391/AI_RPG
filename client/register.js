(function () {
  const els = {
    username: document.getElementById('register-username'),
    email: document.getElementById('register-email'),
    password: document.getElementById('register-password'),
    passwordConfirm: document.getElementById('register-password-confirm'),
    error: document.getElementById('register-error'),
    registerBtn: document.getElementById('register-btn'),
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

  async function register() {
    els.error.textContent = '';

    const username = els.username.value.trim();
    const email = els.email.value.trim();
    const password = els.password.value;
    const passwordConfirm = els.passwordConfirm.value;

    if (!username || !email || !password || !passwordConfirm) {
      els.error.textContent = 'すべての項目を入力してください';
      return;
    }

    if (password !== passwordConfirm) {
      els.error.textContent = 'パスワード確認が一致しません';
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        els.error.textContent = data.error || '通信エラーが発生しました';
        return;
      }
      location.replace('/login.html');
    } catch (_e) {
      els.error.textContent = 'ネットワークエラーが発生しました';
    }
  }

  function bindEvents() {
    els.registerBtn.addEventListener('click', register);
  }

  async function init() {
    bindEvents();
    await checkSessionAndRedirect();
  }

  init();
})();
