const api = window.myworkspace;

export function bindLogin({ onSuccess }) {
  const screen = document.getElementById('login-screen');
  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');

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
