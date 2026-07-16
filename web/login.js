    // HttpOnly Cookieが有効ならユーザー表示情報を復元して各ポータルへ。
    api('/api/auth/me', { skipAuthRedirect: true })
      .then(existing => {
        setAuth(existing);
        location.href = existing.role === 'exhibitor' ? 'index.html' : 'admin.html';
      })
      .catch(() => clearAuth());

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnLogin');
      const errorBox = document.getElementById('errorBox');
      errorBox.classList.remove('show');
      btn.disabled = true;
      btn.textContent = 'ログイン中...';
      try {
        const res = await api('/api/auth/login', {
          method: 'POST',
          body: {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          },
          skipAuthRedirect: true,
        });
        setAuth(res.user);
        location.href = res.user.role === 'exhibitor' ? 'index.html' : 'admin.html';
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'ログイン';
      }
    });
