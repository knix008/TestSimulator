// HTML of the detail panel: header (breadcrumb, key, type, summary, actions), status row, banners and the
// field column. Pure builders over the view object `v` (index.js); events are wired by data-act attributes.
import { icon } from '../../icons.js';
import { t } from '../../i18n.js';
import { renderIconRef, normalizeColor, readableOn } from '../../ui/iconref.js';
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
    ${resolution ? `<span class="dt-chip resolution" title="${esc(t('detail.field.resolution'))}">${icon('check')}<span>${esc(resolution.name)}</span></span>` : ''}
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
    rows.push(`<label class="dt-tf-row"><span>${icon('check')}${esc(t('detail.field.resolution'))}</span><button type="button" class="dt-fbtn" data-act="tf-resolution" data-picker-anchor="tf-resolution">${icon('check')}<span>${esc(res?.name ?? t('detail.choose'))}</span>${icon('chevronDown')}</button></label>`);
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

const fbtn = (v, field, inner, { title = '', disabled = false } = {}) => `<button type="button" class="dt-fbtn" data-act="pick" data-field="${esc(field)}" data-picker-anchor="${esc(field)}" aria-haspopup="listbox"${disabled || v.readOnly ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${inner}${disabled || v.readOnly ? '' : icon('chevronDown', 'icon dt-chev')}</button>`;

const none = (text = t('detail.noneValue')) => `<span class="dt-none">${esc(text)}</span>`;

/** A −/+ stepper (the shell's .stepper look); value '' shows an empty box. */
export function stepper(v, key, value, { min = 0, max = 9999, step = 1, unit = '', label = '', disabled = false } = {}) {
  const off = disabled || v.readOnly;
  const shown = value === '' || value == null ? '' : `${value}${unit}`;
  return `<span class="stepper dt-stepper${off ? ' disabled' : ''}" data-stepper="${esc(key)}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${esc(unit)}" title="${esc(label)}">
    <button type="button" class="stepper-button" data-step-dir="-1" aria-label="${esc(`${label} −${step}`)}" title="${esc(`${label} −${step}`)}"${off ? ' disabled' : ''}>${icon('minus')}</button>
    <input class="stepper-value" type="text" inputmode="decimal" value="${esc(shown)}" aria-label="${esc(label)}" placeholder="—"${off ? ' disabled' : ''} />
    <button type="button" class="stepper-button" data-step-dir="1" aria-label="${esc(`${label} +${step}`)}" title="${esc(`${label} +${step}`)}"${off ? ' disabled' : ''}>${icon('plus')}</button>
  </span>`;
}

const clearBtn = (v, field, show) => (show && !v.readOnly ? `<button type="button" class="icon-button dt-clear" data-act="clear" data-field="${esc(field)}" title="${esc(t('detail.clear'))}" aria-label="${esc(t('detail.clear'))}">${icon('close')}</button>` : '');

function chips(items) {
  return items.length ? `<span class="dt-chips">${items.map((x) => `<span class="dt-chip">${x.iconHtml ?? ''}<span>${esc(x.label)}</span></span>`).join('')}</span>` : none();
}

function row(field, ic, label, value, { extra = '', cls = '' } = {}) {
  return `<div class="dt-field ${cls}" data-field="${esc(field)}"><div class="dt-flabel">${ic.startsWith('<') ? ic : icon(ic)}<span>${esc(label)}</span></div><div class="dt-fvalue">${value}${extra}</div></div>`;
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
  if (cover.color) return `<span class="dt-cover-chip" style="background:${esc(normalizeColor(cover.color) ?? '#888')}"></span><span>${esc(cover.color)}</span>`;
  if (cover.attachmentId) {
    const a = v.attachments?.find((x) => x.id === cover.attachmentId);
    return `<img class="dt-cover-thumb" src="${esc(v.attachmentUrl(cover.attachmentId, true))}" alt="" /><span>${esc(a?.fileName ?? t('detail.cover.image'))}</span>`;
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
    case 'number': return stepper(v, key, value ?? '', { min: -1e9, max: 1e9, step: 1, label: field.name }) + clearBtn(v, key, !empty);
    case 'checkbox': return `<label class="dt-check"><input type="checkbox" data-act="custom-check" data-field="${esc(key)}"${value ? ' checked' : ''}${v.readOnly ? ' disabled' : ''} /><span>${esc(value ? t('detail.yes') : t('detail.no'))}</span></label>`;
    case 'date': return `<input type="date" class="dt-input dt-date" data-act="date" data-field="${esc(key)}" value="${esc(value ?? '')}"${v.readOnly ? ' disabled' : ''} />${clearBtn(v, key, !empty)}`;
    case 'select': {
      const o = optionOf(value);
      return fbtn(v, key, empty ? `${icon('list')}${none()}` : `${o?.icon ? renderIconRef(o.icon, { size: 16 }) : icon('tag')}<span>${esc(o?.value ?? value)}</span>`);
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
      return `<div class="dt-textfield${v.readOnly ? '' : ' editable'}" ${v.readOnly ? '' : `data-act="field-edit" data-field="${esc(key)}" tabindex="0"`}>${shown}</div>`;
    }
    default: return `<span class="dt-text">${esc(JSON.stringify(value ?? ''))}</span>`;
  }
}

const FIELD_ICONS = { text: 'textTool', textarea: 'notes', number: 'percent', date: 'calendar', select: 'list', multiselect: 'list', user: 'user', checkbox: 'check', url: 'hyperlink', labels: 'tag' };

export function fieldsHtml(v) {
  const issue = v.issue;
  const level = Number(v.typeOf(issue.typeId)?.level ?? 0);
  const users = v.users;
  const pr = v.cfg.priorities.find((p) => p.id === issue.priorityId);
  const comps = v.cfg.components.filter((c) => (issue.componentIds ?? []).includes(c.id));
  const vers = (ids) => v.cfg.versions.filter((x) => (ids ?? []).includes(x.id)).map((x) => ({ label: x.name, iconHtml: icon(x.released ? 'check' : 'tag') }));
  const rows = [];
  rows.push(row('assignee', 'user', t('detail.field.assignee'), fbtn(v, 'assignee', `${avatarHtml(users.get(issue.assigneeId), 18)}<span>${esc(issue.assigneeId ? userName(users, issue.assigneeId) : t('detail.unassigned'))}</span>`),
    { extra: !v.readOnly && issue.assigneeId !== v.me?.id ? `<button type="button" class="dt-link-button" data-act="assign-me">${icon('user')}<span>${esc(t('detail.assignToMe'))}</span></button>` : '' }));
  rows.push(row('reporter', 'user', t('detail.field.reporter'), fbtn(v, 'reporter', `${avatarHtml(users.get(issue.reporterId), 18)}<span>${esc(issue.reporterId ? userName(users, issue.reporterId) : t('detail.noneValue'))}</span>`)));
  rows.push(row('priority', 'flag', t('detail.field.priority'), fbtn(v, 'priority', pr ? `${renderIconRef(pr.icon, { size: 16 })}<span>${esc(pr.name)}</span>` : `${icon('flag')}${none()}`)));
  rows.push(row('labels', 'tag', t('detail.field.labels'), fbtn(v, 'labels', chips((issue.labels ?? []).map((l) => ({ label: l, iconHtml: icon('tag') }))))));
  rows.push(row('components', 'layers', t('detail.field.components'), fbtn(v, 'components', chips(comps.map((c) => ({ label: c.name, iconHtml: renderIconRef(c.icon || 'b:layers', { size: 14 }) }))))));
  rows.push(row('fixVersions', 'tag', t('detail.field.fixVersions'), fbtn(v, 'fixVersions', chips(vers(issue.fixVersionIds)))));
  rows.push(row('affectedVersions', 'bug', t('detail.field.affectedVersions'), fbtn(v, 'affectedVersions', chips(vers(issue.affectedVersionIds)))));
  if (level === 1) {
    rows.push(row('parent', 'link', t('detail.field.parent'), fbtn(v, 'parent', issue.parent ? `${icon('link')}<span>${esc(`${issue.parent.key} ${issue.parent.summary ?? ''}`)}</span>` : none())));
    rows.push(row('epic', renderIconRef('b:epic', { size: 15 }), t('detail.field.epic'), issue.epic ? `<span class="dt-text muted">${esc(`${issue.epic.key} ${issue.epic.summary ?? ''}`)}</span>` : none(t('detail.epicFromParent'))));
  } else if (level !== -1) {
    rows.push(row('epic', renderIconRef('b:epic', { size: 15 }), t('detail.field.epic'), fbtn(v, 'epic', issue.epic ? `${renderIconRef('b:epic', { size: 16 })}<span>${esc(`${issue.epic.key} ${issue.epic.summary ?? ''}`)}</span>` : none()) + clearBtn(v, 'epic', Boolean(issue.epic))));
  }
  rows.push(row('storyPoints', 'percent', t('detail.field.storyPoints'), stepper(v, 'storyPoints', issue.storyPoints ?? '', { min: 0, max: 1000, step: 1, label: t('detail.field.storyPoints') }) + clearBtn(v, 'storyPoints', issue.storyPoints != null)));
  rows.push(row('originalEstimate', 'hourglass', t('detail.field.originalEstimate'), stepper(v, 'originalEstimate', hoursOf(issue.originalEstimate), { min: 0, max: 10000, step: 0.5, unit: 'h', label: t('detail.field.originalEstimate') }) + clearBtn(v, 'originalEstimate', issue.originalEstimate != null)));
  rows.push(row('remainingEstimate', 'hourglass', t('detail.field.remainingEstimate'), stepper(v, 'remainingEstimate', hoursOf(issue.remainingEstimate), { min: 0, max: 10000, step: 0.5, unit: 'h', label: t('detail.field.remainingEstimate') }) + clearBtn(v, 'remainingEstimate', issue.remainingEstimate != null)));
  rows.push(row('timeSpent', 'clock', t('detail.field.timeSpent'), stepper(v, 'timeSpent', hoursOf(issue.timeSpent ?? 0), { unit: 'h', label: t('detail.field.timeSpent'), disabled: true }) + trackingHtml(issue), { cls: 'wrap' }));
  rows.push(row('startDate', 'calendar', t('detail.field.startDate'), `<input type="date" class="dt-input dt-date" data-act="date" data-field="startDate" value="${esc(issue.startDate ?? '')}"${v.readOnly ? ' disabled' : ''} aria-label="${esc(t('detail.field.startDate'))}" />${clearBtn(v, 'startDate', Boolean(issue.startDate))}`));
  const overdue = issue.dueDate && !issue.resolvedAt && issue.dueDate < new Date().toISOString().slice(0, 10);
  rows.push(row('dueDate', 'calendar', t('detail.field.dueDate'), `<input type="date" class="dt-input dt-date${overdue ? ' overdue' : ''}" data-act="date" data-field="dueDate" value="${esc(issue.dueDate ?? '')}"${v.readOnly ? ' disabled' : ''} aria-label="${esc(t('detail.field.dueDate'))}" />${clearBtn(v, 'dueDate', Boolean(issue.dueDate))}`));
  const color = normalizeColor(issue.color);
  rows.push(row('color', 'palette', t('detail.field.color'), fbtn(v, 'color', color ? `<span class="dt-swatch" style="background:${color};color:${readableOn(color)}"></span><span>${esc(color)}</span>` : `${icon('palette')}${none()}`) + clearBtn(v, 'color', Boolean(color))));
  rows.push(row('cover', 'picture', t('detail.field.cover'), fbtn(v, 'cover', coverHtml(v, issue.cover)) + clearBtn(v, 'cover', Boolean(issue.cover))));
  rows.push(row('icon', 'iconInsert', t('detail.field.icon'), `<button type="button" class="dt-fbtn" data-act="pick-icon"${v.readOnly ? ' disabled' : ''}>${issue.icon ? renderIconRef(issue.icon, { size: 18 }) : icon('iconInsert')}<span>${esc(issue.icon ? issue.icon : t('detail.noneValue'))}</span>${v.readOnly ? '' : icon('edit', 'icon dt-chev')}</button>${clearBtn(v, 'icon', Boolean(issue.icon))}`));
  for (const field of v.cfg.fields ?? []) rows.push(row(`custom:${field.id}`, FIELD_ICONS[field.type] ?? 'field', field.name, customFieldHtml(v, field), { cls: `custom type-${field.type}` }));
  const times = `<div class="dt-times">
    <span title="${esc(fmtDateTime(issue.createdAt))}">${icon('fileNew')}${esc(t('detail.created'))} <b>${esc(relTime(issue.createdAt))}</b></span>
    <span title="${esc(fmtDateTime(issue.updatedAt))}">${icon('refresh')}${esc(t('detail.updated'))} <b>${esc(relTime(issue.updatedAt))}</b></span>
    ${issue.resolvedAt ? `<span title="${esc(fmtDateTime(issue.resolvedAt))}">${icon('check')}${esc(t('detail.resolved'))} <b>${esc(relTime(issue.resolvedAt))}</b></span>` : ''}
  </div>`;
  return section(v, 'fields', 'docProps', t('detail.section.details'), `<div class="dt-fields">${rows.join('')}</div>${times}`);
}

/** A collapsible section. */
export function section(v, id, ic, title, body, { count = null, actions = '', cls = '' } = {}) {
  const closed = v.collapsed.has(id);
  return `<section class="dt-section ${cls}${closed ? ' collapsed' : ''}" data-section="${esc(id)}">
    <div class="dt-section-head"><button type="button" class="dt-section-toggle" data-act="toggle-section" data-section="${esc(id)}" aria-expanded="${!closed}">${icon(closed ? 'caretRight' : 'caretDown')}${icon(ic)}<span>${esc(title)}</span>${count != null ? `<i class="dt-count-badge">${esc(count)}</i>` : ''}</button><div class="dt-section-actions">${actions}</div></div>
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
