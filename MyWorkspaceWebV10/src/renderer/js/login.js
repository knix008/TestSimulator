const api = window.myworkspace;

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

export function bindLogin({ onSuccess }) {
  const screen = document.getElementById('login-screen');
  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');
  const hintEl = document.getElementById('login-hint');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.classList.add('hidden');

    const result = await api.login(usernameInput.value, passwordInput.value);
    if (!result.ok) {
      errorEl.textContent = result.message;
      errorEl.classList.remove('hidden');
      return;
    }

    screen.classList.add('hidden');
    await onSuccess(result.user);
  });

  return {
    async applyDefaults(uiConfig) {
      const showDefaultAdmin = !uiConfig?.hasLoggedInOnce;
      if (showDefaultAdmin) {
        usernameInput.value = DEFAULT_ADMIN_USERNAME;
        passwordInput.value = DEFAULT_ADMIN_PASSWORD;
        hintEl?.classList.remove('hidden');
        passwordInput.focus();
        passwordInput.select();
        return;
      }

      usernameInput.value = uiConfig?.lastLoginUsername || '';
      passwordInput.value = '';
      hintEl?.classList.add('hidden');
      if (usernameInput.value) {
        passwordInput.focus();
      } else {
        usernameInput.focus();
      }
    },
    show() {
      screen.classList.remove('hidden');
      usernameInput.focus();
    },
    hide() {
      screen.classList.add('hidden');
    }
  };
}

export async function tryRestoreSession(onSuccess) {
  const result = await api.getSession();
  if (result.ok) {
    await onSuccess(result.user);
    return true;
  }
  return false;
}
