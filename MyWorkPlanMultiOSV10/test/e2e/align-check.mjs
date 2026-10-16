// Runs inside a popup document; returns a list of alignment problems (empty = aligned).
//  - label | control rows: every control starts on one vertical line, and fields that
//    fill their row (text, select, dates) end on one line;
//  - each row: label and control share a vertical centre;
//  - buttons in one bar (footer, toolbars inside the popup): same height and top;
//  - inside every button: icon and text share a vertical centre;
//  - tabs: one row, same height.
export const ALIGN_CHECK = `(() => {
  const out = [];
  const visible = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const box = (e) => e.getBoundingClientRect();
  const mid = (r) => r.top + r.height / 2;
  const name = (e) => (e.title || e.textContent || e.className || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 28);
  for (const body of document.querySelectorAll('.popup-body')) {
    const rows = [...body.querySelectorAll('.row:not(.col-row):not(.recent-row)')].filter((r) => visible(r) && r.querySelector(':scope > .row-label') && r.querySelector(':scope > .row-control > *'));
    const starts = new Map();
    const ends = new Map();
    for (const row of rows) {
      const control = row.querySelector(':scope > .row-control');
      const first = [...control.children].find(visible);
      if (!first) continue;
      const left = Math.round(box(first).left);
      starts.set(left, [...(starts.get(left) ?? []), name(row)]);
      const fill = [...control.children].filter((c) => visible(c) && getComputedStyle(c).flexGrow !== '0');
      const last = [...control.children].filter(visible).at(-1);
      if (fill.includes(last)) { const right = Math.round(box(last).right); ends.set(right, [...(ends.get(right) ?? []), name(row)]); }
      const label = row.querySelector(':scope > .row-label > span') ?? row.querySelector(':scope > .row-label');
      const items = [...control.children].filter(visible).filter((c) => box(c).height < 60);
      for (const item of items) {
        const d = Math.abs(mid(box(label)) - mid(box(item)));
        if (d > 2.5) { out.push('row "' + name(row) + '": label and "' + name(item) + '" off centre by ' + d.toFixed(1) + 'px'); break; }
      }
    }
    if (starts.size > 1) out.push('controls start at ' + [...starts].map(([x, r]) => x + ' (' + r.slice(0, 2).join(', ') + ')').join(' | '));
    if (ends.size > 1) out.push('filled fields end at ' + [...ends].map(([x, r]) => x + ' (' + r.slice(0, 2).join(', ') + ')').join(' | '));
  }
  const bars = new Set([...document.querySelectorAll('button.button, .button-row button, .popup-foot button')].filter(visible).map((b) => b.parentElement));
  for (const bar of bars) {
    const buttons = [...bar.children].filter((b) => b.matches('button, a.button') && visible(b));
    if (buttons.length < 2) continue;
    const lines = new Map();
    for (const b of buttons) { const k = Math.round(box(b).top / 4); lines.set(k, [...(lines.get(k) ?? []), b]); }
    for (const group of lines.values()) {
      const h = new Set(group.map((b) => Math.round(box(b).height)));
      const m = new Set(group.map((b) => Math.round(mid(box(b)))));
      if (h.size > 1 || [...m].some((v) => Math.abs(v - [...m][0]) > 1)) out.push('buttons "' + group.map(name).join('", "') + '" differ: heights ' + [...h].join('/') + ', centres ' + [...m].join('/'));
    }
  }
  for (const b of [...document.querySelectorAll('button')].filter(visible)) {
    const svg = b.querySelector(':scope > svg, :scope > .icon');
    const text = [...b.childNodes].find((n) => (n.nodeType === 3 && n.textContent.trim()) || (n.nodeType === 1 && n.tagName === 'SPAN' && n.textContent.trim() && !n.querySelector('svg')));
    if (!svg || !text) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    const t = range.getBoundingClientRect();
    if (!t.height) continue;
    const d = Math.abs(mid(box(svg)) - mid(t));
    if (d > 2.5) out.push('button "' + name(b) + '": icon off the text centre by ' + d.toFixed(1) + 'px');
  }
  const tabs = [...document.querySelectorAll('.tabs .tab')].filter(visible);
  if (new Set(tabs.map((t) => Math.round(box(t).top))).size > 1) out.push('tabs wrap onto more than one row');
  return out;
})()`;
