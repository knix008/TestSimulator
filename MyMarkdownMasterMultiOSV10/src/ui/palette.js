// The command palette, quick switcher and every "pick one" list (templates, folders, tags, headings …):
// a box over the window with a filter field and a list kept in step with the typing — no OS window, so
// typing is instant. `items(query)` may be async (the quick switcher asks the Rust core).
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { escapeHtml } from './dom.js';

let open = null;

// Popup windows: with a host (the app's PopupHost) the suggester and the prompt are popups of their own —
// an OS window on the desktop ("popup-suggest", "popup-prompt"), a floating frame on the web — like every
// other popup. The window shows the list and the filter; the items come from here (they may need the core).
let host = null;
let session = null;
export function useWindows(popups) {
  host = popups;
  host.on('suggest-query', (data) => session?.query(data));
}
const topAnchor = (width) => ({ x: Math.round(window.screenX + Math.max(0, (window.outerWidth - width) / 2)), y: Math.round(window.screenY + 96) });

function suggestWindow(options) {
  return new Promise((resolve) => {
    let items = [];
    session = {
      async query({ query, seq }) {
        let next = (await options.items(query)) ?? [];
        const create = options.allowCreate?.(query, next);
        if (create) next = [...next, create];
        items = next;
        host.post('suggest', { type: 'suggest-items', seq, items: next.map(({ id, label, detail, icon: glyph, hint, positions, kbd }) => ({ id: String(id), label, detail, icon: glyph, hint, positions, kbd })) });
      },
    };
    const params = { title: options.title ?? options.placeholder ?? '', placeholder: options.placeholder ?? '', icon: options.icon ?? 'search', emptyText: options.emptyText ?? t('palette.empty'), initial: options.initial ?? '', footer: options.footer ?? [['↑↓', t('palette.move')], ['↵', t('palette.choose')], ['Esc', t('palette.close')]] };
    host.open('suggest', params, { anchor: topAnchor(640) }).then((result) => {
      session = null;
      const item = result?.id != null ? items.find((x) => String(x.id) === String(result.id)) ?? null : null;
      if (item) options.onChoose?.(item, { query: result.query ?? '', newTab: Boolean(result.newTab), shift: Boolean(result.shift), alt: false });
      resolve(item);
    });
  });
}

/** Highlights the matched characters (positions are char indexes). */
export function highlight(text, positions = []) {
  const set = new Set(positions);
  return [...String(text)].map((c, i) => (set.has(i) ? `<b>${escapeHtml(c)}</b>` : escapeHtml(c))).join('');
}

/** Simple fuzzy match for local lists: returns positions or null. */
export function fuzzy(query, text) {
  const q = String(query).toLowerCase().replace(/\s+/g, '');
  if (!q) return [];
  const s = String(text).toLowerCase();
  const out = [];
  let j = 0;
  for (let i = 0; i < s.length && j < q.length; i += 1) if (s[i] === q[j]) { out.push(i); j += 1; }
  return j === q.length ? out : null;
}

/**
 * Opens a suggester. options: { placeholder, items(query) → [{ id, label, detail, icon, hint, positions, kbd }] (sync or async),
 * onChoose(item, { query, newTab, shift }), emptyText, footer: [[key, text]], allowCreate: (query) → item|null, initial }.
 * Resolves with the chosen item (or null).
 */
export function openSuggest(options) {
  close();
  if (host) return suggestWindow(options);
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'suggest-layer';
    layer.innerHTML = `<div class="suggest-box" role="dialog" aria-modal="true">
      <label class="suggest-input">${icon(options.icon ?? 'search')}<input type="text" spellcheck="false" autocomplete="off" placeholder="${escapeHtml(options.placeholder ?? '')}" value="${escapeHtml(options.initial ?? '')}" /></label>
      <div class="suggest-list" role="listbox"></div>
      <div class="suggest-foot">${(options.footer ?? [['↑↓', t('palette.move')], ['↵', t('palette.choose')], ['Esc', t('palette.close')]]).map(([k, v]) => `<span><kbd>${escapeHtml(k)}</kbd>${escapeHtml(v)}</span>`).join('')}</div>
    </div>`;
    document.body.append(layer);
    const input = layer.querySelector('input');
    const list = layer.querySelector('.suggest-list');
    let items = [];
    let selected = 0;
    let seq = 0;
    const draw = () => {
      list.innerHTML = items.length ? items.map((it, i) => `<div class="suggest-item ${i === selected ? 'selected' : ''}" data-i="${i}" role="option" aria-selected="${i === selected}">
          ${it.icon ? icon(it.icon) : ''}<span class="suggest-main"><span class="suggest-label">${it.positions ? highlight(it.label, it.positions) : escapeHtml(it.label)}</span>${it.detail ? `<span class="suggest-detail">${escapeHtml(it.detail)}</span>` : ''}</span>
          ${it.hint ? `<span class="suggest-hint">${escapeHtml(it.hint)}</span>` : ''}${it.kbd ? `<kbd>${escapeHtml(it.kbd)}</kbd>` : ''}</div>`).join('')
        : `<div class="suggest-empty">${escapeHtml(options.emptyText ?? t('palette.empty'))}</div>`;
      list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    };
    const refresh = async () => {
      const mine = (seq += 1);
      let next = await options.items(input.value);
      if (mine !== seq) return;
      next = next ?? [];
      const create = options.allowCreate?.(input.value, next);
      if (create) next = [...next, create];
      items = next;
      selected = Math.min(selected, Math.max(0, items.length - 1));
      if (input.value !== refresh.last) selected = 0;
      refresh.last = input.value;
      draw();
    };
    const finish = (item, event) => {
      layer.remove();
      open = null;
      if (item) options.onChoose?.(item, { query: input.value, newTab: Boolean(event?.ctrlKey || event?.metaKey), shift: Boolean(event?.shiftKey), alt: Boolean(event?.altKey) });
      resolve(item ?? null);
    };
    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) { event.preventDefault(); selected = Math.min(items.length - 1, selected + 1); draw(); }
      else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) { event.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
      else if (event.key === 'PageDown') { event.preventDefault(); selected = Math.min(items.length - 1, selected + 8); draw(); }
      else if (event.key === 'PageUp') { event.preventDefault(); selected = Math.max(0, selected - 8); draw(); }
      else if (event.key === 'Enter') { event.preventDefault(); finish(items[selected], event); }
      else if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      event.stopPropagation();
    });
    list.addEventListener('pointerdown', (event) => { const row = event.target.closest('.suggest-item'); if (row) { event.preventDefault(); finish(items[Number(row.dataset.i)], event); } });
    list.addEventListener('pointermove', (event) => { const row = event.target.closest('.suggest-item'); if (row && Number(row.dataset.i) !== selected) { selected = Number(row.dataset.i); for (const el of list.children) el.classList.toggle('selected', Number(el.dataset.i) === selected); } });
    layer.addEventListener('pointerdown', (event) => { if (event.target === layer) finish(null); });
    open = { close: () => finish(null) };
    input.focus();
    input.select();
    refresh();
  });
}

export function close() { open?.close(); if (session && host) host.close('suggest'); }
export const isOpen = () => Boolean(open);

/** A small text prompt over the window (rename, new folder …). Resolves with the text or null. */
export async function promptText({ title, value = '', placeholder = '', selectStem = false, okLabel = t('common.ok'), glyph = 'edit', validate = null }) {
  close();
  if (host) {
    // The prompt popup; a value that does not pass `validate` comes back with the reason shown.
    let current = value;
    let problem = '';
    for (;;) {
      const result = await host.open('prompt', { title, value: current, label: problem || placeholder || title, icon: glyph, selectStem, error: Boolean(problem) });
      if (result?.value == null) return null;
      current = String(result.value).trim();
      problem = validate?.(current) ?? '';
      if (!problem) return current || null;
    }
  }
  return promptInPage({ title, value, placeholder, selectStem, okLabel, glyph, validate });
}

function promptInPage({ title, value, placeholder, selectStem, okLabel, glyph, validate }) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'suggest-layer';
    layer.innerHTML = `<form class="suggest-box prompt-box" role="dialog" aria-modal="true">
      <div class="prompt-title">${icon(glyph)}<span>${escapeHtml(title)}</span></div>
      <label class="suggest-input"><input type="text" spellcheck="false" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" /></label>
      <div class="prompt-error" hidden></div>
      <div class="prompt-buttons"><button type="button" class="button" data-cancel>${escapeHtml(t('common.cancel'))}</button><button type="submit" class="button primary">${icon('check')}<span>${escapeHtml(okLabel)}</span></button></div>
    </form>`;
    document.body.append(layer);
    const input = layer.querySelector('input');
    const error = layer.querySelector('.prompt-error');
    const done = (v) => { layer.remove(); open = null; resolve(v); };
    layer.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const v = input.value.trim();
      const problem = validate?.(v);
      if (problem) { error.hidden = false; error.textContent = problem; return; }
      done(v || null);
    });
    layer.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); done(null); } event.stopPropagation(); });
    layer.addEventListener('pointerdown', (event) => { if (event.target === layer) done(null); });
    open = { close: () => done(null) };
    input.focus();
    const dot = value.lastIndexOf('.');
    if (selectStem && dot > 0) input.setSelectionRange(0, dot); else input.select();
  });
}
