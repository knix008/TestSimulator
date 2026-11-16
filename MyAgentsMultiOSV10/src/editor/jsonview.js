// A read-only JSON tree (details/summary, so it folds without script). Long strings are cut with a hint.
import { escapeHtml } from '../ui/dom.js';

const MAX_STR = 600;

function scalar(v) {
  if (v === null || v === undefined) return '<span class="j-null">null</span>';
  if (typeof v === 'number') return `<span class="j-num">${v}</span>`;
  if (typeof v === 'boolean') return `<span class="j-bool">${v}</span>`;
  const s = String(v);
  const shown = s.length > MAX_STR ? `${s.slice(0, MAX_STR)}…` : s;
  return `<span class="j-str" title="${escapeHtml(s.length > MAX_STR ? `${s.length} chars` : '')}">"${escapeHtml(shown)}"</span>`;
}

function node(key, value, depth, max) {
  const k = key == null ? '' : `<span class="j-key">${escapeHtml(key)}</span>: `;
  if (value === null || typeof value !== 'object') return `<div class="j-row">${k}${scalar(value)}</div>`;
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  const open = depth < max ? 'open' : '';
  const head = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  if (!entries.length) return `<div class="j-row">${k}<span class="j-brace">${Array.isArray(value) ? '[]' : '{}'}</span></div>`;
  return `<details class="j-node" ${open}><summary>${k}<span class="j-brace">${head}</span></summary><div class="j-children">${entries.slice(0, 200).map(([ck, cv]) => node(ck, cv, depth + 1, max)).join('')}${entries.length > 200 ? `<div class="j-row muted">… ${entries.length - 200}</div>` : ''}</div></details>`;
}

export function jsonView(value, { max = 2 } = {}) {
  if (value === undefined) return '<div class="json-view empty">—</div>';
  return `<div class="json-view">${node(null, value, 0, max)}</div>`;
}
