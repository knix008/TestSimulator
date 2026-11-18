import { L, nameOf } from '../i18n.js';
import { icon, TYPE_ICON } from '../icons.js';
import { escapeHtml } from '../domain/markdown.js';
import { ago, byId, formatDuration, formatWhen } from '../domain/util.js';

export { L, nameOf, icon, escapeHtml as esc, ago, formatDuration, formatWhen, byId };

const AVATAR_COLORS = ['#3a6cf0', '#0f9f6e', '#e5484d', '#d97706', '#7c3aed', '#0ea5e9', '#db2777', '#475569'];

export function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#64748b';
}

export function hue(name) {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatar(user) {
  if (!user?.name) return `<span class="avatar empty" title="${escapeHtml(L('없음', 'None'))}">–</span>`;
  if (String(user.photo || '').startsWith('data:image/')) {
    return `<span class="avatar photo" title="${escapeHtml(user.name)}"><img src="${escapeHtml(user.photo)}" alt=""></span>`;
  }
  const letter = [...user.name][0] || '?';
  return `<span class="avatar" style="background:${hue(user.name)}" title="${escapeHtml(user.name)}">${escapeHtml(letter)}</span>`;
}

export function badge(text, color) {
  const ink = safeColor(color);
  return `<span class="badge" style="color:${ink};background:color-mix(in srgb, ${ink} 18%, transparent)">${escapeHtml(text || '')}</span>`;
}

export function typeBadge(project, typeId) {
  const type = byId(project?.issueTypes, typeId);
  return `<span class="badge type" style="color:${safeColor(type?.color)};background:color-mix(in srgb, ${safeColor(type?.color)} 16%, transparent)">${icon(TYPE_ICON[typeId] || 'box')}<span>${escapeHtml(nameOf(type) || typeId || '')}</span></span>`;
}

export function person(ws, id) {
  return byId(ws.users, id);
}

export function options(items, selected, placeholder = '') {
  const head = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : '';
  return head + items.map((item) => {
    const id = item.id ?? item;
    const label = item.id ? nameOf(item) || item.name || item.summary || item.id : String(item);
    return `<option value="${escapeHtml(id)}"${id === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function userOptions(ws, selected, placeholder) {
  const people = ws.users.filter((user) => user.active !== false);
  return options(people.map((user) => ({ id: user.id, name: user.name })), selected, placeholder ?? L('없음', 'None'));
}

export function button(action, label, extra = '', glyph = 'plus') {
  return `<button type="button" class="button" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span></button>`;
}

export function primary(action, label, extra = '', glyph = 'check') {
  return `<button type="button" class="button primary" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span></button>`;
}

/** The same glyph the left panel uses for each screen. */
export const NAV_GLYPH = {
  home: 'home', board: 'board', backlog: 'backlog', roadmap: 'roadmap', issues: 'issues', queues: 'list', portal: 'request',
  dashboard: 'dashboard', reports: 'chart', knowledge: 'book', documents: 'file', calendar: 'calendar', plans: 'roadmap',
  releases: 'release', components: 'component', filters: 'filter', health: 'alert', people: 'people', users: 'people', projects: 'folder', extensions: 'bolt',
  notifications: 'bell', settings: 'settings', 'project-settings': 'settings', help: 'help', teams: 'team', team: 'team', search: 'search', timeline: 'calendar',
};

export function pageHead(title, actions = '', view = '') {
  const glyph = NAV_GLYPH[view];
  const mark = glyph ? icon(glyph) : '';
  return `<div class="page-head"><h1>${mark}${title}</h1><div class="page-actions">${actions}</div></div>`;
}

export function empty(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

/** Open panel: icon, title, and a collapse button. Folded panel: the same icon and title beside an expand button. */
export function panelFrame(open, side, glyph, title, body = '') {
  const id = side === 'right' ? 'right' : 'left';
  const name = escapeHtml(title);
  if (!open) {
    const expand = L(id === 'left' ? '왼쪽 패널 펴기' : '오른쪽 패널 펴기', id === 'left' ? 'Expand the left panel' : 'Expand the right panel');
    return `<div class="panel-rail"><button type="button" class="rail-button expand" data-action="toggle-panel" data-id="${id}" title="${escapeHtml(expand)}" aria-label="${escapeHtml(expand)}">${icon(id === 'left' ? 'foldRight' : 'foldLeft')}</button><div class="rail-title" title="${name}">${icon(glyph)}</div></div>`;
  }
  const collapse = L(id === 'left' ? '왼쪽 패널 접기' : '오른쪽 패널 접기', id === 'left' ? 'Collapse the left panel' : 'Collapse the right panel');
  return `<div class="panel-header">${icon(glyph)}<span>${name}</span><button type="button" class="icon-button" data-action="toggle-panel" data-id="${id}" title="${escapeHtml(collapse)}" aria-label="${escapeHtml(collapse)}">${icon(id === 'left' ? 'foldLeft' : 'foldRight')}</button></div>${body}`;
}
