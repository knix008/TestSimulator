// Issue cards and their parts, shared by the board and the backlog (and anything that lists issues):
// avatars, type/priority icons, label chips, epic chips, progress, due dates, covers, and the card itself.
// Everything returns HTML text; colours come from the theme variables (views/shared/shared.css).
//
// `L` (lookups) is made once per data load with createLookups(data) from a board data answer
// (GET /boards/:id/data) or any object with the same lists (users, types, priorities, statuses, epics,
// projects, versions, components, columns).
import { renderIconRef } from '../../ui/iconref.js';
import { daysSince, dueState, escapeHtml, formatDate, formatDuration, formatPoints, hashColor, initials } from './format.js';

const byId = (list) => new Map((list ?? []).map((x) => [x.id, x]));

/** Maps by id of the lists a board data answer holds. */
export function createLookups(data = {}) {
  const maps = {
    users: byId(data.users), types: byId(data.types), priorities: byId(data.priorities), statuses: byId(data.statuses),
    epics: byId(data.epics), projects: byId(data.projects), versions: byId(data.versions), components: byId(data.components), columns: byId(data.columns),
  };
  const columnOfStatus = new Map();
  for (const column of data.columns ?? []) for (const id of column.statusIds ?? []) columnOfStatus.set(id, column.id);
  return {
    ...maps,
    user: (id) => (id ? maps.users.get(id) ?? null : null),
    type: (id) => maps.types.get(id) ?? null,
    priority: (id) => maps.priorities.get(id) ?? null,
    status: (id) => maps.statuses.get(id) ?? null,
    epic: (id) => (id ? maps.epics.get(id) ?? null : null),
    project: (id) => maps.projects.get(id) ?? null,
    version: (id) => maps.versions.get(id) ?? null,
    component: (id) => maps.components.get(id) ?? null,
    column: (id) => maps.columns.get(id) ?? null,
    columnOfStatus: (statusId) => columnOfStatus.get(statusId) ?? null,
  };
}

/** The letter avatar used when a user has none: 'l:KM#<colour>'. */
export function letterAvatar(user) {
  const name = user?.displayName ?? user?.display_name ?? user?.name ?? user?.username ?? '?';
  const hsl = hashColor(user?.id ?? name, { s: 50, l: 46 });
  return `l:${initials(name)}#${hslToHex(hsl)}`;
}

/** A user's avatar (IconRef or letters); `null` user → an "unassigned" circle. */
export function avatarHtml(user, { size = 22, title = null, t = null, className = 'mb-avatar' } = {}) {
  if (!user) {
    const tip = title ?? (t ? t('shared.unassigned') : '');
    return `<span class="${className} mb-avatar-none" style="width:${size}px;height:${size}px"${tip ? ` title="${escapeHtml(tip)}"` : ''} role="img" aria-label="${escapeHtml(tip)}"></span>`;
  }
  const name = user.displayName ?? user.display_name ?? user.name ?? user.username ?? '';
  return renderIconRef(user.avatar, { size, title: title ?? name, className, fallback: letterAvatar(user) });
}

/** Several avatars, overlapping (presence, watchers). */
export function avatarStackHtml(users, { size = 22, max = 5, t = null } = {}) {
  const list = (users ?? []).slice(0, max);
  const more = (users?.length ?? 0) - list.length;
  return `<span class="mb-avatar-stack">${list.map((u) => avatarHtml(u, { size, t })).join('')}${more > 0 ? `<span class="mb-avatar-more" style="height:${size}px;min-width:${size}px">+${more}</span>` : ''}</span>`;
}

export function typeIconHtml(type, { size = 16, t = null } = {}) {
  if (!type) return '';
  return renderIconRef(type.icon, { size, title: t ? t('shared.type', { name: type.name }) : type.name, className: 'mb-type', fallback: 'b:task' });
}

export function priorityIconHtml(priority, { size = 16, t = null } = {}) {
  if (!priority) return '';
  return renderIconRef(priority.icon, { size, title: t ? t('shared.priority', { name: priority.name }) : priority.name, className: 'mb-priority', fallback: 'b:priority-medium' });
}

/** The colour of a label chip (stable per text). */
export const labelColor = (label) => hashColor(label, { s: 60, l: 45 });

export function labelChipsHtml(labels, { max = 3, t = null } = {}) {
  const list = (labels ?? []).filter(Boolean);
  if (!list.length) return '';
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  return `<span class="mb-labels">${shown.map((label) => `<span class="mb-label" style="--label:${labelColor(label)}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`).join('')}${more > 0 ? `<span class="mb-label more" title="${escapeHtml(t ? t('shared.moreLabels', { n: more }) : `+${more}`)}">+${more}</span>` : ''}</span>`;
}

export function epicChipHtml(epic, { t = null } = {}) {
  if (!epic) return '';
  const color = epic.color || hashColor(epic.id, { s: 55, l: 50 });
  return `<span class="mb-epic" style="--epic:${escapeHtml(color)}" title="${escapeHtml(t ? t('shared.epic', { name: `${epic.key} ${epic.summary}` }) : epic.summary)}">${escapeHtml(epic.summary || epic.key)}</span>`;
}

/** A small "done/total" with a bar (subtasks, checklist). */
export function progressHtml(progress, { glyph = '', title = '', kind = '' } = {}) {
  if (!progress?.total) return '';
  const pct = Math.round((progress.done / progress.total) * 100);
  const full = progress.done >= progress.total;
  return `<span class="mb-progress ${kind} ${full ? 'full' : ''}" title="${escapeHtml(title)}">${glyph}<span>${progress.done}/${progress.total}</span><i style="--pct:${pct}%"></i></span>`;
}

/** The due date chip: coloured when overdue / today / soon. */
export function dueChipHtml(dueDate, { t, lang = 'ko', now = Date.now(), resolved = false, glyph = '' } = {}) {
  const state = dueState(dueDate, { now, resolved });
  if (!state) return '';
  const date = formatDate(dueDate, lang, now);
  const tip = state === 'overdue' ? t('shared.due.overdue', { date }) : state === 'today' ? t('shared.due.today') : state === 'soon' ? t('shared.due.soon', { date }) : t('shared.due', { date });
  return `<span class="mb-due ${state}" title="${escapeHtml(tip)}">${glyph}<span>${escapeHtml(date)}</span></span>`;
}

/** Up to five dots for the days spent in the current column (2, 4, 6, 8, 10+ days … like a heat bar). */
export function daysDotsHtml(since, { t, now = Date.now() } = {}) {
  const days = daysSince(since, now);
  if (days == null || days < 1) return '';
  const dots = Math.min(5, Math.max(1, Math.ceil(days / 2)));
  const level = days >= 10 ? 'hot' : days >= 5 ? 'warm' : '';
  return `<span class="mb-days ${level}" title="${escapeHtml(t('shared.daysInColumn', { n: days }))}" aria-label="${escapeHtml(t('shared.daysInColumn', { n: days }))}">${'<i></i>'.repeat(dots)}</span>`;
}

/**
 * The cover of a card: `{ color }`, `{ attachmentId }` (served at /api/attachments/:id?inline=1), `{ url }` or
 * `{ icon }` (an IconRef, drawn big). `urlOf(path)` turns an API path into a URL (ApiClient.url).
 */
export function coverHtml(cover, { urlOf = (p) => `/api${p}` } = {}) {
  if (!cover || typeof cover !== 'object') return '';
  if (cover.attachmentId) return `<div class="mb-cover image"><img src="${escapeHtml(urlOf(`/attachments/${encodeURIComponent(cover.attachmentId)}?inline=1`))}" alt="" loading="lazy" draggable="false" /></div>`;
  if (cover.url && /^(https?:|data:image\/)/i.test(cover.url)) return `<div class="mb-cover image"><img src="${escapeHtml(cover.url)}" alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer" /></div>`;
  if (cover.icon) return `<div class="mb-cover icon" style="${cover.color ? `background:${escapeHtml(cover.color)}` : ''}">${renderIconRef(cover.icon, { size: 34 })}</div>`;
  if (cover.color) return `<div class="mb-cover color" style="background:${escapeHtml(cover.color)}"></div>`;
  return '';
}

/** What a card shows besides the fixed parts: the board's cardFields (§3.2), up to 3. */
export const CARD_FIELDS = ['priority', 'storyPoints', 'dueDate', 'originalEstimate', 'remainingEstimate', 'timeSpent', 'components', 'fixVersions', 'labels', 'daysInColumn'];

/**
 * One issue card. `card`: the board card shape (§5 board data). Options:
 *   t, lang, now, fields (cardFields), urlOf, selected, focusable, done (in a done column), showDays,
 *   glyph(name) → app icon HTML (comment, paperclip, check, list …), compact (one line, backlog rows)
 */
export function cardHtml(card, L, opts = {}) {
  const { t, lang = 'ko', now = Date.now(), fields = ['priority', 'storyPoints', 'dueDate'], urlOf, selected = false, done = false, showDays = false, glyph = () => '', compact = false } = opts;
  const type = L.type(card.typeId);
  const priority = L.priority(card.priorityId);
  const user = L.user(card.assigneeId);
  const epic = L.epic(card.epicId);
  const status = L.status(card.statusId);
  const resolved = Boolean(card.resolutionId) || done || status?.category === 'done';
  const color = card.cardColor || card.color || '';
  const want = (f) => fields.includes(f);
  const parts = [];
  parts.push(typeIconHtml(type, { t }));
  parts.push(`<span class="mb-key ${resolved ? 'resolved' : ''}">${escapeHtml(card.key)}</span>`);
  if (card.flagged) parts.push(`<span class="mb-flag" title="${escapeHtml(t('shared.flagged'))}">${glyph('flag')}</span>`);
  if (want('priority') && priority) parts.push(priorityIconHtml(priority, { t }));
  if (want('storyPoints') && card.storyPoints != null) parts.push(`<span class="mb-points" title="${escapeHtml(t('shared.storyPoints', { n: formatPoints(card.storyPoints) }))}">${escapeHtml(formatPoints(card.storyPoints))}</span>`);
  if (want('originalEstimate') && card.originalEstimate) parts.push(`<span class="mb-time" title="${escapeHtml(t('shared.estimate', { d: formatDuration(card.originalEstimate, lang) }))}">${glyph('clock')}${escapeHtml(formatDuration(card.originalEstimate, lang))}</span>`);
  if (want('remainingEstimate') && card.remainingEstimate) parts.push(`<span class="mb-time" title="${escapeHtml(t('shared.remaining', { d: formatDuration(card.remainingEstimate, lang) }))}">${glyph('hourglass')}${escapeHtml(formatDuration(card.remainingEstimate, lang))}</span>`);
  if (want('timeSpent') && card.timeSpent) parts.push(`<span class="mb-time" title="${escapeHtml(t('shared.timeSpent', { d: formatDuration(card.timeSpent, lang) }))}">${glyph('speed')}${escapeHtml(formatDuration(card.timeSpent, lang))}</span>`);
  if (want('dueDate') && card.dueDate) parts.push(dueChipHtml(card.dueDate, { t, lang, now, resolved, glyph: glyph('calendar') }));
  if (card.subtasks?.total) parts.push(progressHtml(card.subtasks, { glyph: glyph('layers'), title: t('shared.subtasks', card.subtasks), kind: 'subtasks' }));
  if (card.checklist?.total) parts.push(progressHtml(card.checklist, { glyph: glyph('check'), title: t('shared.checklist', card.checklist), kind: 'checklist' }));
  if (card.commentCount) parts.push(`<span class="mb-count" title="${escapeHtml(t('shared.comments', { n: card.commentCount }))}">${glyph('comment')}${card.commentCount}</span>`);
  if (card.attachmentCount) parts.push(`<span class="mb-count" title="${escapeHtml(t('shared.attachments', { n: card.attachmentCount }))}">${glyph('file')}${card.attachmentCount}</span>`);
  const extra = [];
  if (want('components') && card.componentIds?.length) extra.push(`<span class="mb-meta" title="${escapeHtml(t('shared.components', { names: card.componentIds.map((id) => L.component(id)?.name ?? '').join(', ') }))}">${glyph('layers')}${escapeHtml(card.componentIds.map((id) => L.component(id)?.name ?? '').filter(Boolean).join(', '))}</span>`);
  if (want('fixVersions') && card.fixVersionIds?.length) extra.push(`<span class="mb-meta" title="${escapeHtml(t('shared.fixVersions', { names: card.fixVersionIds.map((id) => L.version(id)?.name ?? '').join(', ') }))}">${glyph('tag')}${escapeHtml(card.fixVersionIds.map((id) => L.version(id)?.name ?? '').filter(Boolean).join(', '))}</span>`);
  const days = showDays || want('daysInColumn') ? daysDotsHtml(card.statusChangedAt ?? card.updatedAt, { t, now }) : '';
  const icon = card.icon ? renderIconRef(card.icon, { size: 16, className: 'mb-card-icon' }) : '';
  const classes = ['mb-card', compact ? 'compact' : '', card.flagged ? 'flagged' : '', selected ? 'selected' : '', resolved ? 'resolved' : '', color ? 'colored' : ''].filter(Boolean).join(' ');
  const labels = labelChipsHtml(card.labels, { t, max: compact ? 2 : 3 });
  const epicChip = epicChipHtml(epic, { t });
  const label = `${card.key} ${card.summary}`;
  if (compact) {
    return `<div class="${classes}" data-id="${escapeHtml(card.id)}" data-key="${escapeHtml(card.key)}" tabindex="-1" role="listitem" aria-label="${escapeHtml(label)}"${color ? ` style="--card-color:${escapeHtml(color)}"` : ''}>
      ${typeIconHtml(type, { t })}<span class="mb-key ${resolved ? 'resolved' : ''}">${escapeHtml(card.key)}</span>${icon}<span class="mb-summary">${escapeHtml(card.summary)}</span>${labels}${epicChip}<span class="grow"></span>${parts.slice(2).join('')}${avatarHtml(user, { size: 20, t })}
    </div>`;
  }
  return `<div class="${classes}" data-id="${escapeHtml(card.id)}" data-key="${escapeHtml(card.key)}" tabindex="-1" role="listitem" aria-label="${escapeHtml(label)}" aria-selected="${selected}"${color ? ` style="--card-color:${escapeHtml(color)}"` : ''}>
    ${coverHtml(card.cover, { urlOf })}
    <div class="mb-card-body">
      <div class="mb-card-title">${icon}<span class="mb-summary">${escapeHtml(card.summary)}</span>${avatarHtml(user, { size: 22, t })}</div>
      ${labels || epicChip || extra.length ? `<div class="mb-card-tags">${epicChip}${labels}${extra.join('')}</div>` : ''}
      <div class="mb-card-foot">${parts.join('')}</div>
      ${days}
    </div>
  </div>`;
}

/**
 * A board card from a full issue (an event's data, a POST /issues or /move answer). `prev`: the card it
 * replaces (counts the full issue lacks, lane, colour); `L`: lookups for the column.
 */
export function issueToCard(issue, { prev = null, L = null } = {}) {
  const pick = (key, fallback = null) => (issue[key] !== undefined ? issue[key] : prev?.[key] ?? fallback);
  const progressOf = (list, done) => (Array.isArray(list) ? (list.length ? { total: list.length, done: list.filter(done).length } : null) : undefined);
  const subtasks = progressOf(issue.subtasks, (s) => L?.status(s.statusId ?? s.status_id)?.category === 'done');
  const checklist = progressOf(issue.checklist, (c) => c.done);
  return {
    id: issue.id, key: pick('key'), projectId: pick('projectId'), summary: pick('summary', ''), typeId: pick('typeId'), statusId: pick('statusId'),
    priorityId: pick('priorityId'), assigneeId: pick('assigneeId'), epicId: pick('epicId'), parentId: pick('parentId'), storyPoints: pick('storyPoints'),
    originalEstimate: pick('originalEstimate'), remainingEstimate: pick('remainingEstimate'), timeSpent: pick('timeSpent'), dueDate: pick('dueDate'),
    rank: pick('rank'), color: pick('color'), cover: pick('cover'), icon: pick('icon'), flagged: Boolean(pick('flagged', false)), resolutionId: pick('resolutionId'),
    resolvedAt: pick('resolvedAt'), statusChangedAt: pick('statusChangedAt'), createdAt: pick('createdAt'), updatedAt: pick('updatedAt'), rev: pick('rev'),
    labels: pick('labels', []) ?? [], componentIds: pick('componentIds', []) ?? [], fixVersionIds: pick('fixVersionIds', []) ?? [],
    subtasks: subtasks !== undefined ? subtasks : prev?.subtasks ?? null,
    checklist: checklist !== undefined ? checklist : prev?.checklist ?? null,
    commentCount: issue.commentCount ?? prev?.commentCount ?? 0, attachmentCount: issue.attachmentCount ?? prev?.attachmentCount ?? 0,
    columnId: L?.columnOfStatus(pick('statusId')) ?? prev?.columnId ?? null, lane: prev?.lane ?? null, cardColor: prev?.cardColor ?? null,
  };
}

function hslToHex(hsl) {
  const m = /hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/.exec(hsl);
  if (!m) return '5b6ee1';
  const h = Number(m[1]) / 360; const s = Number(m[2]) / 100; const l = Number(m[3]) / 100;
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0'); };
  return `${f(0)}${f(8)}${f(4)}`;
}
