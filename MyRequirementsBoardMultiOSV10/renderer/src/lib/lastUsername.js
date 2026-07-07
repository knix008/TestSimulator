const LAST_USERNAME_KEY = 'mrb_last_username';

export function getLastUsername() {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLastUsername(username) {
  const value = String(username || '').trim();
  if (!value) return;
  try {
    localStorage.setItem(LAST_USERNAME_KEY, value);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}
