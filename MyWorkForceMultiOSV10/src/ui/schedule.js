// The schedule screen, like Microsoft Project: the task table (WBS, name, duration, start, finish,
// predecessors, person, progress) on the left and the Gantt chart on the right, row for row. Bars use the
// timeline's drag code (app.js bindTimeline): drag a bar to move a task, its end to change the duration,
// the dot on its right onto another bar to link them.
import { calendarOf } from '../domain/services.js';
import {
  computeSchedule, DAY, dayOf, ensureSchedule, formatPreds, isSummary, progressOf, scheduleSummary, slip, TASK_KINDS, wbsNumbers,
} from '../domain/schedule.js';
import { badge, empty, esc, icon, L, pageHead, userOptions } from './bits.js';

const ROW = 30;
const HEAD = 44;
const SCALES = { day: 26, week: 12, month: 4 };
const KIND_LABEL = { task: ['작업', 'Task'], story: ['스토리', 'Story'], feature: ['새 기능', 'Feature'], bug: ['결함', 'Bug'], improvement: ['개선', 'Improvement'] };

function stat(value, label, tone = '') {
  return `<div class="q-stat${tone ? ` ${tone}` : ''}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function shortDay(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function stepper(id, value, min, max, label, unit) {
  return `<span class="stepper" title="${esc(label)}"><span class="stepper-label">${esc(label)}</span><button type="button" class="small-button" data-action="plan-step" data-id="${id}" data-delta="-1" aria-label="−">−</button><input data-plan-setting="${id}" value="${esc(value)}" inputmode="numeric" min="${min}" max="${max}"><button type="button" class="small-button" data-action="plan-step" data-id="${id}" data-delta="1" aria-label="+">+</button><span class="muted">${esc(unit)}</span></span>`;
}

export function scheduleView(ctx) {
  const project = ctx.project;
  const calendar = calendarOf(ctx.ws);
  const schedule = ensureSchedule(project);
  computeSchedule(project, calendar);
  const tasks = schedule.tasks;
  const totals = scheduleSummary(project, calendar, ctx.now);
  const progress = progressOf(project);
  const wbs = wbsNumbers(tasks);
  const selected = tasks.find((task) => task.id === ctx.ui.planTask) || null;
  const scale = SCALES[ctx.ui.planScale] ? ctx.ui.planScale : 'day';
  const px = SCALES[scale];
  const canSwitch = tasks.length > 0;
  const boardOn = (id) => (project.methods || []).includes(id);
  const actions = `
    <button type="button" class="button" data-action="plan-import">${icon('folder')}<span>${L('가져오기', 'Import')}</span></button>
    <button type="button" class="button" data-action="export-view" title="${esc(L('HTML, Markdown, PDF, Word, Excel, 그림', 'HTML, Markdown, PDF, Word, Excel, picture'))}">${icon('download')}<span>${L('내보내기', 'Export')}</span></button>
    <button type="button" class="button" data-action="plan-export" data-kind="xml" title="Microsoft Project XML">${icon('download')}<span>MS-Project XML</span></button>
    <button type="button" class="button" data-action="plan-export" data-kind="csv">${icon('download')}<span>CSV</span></button>
    <button type="button" class="button${boardOn('kanban') ? '' : ' primary'}" data-action="plan-switch" data-mode="kanban" ${canSwitch ? '' : 'disabled'} title="${esc(L('작업을 이슈로 만들어 칸반 보드로 전환합니다.', 'Turn the tasks into issues and switch to a Kanban board.'))}">${icon('board')}<span>${L('칸반으로 전환', 'Switch to Kanban')}</span></button>
    <button type="button" class="button${boardOn('scrum') ? '' : ' primary'}" data-action="plan-switch" data-mode="scrum" ${canSwitch ? '' : 'disabled'} title="${esc(L('작업을 이슈로 만들고 기간에 맞춰 스프린트를 나눕니다.', 'Turn the tasks into issues and split them into sprints by date.'))}">${icon('backlog')}<span>${L('스크럼으로 전환', 'Switch to Scrum')}</span></button>`;
  // The schedule's own toolbar, in labelled groups — only this screen has these buttons.
  const linkMode = Boolean(ctx.ui.planLinkMode);
  const linkType = ['FS', 'SS', 'FF', 'SF'].includes(ctx.ui.planLinkType) ? ctx.ui.planLinkType : 'FS';
  const critical = Boolean(ctx.ui.planCritical);
  const linkFrom = tasks.find((task) => task.id === ctx.ui.planLinkFrom) || null;
  const typeTip = { FS: L('끝나면 시작 (FS)', 'Finish to start (FS)'), SS: L('함께 시작 (SS)', 'Start to start (SS)'), FF: L('함께 끝 (FF)', 'Finish to finish (FF)'), SF: L('시작하면 끝 (SF)', 'Start to finish (SF)') };
  const group = (title, body) => `<div class="plan-group"><div class="plan-group-body">${body}</div><small class="plan-group-title">${esc(title)}</small></div>`;
  const tools = `<div class="plan-ribbon" role="toolbar" aria-label="${esc(L('일정 도구', 'Schedule tools'))}">
    ${group(L('작업', 'Tasks'), `
      <button type="button" class="small-button" data-action="plan-add">${icon('plus')}<span>${L('작업', 'Task')}</span></button>
      <button type="button" class="small-button" data-action="plan-add" data-child="1" ${selected ? '' : 'disabled'}>${icon('subtask')}<span>${L('하위 작업', 'Subtask')}</span></button>
      <button type="button" class="small-button" data-action="plan-add" data-milestone="1">${icon('flag')}<span>${L('마일스톤', 'Milestone')}</span></button>
      <button type="button" class="icon-button" data-action="plan-delete" ${selected ? '' : 'disabled'} title="${esc(L('고른 작업 삭제', 'Delete the chosen task'))}">${icon('trash')}</button>`)}
    ${group(L('개요', 'Outline'), `
      <button type="button" class="icon-button" data-action="plan-indent" data-delta="-1" ${selected ? '' : 'disabled'} title="${esc(L('내어쓰기 (Alt+Shift+←)', 'Outdent (Alt+Shift+←)'))}">⇤</button>
      <button type="button" class="icon-button" data-action="plan-indent" data-delta="1" ${selected ? '' : 'disabled'} title="${esc(L('들여쓰기 (Alt+Shift+→)', 'Indent (Alt+Shift+→)'))}">⇥</button>
      <button type="button" class="icon-button" data-action="plan-move" data-delta="-1" ${selected ? '' : 'disabled'} title="${esc(L('위로 (Alt+Shift+↑)', 'Move up (Alt+Shift+↑)'))}">↑</button>
      <button type="button" class="icon-button" data-action="plan-move" data-delta="1" ${selected ? '' : 'disabled'} title="${esc(L('아래로 (Alt+Shift+↓)', 'Move down (Alt+Shift+↓)'))}">↓</button>`)}
    ${group(L('선행·후행 연결', 'Dependencies'), `
      <button type="button" class="small-button${linkMode ? ' active' : ''}" data-action="plan-link-mode" aria-pressed="${linkMode}" title="${esc(L('켜면 선행 작업 막대를 누르고 이어서 후행 작업 막대를 눌러 연결합니다. 막대 오른쪽 점을 끌어도 됩니다.', 'When on, click the predecessor bar and then the successor bar to link them. Dragging the dot on a bar\'s right works too.'))}">${icon('link')}<span>${L('연결 도구', 'Link tool')}</span></button>
      <span class="segmented plan-link-types">${['FS', 'SS', 'FF', 'SF'].map((type) => `<button type="button" class="small-button${linkType === type ? ' active' : ''}" data-action="plan-link-type" data-id="${type}" title="${esc(typeTip[type])}">${type}</button>`).join('')}</span>
      <button type="button" class="small-button" data-action="plan-unlink" ${selected || ctx.ui.planLinkPick ? '' : 'disabled'} title="${esc(ctx.ui.planLinkPick ? L('고른 연결선을 지웁니다.', 'Remove the chosen link.') : L('고른 작업의 선행·후행 연결을 모두 지웁니다.', 'Remove every link of the chosen task.'))}">${icon('close')}<span>${ctx.ui.planLinkPick ? L('연결선 지우기', 'Remove link') : L('연결 끊기', 'Unlink')}</span></button>`)}
    ${group(L('임계 경로', 'Critical path'), `
      <button type="button" class="small-button${critical ? ' active' : ''}" data-action="plan-critical" aria-pressed="${critical}" title="${esc(L('늦어지면 전체 일정이 늦어지는 작업을 찾아 강조하고, 나머지 작업의 여유일을 보여 줍니다.', 'Find and highlight the tasks that move the end date, and show the slack of the others.'))}">${icon('alert')}<span>${L('임계 경로 검출', 'Find critical path')}</span></button>`)}
    ${group(L('기준선', 'Baseline'), `
      <button type="button" class="small-button" data-action="plan-baseline" title="${esc(schedule.baselineAt ? L('지금 날짜를 기준선으로 다시 저장합니다.', 'Save the current dates as the baseline again.') : L('지금 날짜를 기준선으로 저장해 나중에 비교합니다.', 'Keep the current dates to compare with later.'))}">${icon('save')}<span>${L('저장', 'Save')}</span></button>
      ${schedule.baselineAt ? `<button type="button" class="small-button" data-action="plan-baseline-clear">${icon('close')}<span>${L('지우기', 'Clear')}</span></button>` : ''}`)}
    ${group(L('보기', 'View'), `<span class="segmented">${Object.keys(SCALES).map((id) => `<button type="button" class="small-button${scale === id ? ' active' : ''}" data-action="plan-scale" data-id="${id}">${esc({ day: L('일', 'Days'), week: L('주', 'Weeks'), month: L('월', 'Months') }[id])}</button>`).join('')}</span><button type="button" class="small-button" data-action="plan-today">${icon('calendar')}<span>${L('오늘', 'Today')}</span></button>`)}
  </div>
  ${linkMode ? `<p class="banner plan-hint">${icon('link')}<span>${esc(linkFrom ? L(`선행 작업: ${linkFrom.name} — 이제 후행 작업 막대를 누르세요 (${typeTip[linkType]}). Esc로 취소.`, `Predecessor: ${linkFrom.name} — now click the successor bar (${typeTip[linkType]}). Esc cancels.`) : L(`선행 작업 막대를 누르세요 (${typeTip[linkType]}).`, `Click the predecessor bar (${typeTip[linkType]}).`))}</span></p>` : ''}
  ${critical ? criticalBanner(tasks, wbs) : ''}
  <div class="plan-settings">
    <label class="plan-setting"><span>${L('과제 시작', 'Project start')}</span><input type="date" data-plan-setting="start" value="${esc(schedule.start)}"></label>
    ${stepper('sprintDays', schedule.sprintDays, 1, 90, L('스프린트 기간', 'Sprint length'), L('일', 'days'))}
    <span class="muted">${esc(calendar ? `${L('근무 달력', 'Work calendar')}: ${calendar.name}` : L('근무 달력 없음 — 월~금을 셉니다.', 'No work calendar — Monday to Friday count.'))}</span>
    ${schedule.applied ? `<span class="muted">${icon('check')}${esc(L(`${schedule.applied.mode === 'scrum' ? '스크럼' : '칸반'}으로 전환함`, `Switched to ${schedule.applied.mode === 'scrum' ? 'Scrum' : 'Kanban'}`))}</span>` : ''}
  </div>`;

  const head = `<tr><th class="plan-n">#</th><th class="plan-wbs">WBS</th><th class="plan-name">${esc(L('작업 이름', 'Task name'))}</th><th class="plan-dur">${esc(L('기간', 'Duration'))}</th><th class="plan-date">${esc(L('시작', 'Start'))}</th><th class="plan-date">${esc(L('끝', 'Finish'))}</th><th class="plan-pred">${esc(L('선행', 'Predecessors'))}</th><th class="plan-who">${esc(L('담당', 'Resource'))}</th><th class="plan-kind">${esc(L('종류', 'Kind'))}</th><th class="plan-pct">%</th><th class="plan-issue">${esc(L('이슈', 'Issue'))}</th></tr>`;
  const rows = tasks.map((task, i) => {
    const summary = isSummary(tasks, i);
    const issue = task.issueId ? project.issues.find((item) => item.id === task.issueId) : null;
    const pct = progress.get(task.id) || 0;
    const late = !summary && task.finish && dayOf(task.finish) < dayOf(ctx.now) && pct < 100;
    return `<tr class="plan-row${task.id === ctx.ui.planTask ? ' active' : ''}${summary ? ' summary' : ''}${task.milestone ? ' milestone' : ''}${task.critical && !summary ? ' critical' : ''}${late ? ' late' : ''}" data-plan-row="${esc(task.id)}">
      <td class="plan-n"><button type="button" data-action="plan-select" data-id="${esc(task.id)}">${i + 1}</button></td>
      <td class="plan-wbs">${esc(wbs[i])}</td>
      <td class="plan-name"><span class="plan-indent" style="--level:${task.level - 1}">${summary ? icon('chevronDown') : task.milestone ? '<b class="plan-diamond">◆</b>' : ''}<input data-plan-field="name" data-task="${esc(task.id)}" value="${esc(task.name)}" placeholder="${esc(L('작업 이름', 'Task name'))}"></span></td>
      <td class="plan-dur">${summary ? `<span>${task.duration}${esc(L('일', 'd'))}</span>` : `<input data-plan-field="duration" data-task="${esc(task.id)}" value="${task.milestone ? 0 : task.duration}" inputmode="numeric" title="${esc(L('작업일 수 (0 = 마일스톤)', 'Working days (0 = milestone)'))}">`}</td>
      <td class="plan-date">${summary ? `<span>${esc(shortDay(task.start))}</span>` : `<input type="date" data-plan-field="fixedStart" data-task="${esc(task.id)}" value="${esc(task.fixedStart || task.start)}" class="${task.fixedStart ? 'fixed' : ''}" title="${esc(task.fixedStart ? L('시작일 고정 (지우면 선행 작업을 따릅니다)', 'Start fixed (clear it to follow the predecessors)') : L('날짜를 고르면 그날 이후로 고정합니다', 'Pick a date to start no earlier than it'))}">`}</td>
      <td class="plan-date"><span>${esc(shortDay(task.finish))}</span>${task.baseline && slip(task) ? `<small class="plan-slip${slip(task) > 0 ? ' bad' : ''}">${slip(task) > 0 ? '+' : ''}${slip(task)}</small>` : ''}</td>
      <td class="plan-pred"><input data-plan-field="preds" data-task="${esc(task.id)}" value="${esc(formatPreds(tasks, task))}" title="${esc(L('행 번호와 종류: 3, 3FS+2d, 4SS, 5FF-1d (여럿은 ;)', 'Row numbers with a type: 3, 3FS+2d, 4SS, 5FF-1d (several with ;)'))}"></td>
      <td class="plan-who">${summary ? '' : `<select data-plan-field="assigneeId" data-task="${esc(task.id)}">${userOptions(ctx.ws, task.assigneeId, '—')}</select>`}</td>
      <td class="plan-kind">${summary || task.milestone ? '' : `<select data-plan-field="kind" data-task="${esc(task.id)}">${TASK_KINDS.map((kind) => `<option value="${kind}"${task.kind === kind ? ' selected' : ''}>${esc(L(...KIND_LABEL[kind]))}</option>`).join('')}</select>`}</td>
      <td class="plan-pct">${summary || issue ? `<span>${pct}</span>` : `<input data-plan-field="percent" data-task="${esc(task.id)}" value="${pct}" inputmode="numeric">`}</td>
      <td class="plan-issue">${issue ? `<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${esc(issue.key)}</button>` : ''}</td>
    </tr>`;
  }).join('');

  // ── the chart
  const today = dayOf(ctx.now);
  const starts = tasks.map((task) => dayOf(task.start)).filter((v) => v != null);
  const ends = tasks.map((task) => dayOf(task.finish)).filter((v) => v != null);
  const base = tasks.flatMap((task) => (task.baseline ? [dayOf(task.baseline.start), dayOf(task.baseline.finish)] : [])).filter((v) => v != null);
  const from = Math.min(dayOf(schedule.start), today, ...starts, ...base) - 3 * DAY;
  const until = Math.max(today + 14 * DAY, ...ends, ...base) + 14 * DAY;
  const days = Math.round((until - from) / DAY);
  const width = days * px;
  const height = HEAD + Math.max(1, tasks.length) * ROW + 6;
  const x = (day) => Math.round(((day - from) / DAY) * px);
  const ticks = [];
  for (let d = 0; d <= days; d += 1) {
    const time = from + d * DAY;
    const date = new Date(time);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    if (date.getUTCDate() === 1 || d === 0) ticks.push(`<text x="${x(time) + 4}" y="14" class="tl-month">${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}</text><line x1="${x(time)}" y1="0" x2="${x(time)}" y2="${height}" class="tl-month-line"/>`);
    if (scale === 'day') {
      ticks.push(`<text x="${x(time) + 3}" y="34" class="tl-day${weekend ? ' weekend' : ''}">${date.getUTCDate()}</text>`);
      if (weekend) ticks.push(`<rect x="${x(time)}" y="${HEAD}" width="${px}" height="${height - HEAD}" class="tl-weekend"/>`);
    } else if (scale === 'week' && date.getUTCDay() === 1) {
      ticks.push(`<text x="${x(time) + 3}" y="34" class="tl-day">${date.getUTCDate()}</text><line x1="${x(time)}" y1="${HEAD - 6}" x2="${x(time)}" y2="${height}" class="tl-week-line"/>`);
    }
  }
  const rowY = (i) => HEAD + i * ROW;
  const at = new Map(tasks.map((task, i) => [task.id, i]));
  const bars = tasks.map((task, i) => {
    const y = rowY(i);
    const s = dayOf(task.start);
    const e = dayOf(task.finish);
    if (s == null) return '';
    const left = x(s);
    const w = Math.max(px, x(e + DAY) - left);
    const pct = progress.get(task.id) || 0;
    const summary = isSummary(tasks, i);
    const label = `${task.name} · ${shortDay(task.start)}–${shortDay(task.finish)}${task.critical ? ` · ${L('임계 경로', 'critical path')}` : ''}`;
    const baseline = task.baseline ? `<rect x="${x(dayOf(task.baseline.start))}" y="${y + ROW - 7}" width="${Math.max(3, x(dayOf(task.baseline.finish) + DAY) - x(dayOf(task.baseline.start)))}" height="4" class="plan-baseline"/>` : '';
    if (task.milestone) {
      const cx = left + px / 2;
      return `<g class="tl-bar plan-bar milestone${task.critical ? ' critical' : ''}" data-tl-issue="${esc(task.id)}" data-plan-task="${esc(task.id)}"><title>${esc(label)}</title>${baseline}<path d="M${cx},${y + 6} l9,9 l-9,9 l-9,-9 z" class="plan-diamond-shape" data-tl-drag="both"/><text x="${cx + 13}" y="${y + 19}" class="tl-label plan-side">${esc(task.name)} ${esc(shortDay(task.finish))}</text></g>`;
    }
    if (summary) {
      return `<g class="tl-bar plan-bar summary" data-plan-task="${esc(task.id)}"><title>${esc(label)}</title>${baseline}<path d="M${left},${y + 9} h${w} v10 l-5,-5 h${-(w - 10)} l-5,5 z" class="plan-summary-shape"/><rect x="${left}" y="${y + 9}" width="${Math.round((w * pct) / 100)}" height="5" class="plan-summary-done"/></g>`;
    }
    const slack = ctx.ui.planCritical && !task.critical ? `<text x="${left + w + 16 + (nameOfUser(ctx, task.assigneeId) ? nameOfUser(ctx, task.assigneeId).length * 12 + 6 : 0)}" y="${y + 19}" class="plan-slack">${esc(L(`여유 ${task.float}일`, `slack ${task.float}d`))}</text>` : '';
    return `<g class="tl-bar plan-bar${task.critical ? ' critical' : ''}${pct >= 100 ? ' done' : ''}${ctx.ui.planLinkFrom === task.id ? ' link-from' : ''}" data-tl-issue="${esc(task.id)}" data-plan-task="${esc(task.id)}">${slack}<title>${esc(label)}</title>${baseline}
      <rect x="${left}" y="${y + 6}" width="${w}" height="${ROW - 14}" rx="4" class="tl-rect plan-rect" data-tl-drag="both"/>
      <rect x="${left}" y="${y + 6}" width="${Math.round((w * pct) / 100)}" height="${ROW - 14}" rx="4" class="plan-done" pointer-events="none"/>
      <rect x="${left + w - 6}" y="${y + 6}" width="6" height="${ROW - 14}" class="tl-edge" data-tl-drag="end"/>
      <circle cx="${left + w + 7}" cy="${y + ROW / 2 - 1}" r="5" class="tl-link-dot" data-tl-link="${esc(task.id)}"><title>${esc(L('끌어서 다른 작업에 놓으면 그 작업의 선행 작업이 됩니다', 'Drag onto another task to make this one its predecessor'))}</title></circle>
      <text x="${left + w + 16}" y="${y + 19}" class="tl-label plan-side">${esc(nameOfUser(ctx, task.assigneeId))}</text>
    </g>`;
  }).join('');
  const arrows = tasks.flatMap((task, i) => task.preds.filter((pred) => at.has(pred.id)).map((pred) => {
    const p = at.get(pred.id);
    const src = tasks[p];
    const fromX = pred.type === 'SS' || pred.type === 'SF' ? x(dayOf(src.start)) : x(dayOf(src.finish) + DAY);
    const toX = pred.type === 'FF' || pred.type === 'SF' ? x(dayOf(task.finish) + DAY) : x(dayOf(task.start));
    const y1 = rowY(p) + ROW / 2;
    const y2 = rowY(i) + ROW / 2;
    const out = pred.type === 'SS' || pred.type === 'SF' ? -8 : 8;
    const into = pred.type === 'FF' || pred.type === 'SF' ? 8 : -8;
    const path = `M${fromX},${y1} h${out} V${y2} H${toX + into} H${toX + (into > 0 ? 1 : -1)}`;
    const critical = src.critical && task.critical;
    const picked = ctx.ui.planLinkPick === `${task.id}|${pred.id}`;
    return `<path d="${path}" class="plan-arrow-hit" data-action="plan-link-pick" data-task="${esc(task.id)}" data-pred="${esc(pred.id)}"/><path d="${path}" class="tl-arrow plan-arrow${critical ? ' critical' : ''}${picked ? ' picked' : ''}" marker-end="url(#plan-head${critical ? '-crit' : ''})" pointer-events="none"><title>${esc(`${p + 1} → ${i + 1} ${pred.type}${pred.lag ? ` ${pred.lag > 0 ? '+' : ''}${pred.lag}d` : ''}`)}</title></path>`;
  }));
  const sprintBands = (project.sprints || []).filter((sprint) => sprint.start && sprint.end && sprint.state !== 'closed').map((sprint) => {
    const s = dayOf(sprint.start);
    const e = dayOf(sprint.end);
    return `<rect x="${x(s)}" y="${HEAD - 8}" width="${Math.max(2, x(e + DAY) - x(s) - 1)}" height="6" rx="3" class="plan-sprint${sprint.state === 'active' ? ' active' : ''}"><title>${esc(`${sprint.name} · ${shortDay(sprint.start.slice(0, 10))}–${shortDay(sprint.end.slice(0, 10))}`)}</title></rect>`;
  }).join('');
  const svg = `<svg class="tl-svg plan-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-tl-from="${from}" data-tl-px="${px}" data-plan-chart>
    <defs><marker id="plan-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="tl-head"/></marker><marker id="plan-head-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="plan-head-crit"/></marker></defs>
    ${ticks.join('')}${tasks.map((_, i) => `<line x1="0" y1="${rowY(i + 1)}" x2="${width}" y2="${rowY(i + 1)}" class="tl-row-line"/>`).join('')}
    ${sprintBands}
    <line x1="${x(today) + px / 2}" y1="${HEAD}" x2="${x(today) + px / 2}" y2="${height}" class="tl-today"/>
    ${arrows.join('')}${bars}
  </svg>`;
  const legend = `<span class="tl-legend plan-legend"><i class="sw plan-sw"></i>${L('작업', 'Task')}<i class="sw plan-sw critical"></i>${L('임계 경로', 'Critical path')}<i class="sw plan-sw summary"></i>${L('요약 작업', 'Summary')}<b class="plan-diamond">◆</b>${L('마일스톤', 'Milestone')}${schedule.baselineAt ? `<i class="sw plan-sw base"></i>${L('기준선', 'Baseline')}` : ''}${(project.sprints || []).length ? `<i class="sw plan-sw sprint"></i>${L('스프린트', 'Sprint')}` : ''}</span>`;

  const sprints = (project.sprints || []).filter((sprint) => sprint.state !== 'closed');
  const sprintTable = sprints.length ? `<h2>${icon('backlog')}<span>${L('스프린트 기간', 'Sprint dates')}</span></h2>
    <div class="table-wrap"><table class="data plan-sprints"><tr><th>${esc(L('스프린트', 'Sprint'))}</th><th>${esc(L('상태', 'State'))}</th><th>${esc(L('시작', 'Start'))}</th><th>${esc(L('끝', 'End'))}</th><th>${esc(L('일수', 'Days'))}</th></tr>
    ${sprints.map((sprint) => {
      const s = dayOf(sprint.start);
      const e = dayOf(sprint.end);
      return `<tr><td><input data-sprint-field="name" data-sprint="${esc(sprint.id)}" value="${esc(sprint.name)}"></td><td>${badge(sprint.state === 'active' ? L('진행 중', 'Active') : L('예정', 'Future'), sprint.state === 'active' ? '#30a46c' : '#64748b')}</td><td><input type="date" data-sprint-field="start" data-sprint="${esc(sprint.id)}" value="${esc(s != null ? new Date(s).toISOString().slice(0, 10) : '')}"></td><td><input type="date" data-sprint-field="end" data-sprint="${esc(sprint.id)}" value="${esc(e != null ? new Date(e).toISOString().slice(0, 10) : '')}"></td><td>${s != null && e != null ? Math.round((e - s) / DAY) + 1 : ''}</td></tr>`;
    }).join('')}</table></div>` : '';

  const body = tasks.length
    ? `<div class="plan-wrap${ctx.ui.planCritical ? ' critical-mode' : ''}${ctx.ui.planLinkMode ? ' link-mode' : ''}"><div class="plan-table-box"><table class="plan-table">${head}${rows}</table></div><div class="plan-chart tl-chart" data-tl-chart>${svg}</div></div>`
    : `<div class="plan-empty">${empty(L('작업이 없습니다. "작업"으로 새로 만들거나 MS-Project XML·CSV 파일을 가져오세요.', 'No tasks yet. Add one with "Task", or import a Microsoft Project XML or CSV file.'))}<div class="page-actions page-actions-left"><button type="button" class="button primary" data-action="plan-add">${icon('plus')}<span>${L('첫 작업', 'First task')}</span></button><button type="button" class="button" data-action="plan-import">${icon('folder')}<span>${L('가져오기', 'Import')}</span></button></div></div>`;
  return `<div class="page plan-page">${pageHead(L('일정 계획', 'Schedule'), actions, 'schedule')}
    <div class="q-stats">
      ${stat(shortDay(totals.start) || '—', L('시작', 'Start'))}
      ${stat(shortDay(totals.finish) || '—', L('끝', 'Finish'))}
      ${stat(totals.workDays, L('작업일', 'Working days'))}
      ${stat(`${totals.percent}%`, L('진행률', 'Complete'), 'good')}
      ${stat(totals.critical, L('임계 작업', 'Critical tasks'), totals.critical ? 'bad' : '')}
      ${stat(totals.late, L('늦은 작업', 'Late tasks'), totals.late ? 'warn' : '')}
      ${stat(`${totals.linked}/${tasks.length}`, L('이슈로 만든 작업', 'Tasks with an issue'))}
    </div>
    ${tools}
    ${tasks.length ? legend : ''}
    ${body}
    ${sprintTable}
  </div>`;
}

function nameOfUser(ctx, id) {
  return (ctx.ws.users || []).find((user) => user.id === id)?.name || '';
}

/** The critical path as a chain of tasks, with its length in working days. */
function criticalBanner(tasks, wbs) {
  const chain = tasks.map((task, i) => ({ task, i })).filter(({ task, i }) => task.critical && !isSummary(tasks, i)).sort((a, b) => a.task.start.localeCompare(b.task.start) || a.i - b.i);
  if (!chain.length) return `<p class="banner">${icon('check')}<span>${esc(L('임계 경로가 없습니다.', 'There is no critical path.'))}</span></p>`;
  const days = chain.reduce((sum, { task }) => sum + (task.milestone ? 0 : task.duration), 0);
  const steps = chain.map(({ task, i }) => `<button type="button" class="plan-chain-step" data-action="plan-select" data-id="${esc(task.id)}">${task.milestone ? '◆ ' : ''}${esc(wbs[i])} ${esc(task.name)}</button>`).join('<span class="plan-chain-arrow">→</span>');
  return `<div class="banner bad plan-critical-banner">${icon('alert')}<div><b>${esc(L(`임계 경로: 작업 ${chain.length}개, ${days} 작업일`, `Critical path: ${chain.length} tasks, ${days} working days`))}</b><div class="plan-chain">${steps}</div><small>${esc(L('이 작업들이 하루 늦어지면 끝 날짜도 하루 늦어집니다. 다른 작업 옆의 숫자는 여유일입니다.', 'A day late on any of these moves the finish by a day. The number beside other tasks is their slack.'))}</small></div></div>`;
}

/** The "Switch to Kanban / Scrum" dialog with its preview (plan worked out in schedule-apply.js). */
export function switchDialogBody(ctx, plan) {
  const scrum = plan.mode === 'scrum';
  const o = plan.options;
  const c = plan.counts;
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const sprints = scrum ? `<div class="table-wrap plan-preview"><table class="data"><tr><th>${esc(L('스프린트', 'Sprint'))}</th><th>${esc(L('기간', 'Dates'))}</th><th>${esc(L('작업', 'Tasks'))}</th><th></th></tr>${plan.sprints.map((sprint) => `<tr><td>${esc(sprint.name)}${sprint.current ? ` ${badge(L('지금', 'Now'), '#30a46c')}` : ''}</td><td>${esc(day(sprint.start))} – ${esc(day(sprint.end))}</td><td>${sprint.tasks}</td><td>${sprint.existingId ? badge(L('있음', 'Exists'), '#64748b') : badge(L('새로', 'New'), '#3a6cf0')}</td></tr>`).join('')}</table></div>` : '';
  const fields = scrum ? `
    <div class="form-row"><span>${L('스프린트 기간', 'Sprint length')}</span><span class="stepper"><button type="button" class="small-button" data-action="switch-step" data-id="sprintDays" data-delta="-1">−</button><input name="sprintDays" data-switch="sprintDays" value="${o.sprintDays}" inputmode="numeric"><button type="button" class="small-button" data-action="switch-step" data-id="sprintDays" data-delta="1">+</button><span class="muted">${L('일', 'days')}</span></span></div>
    <div class="form-row"><span>${L('첫 스프린트 시작', 'First sprint starts')}</span><input type="date" name="sprintStart" data-switch="sprintStart" value="${esc(o.sprintStart)}"></div>
    <div class="form-row"><span>${L('스프린트 수', 'Number of sprints')}</span><span class="stepper"><button type="button" class="small-button" data-action="switch-step" data-id="sprintCount" data-delta="-1">−</button><input name="sprintCount" data-switch="sprintCount" value="${o.sprintCount}" inputmode="numeric"><button type="button" class="small-button" data-action="switch-step" data-id="sprintCount" data-delta="1">+</button><span class="muted">${L('0 = 일정 끝까지, 나머지는 백로그', '0 = to the end; the rest go to the backlog')}</span></span></div>
    <label class="check"><input type="checkbox" name="startCurrent" data-switch="startCurrent" ${o.startCurrent ? 'checked' : ''}> ${L('오늘이 든 스프린트를 시작', 'Start the sprint that holds today')}</label>`
    : `<div class="form-row"><span>${L('할 일로 올릴 기간', 'Ready window')}</span><span class="stepper"><button type="button" class="small-button" data-action="switch-step" data-id="windowDays" data-delta="-1">−</button><input name="windowDays" data-switch="windowDays" value="${o.windowDays}" inputmode="numeric"><button type="button" class="small-button" data-action="switch-step" data-id="windowDays" data-delta="1">+</button><span class="muted">${L('일 안에 시작할 작업은 "할 일", 나머지는 "백로그"', 'days: tasks starting sooner go to To Do, later ones to Backlog')}</span></span></div>`;
  return `<p class="muted">${esc(scrum
    ? L('작업은 이슈가, 요약 작업은 에픽이, 마일스톤은 릴리스 버전이 됩니다. 시작일이 든 스프린트에 넣고, 선행 관계는 "막음" 연결이 됩니다. 일정은 그대로 남습니다.', 'Tasks become issues, summary tasks epics and milestones release versions. Each goes into the sprint its start falls in; dependencies become "blocks" links. The schedule stays.')
    : L('작업은 이슈가, 요약 작업은 에픽이, 마일스톤은 릴리스 버전이 되어 칸반 보드에 놓입니다. 선행 관계는 "막음" 연결이 됩니다. 일정은 그대로 남습니다.', 'Tasks become issues on the Kanban board, summary tasks epics and milestones release versions; dependencies become "blocks" links. The schedule stays.'))}</p>
    ${fields}
    <div class="q-stats switch-stats">
      <div class="q-stat"><b>${c.create}</b><span>${esc(L('새 이슈', 'New issues'))}</span></div>
      <div class="q-stat"><b>${c.update}</b><span>${esc(L('고칠 이슈', 'Updated issues'))}</span></div>
      <div class="q-stat"><b>${c.epics}</b><span>${esc(L('에픽', 'Epics'))}</span></div>
      ${scrum ? `<div class="q-stat"><b>${c.sprints}</b><span>${esc(L('스프린트', 'Sprints'))}</span></div>` : `<div class="q-stat"><b>${c.todo}</b><span>${esc(L('할 일', 'To Do'))}</span></div>`}
      <div class="q-stat"><b>${c.backlog}</b><span>${esc(L('백로그', 'Backlog'))}</span></div>
      <div class="q-stat"><b>${c.versions}</b><span>${esc(L('릴리스', 'Releases'))}</span></div>
    </div>
    ${c.locked ? `<p class="muted">${esc(L(`진행 중이거나 끝난 이슈 ${c.locked}개는 스프린트와 상태를 그대로 둡니다.`, `${c.locked} issues already in progress or done keep their sprint and status.`))}</p>` : ''}
    ${sprints}`;
}

