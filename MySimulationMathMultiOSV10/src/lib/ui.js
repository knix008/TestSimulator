// App-wide confirmations, toasts and error popups without threading
// callbacks through every view. <UiHost/> (mounted once in App) renders them.
//
//   if (!(await ask({ title, body, okLabel, danger: true }))) return;
//   const r = await attempt(() => call('x.y', args), { ok: t('saved') });
//   if (!r.ok) return;            // the error popup has been shown
import { t, getLanguage } from './i18n';

const state = { asks: [], toasts: [] };
const subs = new Set();
let seq = 0;
const emit = () => subs.forEach((fn) => fn({ asks: [...state.asks], toasts: [...state.toasts] }));

export function subscribeUi(fn) {
  subs.add(fn);
  fn({ asks: [...state.asks], toasts: [...state.toasts] });
  return () => subs.delete(fn);
}

/**
 * A confirmation. Resolves true (OK) / false (cancel), or — with `buttons`
 * ([{ id, label, icon, primary, danger }]) — the id of the chosen button
 * ('cancel' when closed with × or Esc).
 */
export function ask(opts) {
  return new Promise((resolve) => {
    seq += 1;
    const id = seq;
    state.asks.push({ ...opts, id, resolve: (v) => { state.asks = state.asks.filter((a) => a.id !== id); emit(); resolve(v); } });
    emit();
  });
}

/** A short note at the bottom right; kind: ok | warn | bad; action: { label, icon, run } adds a button. */
export function toast(text, kind = 'ok', ms = 3200, action = null) {
  if (!text) return;
  seq += 1;
  const id = seq;
  state.toasts = [...state.toasts.slice(-3), { id, text: String(text), kind, action }];
  emit();
  setTimeout(() => { state.toasts = state.toasts.filter((x) => x.id !== id); emit(); }, ms);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('msm-toast', { detail: { text: String(text), kind } }));
}

const CODES = ['FORBIDDEN', 'NOT_CONFIGURED', 'APPROVAL_REQUIRED', 'UNAUTHORIZED', 'NOT_FOUND', 'BAD_REQUEST', 'LAST_ADMIN', 'CANCELLED', 'CONFLICT', 'NO_METHOD'];

/** Error text: the server's own text in this language, else a plain explanation of the code, else the message. */
export function errorText(err) {
  const code = err && err.code;
  const msg = (err && err.message) || String(err || '');
  const own = err && err.text && (err.text[getLanguage()] || err.text.en || err.text.ko);
  if (own) return own;
  if (code && CODES.includes(code)) {
    const plain = t(`err_${code}`);
    return msg && msg !== plain ? `${plain} (${msg})` : plain;
  }
  return msg;
}

/** An error popup (cancellations only get a toast). */
export function showError(err, title) {
  if (err && err.code === 'CANCELLED') { toast(errorText(err), 'warn'); return Promise.resolve(); }
  return ask({ kind: 'error', title: title || t('error_title'), body: errorText(err), alert: true });
}

/**
 * Runs fn (an API call); on failure shows the error popup, on success the
 * optional `ok` toast. Resolves { ok, value, error }.
 */
export async function attempt(fn, { ok, title } = {}) {
  try {
    const value = await fn();
    if (ok) toast(typeof ok === 'function' ? ok(value) : ok, 'ok');
    return { ok: true, value };
  } catch (error) {
    showError(error, title);
    return { ok: false, error };
  }
}
