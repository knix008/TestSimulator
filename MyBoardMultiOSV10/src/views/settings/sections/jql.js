// JQL boxes: a text field checked with POST /jql/validate while typing; the message under it says where the
// query is wrong (translated by code) or that it is fine.
import { tr, esc, icon, errorText } from '../util.js';

/** A JQL field (data-jql) with its message line. `attrs` go on the input. */
export function jqlInput(name, value, { disabled = false, placeholder = '', attrs = '' } = {}) {
  return `<span class="ps-jql"><span class="ps-jql-box">${icon('search')}<input class="ps-input ps-jql-input" type="text" data-field="${esc(name)}" data-jql value="${esc(value ?? '')}" ${disabled ? 'disabled' : ''} placeholder="${esc(placeholder || tr('jql.placeholder'))}" aria-label="${esc(placeholder || tr('jql.placeholder'))}" spellcheck="false" autocomplete="off" ${attrs} /></span><span class="ps-jql-msg" aria-live="polite"></span></span>`;
}

/** Checks a query: { ok } or { ok: false, message }. */
export async function checkJql(api, jql) {
  if (!String(jql ?? '').trim()) return { ok: true, empty: true };
  try {
    const out = await api.post('/jql/validate', { jql });
    if (out?.ok) return { ok: true };
    const error = out?.error ?? {};
    const pos = error.details?.position;
    return { ok: false, code: error.code, message: `${errorText({ code: error.code, message: error.message })}${pos != null ? ` (${tr('jql.at', { pos: Number(pos) + 1 })})` : ''}` };
  } catch (error) {
    return { ok: false, code: error.code, message: errorText(error) };
  }
}

export function showJql(input, result) {
  const msg = input.closest('.ps-jql')?.querySelector('.ps-jql-msg');
  input.classList.toggle('invalid', !result.ok);
  input.dataset.jqlState = result.ok ? 'ok' : 'error';
  if (!msg) return;
  msg.className = `ps-jql-msg ${result.ok ? (result.empty ? '' : 'ok') : 'error'}`;
  msg.innerHTML = result.ok ? (result.empty ? '' : `${icon('check')}<span>${esc(tr('jql.ok'))}</span>`) : `${icon('error')}<span>${esc(result.message)}</span>`;
}

/** Validates every [data-jql] box of `el` while typing (and once now for the filled ones). */
export function bindJql(S, el) {
  const timers = new WeakMap();
  const run = (input) => {
    clearTimeout(timers.get(input));
    timers.set(input, setTimeout(async () => { const result = await checkJql(S.api, input.value); if (input.isConnected) showJql(input, result); }, 280));
  };
  el.addEventListener('input', (event) => { if (event.target.matches?.('[data-jql]')) run(event.target); });
  for (const input of el.querySelectorAll('[data-jql]')) if (input.value.trim()) checkJql(S.api, input.value).then((r) => { if (input.isConnected) showJql(input, r); });
}
