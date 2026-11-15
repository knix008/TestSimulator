const KEY = 'myworkforce-data-url';

export function dataUrl() {
  try {
    return (localStorage.getItem(KEY) || 'http://127.0.0.1:1481').replace(/\/$/, '');
  } catch {
    return 'http://127.0.0.1:1481';
  }
}

export function rememberDataUrl(url) {
  const next = String(url || '').trim().replace(/\/$/, '');
  if (!next) return;
  localStorage.setItem(KEY, next);
}

async function call(path, options = {}) {
  const response = await fetch(`${dataUrl()}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'connect');
    error.detail = data.detail || '';
    throw error;
  }
  return data;
}

export const dataStatus = () => call('/api/status');
export const connectData = (config) => call('/api/connect', { method: 'POST', body: JSON.stringify(config || { engine: 'sqlite' }) });
export const loadWorkspace = () => call('/api/workspace');
export const saveWorkspace = (workspace) => call('/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace }) });
export const unlockData = (userId, password) => call('/api/unlock', { method: 'POST', body: JSON.stringify({ userId, password }) });
export const hashPassword = (password) => call('/api/password', { method: 'POST', body: JSON.stringify({ password }) });
