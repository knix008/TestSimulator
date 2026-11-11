// The views' sidebars (views/registry.js `sidebar`): the lower part of the LEFT panel shows the current view's
// own navigation and information. A sidebar draws from the view's state (the same instance) and drives the
// view; the view calls `link.refresh()` when something the sidebar shows changed.
//
//   const link = linkSidebar(() => current, { icon, title(view, ctx), render(view, ctx) → html, act(view, el, event, ctx) });
//   registerView(id, { …, sidebar: link.sidebar });   view.onSideChange = link.refresh;
//
// Every item is a button on one grid (icon · label · extra), the same height; ↑/↓/Home/End move between items.
import './sidebar.css';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A section head: icon, label and an optional action button html. */
export function sideHeadHtml(glyphHtml, label, action = '') {
  return `<div class="vs-head">${glyphHtml}<span class="vs-head-label" title="${esc(label)}">${esc(label)}</span>${action}</div>`;
}

/**
 * One item. `act` + `value` go to data attributes (the view's act() reads them); `active` marks the current
 * choice (aria-current), `pressed` a toggle (aria-pressed, a switch in the extra column); `mini` { act, value?, glyph,
 * tip, pressed } adds a small button at the row's right end (the item keeps room for it).
 */
export function sideItemHtml({ act, value = '', glyph = '', label, tip = label, extra = '', active = false, pressed = null, cls = '', attrs = '', disabled = false, mini = null }) {
  const state = pressed != null ? `aria-pressed="${Boolean(pressed)}"` : active ? 'aria-current="true"' : '';
  const sw = pressed != null ? `<i class="vs-switch${pressed ? ' on' : ''}" aria-hidden="true"></i>` : '';
  const item = `<button type="button" class="vs-item${active || pressed ? ' active' : ''}${cls ? ` ${cls}` : ''}" data-vs-act="${esc(act)}" data-vs-value="${esc(value)}" data-vs-key="${esc(`${act}:${value}`)}" title="${esc(tip)}" ${state} ${attrs} ${disabled ? 'disabled' : ''}><span class="vs-glyph">${glyph}</span><span class="vs-label">${esc(label)}</span><span class="vs-extra">${extra}${sw}</span></button>`;
  if (!mini) return item;
  // a small second button on the row (e.g. a star), outside the item button
  return `<div class="vs-row has-mini">${item}<button type="button" class="vs-mini${mini.pressed ? ' on' : ''}" data-vs-act="${esc(mini.act)}" data-vs-value="${esc(mini.value ?? value)}" data-vs-key="${esc(`${mini.act}:${mini.value ?? value}`)}" title="${esc(mini.tip)}" aria-label="${esc(mini.tip)}" aria-pressed="${Boolean(mini.pressed)}">${mini.glyph}</button></div>`;
}

/** A muted line in a section (nothing to show, loading). */
export const sideNoteHtml = (text, glyphHtml = '') => `<p class="vs-note">${glyphHtml}<span>${esc(text)}</span></p>`;

/** A count badge for the extra column. */
export const sideCountHtml = (n, cls = '') => `<i class="vs-count${cls ? ` ${cls}` : ''}">${esc(n)}</i>`;

export function linkSidebar(getView, spec) {
  let host = null;
  let ctx = null;
  let abort = null;
  let queued = false;

  const draw = () => {
    queued = false;
    if (!host) return;
    const view = getView();
    const doc = host.ownerDocument;
    const active = doc.activeElement;
    const focusKey = host.contains(active) ? active.closest('[data-vs-key]')?.dataset.vsKey ?? null : null;
    const scroll = host.scrollTop;
    let html = '';
    try { html = view ? spec.render(view, ctx) : ''; } catch (error) { console.error(error); html = ''; }
    host.innerHTML = `<div class="vs-root" data-vs="${esc(spec.id ?? '')}">${html}</div>`;
    host.scrollTop = scroll;
    if (focusKey) [...host.querySelectorAll('[data-vs-key]')].find((el) => el.dataset.vsKey === focusKey)?.focus({ preventScroll: true });
  };

  const onClick = (event) => {
    const el = event.target.closest('[data-vs-act]');
    if (!el || el.disabled || !host?.contains(el)) return;
    const view = getView();
    if (!view) return;
    event.preventDefault();
    try { spec.act(view, el, event, ctx); } catch (error) { console.error(error); }
  };

  const onKey = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...host.querySelectorAll('.vs-item:not([disabled])')];
    const at = items.indexOf(event.target.closest('.vs-item'));
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
    items[next]?.focus();
  };

  const refresh = () => {
    if (!host || queued) return;
    queued = true;
    queueMicrotask(() => { draw(); try { ctx?.app?.renderSideHeader?.(); } catch { /* shell */ } });
  };

  const sidebar = {
    icon: spec.icon,
    title(c) { const view = getView(); if (!view) return ''; try { return spec.title?.(view, c ?? ctx) ?? ''; } catch { return ''; } },
    mount(h, c) {
      host = h;
      ctx = c;
      abort = new AbortController();
      h.addEventListener('click', onClick, { signal: abort.signal });
      h.addEventListener('keydown', onKey, { signal: abort.signal });
      draw();
      // The view may mount after its sidebar (the shell draws the left panel first sometimes).
      if (!getView()) setTimeout(refresh, 0);
    },
    update(c) { ctx = c; draw(); },
    unmount() { abort?.abort(); abort = null; if (host) host.innerHTML = ''; host = null; },
  };
  return { sidebar, refresh, get mounted() { return Boolean(host); }, get host() { return host; } };
}
