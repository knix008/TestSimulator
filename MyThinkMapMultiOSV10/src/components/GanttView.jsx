// The Gantt chart (보기 › 간트 차트): the topics with task dates as bars on a
// calendar, the branches above them as summary bars. Drag a bar to move it,
// its ends to change the start or due date; a diamond is a milestone. The
// progress fills the bar; today is the red line. Scale: day · week · month.
import React, { useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { setTask } from '../lib/model';

const DAY = 86400000;
const parse = (s) => (s ? new Date(`${s}T12:00:00`) : null);
const fmt = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const days = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
const SCALES = { day: 28, week: 12, month: 4 };

function collect(map, showAll) {
  // rows: tasks plus the ancestors that lead to them (summary rows)
  const rows = [];
  const walk = (tp, depth, kind) => {
    const kids = [];
    for (const c of tp.children || []) { const r = walk(c, depth + 1, 'child'); if (r) kids.push(r); }
    const task = tp.task || {};
    const own = task.start || task.due;
    if (!own && !kids.length && !showAll) return null;
    const node = { tp, depth, kind, kids, start: task.start || (task.milestone ? task.due : ''), due: task.due || task.start || '', progress: task.progress, milestone: !!task.milestone, own: !!own };
    if (!own && kids.length) {
      // a summary: the span of its children
      const starts = kids.map((k) => k.start).filter(Boolean).sort();
      const dues = kids.map((k) => k.due).filter(Boolean).sort();
      node.start = starts[0] || '';
      node.due = dues[dues.length - 1] || '';
      node.summary = true;
    }
    return node;
  };
  const tops = [walk(map.root, 0, 'root'), ...(map.floating || []).map((f) => walk(f, 0, 'floating'))].filter(Boolean);
  const flat = (n) => { rows.push(n); n.kids.forEach(flat); };
  tops.forEach(flat);
  return rows;
}

export function GanttView({ doc, map, edit, onSelect, onAction, readonly }) {
  useLanguage();
  const lang = getLanguage();
  const [scale, setScale] = useState('day');
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState(null);   // { id, mode, startX, start, due, dx }
  const scroller = useRef(null);
  const rows = useMemo(() => collect(map, showAll), [map, showAll]);
  const today = fmt(new Date());
  const dated = rows.filter((r) => r.start || r.due);
  const all = dated.flatMap((r) => [r.start, r.due]).filter(Boolean).sort();
  const from = addDays(all.length ? (all[0] < today ? all[0] : today) : today, -3);
  let to = addDays(all.length ? (all[all.length - 1] > today ? all[all.length - 1] : today) : today, 10);
  if (days(from, to) < 35) to = addDays(from, 35);
  const dw = SCALES[scale];
  const total = days(from, to) + 1;
  const width = total * dw;
  const x = (s) => days(from, s) * dw;
  const sel = doc.sel || [];

  const startDrag = (e, r, mode) => {
    if (readonly || !r.own) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect([r.tp.id]);
    const d = { id: r.tp.id, mode, startX: e.clientX, start: r.start, due: r.due, dx: 0 };
    setDrag(d);
    const move = (ev) => setDrag((cur) => (cur ? { ...cur, dx: Math.round((ev.clientX - cur.startX) / dw) } : cur));
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dx = Math.round((ev.clientX - d.startX) / dw);
      setDrag(null);
      if (!dx) return;
      let { start, due } = d;
      if (mode === 'move') { start = start ? addDays(start, dx) : start; due = due ? addDays(due, dx) : due; }
      else if (mode === 'start') { start = addDays(start, dx); if (due && start > due) start = due; }
      else if (mode === 'end') { due = addDays(due, dx); if (start && due < start) due = start; }
      edit((m) => setTask(m, [d.id], { start: r.milestone && !r.tp.task.start ? null : start, due }), '');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // calendar header: months on top, days (or week starts) below
  const months = [];
  const ticks = [];
  for (let i = 0; i < total; i++) {
    const d = parse(addDays(from, i));
    if (i === 0 || d.getDate() === 1) months.push({ i, label: d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'short' }) });
    if (scale === 'day' || (scale === 'week' && d.getDay() === 1) || (scale === 'month' && (d.getDate() === 1 || d.getDate() === 15))) ticks.push({ i, label: String(d.getDate()), weekend: d.getDay() === 0 || d.getDay() === 6 });
  }

  return (
    <div className="gantt-view">
      <div className="gantt-bar">
        <div className="seg">
          {Object.keys(SCALES).map((s) => <button key={s} type="button" className={`seg-btn ${scale === s ? 'on' : ''}`} onClick={() => setScale(s)}>{t(`gantt_${s}`)}</button>)}
        </div>
        <label className="check small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /><span>{t('gantt_all')}</span></label>
        <span className="spacer" />
        <button type="button" className="btn small" onClick={() => { const el = scroller.current; if (el) el.scrollLeft = Math.max(0, x(today) - el.clientWidth / 3); }}><Icon name="calendar" size={12} /> {t('gantt_today')}</button>
        <span className="muted small">{t('gantt_hint')}</span>
      </div>
      {!dated.length && !showAll ? (
        <div className="gantt-empty">
          <Icon name="gantt" size={40} />
          <p>{t('gantt_empty')}</p>
          <button type="button" className="btn" onClick={() => onAction('pane:task')}>{t('gantt_add_dates')}</button>
        </div>
      ) : (
        <div className="gantt-main">
          <div className="gantt-left">
            <div className="gantt-head-left"><span>{t('ov_topic')}</span><span>{t('task_start')}</span><span>{t('task_due')}</span><span>%</span></div>
            {rows.map((r) => (
              <div key={r.tp.id} className={`gantt-row-left ${sel.includes(r.tp.id) ? 'selected' : ''} ${r.summary ? 'summary' : ''}`} onClick={() => onSelect([r.tp.id])}>
                <span className="ellipsis" style={{ paddingLeft: 6 + r.depth * 14 }} title={r.tp.text}>{r.milestone ? '◆ ' : ''}{String(r.tp.text || '').split('\n')[0] || t('untitled_topic')}</span>
                <span>{r.start ? r.start.slice(5) : ''}</span>
                <span>{r.due ? r.due.slice(5) : ''}</span>
                <span>{r.progress != null ? r.progress : ''}</span>
              </div>
            ))}
          </div>
          <div className="gantt-right" ref={scroller}>
            <div className="gantt-canvas" style={{ width }}>
              <div className="gantt-months">{months.map((m) => <span key={m.i} style={{ left: m.i * dw }}>{m.label}</span>)}</div>
              <div className="gantt-days">{ticks.map((d) => <span key={d.i} className={d.weekend && scale === 'day' ? 'weekend' : ''} style={{ left: d.i * dw, width: scale === 'day' ? dw : undefined }}>{d.label}</span>)}</div>
              <div className="gantt-grid" style={{ backgroundSize: `${scale === 'day' ? dw : dw * 7}px 100%` }}>
                {scale === 'day' && ticks.filter((d) => d.weekend).map((d) => <span key={d.i} className="gantt-weekend" style={{ left: d.i * dw, width: dw }} />)}
                <span className="gantt-today" style={{ left: x(today) + dw / 2 }} title={t('gantt_today')} />
                {rows.map((r) => {
                  let s = r.start, e = r.due;
                  if (drag && drag.id === r.tp.id && drag.dx) {
                    if (drag.mode === 'move') { s = s ? addDays(s, drag.dx) : s; e = e ? addDays(e, drag.dx) : e; }
                    else if (drag.mode === 'start') s = addDays(s, drag.dx);
                    else if (drag.mode === 'end') e = addDays(e, drag.dx);
                  }
                  const has = s || e;
                  return (
                    <div key={r.tp.id} className={`gantt-row ${sel.includes(r.tp.id) ? 'selected' : ''}`} onClick={() => onSelect([r.tp.id])}>
                      {has && (r.milestone
                        ? <span className="gantt-milestone" style={{ left: x(e || s) + dw / 2 - 8 }} onPointerDown={(ev) => startDrag(ev, r, 'move')} title={`${r.tp.text} · ${e || s}`} />
                        : (
                          <span className={`gantt-task ${r.summary ? 'summary' : ''} ${r.progress === 100 ? 'done' : ''}`} style={{ left: x(s || e), width: Math.max(dw, (days(s || e, e || s) + 1) * dw) }}
                            onPointerDown={(ev) => startDrag(ev, r, 'move')} onDoubleClick={() => onAction('pane:task')} title={`${r.tp.text} · ${s} → ${e}`}>
                            {!r.summary && r.progress != null && <span className="gantt-progress" style={{ width: `${r.progress}%` }} />}
                            {!r.summary && <span className="gantt-handle l" onPointerDown={(ev) => startDrag(ev, r, 'start')} />}
                            {!r.summary && <span className="gantt-handle r" onPointerDown={(ev) => startDrag(ev, r, 'end')} />}
                          </span>
                        ))}
                      {has && r.tp.task && r.tp.task.resources && <span className="gantt-res" style={{ left: x(e || s) + dw + 6 }}>{r.tp.task.resources}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GanttView;
