// The Kanban board (보기 › 칸반 보드): every main topic is a column and its
// subtopics are the cards. Drag a card onto another column (or between two
// cards) to move the topic there — it is the same move as on the map, so it
// can be undone. A card shows the topic's priority, progress, due date,
// resources and how many subtopics it has. "+" at a column's foot adds a card.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { markerSvgDoc } from '../lib/markers';
import { makeTopic, addChild } from '../lib/model';
import { cmdMove } from '../lib/commands';

const firstLine = (s) => String(s || '').split('\n')[0];
const Svg = ({ html }) => <span className="mk-svg" style={{ width: 14, height: 14 }} dangerouslySetInnerHTML={{ __html: html }} />;

export function KanbanView({ doc, map, ms, edit, onSelect, readonly }) {
  useLanguage();
  const [drag, setDrag] = useState(null);     // { id }
  const [over, setOver] = useState(null);     // { col, before } — before: card id or null (end of column)
  const [adding, setAdding] = useState(null); // column id
  const [text, setText] = useState('');
  const sel = doc.sel || [];
  const cols = map.root.children || [];

  const drop = () => {
    if (!drag || !over) return;
    const r = over.before
      ? edit((m) => cmdMove(m, [drag.id], over.before, 'before'))
      : edit((m) => cmdMove(m, [drag.id], over.col, 'child'));
    if (r) onSelect([drag.id]);
    setDrag(null);
    setOver(null);
  };
  const addCard = (colId) => {
    const v = text.trim();
    if (v) edit((m) => { const r = addChild(m, colId, makeTopic(v)); return { map: r.map, sel: [r.id] }; });
    setText('');
    setAdding(null);
  };
  const addColumn = () => edit((m) => { const r = addChild(m, m.root.id, makeTopic(t('kanban_new_column'))); return { map: r.map, sel: [r.id] }; });

  return (
    <div className="kanban" data-view="kanban">
      <div className="kanban-head">
        <Icon name="kanban" size={16} /><b>{firstLine(map.root.text)}</b>
        <span className="muted small">{t('kanban_hint')}</span>
      </div>
      <div className="kanban-board">
        {cols.map((col, ci) => {
          const cards = col.children || [];
          const done = cards.filter((c) => c.task && c.task.progress === 100).length;
          return (
            <section key={col.id} className={`kanban-col ${over && over.col === col.id && !over.before ? 'over' : ''}`} data-col={col.id}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (!over || over.col !== col.id || over.before) setOver({ col: col.id, before: null }); }}
              onDrop={(e) => { e.preventDefault(); drop(); }}>
              <header className={`kanban-col-head ${sel.includes(col.id) ? 'active' : ''}`} style={{ '--col': (ms && ms.branch && ms.branch[ci % ms.branch.length]) || 'var(--accent)' }} onClick={() => onSelect([col.id])}>
                <span className="kanban-dot" />
                <b className="ellipsis">{firstLine(col.text) || t('untitled_topic')}</b>
                <span className="kanban-count">{done ? `${done}/` : ''}{cards.length}</span>
              </header>
              <div className="kanban-cards">
                {cards.map((c) => {
                  const task = c.task || {};
                  return (
                    <article key={c.id} className={`kanban-card ${sel.includes(c.id) ? 'active' : ''} ${drag && drag.id === c.id ? 'dragging' : ''} ${over && over.before === c.id ? 'drop-before' : ''}`}
                      data-card={c.id} draggable={!readonly}
                      onDragStart={(e) => { setDrag({ id: c.id }); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.text || ''); } catch { /* some hosts refuse */ } }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onDragOver={(e) => { if (!drag || drag.id === c.id) return; e.preventDefault(); e.stopPropagation(); if (!over || over.before !== c.id) setOver({ col: col.id, before: c.id }); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(); }}
                      onClick={() => onSelect([c.id])}>
                      <div className="kanban-card-text">{firstLine(c.text) || <span className="muted">{t('untitled_topic')}</span>}</div>
                      <div className="kanban-card-meta">
                        {task.priority ? <Svg html={markerSvgDoc(`priority-${task.priority}`, 14)} /> : null}
                        {task.progress != null ? <span className="kanban-progress"><span style={{ width: `${task.progress}%` }} /></span> : null}
                        {task.due ? <span className="muted small"><Icon name="calendar" size={11} /> {task.due.slice(5)}</span> : null}
                        {task.resources ? <span className="muted small"><Icon name="people" size={11} /> {String(task.resources)}</span> : null}
                        {(c.children || []).length ? <span className="muted small"><Icon name="listTree" size={11} /> {c.children.length}</span> : null}
                        {c.notes ? <Icon name="notes" size={11} className="muted" /> : null}
                        {(c.comments || []).length ? <span className="muted small"><Icon name="comment" size={11} /> {c.comments.length}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!readonly && (adding === col.id ? (
                <div className="kanban-add">
                  <input autoFocus value={text} placeholder={t('kanban_card_ph')} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addCard(col.id); else if (e.key === 'Escape') { setAdding(null); setText(''); } }} onBlur={() => addCard(col.id)} />
                </div>
              ) : (
                <button type="button" className="kanban-add-btn" data-add={col.id} onClick={() => { setAdding(col.id); setText(''); }}><Icon name="plus" size={13} /> {t('kanban_add_card')}</button>
              ))}
            </section>
          );
        })}
        {!readonly && (
          <button type="button" className="kanban-col kanban-new-col" onClick={addColumn}><Icon name="plus" size={14} /> {t('kanban_add_column')}</button>
        )}
      </div>
    </div>
  );
}

export default KanbanView;
