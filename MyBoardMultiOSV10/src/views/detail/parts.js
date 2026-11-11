// HTML of the issue parts: checklist, subtasks, links, attachments, and the activity tabs (comments,
// history, work log, all).
import { icon } from '../../icons.js';
import { t } from '../../i18n.js';
import { renderIconRef, normalizeColor } from '../../ui/iconref.js';
import { avatarHtml, esc, fmtDate, fmtDateTime, fmtDuration, formatBytes, isImage, relTime, userName } from './util.js';
import { section, statusPill, typeIcon } from './render.js';
import { editorHtml } from './editor.js';
import { renderMarkdown } from './markdown.js';

const ib = (act, ic, label, attrs = '', cls = 'icon-button') => `<button type="button" class="${cls}" data-act="${act}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${icon(ic)}</button>`;
const tb = (act, ic, label, attrs = '', cls = 'button small') => `<button type="button" class="${cls}" data-act="${act}" ${attrs}>${icon(ic)}<span>${esc(label)}</span></button>`;

function progress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="dt-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><span class="dt-progress-text">${pct}%</span>`;
}

// ───────────────────────── checklist

export function checklistHtml(v) {
  const items = v.issue.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const ro = v.readOnly;
  const rows = items.map((item) => {
    const editing = v.editing.has(`cl:${item.id}`);
    return `<li class="dt-cl-item${item.done ? ' done' : ''}" data-cl="${esc(item.id)}">
      ${ro ? '<i></i>' : `<span class="dt-grip" data-drag="checklist" title="${esc(t('detail.cl.drag'))}" aria-label="${esc(t('detail.cl.drag'))}" tabindex="0">${icon('grip')}</span>`}
      <input type="checkbox" data-act="cl-toggle" data-id="${esc(item.id)}"${item.done ? ' checked' : ''}${ro ? ' disabled' : ''} aria-label="${esc(item.text)}" />
      ${editing
    ? `<input type="text" class="dt-input dt-cl-input" data-draft="cl:${esc(item.id)}" value="${esc(v.drafts.get(`cl:${item.id}`) ?? item.text)}" maxlength="500" />`
    : `<span class="dt-cl-text" ${ro ? '' : `data-act="cl-edit" data-id="${esc(item.id)}" tabindex="0"`}>${esc(item.text)}</span>`}
      ${ro ? '' : ib('cl-delete', 'trash', t('detail.cl.delete'), `data-id="${esc(item.id)}"`, 'icon-button dt-row-action')}
    </li>`;
  }).join('');
  const add = ro ? '' : `<div class="dt-add-row"><span class="dt-add-icon">${icon('plus')}</span><input type="text" class="dt-input" data-draft="cl:new" data-enter="cl-add" value="${esc(v.drafts.get('cl:new') ?? '')}" placeholder="${esc(t('detail.cl.add'))}" maxlength="500" />${tb('cl-add', 'plus', t('detail.add'))}</div>`;
  const body = `${items.length ? `<div class="dt-progress-row">${progress(done, items.length)}</div>` : ''}<ul class="dt-checklist" data-list="checklist">${rows}</ul>${add}`;
  return section(v, 'checklist', 'check', t('detail.section.checklist'), body, { count: items.length ? `${done}/${items.length}` : null });
}

// ───────────────────────── subtasks

export function subtasksHtml(v) {
  const level = Number(v.typeOf(v.issue.typeId)?.level ?? 0);
  if (level === 1) return '';
  const subs = v.issue.subtasks ?? [];
  const done = subs.filter((s) => v.statusOf(s.statusId)?.category === 'done').length;
  const rows = subs.map((s) => `<li class="dt-issue-row" data-sub="${esc(s.id)}">
      ${typeIcon(v, s.typeId, 15)}
      <button type="button" class="dt-issue-link" data-act="open" data-id="${esc(s.id)}"><b>${esc(s.key)}</b><span>${esc(s.summary)}</span></button>
      ${statusPill(v, s.statusId, { small: true })}
      ${avatarHtml(v.users.get(s.assigneeId), 18)}
    </li>`).join('');
  const subtaskType = v.cfg.types.find((x) => Number(x.level) === 1);
  const add = v.readOnly || !subtaskType ? '' : `<div class="dt-add-row"><span class="dt-add-icon">${renderIconRef(subtaskType.icon || 'b:subtask', { size: 15 })}</span><input type="text" class="dt-input" data-draft="sub:new" data-enter="sub-add" value="${esc(v.drafts.get('sub:new') ?? '')}" placeholder="${esc(t('detail.sub.add'))}" maxlength="500" />${tb('sub-add', 'plus', t('detail.create'))}</div>`;
  const body = `${subs.length ? `<div class="dt-progress-row">${progress(done, subs.length)}</div>` : ''}<ul class="dt-issue-list">${rows}</ul>${add}`;
  return section(v, 'subtasks', 'list', t('detail.section.subtasks'), body, { count: subs.length ? `${done}/${subs.length}` : null });
}

// ───────────────────────── links

export const LINK_OPTIONS = [
  ['blocks', 'outward'], ['blocks', 'inward'], ['relates', 'outward'], ['duplicates', 'outward'], ['duplicates', 'inward'],
  ['clones', 'outward'], ['clones', 'inward'], ['causes', 'outward'], ['causes', 'inward'],
];
export const linkLabel = (kind, direction) => t(`detail.link.${kind}.${direction === 'inward' && kind !== 'relates' ? 'in' : 'out'}`);

export function linksHtml(v) {
  const links = v.issue.links ?? [];
  const groups = new Map();
  for (const l of links) {
    const label = linkLabel(l.kind, l.direction);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(l);
  }
  const ro = v.readOnly;
  const list = [...groups].map(([label, items]) => `<div class="dt-link-group"><h4>${esc(label)}</h4><ul class="dt-issue-list">${items.map((l) => `<li class="dt-issue-row" data-link="${esc(l.id)}">
      ${typeIcon(v, l.issue.typeId, 15)}
      <button type="button" class="dt-issue-link" data-act="open" data-id="${esc(l.issue.id)}"><b>${esc(l.issue.key)}</b><span>${esc(l.issue.summary)}</span></button>
      ${statusPill(v, l.issue.statusId, { small: true })}
      ${ro ? '' : ib('link-remove', 'unlink', t('detail.link.remove'), `data-id="${esc(l.id)}"`, 'icon-button dt-row-action')}
    </li>`).join('')}</ul></div>`).join('');
  let form = '';
  if (v.linkForm && !ro) {
    const f = v.linkForm;
    form = `<div class="dt-link-form" data-form="link">
      <button type="button" class="dt-fbtn" data-act="link-kind" data-picker-anchor="link-kind">${icon('link')}<span>${esc(linkLabel(f.kind, f.direction))}</span>${icon('chevronDown', 'icon dt-chev')}</button>
      <button type="button" class="dt-fbtn" data-act="link-target" data-picker-anchor="link-target">${icon('search')}<span>${esc(f.target ? `${f.target.key} ${f.target.summary ?? ''}` : t('detail.link.pick'))}</span>${icon('chevronDown', 'icon dt-chev')}</button>
      <input type="text" class="dt-input dt-link-key" data-draft="link:key" data-enter="link-save" value="${esc(v.drafts.get('link:key') ?? '')}" placeholder="${esc(t('detail.link.keyPlaceholder'))}" aria-label="${esc(t('detail.link.key'))}" />
      <div class="dt-inline-actions">${tb('link-save', 'link', t('detail.link.add'), '', 'button small primary')}${tb('link-cancel', 'close', t('detail.cancel'))}</div>
    </div>`;
  }
  const body = `${list || (form ? '' : `<p class="dt-none">${esc(t('detail.link.none'))}</p>`)}${form}`;
  return section(v, 'links', 'link', t('detail.section.links'), body, { count: links.length || null, actions: ro || v.linkForm ? '' : ib('link-new', 'plus', t('detail.link.add')) });
}

// ───────────────────────── attachments

export function attachmentsHtml(v) {
  const list = v.attachments ?? [];
  const ro = v.readOnly;
  const tiles = list.map((a) => {
    const img = isImage(a.mime);
    return `<li class="dt-att" data-att="${esc(a.id)}" title="${esc(a.fileName)}">
      <button type="button" class="dt-att-thumb" data-act="att-preview" data-id="${esc(a.id)}" aria-label="${esc(t('detail.att.preview'))}: ${esc(a.fileName)}">${img ? `<img src="${esc(v.attachmentUrl(a.id, true))}" alt="${esc(a.fileName)}" loading="lazy" draggable="false" />` : `${icon('file', 'icon big')}<span class="dt-att-ext">${esc((a.fileName.split('.').pop() ?? '').slice(0, 5).toUpperCase())}</span>`}</button>
      <div class="dt-att-meta"><span class="dt-att-name">${esc(a.fileName)}</span><small>${esc(formatBytes(a.size))} · ${esc(relTime(a.createdAt))}</small></div>
      <div class="dt-att-actions">
        <a class="icon-button" href="${esc(v.attachmentUrl(a.id, false))}" download="${esc(a.fileName)}" data-act="att-download" data-id="${esc(a.id)}" title="${esc(t('detail.att.download'))}" aria-label="${esc(t('detail.att.download'))}">${icon('exportFile')}</a>
        ${img && !ro ? ib('att-cover', 'picture', t('detail.att.cover'), `data-id="${esc(a.id)}"`) : ''}
        ${ro ? '' : ib('att-delete', 'trash', t('detail.att.delete'), `data-id="${esc(a.id)}"`)}
      </div>
    </li>`;
  }).join('');
  const drop = ro ? '' : `<div class="dt-dropzone" data-drop="attachments">${icon('importFile')}<span>${esc(t('detail.att.drop'))}</span>${tb('att-upload', 'paste', t('detail.att.upload'))}</div>`;
  const body = `${v.uploading ? `<div class="dt-uploading">${icon('refresh')}<span>${esc(t('detail.att.uploading', { n: v.uploading }))}</span></div>` : ''}${tiles ? `<ul class="dt-atts">${tiles}</ul>` : ''}${drop}`;
  return section(v, 'attachments', 'picture', t('detail.section.attachments'), body, { count: list.length || null, actions: ro ? '' : ib('att-upload', 'plus', t('detail.att.upload')) });
}

export function previewHtml(v) {
  const a = v.attachments?.find((x) => x.id === v.preview);
  if (!a) return '';
  const img = isImage(a.mime);
  return `<div class="dt-lightbox" data-act="preview-close" role="dialog" aria-label="${esc(a.fileName)}">
    <div class="dt-lightbox-body" data-stop>
      <div class="dt-lightbox-head">${icon(img ? 'picture' : 'file')}<span>${esc(a.fileName)}</span><small>${esc(formatBytes(a.size))}</small>
        <a class="icon-button" href="${esc(v.attachmentUrl(a.id, false))}" download="${esc(a.fileName)}" title="${esc(t('detail.att.download'))}">${icon('exportFile')}</a>
        ${ib('preview-close', 'close', t('detail.close'))}</div>
      ${img ? `<img class="dt-lightbox-img" src="${esc(v.attachmentUrl(a.id, true))}" alt="${esc(a.fileName)}" />` : `<p class="dt-none">${esc(t('detail.att.noPreview'))}</p>`}
    </div>
  </div>`;
}

// ───────────────────────── activity

const TABS = [['comments', 'comment'], ['history', 'recent'], ['worklog', 'clock'], ['all', 'list']];

export function activityHtml(v) {
  const tabs = `<div class="dt-tabs" role="tablist">${TABS.map(([id, ic]) => `<button type="button" class="dt-tab${v.tab === id ? ' active' : ''}" role="tab" aria-selected="${v.tab === id}" data-act="tab" data-tab="${id}">${icon(ic)}<span>${esc(t(`detail.tab.${id}`))}</span>${id === 'comments' && v.comments?.length ? `<i class="dt-count-badge">${v.comments.length}</i>` : ''}</button>`).join('')}
    <button type="button" class="icon-button dt-order" data-act="order" title="${esc(t(v.order === 'newest' ? 'detail.order.newest' : 'detail.order.oldest'))}" aria-label="${esc(t(v.order === 'newest' ? 'detail.order.newest' : 'detail.order.oldest'))}">${icon(v.order === 'newest' ? 'chevronDown' : 'chevronUp')}</button></div>`;
  let body = '';
  if (v.tab === 'comments') body = commentComposer(v) + entries(v, (v.comments ?? []).map((c) => ({ at: c.createdAt, html: commentHtml(v, c) })));
  else if (v.tab === 'history') body = entries(v, historyEntries(v));
  else if (v.tab === 'worklog') body = worklogForm(v) + entries(v, (v.worklogs ?? []).map((w) => ({ at: w.startedAt ?? w.createdAt, html: worklogHtml(v, w) })));
  else {
    body = entries(v, [
      ...(v.comments ?? []).map((c) => ({ at: c.createdAt, html: commentHtml(v, c) })),
      ...historyEntries(v),
      ...(v.worklogs ?? []).map((w) => ({ at: w.createdAt ?? w.startedAt, html: worklogHtml(v, w) })),
    ]);
  }
  const loading = v.activityLoading ? `<div class="dt-loading-line">${icon('refresh')}<span>${esc(t('detail.loadingParts'))}</span></div>` : '';
  return section(v, 'activity', 'comment', t('detail.section.activity'), `${tabs}<div class="dt-activity" data-activity="${v.tab}">${loading}${body}</div>`);
}

function entries(v, list) {
  const sorted = [...list].sort((a, b) => (v.order === 'newest' ? b.at - a.at : a.at - b.at));
  return sorted.length ? `<ol class="dt-entries">${sorted.map((e) => e.html).join('')}</ol>` : `<p class="dt-none dt-empty-activity">${esc(t('detail.activity.none'))}</p>`;
}

function who(v, userId, at, extra = '') {
  const u = v.users.get(userId);
  return `<div class="dt-entry-head">${avatarHtml(u, 22)}<b>${esc(u ? userName(v.users, userId) : t('detail.system'))}</b>${extra}<time datetime="${esc(new Date(Number(at)).toISOString())}" title="${esc(fmtDateTime(at))}">${esc(relTime(at))}</time></div>`;
}

function commentComposer(v) {
  if (v.readOnly) return '';
  if (!v.editing.has('comment:new')) return `<button type="button" class="dt-composer-placeholder" data-act="comment-new">${avatarHtml(v.me, 22)}<span>${esc(t('detail.comment.placeholder'))}</span><kbd>M</kbd></button>`;
  return `<div class="dt-composer">${editorHtml(v, 'comment:new', { save: t('detail.comment.add'), placeholder: t('detail.comment.placeholderLong'), rows: 4 })}</div>`;
}

function commentHtml(v, c) {
  const mine = c.authorId && c.authorId === v.me?.id;
  const can = !v.readOnly && (mine || v.me?.role === 'admin');
  const edited = c.updatedAt && c.createdAt && c.updatedAt - c.createdAt > 1000;
  const key = `comment:${c.id}`;
  return `<li class="dt-entry comment" data-comment="${esc(c.id)}">
    ${who(v, c.authorId, c.createdAt, edited ? `<small class="muted" title="${esc(fmtDateTime(c.updatedAt))}">${esc(t('detail.comment.edited'))}</small>` : '')}
    ${v.editing.has(key) ? editorHtml(v, key, { rows: 4 }) : `<div class="dt-md dt-comment-body">${renderMarkdown(c.body, v.mdOptions())}</div>
    ${can ? `<div class="dt-entry-actions">${tb('comment-edit', 'edit', t('detail.edit'), `data-id="${esc(c.id)}"`, 'dt-link-button')}${tb('comment-delete', 'trash', t('detail.delete'), `data-id="${esc(c.id)}"`, 'dt-link-button danger')}</div>` : ''}`}
  </li>`;
}

function worklogForm(v) {
  if (v.readOnly) return '';
  const mode = v.drafts.get('wl:mode') ?? 'auto';
  return `<form class="dt-worklog-form" data-form="worklog" onsubmit="return false">
    <div class="dt-wl-grid">
      <label><span>${icon('clock')}${esc(t('detail.wl.spent'))}</span><input type="text" class="dt-input" data-draft="wl:time" data-enter="wl-add" value="${esc(v.drafts.get('wl:time') ?? '')}" placeholder="1h 30m" /></label>
      <label><span>${icon('calendar')}${esc(t('detail.wl.date'))}</span><input type="date" class="dt-input" data-draft="wl:date" value="${esc(v.drafts.get('wl:date') ?? '')}" /></label>
    </div>
    <div class="dt-wl-remaining" role="radiogroup" aria-label="${esc(t('detail.wl.remaining'))}"><span>${icon('hourglass')}${esc(t('detail.wl.remaining'))}</span>
      <span class="seg-toggle dt-seg">${['auto', 'set'].map((m) => `<button type="button" class="${mode === m ? 'active' : ''}" data-act="wl-mode" data-mode="${m}" role="radio" aria-checked="${mode === m}">${icon(m === 'auto' ? 'sparkles' : 'edit')}<span>${esc(t(`detail.wl.${m}`))}</span></button>`).join('')}</span>
      ${mode === 'set' ? `<input type="text" class="dt-input dt-wl-rem" data-draft="wl:remaining" value="${esc(v.drafts.get('wl:remaining') ?? '')}" placeholder="2h" aria-label="${esc(t('detail.wl.remainingNew'))}" />` : ''}
    </div>
    <input type="text" class="dt-input" data-draft="wl:comment" data-enter="wl-add" value="${esc(v.drafts.get('wl:comment') ?? '')}" placeholder="${esc(t('detail.wl.comment'))}" />
    ${v.wlError ? `<div class="dt-error" role="alert">${icon('error')}<span>${esc(v.wlError)}</span></div>` : ''}
    <div class="dt-inline-actions">${tb('wl-add', 'clock', t('detail.wl.log'), '', 'button small primary')}</div>
  </form>`;
}

function worklogHtml(v, w) {
  const can = !v.readOnly && (w.authorId === v.me?.id || v.me?.role === 'admin');
  const key = `wl:${w.id}`;
  if (v.editing.has(key)) {
    return `<li class="dt-entry worklog editing" data-worklog="${esc(w.id)}">${who(v, w.authorId, w.startedAt)}
      <div class="dt-wl-grid"><label><span>${icon('clock')}${esc(t('detail.wl.spent'))}</span><input type="text" class="dt-input" data-draft="${key}:time" value="${esc(v.drafts.get(`${key}:time`) ?? fmtDuration(w.seconds))}" /></label>
      <label><span>${icon('comment')}${esc(t('detail.wl.comment'))}</span><input type="text" class="dt-input" data-draft="${key}:comment" value="${esc(v.drafts.get(`${key}:comment`) ?? w.comment ?? '')}" /></label></div>
      <div class="dt-inline-actions">${tb('wl-save', 'check', t('detail.save'), `data-id="${esc(w.id)}"`, 'button small primary')}${tb('wl-cancel', 'close', t('detail.cancel'), `data-id="${esc(w.id)}"`)}</div></li>`;
  }
  return `<li class="dt-entry worklog" data-worklog="${esc(w.id)}">
    ${who(v, w.authorId, w.startedAt, `<span class="dt-wl-amount">${icon('clock')}${esc(t('detail.wl.logged', { v: fmtDuration(w.seconds) }))}</span>`)}
    ${w.comment ? `<p class="dt-wl-comment">${esc(w.comment)}</p>` : ''}
    <small class="muted">${esc(fmtDate(w.startedAt))}</small>
    ${can ? `<div class="dt-entry-actions">${tb('wl-edit', 'edit', t('detail.edit'), `data-id="${esc(w.id)}"`, 'dt-link-button')}${tb('wl-delete', 'trash', t('detail.delete'), `data-id="${esc(w.id)}"`, 'dt-link-button danger')}</div>` : ''}
  </li>`;
}

// ───────────────────────── history

function historyValue(v, h, side) {
  const value = h[`${side}Value`];
  const label = h[`${side}Label`];
  if (value == null && label == null) return `<span class="dt-none">${esc(t('detail.noneValue'))}</span>`;
  switch (h.field) {
    case 'description': return `<span class="muted">${esc(t('detail.history.text'))}</span>`;
    case 'originalEstimate': case 'remainingEstimate': case 'timeSpent': return esc(fmtDuration(value));
    case 'dueDate': case 'startDate': return esc(fmtDate(value));
    case 'color': { const c = normalizeColor(value); return c ? `<span class="dt-swatch small" style="background:${c}"></span>${esc(c)}` : esc(value); }
    case 'icon': return `${renderIconRef(value, { size: 15 })}<span>${esc(value)}</span>`;
    case 'flagged': case 'archived': return esc(value === '1' || value === 'true' ? t('detail.yes') : t('detail.no'));
    case 'cover': { try { const c = JSON.parse(value); return esc(c?.color ?? (c?.attachmentId ? t('detail.cover.image') : value)); } catch { return esc(value); } }
    case 'created': return statusPill(v, value, { small: true }) || esc(label ?? value);
    default:
      if (h.field.startsWith('custom:')) { try { const x = JSON.parse(value); return esc(Array.isArray(x) ? x.join(', ') : typeof x === 'boolean' ? (x ? t('detail.yes') : t('detail.no')) : x); } catch { return esc(value); } }
      return esc(label ?? value);
  }
}

export function historyEntries(v) {
  return (v.history ?? []).map((h) => {
    const at = Number(h.at);
    let text;
    if (h.field === 'created') text = `<span>${esc(t('detail.history.created'))}</span>`;
    else if (h.field === 'attachment') text = h.toLabel ? `<span>${esc(t('detail.history.attached', { name: h.toLabel }))}</span>` : `<span>${esc(t('detail.history.detached', { name: h.fromLabel ?? '' }))}</span>`;
    else if (h.field === 'link') text = `<span>${esc(t('detail.history.linked', { what: h.toLabel ?? h.fromLabel ?? '' }))}</span>`;
    else {
      text = `<span>${esc(t('detail.history.changed', { field: v.fieldLabel(h.field) }))}</span>
        <div class="dt-change"><span class="from">${historyValue(v, h, 'from')}</span><span class="arrow">→</span><span class="to">${historyValue(v, h, 'to')}</span></div>`;
    }
    return { at, html: `<li class="dt-entry history" data-history="${esc(h.field)}">${who(v, h.userId, at)}<div class="dt-history-text">${text}</div></li>` };
  });
}
