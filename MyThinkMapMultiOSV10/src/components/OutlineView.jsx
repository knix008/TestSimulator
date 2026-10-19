// The outline view (보기 › 개요): the map as an editable list with task
// columns. Enter adds a topic below, Tab / Shift+Tab indent and outdent,
// Alt+↑ / Alt+↓ move a topic among its siblings, ↑ / ↓ go to the row above /
// below, Backspace on an empty topic deletes it, Ctrl+Space folds. Folding is
// the map's own, so the map view shows the same branches open.
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { topicMarkers, markerSvgDoc } from '../lib/markers';
import { setText, addSibling, addChild, makeTopic, indentTopic, outdentTopic, shiftTopic, removeTopics, setCollapsed, setTask } from '../lib/model';

function rowsOf(map) {
  const rows = [];
  const walk = (tp, depth, kind) => {
    rows.push({ tp, depth, kind });
    if (!tp.collapsed) (tp.children || []).forEach((c) => walk(c, depth + 1, 'child'));
  };
  walk(map.root, 0, 'root');
  for (const f of map.floating || []) walk(f, 0, 'floating');
  return rows;
}

function AutoText({ value, onChange, onKeyDown, onFocus, inputRef, spellCheck, className }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return (
    <textarea ref={(el) => { ref.current = el; if (inputRef) inputRef(el); }} className={className} rows={1} value={value} spellCheck={spellCheck}
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onFocus={onFocus} />
  );
}

export function OutlineView({ doc, map, settings, edit, onSelect, readonly }) {
  useLanguage();
  const rows = rowsOf(map);
  const inputs = useRef(new Map());
  const pendingFocus = useRef(null);
  const sel = doc.sel || [];

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = inputs.current.get(id);
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); pendingFocus.current = null; }
  });

  const focusRow = (i) => { const r = rows[Math.max(0, Math.min(rows.length - 1, i))]; if (r) { const el = inputs.current.get(r.tp.id); if (el) el.focus(); } };

  const onKey = (e, row, i) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const id = row.tp.id;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (readonly) return;
      const topic = makeTopic('');
      edit((m) => (row.kind === 'root' ? addChild(m, id, topic, 0).map : addSibling(m, id, topic).map), '', [topic.id]);
      pendingFocus.current = topic.id;
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (readonly) return;
      edit((m) => (e.shiftKey ? outdentTopic(m, id) : indentTopic(m, id)), '', [id]);
      pendingFocus.current = id;
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (readonly) return;
      edit((m) => shiftTopic(m, id, e.key === 'ArrowUp' ? -1 : 1), '', [id]);
      pendingFocus.current = id;
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const el = e.currentTarget;
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd = el.selectionStart === el.value.length;
      if ((e.key === 'ArrowUp' && (atStart || !el.value.slice(0, el.selectionStart).includes('\n'))) || (e.key === 'ArrowDown' && (atEnd || !el.value.slice(el.selectionEnd).includes('\n')))) {
        e.preventDefault();
        focusRow(i + (e.key === 'ArrowUp' ? -1 : 1));
      }
      return;
    }
    if (e.key === 'Backspace' && !row.tp.text && row.kind !== 'root' && !(row.tp.children || []).length) {
      e.preventDefault();
      if (readonly) return;
      const prev = rows[i - 1];
      edit((m) => removeTopics(m, [id]).map, '', prev ? [prev.tp.id] : undefined);
      if (prev) pendingFocus.current = prev.tp.id;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === ' ' || e.code === 'Space')) {
      e.preventDefault();
      edit((m) => setCollapsed(m, [id], !row.tp.collapsed), '');
    }
  };

  return (
    <div className="outline-view">
      <div className="ov-head">
        <span className="ov-c-topic">{t('ov_topic')}</span>
        <span className="ov-c-pri">{t('ov_priority')}</span>
        <span className="ov-c-prog">{t('ov_progress')}</span>
        <span className="ov-c-date">{t('task_start')}</span>
        <span className="ov-c-date">{t('task_due')}</span>
        <span className="ov-c-res">{t('task_resources')}</span>
      </div>
      <div className="ov-body">
        {rows.map((row, i) => {
          const { tp, depth, kind } = row;
          const task = tp.task || {};
          const kids = (tp.children || []).length;
          const marks = topicMarkers(tp).filter((m) => !/^(priority|progress)-/.test(m));
          return (
            <div key={tp.id} className={`ov-row ${sel.includes(tp.id) ? 'selected' : ''} ${kind}`} data-id={tp.id}>
              <span className="ov-c-topic" style={{ paddingLeft: 6 + depth * 20 }}>
                <button type="button" className="ov-fold" disabled={!kids} onClick={() => edit((m) => setCollapsed(m, [tp.id], !tp.collapsed), '')} title={tp.collapsed ? t('expand') : t('collapse')}>
                  {kids ? <Icon name={tp.collapsed ? 'chevronRight' : 'chevronDown'} size={12} /> : <Icon name="dot" size={8} className="muted" />}
                </button>
                {kind === 'floating' && <Icon name="floating" size={13} className="muted" />}
                {marks.slice(0, 3).map((mk) => <span key={mk} className="mk-svg" style={{ width: 15, height: 15 }} dangerouslySetInnerHTML={{ __html: markerSvgDoc(mk, 15) }} />)}
                <AutoText className={`ov-text ${kind === 'root' ? 'root' : depth === 1 ? 'main' : ''}`} value={tp.text || ''} spellCheck={!!settings.spellCheck}
                  inputRef={(el) => { if (el) inputs.current.set(tp.id, el); else inputs.current.delete(tp.id); }}
                  onFocus={() => { if (!sel.includes(tp.id) || sel.length > 1) onSelect([tp.id]); }}
                  onChange={(v) => { if (!readonly) edit((m) => setText(m, tp.id, v), `text:${tp.id}`); }}
                  onKeyDown={(e) => onKey(e, row, i)} />
                {tp.notes && <Icon name="notes" size={12} className="muted" />}
                {tp.collapsed && kids > 0 && <span className="tree-count">{kids}</span>}
              </span>
              <span className="ov-c-pri">
                <select value={task.priority || ''} disabled={readonly} onChange={(e) => edit((m) => setTask(m, [tp.id], { priority: e.target.value ? Number(e.target.value) : null }), '')}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </span>
              <span className="ov-c-prog">
                <select value={task.progress ?? ''} disabled={readonly} onChange={(e) => edit((m) => setTask(m, [tp.id], { progress: e.target.value === '' ? null : Number(e.target.value) }), '')}>
                  <option value="">—</option>
                  {[0, 25, 50, 75, 100].concat(task.progress != null && ![0, 25, 50, 75, 100].includes(task.progress) ? [task.progress] : []).map((p) => <option key={p} value={p}>{`${p}%`}</option>)}
                </select>
              </span>
              <span className="ov-c-date"><input type="date" value={task.start || ''} disabled={readonly} onChange={(e) => edit((m) => setTask(m, [tp.id], { start: e.target.value }), '')} /></span>
              <span className="ov-c-date"><input type="date" value={task.due || ''} disabled={readonly} onChange={(e) => edit((m) => setTask(m, [tp.id], { due: e.target.value }), '')} /></span>
              <span className="ov-c-res"><input value={task.resources || ''} disabled={readonly} onChange={(e) => edit((m) => setTask(m, [tp.id], { resources: e.target.value }), `res:${tp.id}`)} /></span>
            </div>
          );
        })}
      </div>
      <div className="ov-foot muted small">{t('ov_hint')}</div>
    </div>
  );
}

export default OutlineView;
