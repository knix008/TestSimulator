// HTML of the detail panel: header (breadcrumb, key, type, summary, actions), status row, banners and the
// field column. Pure builders over the view object `v` (index.js); events are wired by data-act attributes.
import { icon } from '../../icons.js';
import { getLanguage, t } from '../../i18n.js';
import { renderIconRef, normalizeColor, readableOn, parseIconRef, iconRefLabel } from '../../ui/iconref.js';
import { avatarHtml, esc, fmtDate, fmtDateTime, fmtDuration, hoursOf, relTime, userName } from './util.js';
import { editorHtml } from './editor.js';
import { renderMarkdown } from './markdown.js';

export const COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#8d8d8d', '#ffd43b', '#74c0fc', '#b2f2bb', '#ffc9c9'];

const btn = (act, ic, label, { cls = 'icon-button', attrs = '', text = false, disabled = false } = {}) => `<button type="button" class="${cls}" data-act="${act}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}${disabled ? ' disabled' : ''}>${icon(ic)}${text ? `<span>${esc(label)}</span>` : ''}</button>`;

export function statusPill(v, statusId, { small = false } = {}) {
  const s = v.statusOf(statusId);
  if (!s) return '';
  return `<span class="dt-status cat-${esc(s.category)}${small ? ' small' : ''}"${s.color ? ` style="--status:${esc(normalizeColor(s.color) ?? '')}"` : ''}>${esc(s.name)}</span>`;
}

export function typeIcon(v, typeId, size = 16) {
  const type = v.typeOf(typeId);
  return renderIconRef(type?.icon || 'b:task', { size, title: type?.name ?? '' });
}

function presenceHtml(v) {
  const others = v.presence ?? [];
  if (!others.length) return '';
  const editing = others.find((p) => p.state?.editing);
  return `<div class="dt-presence" data-presence="${others.length}">${others.slice(0, 4).map((p) => avatarHtml({ displayName: p.name, avatar: p.avatar }, 20, p.state?.editing ? t('detail.presence.editingField', { name: p.name, field: v.fieldLabel(p.state.editing) }) : t('detail.presence.viewing', { name: p.name }))).join('')}
    ${editing ? `<span class="dt-presence-text">${icon('edit')}${esc(t('detail.presence.editingField', { name: editing.name, field: v.fieldLabel(editing.state.editing) }))}</span>` : `<span class="dt-presence-text">${icon('eye')}${esc(t('detail.presence.viewingCount', { n: others.length }))}</span>`}</div>`;
}

export function headerHtml(v) {
  const issue = v.issue;
  const project = v.cfg?.project;
  const crumbs = [];
  if (project) crumbs.push(`<span class="dt-crumb">${renderIconRef(project.icon || 'b:folder', { size: 14 })}<span>${esc(project.name)}</span></span>`);
  if (issue.epic) crumbs.push(`<button type="button" class="dt-crumb link" data-act="open" data-id="${esc(issue.epic.id)}" title="${esc(issue.epic.summary)}">${renderIconRef('b:epic', { size: 14 })}<span>${esc(issue.epic.key)}</span></button>`);
  if (issue.parent) crumbs.push(`<button type="button" class="dt-crumb link" data-act="open" data-id="${esc(issue.parent.id)}" title="${esc(issue.parent.summary)}">${renderIconRef('b:story', { size: 14 })}<span>${esc(issue.parent.key)}</span></button>`);
  const ro = v.readOnly;
  const summary = v.editing.has('summary')
    ? `<div class="dt-summary-edit"><textarea class="dt-summary-input" data-draft="summary" rows="2" maxlength="500" aria-label="${esc(t('detail.field.summary'))}">${esc(v.drafts.get('summary') ?? issue.summary)}</textarea>
        <div class="dt-inline-actions">${btn('summary-save', 'check', t('detail.save'), { cls: 'button small primary', text: true })}${btn('summary-cancel', 'close', t('detail.cancel'), { cls: 'button small', text: true })}</div></div>`
    : `<h2 class="dt-summary${ro ? '' : ' editable'}" ${ro ? '' : `data-act="summary-edit" tabindex="0" title="${esc(t('detail.editSummaryTip'))}"`}>${issue.icon ? `<span class="dt-issue-icon">${renderIconRef(issue.icon, { size: 20 })}</span>` : ''}<span class="dt-summary-text">${esc(issue.summary)}</span></h2>`;
  return `<header class="dt-header">
    <div class="dt-topline">
      <nav class="dt-crumbs" aria-label="${esc(t('detail.breadcrumb'))}">${crumbs.join(`<span class="dt-crumb-sep">›</span>`)}</nav>
      <div class="dt-head-actions">
        ${btn('watch', 'eye', issue.watching ? t('detail.unwatch') : t('detail.watch'), { cls: `icon-button dt-count${issue.watching ? ' active' : ''}`, attrs: `data-count="${issue.watcherCount ?? 0}"` })}
        ${btn('menu', 'menu', t('detail.actions'), { attrs: 'data-picker-anchor="menu" aria-haspopup="listbox"' })}
        ${btn('wide', v.isWide() ? 'fullscreen' : 'fullscreen', v.isWide() ? t('detail.narrow') : t('detail.wide'), { cls: `icon-button${v.isWide() ? ' active' : ''}` })}
        ${btn('close', 'close', t('detail.close'))}
      </div>
    </div>
    <div class="dt-keyline">
      <button type="button" class="dt-type" data-act="pick" data-field="type" data-picker-anchor="type" title="${esc(t('detail.changeType'))}: ${esc(v.typeOf(issue.typeId)?.name ?? '')}"${ro ? ' disabled' : ''}>${typeIcon(v, issue.typeId, 18)}</button>
      <button type="button" class="dt-key" data-act="copy-link" title="${esc(t('detail.copyLink'))}">${esc(issue.key)}${icon('copy')}</button>
      ${issue.flagged ? `<span class="dt-chip flagged" title="${esc(t('detail.flagged'))}">${icon('flag')}<span>${esc(t('detail.flagged'))}</span></span>` : ''}
      ${issue.voteCount ? `<span class="dt-chip" title="${esc(t('detail.votes'))}">${icon('star')}<span>${issue.voteCount}</span></span>` : ''}
      ${presenceHtml(v)}
    </div>
    ${summary}
  </header>`;
}

export function statusRowHtml(v) {
  const issue = v.issue;
  const s = v.statusOf(issue.statusId);
  const resolution = issue.resolutionId ? v.cfg?.resolutions?.find((r) => r.id === issue.resolutionId) : null;
  return `<div class="dt-statusrow">
    <button type="button" class="dt-status-button cat-${esc(s?.category ?? 'todo')}" data-act="status" data-picker-anchor="status" aria-haspopup="listbox"${v.readOnly ? ' disabled' : ''} title="${esc(t('detail.changeStatus'))}">
      <span>${esc(s?.name ?? '?')}</span>${v.readOnly ? '' : icon('chevronDown')}</button>
    ${resolution ? `<span class="dt-chip resolution" title="${esc(`${t('detail.field.resolution')}: ${resolution.name}`)}"${normalizeColor(resolution.color) ? ` style="--resolution:${normalizeColor(resolution.color)}"` : ''}>${resolutionIcon(resolution)}<span>${esc(resolution.name)}</span></span>` : ''}
    ${v.readOnly ? `<span class="dt-chip readonly" title="${esc(t('detail.readOnlyTip'))}">${icon('lock')}<span>${esc(t('detail.readOnly'))}</span></span>` : ''}
    ${v.saving ? `<span class="dt-saving">${icon('refresh')}<span>${esc(t('detail.saving'))}</span></span>` : ''}
  </div>
  ${v.statusForm ? transitionFormHtml(v) : ''}`;
}

function transitionFormHtml(v) {
  const f = v.statusForm;
  const target = v.statusOf(f.transition.toStatusId);
  const rows = [];
  if (f.needsResolution) {
    const res = v.cfg.resolutions.find((r) => r.id === f.resolutionId);
    rows.push(`<label class="dt-tf-row"><span>${icon('check')}${esc(t('detail.field.resolution'))}</span><button type="button" class="dt-fbtn" data-act="tf-resolution" data-picker-anchor="tf-resolution">${resolutionIcon(res, 16)}<span>${esc(res?.name ?? t('detail.choose'))}</span>${icon('chevronDown')}</button></label>`);
  }
  for (const field of f.fields) {
    const value = f.values[field] ?? '';
    if (field === 'assignee') {
      rows.push(`<label class="dt-tf-row"><span>${icon('user')}${esc(v.fieldLabel(field))}</span><button type="button" class="dt-fbtn" data-act="tf-assignee" data-picker-anchor="tf-assignee">${avatarHtml(v.users.get(value), 18)}<span>${esc(userName(v.users, value, t('detail.unassigned')))}</span>${icon('chevronDown')}</button></label>`);
    } else if (field === 'priority') {
      const p = v.cfg.priorities.find((x) => x.id === value);
      rows.push(`<label class="dt-tf-row"><span>${icon('flag')}${esc(v.fieldLabel(field))}</span><button type="button" class="dt-fbtn" data-act="tf-priority" data-picker-anchor="tf-priority">${p ? renderIconRef(p.icon, { size: 16 }) : icon('flag')}<span>${esc(p?.name ?? t('detail.choose'))}</span>${icon('chevronDown')}</button></label>`);
    } else {
      const type = { dueDate: 'date', storyPoints: 'number' }[field] ?? 'text';
      rows.push(`<label class="dt-tf-row"><span>${icon('edit')}${esc(v.fieldLabel(field))}</span><input type="${type}" class="dt-input" data-draft="tf:${esc(field)}" value="${esc(v.drafts.get(`tf:${field}`) ?? value)}" ${type === 'number' ? 'min="0" step="0.5"' : ''} placeholder="${esc(field === 'originalEstimate' ? '1h 30m' : '')}" /></label>`);
    }
  }
  if (f.needsComment || f.allowComment) rows.push(`<label class="dt-tf-row stack"><span>${icon('comment')}${esc(t(f.needsComment ? 'detail.tf.commentRequired' : 'detail.tf.comment'))}</span><textarea class="dt-input" data-draft="tf:comment" rows="3">${esc(v.drafts.get('tf:comment') ?? '')}</textarea></label>`);
  return `<form class="dt-transition-form" data-form="transition" onsubmit="return false">
    <div class="dt-tf-title">${icon('arrowEnd')}<span>${esc(f.transition.name)}</span><span class="dt-tf-arrow">→</span>${statusPill(v, target?.id, { small: true })}</div>
    ${rows.join('')}
    ${f.error ? `<div class="dt-error" role="alert">${icon('error')}<span>${esc(f.error)}</span></div>` : ''}
    <div class="dt-inline-actions">${btn('tf-apply', 'check', t('detail.tf.apply'), { cls: 'button small primary', text: true })}${btn('tf-cancel', 'close', t('detail.cancel'), { cls: 'button small', text: true })}</div>
  </form>`;
}

export function bannersHtml(v) {
  const out = [];
  if (v.conflict) {
    const c = v.conflict;
    out.push(`<div class="dt-banner conflict" role="alert" data-banner="conflict">
      <div class="dt-banner-head">${icon('warning')}<strong>${esc(t('detail.conflict.title'))}</strong></div>
      <p>${esc(c.by.length ? t('detail.conflict.by', { names: c.by.join(', ') }) : t('detail.conflict.someone'))}</p>
      <ul class="dt-conflict-list">${c.changes.map((ch) => `<li class="${ch.mine ? 'mine' : ''}"><b>${esc(v.fieldLabel(ch.field))}</b>${ch.theirs != null ? `<span class="dt-conflict-val">${esc(ch.theirs)}</span>` : ''}${ch.mine ? `<em>${esc(t('detail.conflict.alsoMine'))}</em>` : ''}</li>`).join('')}</ul>
      <div class="dt-inline-actions">${btn('conflict-mine', 'save', t('detail.conflict.keepMine'), { cls: 'button small primary', text: true })}${btn('conflict-theirs', 'refresh', t('detail.conflict.takeTheirs'), { cls: 'button small', text: true })}</div>
    </div>`);
  }
  if (v.remoteNote) out.push(`<div class="dt-banner info" data-banner="remote">${icon('refresh')}<span>${esc(v.remoteNote)}</span>${btn('dismiss-note', 'close', t('detail.dismiss'))}</div>`);
  if (v.notice) out.push(`<div class="dt-banner ${esc(v.notice.kind)}" role="alert" data-banner="notice">${icon(v.notice.kind === 'error' ? 'error' : 'info')}<span>${esc(v.notice.text)}</span>${btn('dismiss-notice', 'close', t('detail.dismiss'))}</div>`);
  return out.join('');
}

// ───────────────────────── fields

// Every value is one control box (.dt-ctl): the whole value column wide, one row high, the same left edge.
// Inside: the picker button (.dt-fbtn, grows), then small in-box buttons (clear ×, assign to me).

const clearBtn = (v, field, show) => (show && !v.readOnly ? `<button type="button" class="icon-button dt-clear" data-act="clear" data-field="${esc(field)}" title="${esc(t('detail.clear'))}" aria-label="${esc(t('detail.clear'))}">${icon('close')}</button>` : '');

const fbtn = (v, field, inner, { title = '', disabled = false, clear = false, extra = '' } = {}) => {
  const off = disabled || v.readOnly;
  return `<span class="dt-ctl dt-ctl-pick${off ? ' off' : ''}"><button type="button" class="dt-fbtn" data-act="pick" data-field="${esc(field)}" data-picker-anchor="${esc(field)}" aria-haspopup="listbox"${off ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${inner}${off ? '' : icon('chevronDown', 'icon dt-chev')}</button>${extra}${clearBtn(v, field, clear)}</span>`;
};

const none = (text = t('detail.noneValue')) => `<span class="dt-none">${esc(text)}</span>`;

/** A −/+ stepper (the shell's .stepper look) as a full-width control box; value '' shows "—". */
export function stepper(v, key, value, { min = 0, max = 9999, step = 1, unit = '', label = '', disabled = false, clear = false } = {}) {
  const off = disabled || v.readOnly;
  const shown = value === '' || value == null ? '' : `${value}${unit}`;
  return `<span class="stepper dt-stepper dt-ctl${off ? ' disabled' : ''}" data-stepper="${esc(key)}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${esc(unit)}" title="${esc(label)}">
    <button type="button" class="stepper-button" data-step-dir="-1" aria-label="${esc(`${label} −${step}`)}" title="${esc(`${label} −${step}`)}"${off ? ' disabled' : ''}>${icon('minus')}</button>
    <input class="stepper-value" type="text" inputmode="decimal" value="${esc(shown)}" aria-label="${esc(label)}" placeholder="—"${off ? ' disabled' : ''} />${clearBtn(v, key, clear && !off)}
    <button type="button" class="stepper-button" data-step-dir="1" aria-label="${esc(`${label} +${step}`)}" title="${esc(`${label} +${step}`)}"${off ? ' disabled' : ''}>${icon('plus')}</button>
  </span>`;
}

/** A date as a control box: the formatted date (or "None"), the browser's date picker on click (the input stays for typing / tests). */
function dateCtl(v, field, value, { label = '', overdue = false } = {}) {
  const off = v.readOnly;
  return `<span class="dt-ctl dt-datebox${overdue ? ' overdue' : ''}${off ? ' off' : ''}">
    <button type="button" class="dt-fbtn dt-date-open" data-act="date-open" data-field="${esc(field)}" title="${esc(value ? `${label}: ${value}` : t('detail.pickDate'))}"${off ? ' disabled' : ''}>${icon('calendar')}${value ? `<span class="dt-val">${esc(fmtDate(value))}</span>` : none()}</button>
    <input type="date" class="dt-input dt-date${overdue ? ' overdue' : ''}" data-act="date" data-field="${esc(field)}" value="${esc(value ?? '')}" tabindex="-1" aria-label="${esc(label)}"${off ? ' disabled' : ''} />${clearBtn(v, field, Boolean(value))}
  </span>`;
}

/** A read-only value in the same box (created / updated …). */
const staticCtl = (inner, title = '') => `<span class="dt-ctl dt-ctl-static"${title ? ` title="${esc(title)}"` : ''}>${inner}</span>`;

function chips(items) {
  return items.length ? `<span class="dt-chips" title="${esc(items.map((x) => x.label).join(', '))}">${items.map((x) => `<span class="dt-chip">${x.iconHtml ?? ''}<span>${esc(x.label)}</span></span>`).join('')}</span>` : none();
}

function row(field, ic, label, value, { extra = '', cls = '' } = {}) {
  return `<div class="dt-field ${cls}" data-field="${esc(field)}"><div class="dt-flabel" title="${esc(label)}">${ic.startsWith('<') ? ic : icon(ic)}<span>${esc(label)}</span></div><div class="dt-fvalue">${value}${extra}</div></div>`;
}

/** A readable colour name ("purple", "light blue") of a #rrggbb, by hue / lightness. */
export function colorName(hex) {
  const c = normalizeColor(hex);
  if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return c ?? '';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let base;
  if (s < 0.15 || d < 0.08) base = l > 0.9 ? 'white' : l < 0.12 ? 'black' : 'gray';
  else if (h < 15 || h >= 345) base = 'red';
  else if (h < 40) base = l < 0.4 ? 'brown' : 'orange';
  else if (h < 65) base = 'yellow';
  else if (h < 160) base = 'green';
  else if (h < 190) base = 'teal';
  else if (h < 225) base = 'blue';
  else if (h < 255) base = 'indigo';
  else if (h < 295) base = 'purple';
  else base = 'pink';
  const name = t(`detail.colorName.${base}`);
  if (['white', 'black', 'gray', 'brown'].includes(base)) return name;
  return l > 0.72 ? t('detail.colorLight', { c: name }) : l < 0.3 ? t('detail.colorDark', { c: name }) : name;
}

/** Icon + readable name of an IconRef (never the raw ref text). */
function iconRefNameHtml(ref) {
  const p = parseIconRef(ref);
  const name = iconRefLabel(ref, getLanguage()) || t('detail.field.icon');
  const color = normalizeColor(p.color);
  return `${renderIconRef(ref, { size: 18, title: name })}<span class="dt-val">${esc(name)}${color ? `<small class="dt-sub">${esc(colorName(color))}</small>` : ''}</span>`;
}

function trackingHtml(issue) {
  const spent = Number(issue.timeSpent ?? 0);
  const remaining = issue.remainingEstimate != null ? Number(issue.remainingEstimate) : Math.max(0, Number(issue.originalEstimate ?? 0) - spent);
  const total = Math.max(spent + remaining, Number(issue.originalEstimate ?? 0), 1);
  const over = issue.originalEstimate != null && spent + remaining > Number(issue.originalEstimate);
  return `<div class="dt-tracking" data-tracking>
    <div class="dt-track-bar${over ? ' over' : ''}" role="img" aria-label="${esc(t('detail.tracking.aria', { spent: fmtDuration(spent), remaining: fmtDuration(remaining) }))}"><span class="spent" style="width:${(spent / total) * 100}%"></span><span class="remaining" style="width:${(remaining / total) * 100}%"></span></div>
    <div class="dt-track-legend"><span>${icon('clock')}${esc(t('detail.tracking.logged', { v: fmtDuration(spent) || '0m' }))}</span><span>${icon('hourglass')}${esc(t('detail.tracking.remaining', { v: fmtDuration(remaining) || '0m' }))}</span></div>
  </div>`;
}

function coverHtml(v, cover) {
  if (!cover) return none();
  if (cover.color) return `<span class="dt-cover-chip" style="background:${esc(normalizeColor(cover.color) ?? '#888')}"></span><span class="dt-val">${esc(colorName(cover.color) || cover.color)}</span>`;
  if (cover.attachmentId) {
    const a = v.attachments?.find((x) => x.id === cover.attachmentId);
    return `<img class="dt-cover-thumb" src="${esc(v.attachmentUrl(cover.attachmentId, true))}" alt="" /><span class="dt-val">${esc(a?.fileName ?? t('detail.cover.image'))}</span>`;
  }
  return none();
}

function customFieldHtml(v, field) {
  const value = v.issue.custom?.[field.id];
  const key = `custom:${field.id}`;
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  const options = Array.isArray(field.options) ? field.options : [];
  const optionOf = (val) => options.find((o) => o.value === val || o.id === val);
  switch (field.type) {
    case 'number': return stepper(v, key, value ?? '', { min: -1e9, max: 1e9, step: 1, label: field.name, clear: !empty });
    case 'checkbox': return `<label class="dt-ctl dt-check"><input type="checkbox" data-act="custom-check" data-field="${esc(key)}"${value ? ' checked' : ''}${v.readOnly ? ' disabled' : ''} /><span>${esc(value ? t('detail.yes') : t('detail.no'))}</span></label>`;
    case 'date': return dateCtl(v, key, value ?? '', { label: field.name });
    case 'select': {
      const o = optionOf(value);
      return fbtn(v, key, empty ? `${icon('list')}${none()}` : `${o?.icon ? renderIconRef(o.icon, { size: 16 }) : icon('tag')}<span class="dt-val">${esc(o?.value ?? value)}</span>`, { clear: !empty });
    }
    case 'multiselect': case 'labels':
      return fbtn(v, key, chips((value ?? []).map((x) => { const o = optionOf(x); return { label: o?.value ?? x, iconHtml: o?.icon ? renderIconRef(o.icon, { size: 14 }) : icon('tag') }; })));
    case 'user': return fbtn(v, key, `${avatarHtml(v.users.get(value), 18)}<span>${esc(empty ? t('detail.unassigned') : userName(v.users, value))}</span>`);
    case 'url': case 'text': case 'textarea': {
      if (v.editing.has(key)) {
        const draft = v.drafts.get(key) ?? value ?? '';
        const input = field.type === 'textarea'
          ? `<textarea class="dt-input" data-draft="${esc(key)}" rows="3">${esc(draft)}</textarea>`
          : `<input type="${field.type === 'url' ? 'url' : 'text'}" class="dt-input" data-draft="${esc(key)}" value="${esc(draft)}" />`;
        return `<div class="dt-field-edit">${input}<div class="dt-inline-actions">${btn('field-save', 'check', t('detail.save'), { cls: 'button small primary', text: true, attrs: `data-field="${esc(key)}"` })}${btn('field-cancel', 'close', t('detail.cancel'), { cls: 'button small', text: true, attrs: `data-field="${esc(key)}"` })}</div></div>`;
      }
      const shown = empty ? none() : field.type === 'url' && /^https?:\/\//i.test(value) ? `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>` : `<span class="dt-text">${esc(value)}</span>`;
      return `<div class="dt-ctl dt-textfield${v.readOnly ? '' : ' editable'}" ${v.readOnly ? '' : `data-act="field-edit" data-field="${esc(key)}" tabindex="0"`}>${shown}</div>`;
    }
    default: return `<span class="dt-text">${esc(JSON.stringify(value ?? ''))}</span>`;
  }
}

/** Does a custom field apply to issues of this type? (no `issueTypeIds` list = every type) */
export const fieldApplies = (field, typeId) => !Array.isArray(field.issueTypeIds) || !field.issueTypeIds.length || field.issueTypeIds.includes(typeId);

/** A resolution's icon (its IconRef, tinted chip colour) — a check when it has none. */
export const resolutionIcon = (r, size = 14) => (r?.icon ? renderIconRef(r.icon, { size, title: r.name }) : icon('check'));

const FIELD_ICONS = { text: 'textTool', textarea: 'notes', number: 'percent', date: 'calendar', select: 'list', multiselect: 'list', user: 'user', checkbox: 'check', url: 'hyperlink', labels: 'tag' };

/** The field groups (people, planning, time, dates, look, custom): [id, icon]. */
export const FIELD_GROUPS = [['people', 'user'], ['planning', 'flag'], ['time', 'clock'], ['dates', 'calendar'], ['look', 'palette'], ['custom', 'field']];
/** Fields always shown, even empty (like Jira's pinned fields). */
const PINNED = new Set(['assignee', 'reporter', 'priority']);

/**
 * Every field of the issue as { group, field, html, empty }: the rows of the "Details" section. Empty fields are
 * hidden unless "show empty fields" is on, the field was touched in this panel (v.keepShown) or is being edited.
 */
export function fieldItems(v) {
  const issue = v.issue;
  const level = Number(v.typeOf(issue.typeId)?.level ?? 0);
  const users = v.users;
  const pr = v.cfg.priorities.find((p) => p.id === issue.priorityId);
  const comps = v.cfg.components.filter((c) => (issue.componentIds ?? []).includes(c.id));
  const vers = (ids) => v.cfg.versions.filter((x) => (ids ?? []).includes(x.id)).map((x) => ({ label: x.name, iconHtml: icon(x.released ? 'check' : 'tag') }));
  const items = [];
  const add = (group, field, ic, label, value, { empty = false, extra = '', cls = '' } = {}) => items.push({ group, field, empty, html: row(field, ic, label, value, { extra, cls }) });
  // people
  const assignMe = !v.readOnly && issue.assigneeId !== v.me?.id ? `<button type="button" class="icon-button dt-in-btn" data-act="assign-me" title="${esc(t('detail.assignToMe'))}" aria-label="${esc(t('detail.assignToMe'))}">${icon('user')}</button>` : '';
  add('people', 'assignee', 'user', t('detail.field.assignee'), fbtn(v, 'assignee', `${avatarHtml(users.get(issue.assigneeId), 18)}${issue.assigneeId ? `<span class="dt-val">${esc(userName(users, issue.assigneeId))}</span>` : none(t('detail.unassigned'))}`, { extra: assignMe }), { empty: !issue.assigneeId });
  add('people', 'reporter', 'user', t('detail.field.reporter'), fbtn(v, 'reporter', `${avatarHtml(users.get(issue.reporterId), 18)}${issue.reporterId ? `<span class="dt-val">${esc(userName(users, issue.reporterId))}</span>` : none()}`), { empty: !issue.reporterId });
  const watchers = Number(issue.watcherCount ?? 0);
  add('people', 'watchers', 'eye', t('detail.field.watchers'), `<span class="dt-ctl dt-ctl-pick"><button type="button" class="dt-cbtn dt-watch-ctl" data-act="watch" title="${esc(issue.watching ? t('detail.unwatch') : t('detail.watch'))}">${icon('eye')}${watchers ? `<span class="dt-val">${esc(t('detail.watchersN', { n: watchers }))}${issue.watching ? `<small class="dt-sub">${esc(t('detail.watchingMe'))}</small>` : ''}</span>` : none()}</button></span>`, { empty: !watchers });
  // planning
  add('planning', 'priority', 'flag', t('detail.field.priority'), fbtn(v, 'priority', pr ? `${renderIconRef(pr.icon, { size: 16 })}<span class="dt-val">${esc(pr.name)}</span>` : `${icon('flag')}${none()}`), { empty: !pr });
  add('planning', 'labels', 'tag', t('detail.field.labels'), fbtn(v, 'labels', chips((issue.labels ?? []).map((l) => ({ label: l, iconHtml: icon('tag') })))), { empty: !(issue.labels ?? []).length });
  add('planning', 'components', 'layers', t('detail.field.components'), fbtn(v, 'components', chips(comps.map((c) => ({ label: c.name, iconHtml: renderIconRef(c.icon || 'b:layers', { size: 14 }) })))), { empty: !comps.length });
  add('planning', 'fixVersions', 'tag', t('detail.field.fixVersions'), fbtn(v, 'fixVersions', chips(vers(issue.fixVersionIds))), { empty: !(issue.fixVersionIds ?? []).length });
  add('planning', 'affectedVersions', 'bug', t('detail.field.affectedVersions'), fbtn(v, 'affectedVersions', chips(vers(issue.affectedVersionIds))), { empty: !(issue.affectedVersionIds ?? []).length });
  if (level === 1) {
    add('planning', 'parent', 'link', t('detail.field.parent'), fbtn(v, 'parent', issue.parent ? `${icon('link')}<span class="dt-val">${esc(`${issue.parent.key} ${issue.parent.summary ?? ''}`)}</span>` : none()), { empty: !issue.parent });
    add('planning', 'epic', renderIconRef('b:epic', { size: 15 }), t('detail.field.epic'), staticCtl(issue.epic ? `${renderIconRef('b:epic', { size: 16 })}<span class="dt-val">${esc(`${issue.epic.key} ${issue.epic.summary ?? ''}`)}</span>` : none(t('detail.epicFromParent'))), { empty: !issue.epic });
  } else if (level !== -1) {
    add('planning', 'epic', renderIconRef('b:epic', { size: 15 }), t('detail.field.epic'), fbtn(v, 'epic', issue.epic ? `${renderIconRef('b:epic', { size: 16 })}<span class="dt-val">${esc(`${issue.epic.key} ${issue.epic.summary ?? ''}`)}</span>` : none(), { clear: Boolean(issue.epic) }), { empty: !issue.epic });
  }
  // estimates and time
  add('time', 'storyPoints', 'percent', t('detail.field.storyPoints'), stepper(v, 'storyPoints', issue.storyPoints ?? '', { min: 0, max: 1000, step: 1, label: t('detail.field.storyPoints'), clear: issue.storyPoints != null }), { empty: issue.storyPoints == null });
  add('time', 'originalEstimate', 'hourglass', t('detail.field.originalEstimate'), stepper(v, 'originalEstimate', hoursOf(issue.originalEstimate), { min: 0, max: 10000, step: 0.5, unit: 'h', label: t('detail.field.originalEstimate'), clear: issue.originalEstimate != null }), { empty: issue.originalEstimate == null });
  add('time', 'remainingEstimate', 'hourglass', t('detail.field.remainingEstimate'), stepper(v, 'remainingEstimate', hoursOf(issue.remainingEstimate), { min: 0, max: 10000, step: 0.5, unit: 'h', label: t('detail.field.remainingEstimate'), clear: issue.remainingEstimate != null }), { empty: issue.remainingEstimate == null });
  const tracked = Number(issue.timeSpent ?? 0) > 0 || issue.originalEstimate != null || issue.remainingEstimate != null;
  const logWork = v.readOnly ? '' : `<button type="button" class="dt-link-button dt-logwork" data-act="log-work">${icon('clock')}<span>${esc(t('detail.logWork'))}</span></button>`;
  add('time', 'timeSpent', 'clock', t('detail.field.timeSpent'), stepper(v, 'timeSpent', hoursOf(issue.timeSpent ?? 0), { unit: 'h', label: t('detail.field.timeSpent'), disabled: true }), { extra: `${trackingHtml(issue)}${logWork}`, cls: 'wrap', empty: !tracked });
  // dates
  add('dates', 'startDate', 'calendar', t('detail.field.startDate'), dateCtl(v, 'startDate', issue.startDate ?? '', { label: t('detail.field.startDate') }), { empty: !issue.startDate });
  const overdue = Boolean(issue.dueDate && !issue.resolvedAt && issue.dueDate < new Date().toISOString().slice(0, 10));
  add('dates', 'dueDate', 'calendar', t('detail.field.dueDate'), dateCtl(v, 'dueDate', issue.dueDate ?? '', { label: t('detail.field.dueDate'), overdue }), { empty: !issue.dueDate });
  // The date (short); "3 hours ago" beside it only while that says more than the date (it turns into the date after a week).
  const when = (ms, ic) => { const date = fmtDate(ms); const rel = relTime(ms); return staticCtl(`${icon(ic)}<span class="dt-val">${esc(date)}</span>${rel && rel !== date && !rel.includes(date) ? `<small class="dt-sub">${esc(rel)}</small>` : ''}`, fmtDateTime(ms)); };
  add('dates', 'created', 'fileNew', t('detail.created'), when(issue.createdAt, 'fileNew'), { cls: 'static' });
  add('dates', 'updated', 'refresh', t('detail.updated'), when(issue.updatedAt, 'refresh'), { cls: 'static' });
  if (issue.resolvedAt) add('dates', 'resolved', 'check', t('detail.resolved'), when(issue.resolvedAt, 'check'), { cls: 'static' });
  // look
  const color = normalizeColor(issue.color);
  add('look', 'color', 'palette', t('detail.field.color'), fbtn(v, 'color', color ? `<span class="dt-swatch" style="background:${color};color:${readableOn(color)}"></span><span class="dt-val">${esc(colorName(color))}<small class="dt-sub">${esc(color.toUpperCase())}</small></span>` : `${icon('palette')}${none()}`, { clear: Boolean(color) }), { empty: !color });
  add('look', 'cover', 'picture', t('detail.field.cover'), fbtn(v, 'cover', coverHtml(v, issue.cover), { clear: Boolean(issue.cover) }), { empty: !issue.cover });
  const off = v.readOnly;
  add('look', 'icon', 'iconInsert', t('detail.field.icon'), `<span class="dt-ctl dt-ctl-pick${off ? ' off' : ''}"><button type="button" class="dt-fbtn" data-act="pick-icon"${off ? ' disabled' : ''} title="${esc(issue.icon ? iconRefLabel(issue.icon, getLanguage()) : t('detail.field.icon'))}">${issue.icon ? iconRefNameHtml(issue.icon) : `${icon('iconInsert')}${none()}`}${off ? '' : icon('edit', 'icon dt-chev')}</button>${clearBtn(v, 'icon', Boolean(issue.icon))}</span>`, { empty: !issue.icon });
  // custom fields: those limited to other issue types are hidden (their values stay stored, §3 custom_fields.issue_type_ids)
  for (const field of (v.cfg.fields ?? []).filter((f) => fieldApplies(f, issue.typeId))) {
    const value = issue.custom?.[field.id];
    const empty = value == null || value === '' || value === false || (Array.isArray(value) && !value.length);
    add('custom', `custom:${field.id}`, FIELD_ICONS[field.type] ?? 'field', field.name, customFieldHtml(v, field), { cls: `custom type-${field.type}`, empty });
  }
  return items;
}

/** Is this field row shown? */
export const fieldShown = (v, item) => !item.empty || PINNED.has(item.field) || v.showEmpty || v.keepShown?.has(item.field) || v.editing.has(item.field);

export function fieldsHtml(v) {
  const items = fieldItems(v);
  const hidden = items.filter((it) => !fieldShown(v, it)).length;
  const emptyCount = items.filter((it) => it.empty && !PINNED.has(it.field)).length;
  const groups = FIELD_GROUPS.map(([id, ic]) => {
    const all = items.filter((it) => it.group === id);
    const shown = all.filter((it) => fieldShown(v, it));
    if (!shown.length) return '';
    const closed = v.collapsed.has(`group:${id}`);
    const filled = all.filter((it) => !it.empty).length;
    return `<div class="dt-group${closed ? ' collapsed' : ''}" data-group="${id}">
      <button type="button" class="dt-group-head" data-act="toggle-group" data-group="${id}" aria-expanded="${!closed}" title="${esc(t(`detail.group.${id}`))}">${icon(ic)}<span>${esc(t(`detail.group.${id}`))}</span><i class="dt-count-badge" title="${esc(t('detail.group.filled', { n: filled, m: all.length }))}">${filled}/${all.length}</i>${icon(closed ? 'chevronRight' : 'chevronDown', 'icon dt-caret')}</button>
      ${closed ? '' : `<div class="dt-fields">${shown.map((it) => it.html).join('')}</div>`}
    </div>`;
  }).join('');
  const toggle = emptyCount ? `<button type="button" class="dt-link-button dt-empty-toggle" data-act="toggle-empty" aria-pressed="${Boolean(v.showEmpty)}">${icon(v.showEmpty ? 'eye' : 'plus')}<span>${esc(v.showEmpty ? t('detail.empty.hide') : t('detail.empty.show', { n: hidden || emptyCount }))}</span></button>` : '';
  const filled = items.filter((it) => !it.empty && !it.html.includes('dt-field static')).length;
  return section(v, 'fields', 'docProps', t('detail.section.details'), `<div class="dt-groups">${groups}</div>${toggle}`, { count: filled });
}

/** The sticky bar of section chips at the top: jump to a section (with its count). */
export function sectionBarHtml(v) {
  const issue = v.issue;
  const level = Number(v.typeOf(issue.typeId)?.level ?? 0);
  const list = issue.checklist ?? [];
  const chips = [
    ['fields', 'docProps', t('detail.section.details'), fieldItems(v).filter((it) => !it.empty && !it.html.includes('dt-field static')).length],
    ['desc', 'notes', t('detail.section.description'), (issue.description ?? '').trim() ? '✓' : ''],
    ['checklist', 'check', t('detail.section.checklist'), list.length ? `${list.filter((i) => i.done).length}/${list.length}` : 0],
    ...(level === 1 ? [] : [['subtasks', 'list', t('detail.section.subtasks'), (issue.subtasks ?? []).length]]),
    ['links', 'link', t('detail.section.links'), (issue.links ?? []).length],
    ['attachments', 'picture', t('detail.section.attachments'), (v.attachments ?? []).length],
    ['activity', 'comment', t('detail.section.activity'), (v.comments ?? []).length],
  ];
  return `<nav class="dt-secbar" aria-label="${esc(t('detail.sections'))}">${chips.map(([id, ic, label, n]) => `<button type="button" class="dt-sb-chip${v.activeSection === id ? ' active' : ''}" data-act="jump" data-jump="${id}" title="${esc(t('detail.jumpTo', { name: label }))}">${icon(ic)}<span class="dt-sb-label">${esc(label)}</span>${n ? `<i>${esc(n)}</i>` : ''}</button>`).join('')}</nav>`;
}

/** A collapsible section. */
export function section(v, id, ic, title, body, { count = null, actions = '', cls = '' } = {}) {
  const closed = v.collapsed.has(id);
  return `<section class="dt-section ${cls}${closed ? ' collapsed' : ''}" data-section="${esc(id)}">
    <div class="dt-section-head"><button type="button" class="dt-section-toggle" data-act="toggle-section" data-section="${esc(id)}" aria-expanded="${!closed}">${icon(ic)}<span>${esc(title)}</span>${count != null ? `<i class="dt-count-badge">${esc(count)}</i>` : ''}${icon(closed ? 'chevronRight' : 'chevronDown', 'icon dt-caret')}</button><div class="dt-section-actions">${actions}</div></div>
    ${closed ? '' : `<div class="dt-section-body">${body}</div>`}
  </section>`;
}

export function descriptionHtml(v) {
  const text = v.issue.description ?? '';
  const body = v.editing.has('desc')
    ? editorHtml(v, 'desc', { placeholder: t('detail.desc.placeholder'), rows: 8 })
    : `<div class="dt-md dt-description${v.readOnly ? '' : ' editable'}" ${v.readOnly ? '' : `data-act="desc-edit" tabindex="0" title="${esc(t('detail.desc.editTip'))}"`}>${text.trim() ? renderMarkdown(text, v.mdOptions()) : `<p class="dt-none">${esc(v.readOnly ? t('detail.desc.empty') : t('detail.desc.add'))}</p>`}</div>`;
  return section(v, 'desc', 'notes', t('detail.section.description'), body, {
    actions: v.readOnly || v.editing.has('desc') ? '' : btn('desc-edit', 'edit', t('detail.desc.edit')),
  });
}

export { fmtDate };
