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

export function button(action, label, extra = '') {
  return `<button type="button" class="button" data-action="${action}" ${extra}>${label}</button>`;
}

export function primary(action, label, extra = '') {
  return `<button type="button" class="button primary" data-action="${action}" ${extra}>${label}</button>`;
}

export function pageHead(title, actions = '') {
  return `<div class="page-head"><h1>${title}</h1><div class="page-actions">${actions}</div></div>`;
}

export function empty(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}
