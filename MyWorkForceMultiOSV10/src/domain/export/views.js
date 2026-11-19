// What "Export this screen" writes: a document (docexport.js blocks) and, where the screen is a picture,
// a standalone SVG drawing of it (fixed colours and fonts, so it converts to PNG/JPEG/WebP/GIF/AVIF the same
// in every theme). Screens: the schedule (task table + Gantt chart), a Kanban or Scrum board, the backlog with
// its sprints, the planner month, the issue list and the traceability matrix.
import { activeSprint } from '../store.js';
import { runQuery } from '../query.js';
import { traceMatrix, COVERAGE } from '../requirements.js';
import { computeSchedule, DAY, dayOf, ensureSchedule, formatPreds, isSummary, itemsIn, plannerItems, progressOf, scheduleSummary, wbsNumbers } from '../schedule.js';
import { textWidth } from './docexport.js';

const FONT = "'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const T = (lang, ko, en) => (lang === 'en' ? en : ko);
const nameIn = (item, lang) => (item ? (lang === 'en' ? item.en || item.ko || item.name : item.ko || item.en || item.name) || '' : '');
const byId = (list, id) => (list || []).find((item) => item.id === id) || null;
const person = (ws, id) => byId(ws.users, id)?.name || '';
const isoOf = (value) => { const day = dayOf(value); return day == null ? '' : new Date(day).toISOString().slice(0, 10); };
const safe = (color, fallback = '#64748b') => (/^#[0-9a-fA-F]{6}$/.test(color || '') ? color : fallback);

/** Text clipped to about `px` pixels at `size` (wide characters count double). */
function clip(text, px, size = 12) {
  const value = String(text ?? '');
  const max = Math.max(1, Math.floor(px / (size * 0.56)));
  if (textWidth(value) <= max) return value;
  let out = '';
  for (const ch of value) { if (textWidth(`${out}${ch}`) > max - 1) break; out += ch; }
  return `${out}…`;
}

const svgOpen = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}"><rect width="${width}" height="${height}" fill="#ffffff"/>`;

// ── Schedule ──

export function ganttSvg(project, ws, { calendar = null, lang = 'ko', now = Date.now() } = {}) {
  computeSchedule(project, calendar);
  const tasks = ensureSchedule(project).tasks;
  const progress = progressOf(project);
  const wbs = wbsNumbers(tasks);
  const ROW = 26;
  const HEAD = 46;
  const LABEL = 300;
  const starts = tasks.map((t) => dayOf(t.start)).filter((v) => v != null);
  const ends = tasks.map((t) => dayOf(t.finish)).filter((v) => v != null);
  const from = Math.min(...starts, dayOf(now)) - 2 * DAY;
  const until = Math.max(...ends, dayOf(now)) + 4 * DAY;
  const days = Math.max(14, Math.round((until - from) / DAY));
  const px = days > 240 ? 4 : days > 120 ? 8 : days > 60 ? 14 : 22;
  const width = LABEL + days * px + 20;
  const height = HEAD + Math.max(1, tasks.length) * ROW + 30;
  const x = (day) => LABEL + ((day - from) / DAY) * px;
  const out = [svgOpen(width, height)];
  out.push(`<rect x="0" y="0" width="${width}" height="${HEAD}" fill="#f3f6fa"/>`);
  for (let d = 0; d <= days; d += 1) {
    const time = from + d * DAY;
    const date = new Date(time);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    if (weekend && px >= 8) out.push(`<rect x="${x(time)}" y="${HEAD}" width="${px}" height="${height - HEAD - 30}" fill="#f6f7f9"/>`);
    // The first day carries its month only when the next month is not about to start (labels would overlap).
    if (date.getUTCDate() === 1 || (d === 0 && (new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) - time) / DAY > 70 / px)) out.push(`<line x1="${x(time)}" y1="0" x2="${x(time)}" y2="${height - 30}" stroke="#cfd6e0"/><text x="${x(time) + 4}" y="16" font-size="12" font-weight="700" fill="#1d2430">${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}</text>`);
    if ((px >= 14 || date.getUTCDay() === 1) && px >= 8) out.push(`<text x="${x(time) + 2}" y="38" font-size="10" fill="${weekend ? '#d93a3a' : '#6b7685'}">${date.getUTCDate()}</text>`);
  }
  out.push(`<line x1="${LABEL}" y1="0" x2="${LABEL}" y2="${height - 30}" stroke="#b9c2ce"/>`);
  const at = new Map(tasks.map((t, i) => [t.id, i]));
  tasks.forEach((task, i) => {
    const y = HEAD + i * ROW;
    const summary = isSummary(tasks, i);
    out.push(`<line x1="0" y1="${y + ROW}" x2="${width}" y2="${y + ROW}" stroke="#edf0f4"/>`);
    out.push(`<text x="${8 + (task.level - 1) * 14}" y="${y + 17}" font-size="12" ${summary ? 'font-weight="700"' : ''} fill="${task.critical && !summary ? '#c42b2f' : '#1d2430'}">${esc(clip(`${wbs[i]}  ${task.name}`, LABEL - 16 - (task.level - 1) * 14))}</text>`);
    const s = dayOf(task.start);
    const e = dayOf(task.finish);
    if (s == null) return;
    const left = x(s);
    const w = Math.max(px, x(e + DAY) - left);
    const pct = progress.get(task.id) || 0;
    if (task.milestone) {
      const cx = left + px / 2;
      out.push(`<path d="M${cx},${y + 5} l8,8 l-8,8 l-8,-8 z" fill="${task.critical ? '#e5484d' : '#7c3aed'}"/><text x="${cx + 12}" y="${y + 17}" font-size="11" fill="#4b5563">${esc(isoOf(task.finish).slice(5))}</text>`);
    } else if (summary) {
      out.push(`<path d="M${left},${y + 8} h${w} v9 l-5,-4 h${-(w - 10)} l-5,4 z" fill="#1d2430"/><rect x="${left}" y="${y + 8}" width="${(w * pct) / 100}" height="4" fill="#30a46c"/>`);
    } else {
      const color = task.critical ? '#e5484d' : '#3a6cf0';
      out.push(`<rect x="${left}" y="${y + 6}" width="${w}" height="${ROW - 12}" rx="3" fill="${color}" fill-opacity="0.28" stroke="${color}"/><rect x="${left}" y="${y + 6}" width="${(w * pct) / 100}" height="${ROW - 12}" rx="3" fill="${color}" fill-opacity="0.8"/>`);
      const who = person(ws, task.assigneeId);
      if (who) out.push(`<text x="${left + w + 6}" y="${y + 17}" font-size="10.5" fill="#6b7685">${esc(who)}</text>`);
    }
  });
  tasks.forEach((task, i) => {
    for (const pred of task.preds) {
      const p = at.get(pred.id);
      if (p == null) continue;
      const src = tasks[p];
      const x1 = pred.type === 'SS' || pred.type === 'SF' ? x(dayOf(src.start)) : x(dayOf(src.finish) + DAY);
      const x2 = pred.type === 'FF' || pred.type === 'SF' ? x(dayOf(task.finish) + DAY) : x(dayOf(task.start));
      const y1 = HEAD + p * ROW + ROW / 2;
      const y2 = HEAD + i * ROW + ROW / 2;
      const color = src.critical && task.critical ? '#e5484d' : '#8a94a3';
      out.push(`<path d="M${x1},${y1} h6 V${y2} H${x2}" fill="none" stroke="${color}" stroke-width="1.1"/><path d="M${x2},${y2} l-5,-3 v6 z" fill="${color}"/>`);
    }
  });
  const today = dayOf(now);
  out.push(`<line x1="${x(today) + px / 2}" y1="${HEAD}" x2="${x(today) + px / 2}" y2="${height - 30}" stroke="#d93a3a" stroke-dasharray="4 3"/>`);
  const legend = [[`#3a6cf0`, T(lang, '작업', 'Task')], ['#e5484d', T(lang, '임계 경로', 'Critical path')], ['#1d2430', T(lang, '요약 작업', 'Summary')], ['#7c3aed', T(lang, '마일스톤', 'Milestone')]];
  legend.forEach(([color, label], k) => out.push(`<rect x="${10 + k * 120}" y="${height - 20}" width="14" height="10" fill="${color}" fill-opacity="0.8"/><text x="${28 + k * 120}" y="${height - 11}" font-size="11" fill="#4b5563">${esc(label)}</text>`));
  out.push('</svg>');
  return out.join('');
}

function scheduleDoc(ctx) {
  const { ws, project, lang } = ctx;
  const calendar = (ws.calendars || []).find((c) => c.id === ws.calendarId) || null;
  computeSchedule(project, calendar);
  const tasks = ensureSchedule(project).tasks;
  const wbs = wbsNumbers(tasks);
  const progress = progressOf(project);
  const totals = scheduleSummary(project, calendar, ctx.now);
  return {
    title: `${project.name} — ${T(lang, '일정 계획', 'Schedule')}`,
    subtitle: T(lang, `${totals.start} – ${totals.finish} · 작업일 ${totals.workDays}일 · 진행률 ${totals.percent}% · 임계 작업 ${totals.critical}`, `${totals.start} – ${totals.finish} · ${totals.workDays} working days · ${totals.percent}% complete · ${totals.critical} critical`),
    blocks: [
      { type: 'h', level: 2, text: T(lang, '작업', 'Tasks') },
      {
        type: 'table',
        columns: [{ label: '#', num: true }, { label: 'WBS' }, { label: T(lang, '작업 이름', 'Task name') }, { label: T(lang, '기간', 'Duration'), num: true }, { label: T(lang, '시작', 'Start') }, { label: T(lang, '끝', 'Finish') }, { label: T(lang, '선행', 'Predecessors') }, { label: T(lang, '담당', 'Resource') }, { label: '%', num: true }, { label: T(lang, '임계', 'Critical') }, { label: T(lang, '이슈', 'Issue') }],
        rows: tasks.map((task, i) => ({
          depth: task.level - 1,
          cells: [String(i + 1), wbs[i], `${task.milestone ? '◆ ' : ''}${task.name}`, String(task.milestone ? 0 : task.duration), task.start, task.finish, formatPreds(tasks, task), person(ws, task.assigneeId), String(progress.get(task.id) || 0), task.critical && !isSummary(tasks, i) ? T(lang, '예', 'yes') : '', byId(project.issues, task.issueId)?.key || ''],
        })),
      },
    ],
    svg: tasks.length ? ganttSvg(project, ws, { calendar, lang, now: ctx.now }) : null,
    picture: T(lang, '간트 차트', 'Gantt chart'),
  };
}

// ── Boards ──

/** Columns of cards as a picture. columns = [{ title, color, cards: [{ key, title, sub, color }] }] */
export function boardSvg(title, columns) {
  const COL = 250;
  const GAP = 12;
  const CARD = 58;
  const most = Math.max(1, ...columns.map((c) => c.cards.length));
  const width = Math.max(320, columns.length * (COL + GAP) + GAP);
  const height = 60 + most * (CARD + 8) + 20;
  const out = [svgOpen(width, height), `<text x="${GAP}" y="26" font-size="16" font-weight="700" fill="#1d2430">${esc(clip(title, width - 24, 16))}</text>`];
  columns.forEach((column, i) => {
    const x = GAP + i * (COL + GAP);
    out.push(`<rect x="${x}" y="40" width="${COL}" height="${height - 52}" rx="8" fill="#f3f6fa" stroke="#e1e6ee"/>`);
    out.push(`<rect x="${x + 10}" y="50" width="10" height="10" rx="3" fill="${safe(column.color)}"/><text x="${x + 26}" y="59" font-size="12.5" font-weight="700" fill="#1d2430">${esc(clip(`${column.title}  ${column.cards.length}`, COL - 36, 12.5))}</text>`);
    column.cards.forEach((card, k) => {
      const y = 70 + k * (CARD + 8);
      out.push(`<rect x="${x + 8}" y="${y}" width="${COL - 16}" height="${CARD}" rx="6" fill="#ffffff" stroke="#dbe1ea"/><rect x="${x + 8}" y="${y}" width="4" height="${CARD}" rx="2" fill="${safe(card.color, '#3a6cf0')}"/>`);
      out.push(`<text x="${x + 18}" y="${y + 18}" font-size="11" font-weight="700" fill="#2b6cf6">${esc(card.key || '')}</text><text x="${x + 18}" y="${y + 35}" font-size="12" fill="#1d2430">${esc(clip(card.title, COL - 34))}</text><text x="${x + 18}" y="${y + 50}" font-size="10.5" fill="#6b7685">${esc(clip(card.sub || '', COL - 34, 10.5))}</text>`);
    });
  });
  out.push('</svg>');
  return out.join('');
}

function issueRow(ws, project, issue, lang) {
  return [issue.key, issue.summary, nameIn(byId(project.issueTypes, issue.typeId), lang), nameIn(byId(project.statuses, issue.statusId), lang), nameIn(byId(project.priorities, issue.priorityId), lang), person(ws, issue.assigneeId), issue.storyPoints == null ? '' : String(issue.storyPoints), isoOf(issue.due)];
}
const issueColumns = (lang) => [{ label: T(lang, '키', 'Key') }, { label: T(lang, '요약', 'Summary') }, { label: T(lang, '유형', 'Type') }, { label: T(lang, '상태', 'Status') }, { label: T(lang, '우선순위', 'Priority') }, { label: T(lang, '담당', 'Assignee') }, { label: T(lang, '포인트', 'Points'), num: true }, { label: T(lang, '기한', 'Due') }];
const cardOf = (ws, project, issue, lang) => ({ key: issue.key, title: issue.summary, sub: [person(ws, issue.assigneeId), issue.storyPoints != null ? `${issue.storyPoints}pt` : '', isoOf(issue.due)].filter(Boolean).join(' · '), color: byId(project.priorities, issue.priorityId)?.color || byId(project.issueTypes, issue.typeId)?.color });

function boardDoc(ctx) {
  const { ws, project, lang } = ctx;
  const board = byId(project.boards, ctx.ui.boardId) || project.boards[0];
  const sprint = board?.type === 'scrum' ? activeSprint(project, board.id) : null;
  let issues = project.issues.filter((issue) => issue.typeId !== 'epic' && issue.typeId !== 'subtask');
  if (board?.type === 'scrum') issues = sprint ? issues.filter((issue) => issue.sprintId === sprint.id) : [];
  const columns = (board?.columns || []).map((column) => {
    const status = byId(project.statuses, column.statusId);
    const cards = issues.filter((issue) => issue.statusId === column.statusId).sort((a, b) => (a.rank || 0) - (b.rank || 0));
    return { status, cards };
  });
  const blocks = [];
  for (const column of columns) {
    blocks.push({ type: 'h', level: 2, text: `${nameIn(column.status, lang)} (${column.cards.length})` });
    blocks.push({ type: 'table', columns: issueColumns(lang), rows: column.cards.map((issue) => ({ cells: issueRow(ws, project, issue, lang) })) });
  }
  const title = `${project.name} — ${nameIn(board, lang) || T(lang, '보드', 'Board')}`;
  return {
    title,
    subtitle: sprint ? `${sprint.name} · ${isoOf(sprint.start)} – ${isoOf(sprint.end)}${sprint.goal ? ` · ${sprint.goal}` : ''}` : '',
    blocks,
    svg: boardSvg(title, columns.map((column) => ({ title: nameIn(column.status, lang), color: column.status?.color, cards: column.cards.map((issue) => cardOf(ws, project, issue, lang)) }))),
    picture: nameIn(board, lang) || T(lang, '보드', 'Board'),
  };
}

function backlogDoc(ctx) {
  const { ws, project, lang } = ctx;
  const sprints = (project.sprints || []).filter((sprint) => sprint.state !== 'closed');
  const work = project.issues.filter((issue) => issue.typeId !== 'epic' && issue.typeId !== 'subtask').sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const groups = [
    ...sprints.map((sprint) => ({ title: `${sprint.name}${sprint.state === 'active' ? T(lang, ' (진행 중)', ' (active)') : ''}`, note: `${isoOf(sprint.start)} – ${isoOf(sprint.end)}${sprint.goal ? ` · ${sprint.goal}` : ''}`, issues: work.filter((issue) => issue.sprintId === sprint.id), color: sprint.state === 'active' ? '#30a46c' : '#3a6cf0' })),
    { title: T(lang, '백로그', 'Backlog'), note: '', issues: work.filter((issue) => !issue.sprintId || !sprints.some((sprint) => sprint.id === issue.sprintId)).filter((issue) => byId(project.statuses, issue.statusId)?.category !== 'done'), color: '#64748b' },
  ];
  const blocks = [];
  for (const group of groups) {
    const points = group.issues.reduce((sum, issue) => sum + (Number(issue.storyPoints) || 0), 0);
    blocks.push({ type: 'h', level: 2, text: `${group.title} — ${group.issues.length}${T(lang, '개', ' issues')}, ${points}pt` });
    if (group.note) blocks.push({ type: 'p', text: group.note });
    blocks.push({ type: 'table', columns: issueColumns(lang), rows: group.issues.map((issue) => ({ cells: issueRow(ws, project, issue, lang) })) });
  }
  const title = `${project.name} — ${T(lang, '백로그와 스프린트', 'Backlog and sprints')}`;
  return { title, subtitle: '', blocks, svg: boardSvg(title, groups.map((group) => ({ title: group.title, color: group.color, cards: group.issues.map((issue) => cardOf(ws, project, issue, lang)) }))), picture: T(lang, '스프린트', 'Sprints') };
}

// ── Planner ──

export function monthSvg(items, date, lang = 'ko', title = '') {
  const day = dayOf(date);
  const d = new Date(day);
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const start = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY;
  const CELL = 150;
  const ROWH = 104;
  const width = CELL * 7 + 20;
  const height = 70 + ROWH * 6 + 10;
  const names = lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['월', '화', '수', '목', '금', '토', '일'];
  const color = { task: '#3a6cf0', milestone: '#7c3aed', sprint: '#0d9488', version: '#d97706' };
  const out = [svgOpen(width, height), `<text x="10" y="26" font-size="17" font-weight="700" fill="#1d2430">${esc(title || `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`)}</text>`];
  names.forEach((name, i) => out.push(`<text x="${10 + i * CELL + 6}" y="56" font-size="12" font-weight="700" fill="${i >= 5 ? '#d93a3a' : '#6b7685'}">${name}</text>`));
  for (let w = 0; w < 6; w += 1) {
    for (let i = 0; i < 7; i += 1) {
      const cell = start + (w * 7 + i) * DAY;
      const x = 10 + i * CELL;
      const y = 64 + w * ROWH;
      const inMonth = new Date(cell).getUTCMonth() === d.getUTCMonth();
      out.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${ROWH}" fill="${inMonth ? '#ffffff' : '#f6f7f9'}" stroke="#e1e6ee"/><text x="${x + 6}" y="${y + 16}" font-size="12" font-weight="700" fill="${inMonth ? (i >= 5 ? '#d93a3a' : '#1d2430') : '#b0b8c4'}">${new Date(cell).getUTCDate()}</text>`);
      const here = itemsIn(items, cell, cell);
      here.slice(0, 4).forEach((item, k) => {
        const c = item.kind === 'issue' ? safe(item.color, '#3a6cf0') : color[item.kind] || '#3a6cf0';
        const label = item.kind === 'issue' ? `${item.key} ${item.title}` : item.kind === 'milestone' ? `◆ ${item.title}` : item.title;
        out.push(`<rect x="${x + 4}" y="${y + 22 + k * 19}" width="${CELL - 8}" height="16" rx="3" fill="${c}" fill-opacity="${item.done ? 0.12 : 0.2}"/><rect x="${x + 4}" y="${y + 22 + k * 19}" width="3" height="16" fill="${c}"/><text x="${x + 10}" y="${y + 34 + k * 19}" font-size="10.5" fill="${item.done ? '#8a94a3' : '#1d2430'}">${esc(clip(label, CELL - 18, 10.5))}</text>`);
      });
      if (here.length > 4) out.push(`<text x="${x + CELL - 26}" y="${y + 16}" font-size="10.5" fill="#2b6cf6">+${here.length - 4}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

function plannerDoc(ctx) {
  const { ws, lang } = ctx;
  const state = ctx.ui.planner || {};
  const date = dayOf(state.date) ?? dayOf(ctx.now);
  const d = new Date(date);
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  const scope = state.scope || (ctx.project ? 'project' : 'mine');
  const items = plannerItems(ws, { projectIds: scope === 'project' && ctx.project ? [ctx.project.id] : ctx.projectIds || null, userId: ctx.user?.id || '', mine: scope === 'mine', kinds: state.kinds || null });
  const month = itemsIn(items, first, last);
  const kind = { task: T(lang, '일정 작업', 'Task'), milestone: T(lang, '마일스톤', 'Milestone'), issue: T(lang, '이슈', 'Issue'), sprint: T(lang, '스프린트', 'Sprint'), version: T(lang, '릴리스', 'Release') };
  const label = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    title: `${T(lang, '할 일 달력', 'Planner')} — ${label}`,
    subtitle: ctx.project && scope === 'project' ? ctx.project.name : scope === 'mine' ? T(lang, '내 할 일', 'My work') : T(lang, '모든 과제', 'All projects'),
    blocks: [{ type: 'table', columns: [{ label: T(lang, '시작', 'Start') }, { label: T(lang, '끝', 'End') }, { label: T(lang, '종류', 'Kind') }, { label: T(lang, '과제', 'Project') }, { label: T(lang, '내용', 'Item') }, { label: T(lang, '담당', 'Assignee') }, { label: T(lang, '완료', 'Done') }], rows: month.map((item) => ({ cells: [isoOf(item.start), isoOf(item.end), kind[item.kind] || item.kind, item.project, item.kind === 'issue' ? `${item.key} ${item.title}` : item.title, person(ws, item.assigneeId), item.done ? '✓' : ''] })) }],
    svg: monthSvg(items, date, lang, `${T(lang, '할 일 달력', 'Planner')} ${label}`),
    picture: label,
  };
}

// ── Lists ──

function issuesDoc(ctx) {
  const { ws, project, lang } = ctx;
  const result = runQuery(ws, project, ctx.ui.query || '', { user: ctx.user, now: ctx.now });
  const issues = result.error ? project.issues : result.issues;
  return { title: `${project.name} — ${T(lang, '이슈', 'Issues')}`, subtitle: ctx.ui.query || '', blocks: [{ type: 'table', columns: issueColumns(lang), rows: issues.map((issue) => ({ cells: issueRow(ws, project, issue, lang) })) }], svg: null };
}

function traceDoc(ctx) {
  const { project, lang } = ctx;
  const { rows, totals } = traceMatrix(project);
  return {
    title: `${project.name} — ${T(lang, '추적 매트릭스', 'Traceability matrix')}`,
    subtitle: T(lang, `요구 사항 ${totals.total} · 커버리지 ${totals.coveredPct}% · 통과 ${totals.passedPct}%`, `${totals.total} requirements · ${totals.coveredPct}% covered · ${totals.passedPct}% passed`),
    blocks: [{ type: 'table', columns: [{ label: T(lang, '번호', 'No.') }, { label: T(lang, '요구 사항', 'Requirement') }, { label: T(lang, '구현 이슈', 'Implemented by') }, { label: T(lang, '테스트 (결과)', 'Tests (result)') }, { label: T(lang, '열린 결함', 'Open defects') }, { label: T(lang, '커버리지', 'Coverage') }], rows: rows.map((row) => ({ depth: row.depth, cells: [row.number, `${row.requirement.key} ${row.requirement.summary}`, row.implementedBy.map((i) => i.key).join(' '), row.results.map((hit) => `${hit.test.key}:${hit.result}`).join(' '), row.openDefects.map((b) => b.key).join(' '), nameIn(byId(COVERAGE, row.coverage), lang)] })) }],
    svg: null,
  };
}

/** Views that can be exported, and what each writes. */
export const EXPORT_VIEWS = { schedule: scheduleDoc, board: boardDoc, backlog: backlogDoc, planner: plannerDoc, issues: issuesDoc, trace: traceDoc, requirements: traceDoc };

/**
 * The export of a screen: { title, subtitle, blocks, svg|null, picture }. ctx = { ws, project, ui, user, now, lang }.
 * A screen with no export of its own writes the issue list.
 */
export function exportFor(ctx, view = ctx.ui?.view) {
  const make = EXPORT_VIEWS[view] || (ctx.project ? issuesDoc : plannerDoc);
  if (!ctx.project && make !== plannerDoc) return plannerDoc(ctx);
  return make({ ...ctx, ui: ctx.ui || {}, lang: ctx.lang || 'ko', now: ctx.now ?? Date.now() });
}

/** File name made from a title (Hangul kept, path characters dropped). */
export function fileBase(title) {
  return String(title || 'MyWorkForce').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s*—\s*/g, '-').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'MyWorkForce';
}
