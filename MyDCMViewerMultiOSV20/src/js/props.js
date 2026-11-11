/* The right panel: information and properties of what is shown, in sections, changed in place.
 *
 *   PropsPanel.create({ body, rail, t, sections }) → { render(), refresh(), open(sectionId) }
 *
 *   section: { id, icon, title, visible?(), fields: [field…] }
 *   field:   { type, label, get?(), set?(v), visible?(), disabled?() } with type
 *     'text'    a read-only value
 *     'number'  a number field (spin.js adds − / + around it, the value centred); min, max, step, unit
 *     'select'  options() → [[value, label]…]
 *     'check'   a switch
 *     'color'   a colour well
 *     'buttons' items: [{ icon, title, run(), active?() }]
 *     'list'    items() → [text…] (e.g. the measurements)
 *
 * The rail (the folded panel) gets one item per section: its icon and its title written downwards; the owner
 * unfolds the panel and calls open(id) to bring that section into view. refresh() re-reads every value
 * (a field the user is typing in is left alone) and hides what does not apply to the current file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PropsPanel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => (window.Icons ? window.Icons.svg(name) : '');

  function create({ body, rail, t, sections, onRail }) {
    const bound = [];   // { field, el, update() }
    const collapsed = new Set();

    function control(f) {
      const id = `prop-${Math.random().toString(36).slice(2, 9)}`;
      let el;
      switch (f.type) {
        case 'number': {
          el = document.createElement('input');
          el.type = 'number'; el.id = id;
          if (f.min != null) el.min = f.min;
          if (f.max != null) el.max = f.max;
          el.step = f.step != null ? f.step : 1;
          el.addEventListener('change', () => { const v = parseFloat(el.value); if (Number.isFinite(v)) f.set(v); });
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); e.stopPropagation(); });
          const wrap = document.createElement('span');
          wrap.className = 'prop-numwrap';
          wrap.append(el);
          if (f.unit) { const u = document.createElement('span'); u.className = 'prop-unit'; u.textContent = f.unit; wrap.append(u); }
          return { el, node: wrap, update: () => { if (document.activeElement !== el) { const v = f.get(); el.value = v == null || !Number.isFinite(+v) ? '' : String(+(+v).toFixed(f.decimals != null ? f.decimals : 2)); } } };
        }
        case 'select': {
          el = document.createElement('select'); el.id = id;
          let sig = '';
          el.addEventListener('change', () => f.set(el.value));
          return {
            el, node: el,
            update: () => {
              const opts = f.options();
              const s = JSON.stringify(opts);
              if (s !== sig) { sig = s; el.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); }
              const v = f.get();
              if (document.activeElement !== el) el.value = v == null ? '' : String(v);
            },
          };
        }
        case 'check': {
          el = document.createElement('button');
          el.type = 'button'; el.className = 'switch prop-switch'; el.id = id;
          el.setAttribute('role', 'switch');
          el.addEventListener('click', () => f.set(!el.classList.contains('on')));
          return { el, node: el, update: () => { const on = !!f.get(); el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); } };
        }
        case 'color': {
          el = document.createElement('input'); el.type = 'color'; el.id = id;
          el.addEventListener('input', () => f.set(el.value));
          return { el, node: el, update: () => { if (document.activeElement !== el) el.value = f.get() || '#000000'; } };
        }
        case 'buttons': {
          el = document.createElement('span'); el.className = 'prop-buttons';
          const btns = f.items.map((it) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'icon-btn prop-btn'; b.title = it.title; b.innerHTML = icon(it.icon) || esc(it.text || '');
            b.addEventListener('click', () => it.run());
            el.append(b);
            return b;
          });
          return { el, node: el, update: () => f.items.forEach((it, i) => btns[i].classList.toggle('checked', !!(it.active && it.active()))) };
        }
        case 'list': {
          el = document.createElement('ol'); el.className = 'prop-list';
          let sig = '';
          return { el, node: el, update: () => { const items = f.items(); const s = items.join('\n'); if (s === sig) return; sig = s; el.innerHTML = items.length ? items.map((x) => `<li>${esc(x)}</li>`).join('') : `<li class="prop-empty">${esc(f.empty || '')}</li>`; } };
        }
        default: {
          el = document.createElement('span'); el.className = 'prop-text';
          return { el, node: el, update: () => { const v = f.get(); const s = v == null || v === '' ? '—' : String(v); if (el.textContent !== s) { el.textContent = s; el.title = s; } } };
        }
      }
    }

    function render() {
      body.innerHTML = '';
      bound.length = 0;
      for (const sec of sections) {
        const box = document.createElement('section');
        box.className = 'prop-section';
        box.dataset.sec = sec.id;
        box.classList.toggle('collapsed', collapsed.has(sec.id));
        const head = document.createElement('button');
        head.type = 'button'; head.className = 'prop-head';
        head.innerHTML = `<span class="mi">${icon(sec.icon)}</span><span class="prop-title">${esc(t(sec.title))}</span><span class="prop-chev">▾</span>`;
        head.addEventListener('click', () => { box.classList.toggle('collapsed'); if (box.classList.contains('collapsed')) collapsed.add(sec.id); else collapsed.delete(sec.id); });
        const rows = document.createElement('div');
        rows.className = 'prop-rows';
        for (const f of sec.fields) {
          const row = document.createElement('div');
          row.className = `prop-row prop-${f.type || 'text'}`;
          const c = control(f);
          if (f.label) {
            const lab = document.createElement('label');
            lab.className = 'prop-label'; lab.textContent = t(f.label);
            if (c.el && c.el.id) lab.htmlFor = c.el.id;
            row.append(lab);
          } else row.classList.add('wide');
          row.append(c.node);
          rows.append(row);
          bound.push({ f, row, c });
        }
        box.append(head, rows);
        box._sec = sec;
        body.append(box);
      }
      if (rail) {
        rail.querySelectorAll('[data-sec]').forEach((x) => x.remove());
        for (const sec of sections) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'rail-item'; b.dataset.sec = sec.id; b.title = t(sec.title);
          b.innerHTML = `<span class="mi">${icon(sec.icon)}</span><span class="i18n-text">${esc(t(sec.title))}</span>`;
          b.addEventListener('click', () => onRail && onRail(sec.id));
          rail.append(b);
        }
      }
      refresh();
    }

    let queued = false;
    function refresh() {
      for (const box of body.querySelectorAll('.prop-section')) {
        const show = !box._sec.visible || box._sec.visible();
        box.hidden = !show;
        if (rail) { const r = rail.querySelector(`[data-sec="${box._sec.id}"]`); if (r) r.hidden = !show; }
      }
      for (const b of bound) {
        const show = !b.f.visible || b.f.visible();
        b.row.hidden = !show;
        if (!show || b.row.closest('.prop-section').hidden) continue;
        try { b.c.update(); } catch (e) { /* a value that does not apply right now */ }
        const off = !!(b.f.disabled && b.f.disabled());
        if (b.c.el && 'disabled' in b.c.el) b.c.el.disabled = off;
      }
    }
    /** Batched: many events can ask for a refresh in one frame. */
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; refresh(); });
    }
    function open(id) {
      const box = body.querySelector(`.prop-section[data-sec="${id}"]`);
      if (!box) return;
      box.classList.remove('collapsed'); collapsed.delete(id);
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
      box.classList.add('flash');
      setTimeout(() => box.classList.remove('flash'), 900);
    }
    return { render, refresh: schedule, refreshNow: refresh, open };
  }
  return { create };
});
