// The task pane at the right: everything about the selected topics, in tabs.
//   서식   shape, colours, border, text, line, width, how its subtopics grow
//   아이콘 priority, progress, flags, smileys, arrows, symbols, tags
//   메모   the notes (Markdown) with a preview
//   작업   task info: priority, progress, dates, effort, resources, milestone
//   링크   hyperlink, attachments, picture
//   맵     the whole map: title, layout, style, lines, colours, spacing, numbering
// Every change applies to all selected topics at once (notes: the primary one).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { IconSelect, lineWidthIcon, widthIcon, lineStyleIcon, priorityOptions } from './IconSelect';
import { ColorPicker } from './ColorPicker';
import { LAYOUT_ICONS } from './Toolbar';
import { MAP_STYLES, SHAPES, SHAPE_GROUPS, SHAPE_DEFS, LINE_STYLES, resolveMapStyle } from '../lib/mapstyles';
import { shapeOutline } from '../lib/shapes';
import { MARKER_GROUPS, markersOfGroup, markerSvgDoc, markerLabel, PROGRESS_STEPS, toggleIcon } from '../lib/markers';
import { LAYOUTS, SUB_LAYOUTS, findTopic, setStyle, clearStyle, setField, setTask, usage, allTopics, mapTitle, countTopics, addComment, removeComment, setProps } from '../lib/model';
import { renderMarkdown } from '../lib/markdown';
import { FONT_SUGGESTIONS } from '../lib/settings';

export const PANE_TABS = [
  ['format', 'brush', 'pane_format'],
  ['markers', 'marker', 'pane_markers'],
  ['notes', 'notes', 'pane_notes'],
  ['task', 'task', 'pane_task'],
  ['links', 'link', 'pane_links'],
  ['map', 'mapView', 'pane_map'],
];

const Svg = ({ html, size = 18 }) => <span className="mk-svg" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: html }} />;

// scale: drawn smaller (a menu entry's icon) with the same outline
export function ShapeIcon({ shape, scale = 1 }) {
  const w = 30, h = 18, sw = Math.round(w * scale), sh = Math.round(h * scale);
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' };
  if (shape === 'underline') return <svg width={sw} height={sh} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d="M3 15H27" {...common} strokeWidth={2} /><path d="M7 10h16" stroke="currentColor" strokeWidth="1" opacity="0.5" /></svg>;
  if (shape === 'none') return <svg width={sw} height={sh} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d="M7 10h16" stroke="currentColor" strokeWidth="1.2" opacity="0.6" /></svg>;
  // the real outline (shapes.js) in the icon's box, a square one for shapes that are
  const square = shape === 'circle' || shape === 'star' || shape === 'triangle' || shape === 'pentagon' || shape === 'octagon';
  const bw = square ? 15 : 26, bh = 15;
  return (
    <svg width={sw} height={sh} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path transform={`translate(${(w - bw) / 2} ${(h - bh) / 2})`} d={shapeOutline(shape, bw, bh, 'sub')} {...common} />
    </svg>
  );
}

function Row({ label, children, wide = false }) {
  return (
    <div className={`pane-row ${wide ? 'wide' : ''}`}>
      <label className="pane-label">{label}</label>
      <div className="pane-ctl">{children}</div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="pane-section">
      <h4 className="pane-h">{title}{right && <span className="pane-h-right">{right}</span>}</h4>
      {children}
    </section>
  );
}

const MAP_OF_SUB = { right: 'right', left: 'left', down: 'orgDown', up: 'orgUp', treeRight: 'treeRight', treeLeft: 'treeLeft' };
const SUB_OF_MAP = Object.fromEntries(Object.entries(MAP_OF_SUB).map(([k, v]) => [v, k]));

const dayDiff =(a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function FormatTab({ map, topics, edit, ms, primaryNode, clipStyle, setClipStyle }) {
  const first = topics[0];
  const st = (first && first.style) || {};
  const ids = topics.map((x) => x.id);
  const set = (patch, key) => edit((m) => setStyle(m, ids, patch), `style:${key}:${ids.join(',')}`);
  const resolved = primaryNode ? primaryNode.st : null;
  const [fontSize, setFontSize] = useState('');
  useEffect(() => { setFontSize(st.fontSize ? String(st.fontSize) : ''); }, [first && first.id, st.fontSize]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!first) return <p className="pane-empty muted">{t('pane_no_selection')}</p>;
  const toggle = (k) => set({ [k]: st[k] ? null : true }, k);
  // the central topic's subtopics are the whole map: its layout buttons set the map's layout
  const rootSel = ids.includes(map.root.id);
  const subLayout = first.id === map.root.id ? (!map.layout || map.layout === 'map' ? '' : SUB_OF_MAP[map.layout] || null) : first.layout || '';
  const pickSub = (l) => edit((m) => {
    const x = setField(m, ids.filter((id) => id !== m.root.id), 'layout', l);
    return rootSel ? { ...x, layout: l ? MAP_OF_SUB[l] : 'map' } : x;
  });   // each pick its own undo step
  return (
    <>
      <Section title={t('fmt_shape')}>
        {SHAPE_GROUPS.map((g) => (
          <React.Fragment key={g}>
            <div className="shape-group-h">{t(`shape_group_${g}`)}</div>
            <div className="shape-grid" data-group={g}>
              {SHAPES.filter((s) => SHAPE_DEFS[s].group === g).map((s) => (
                <button key={s} type="button" data-shape={s} className={`shape-btn ${(st.shape || '') === s ? 'on' : ''} ${!st.shape && resolved && resolved.shape === s ? 'auto' : ''}`} title={t(`shape_${s}`)} onClick={() => set({ shape: st.shape === s ? null : s }, 'shape')}>
                  <ShapeIcon shape={s} />
                </button>
              ))}
            </div>
          </React.Fragment>
        ))}
      </Section>
      <Section title={t('fmt_colors')}>
        <Row label={t('fmt_fill')}><ColorPicker value={st.fill || ''} allowNone onChange={(v) => set({ fill: v }, 'fill')} /></Row>
        <Row label={t('fmt_text_color')}><ColorPicker value={st.color || ''} onChange={(v) => set({ color: v }, 'color')} /></Row>
        <Row label={t('fmt_border')}>
          <ColorPicker value={st.border || ''} onChange={(v) => set({ border: v }, 'border')} />
          <IconSelect name="borderWidth" className="pane-select-sm" value={st.borderWidth != null ? String(st.borderWidth) : ''} onChange={(v) => set({ borderWidth: v === '' ? null : Number(v) }, 'bw')}
            options={[{ value: '', label: t('auto'), icon: 'refresh' }, ...[0, 1, 1.5, 2, 3, 4, 6].map((w) => ({ value: String(w), label: w === 0 ? t('fmt_no_border') : `${w}px`, iconEl: lineWidthIcon(w) }))]} />
        </Row>
        <Row label={t('fmt_line')}>
          <ColorPicker value={st.line || ''} onChange={(v) => set({ line: v }, 'line')} />
          <IconSelect name="lineWidth" className="pane-select-sm" value={st.lineWidth ? String(st.lineWidth) : ''} onChange={(v) => set({ lineWidth: v === '' ? null : Number(v) }, 'lw')}
            options={[{ value: '', label: t('auto'), icon: 'refresh' }, ...[1, 1.5, 2, 3, 4, 6].map((w) => ({ value: String(w), label: `${w}px`, iconEl: lineWidthIcon(w) }))]} />
        </Row>
      </Section>
      <Section title={t('fmt_text')}>
        <Row label={t('fmt_font')}>
          <input list="tm-fonts" value={st.font || ''} placeholder={t('auto')} onChange={(e) => set({ font: e.target.value }, 'font')} spellCheck={false} />
          <datalist id="tm-fonts">{FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
        </Row>
        <Row label={t('fmt_size')}>
          <span className="row stepper">
            <button type="button" className="icon-btn" onClick={() => set({ fontSize: Math.max(6, Math.round((st.fontSize || (resolved ? resolved.fontSize : 14)) - 1)) }, 'fs')}><Icon name="minus" size={13} /></button>
            <input type="number" min={6} max={96} value={fontSize} placeholder={resolved ? String(Math.round(resolved.fontSize)) : ''} style={{ width: 56 }}
              onChange={(e) => { setFontSize(e.target.value); const n = Number(e.target.value); if (n >= 6 && n <= 96) set({ fontSize: n }, 'fs'); else if (!e.target.value) set({ fontSize: null }, 'fs'); }} />
            <button type="button" className="icon-btn" onClick={() => set({ fontSize: Math.min(96, Math.round((st.fontSize || (resolved ? resolved.fontSize : 14)) + 1)) }, 'fs')}><Icon name="plus" size={13} /></button>
          </span>
        </Row>
        <div className="pane-btns">
          {[['bold', 'bold', 'fmt_bold'], ['italic', 'italic', 'fmt_italic'], ['underline', 'underline', 'fmt_underline'], ['strike', 'strike', 'fmt_strike']].map(([k, icon, tip]) => (
            <button key={k} type="button" className={`tool-btn ${st[k] || (k === 'bold' && st.bold == null && resolved && resolved.bold) ? 'on' : ''}`} title={t(tip)} onClick={() => (k === 'bold' ? set({ bold: !(st.bold ?? (resolved && resolved.bold)) }, 'bold') : toggle(k))}><Icon name={icon} size={16} /></button>
          ))}
          <span className="tb-sep" />
          {[['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignLeft']].map(([a, icon]) => (
            <button key={a} type="button" className={`tool-btn ${st.align === a ? 'on' : ''}`} title={t(`fmt_align_${a}`)} onClick={() => set({ align: st.align === a ? null : a }, 'align')}><Icon name={icon} size={16} style={a === 'right' ? { transform: 'scaleX(-1)' } : undefined} /></button>
          ))}
        </div>
        <Row label={t('fmt_width')}>
          <IconSelect name="width" value={st.width ? String(st.width) : ''} onChange={(v) => set({ width: v === '' ? null : Number(v) }, 'width')}
            options={[{ value: '', label: t('auto'), icon: 'refresh' }, ...[120, 160, 200, 260, 320, 400, 520].map((w) => ({ value: String(w), label: `${w}px`, iconEl: widthIcon(w, 520) }))]} />
        </Row>
      </Section>
      {/* elbow lines to the subtopics: where they turn (also the ◆ handle on the map) */}
      {primaryNode && primaryNode.trunks && (
        <Section title={t('fmt_bend')}>
          <Row label={t('fmt_bend_at')}>
            <input type="range" name="bend" min={5} max={95} step={5} value={Math.round((Number(first.bend) || 0.5) * 100)}
              onChange={(e) => { const v = Number(e.target.value) / 100; edit((m) => setField(m, ids, 'bend', v === 0.5 ? null : v), `bend:${ids.join(',')}`); }} />
            <span className="pane-num">{Math.round((Number(first.bend) || 0.5) * 100)}%</span>
          </Row>
          <div className="pane-btns">
            <button type="button" className="btn small" data-cmd="bend-reset" disabled={!topics.some((x) => x.bend)} onClick={() => edit((m) => setField(m, ids, 'bend', null), '')}><Icon name="refresh" size={13} /> {t('fmt_bend_reset')}</button>
          </div>
          <p className="muted small">{t('fmt_bend_hint')}</p>
        </Section>
      )}
      <Section title={t('fmt_sub_layout')}>
        <div className="layout-grid small">
          <button type="button" className={`layout-btn ${subLayout === '' ? 'on' : ''}`} onClick={() => pickSub('')} title={t('auto')}><Icon name="refresh" size={18} /><span>{t('auto')}</span></button>
          {SUB_LAYOUTS.map((l) => (
            <button key={l} type="button" className={`layout-btn ${subLayout === l ? 'on' : ''}`} onClick={() => pickSub(l)} title={t(`sublayout_${l}`)} data-sublayout={l}>
              <Icon name={LAYOUT_ICONS[l === 'down' ? 'orgDown' : l === 'up' ? 'orgUp' : l] || 'layoutRight'} size={18} /><span>{t(`sublayout_${l}`)}</span>
            </button>
          ))}
        </div>
      </Section>
      {/* three even columns, lined up with the subtopic layout buttons above */}
      <div className="layout-grid fmt-actions">
        <button type="button" className="layout-btn" title={t('fmt_copy_tip')} onClick={() => setClipStyle(first.style ? { ...first.style } : {})}><Icon name="copy" size={18} /><span>{t('fmt_copy')}</span></button>
        <button type="button" className="layout-btn" disabled={!clipStyle} title={t('fmt_paste_tip')} onClick={() => edit((m) => { let out = clearStyle(m, ids); if (clipStyle && Object.keys(clipStyle).length) out = setStyle(out, ids, clipStyle); return out; }, '')}><Icon name="brush" size={18} /><span>{t('fmt_paste')}</span></button>
        <button type="button" className="layout-btn" title={t('fmt_clear')} onClick={() => edit((m) => clearStyle(m, ids), '')}><Icon name="eraser" size={18} /><span>{t('fmt_clear')}</span></button>
      </div>
    </>
  );
}

function MarkersTab({ map, topics, edit, settings, onSettings }) {
  const lang = getLanguage();
  const [tag, setTag] = useState('');
  const ids = topics.map((x) => x.id);
  const first = topics[0];
  const used = useMemo(() => usage(map), [map]);
  if (!first) return <p className="pane-empty muted">{t('pane_no_selection')}</p>;
  const task = first.task || {};
  const has = (id) => (first.icons || []).includes(id);
  const toggle = (id) => {
    const on = has(id);
    edit((m) => ids.reduce((acc, tid) => {
      const tp = findTopic(acc, tid);
      const list = on ? (tp.icons || []).filter((x) => x !== id) : toggleIcon(tp.icons, id);
      return setField(acc, [tid], 'icons', list);
    }, m), '');
  };
  const allTags = [...new Set([...used.tags.keys(), ...(settings.userTags || [])])].sort();
  const addTag = (name) => {
    const g = String(name || '').trim();
    if (!g) return;
    edit((m) => ids.reduce((acc, tid) => { const tp = findTopic(acc, tid); return (tp.tags || []).includes(g) ? acc : setField(acc, [tid], 'tags', [...(tp.tags || []), g]); }, m), '');
    if (!(settings.userTags || []).includes(g)) onSettings({ userTags: [...(settings.userTags || []), g].slice(-60) });
    setTag('');
  };
  const removeTag = (g) => edit((m) => ids.reduce((acc, tid) => { const tp = findTopic(acc, tid); return setField(acc, [tid], 'tags', (tp.tags || []).filter((x) => x !== g)); }, m), '');
  return (
    <>
      <Section title={t('mk_priority')} right={task.priority ? <button type="button" className="link-btn" onClick={() => edit((m) => setTask(m, ids, { priority: null }), '')}>{t('clear')}</button> : null}>
        <div className="marker-row">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
            <button key={p} type="button" className={`marker-btn ${task.priority === p ? 'on' : ''}`} title={markerLabel(`priority-${p}`, lang)} onClick={() => edit((m) => setTask(m, ids, { priority: task.priority === p ? null : p }), '')}>
              <Svg html={markerSvgDoc(`priority-${p}`, 20)} size={20} />
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('mk_progress')} right={task.progress != null ? <button type="button" className="link-btn" onClick={() => edit((m) => setTask(m, ids, { progress: null }), '')}>{t('clear')}</button> : null}>
        <div className="marker-row">
          {PROGRESS_STEPS.map((p) => (
            <button key={p} type="button" className={`marker-btn ${task.progress === p ? 'on' : ''}`} title={markerLabel(`progress-${p}`, lang)} onClick={() => edit((m) => setTask(m, ids, { progress: task.progress === p ? null : p }), '')}>
              <Svg html={markerSvgDoc(`progress-${p}`, 20)} size={20} />
            </button>
          ))}
        </div>
      </Section>
      {MARKER_GROUPS.map((g) => (
        <Section key={g} title={t(`mk_group_${g}`)}>
          <div className={`marker-row ${g === 'symbol' ? 'wrap' : ''}`}>
            {markersOfGroup(g).map((mk) => (
              <button key={mk.id} type="button" className={`marker-btn ${has(mk.id) ? 'on' : ''}`} title={markerLabel(mk.id, lang)} onClick={() => toggle(mk.id)}>
                <Svg html={markerSvgDoc(mk.id, 20)} size={20} />
              </button>
            ))}
          </div>
        </Section>
      ))}
      <Section title={t('mk_tags')}>
        <div className="tag-list">
          {(first.tags || []).map((g) => <span key={g} className="tag-pill">{g}<button type="button" title={t('remove')} onClick={() => removeTag(g)}><Icon name="close" size={11} /></button></span>)}
          {!(first.tags || []).length && <span className="muted small">{t('mk_no_tags')}</span>}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input value={tag} list="tm-tags" placeholder={t('mk_tag_ph')} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tag); } }} />
          <datalist id="tm-tags">{allTags.map((g) => <option key={g} value={g} />)}</datalist>
          <button type="button" className="btn small" onClick={() => addTag(tag)}><Icon name="plus" size={12} /> {t('add')}</button>
        </div>
        {allTags.length > 0 && (
          <div className="tag-suggest">
            {allTags.filter((g) => !(first.tags || []).includes(g)).slice(0, 24).map((g) => <button key={g} type="button" className="tag-pill ghost" onClick={() => addTag(g)}>{g}</button>)}
          </div>
        )}
      </Section>
      <div className="pane-btns end">
        <button type="button" className="btn small" onClick={() => edit((m) => setTask(setField(m, ids, 'icons', null), ids, { priority: null, progress: null }), '')}><Icon name="eraser" size={13} /> {t('mk_clear_all')}</button>
      </div>
    </>
  );
}

function NotesTab({ topic, edit, settings, onSettings, focusSignal }) {
  const [preview, setPreview] = useState(false);
  const ref = useRef(null);
  const [text, setText] = useState(topic ? topic.notes || '' : '');
  const tid = topic ? topic.id : null;
  useEffect(() => { setText(topic ? topic.notes || '' : ''); }, [tid, topic && topic.notes]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusSignal && ref.current && !preview) ref.current.focus(); }, [focusSignal]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!topic) return <p className="pane-empty muted">{t('pane_no_selection')}</p>;
  const change = (v) => { setText(v); edit((m) => setField(m, [tid], 'notes', v), `notes:${tid}`); };
  return (
    <div className="notes-tab">
      <div className="pane-btns">
        <button type="button" className={`btn small ${!preview ? 'on' : ''}`} onClick={() => setPreview(false)}><Icon name="edit" size={12} /> {t('notes_edit')}</button>
        <button type="button" className={`btn small ${preview ? 'on' : ''}`} onClick={() => setPreview(true)}><Icon name="eye" size={12} /> {t('notes_preview')}</button>
        <span className="spacer" />
        <span className="muted small">{t('notes_md')}</span>
      </div>
      {preview
        ? <div className="notes-preview selectable" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) || `<p class="muted">${t('notes_empty')}</p>` }} />
        : <textarea ref={ref} className="notes-input" value={text} placeholder={t('notes_ph')} spellCheck={!!settings.spellCheck} onChange={(e) => change(e.target.value)} />}
      <CommentsSection topic={topic} edit={edit} settings={settings} onSettings={onSettings} />
      <PropsSection topic={topic} edit={edit} />
    </div>
  );
}

// Review comments on the topic: who, when, what. Newest last; each can be removed.
function CommentsSection({ topic, edit, settings, onSettings }) {
  const [text, setText] = useState('');
  const list = topic.comments || [];
  const author = settings.commentAuthor || '';
  const add = () => { if (!text.trim()) return; edit((m) => addComment(m, topic.id, { author, text: text.trim() })); setText(''); };
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(getLanguage() === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }); };
  return (
    <div className="comments">
      <h4 className="pane-h"><Icon name="comment" size={13} /> {t('comments')} <span className="muted small">{list.length || ''}</span></h4>
      {list.map((c) => (
        <div key={c.id} className="comment" data-comment={c.id}>
          <div className="comment-head"><b>{c.author || t('comment_anon')}</b><span className="muted small">{when(c.date)}</span>
            <button type="button" className="icon-btn" title={t('delete')} onClick={() => edit((m) => removeComment(m, topic.id, c.id))}><Icon name="trash" size={12} /></button>
          </div>
          <div className="comment-text selectable">{c.text}</div>
        </div>
      ))}
      <div className="comment-new">
        <input value={author} placeholder={t('comment_author_ph')} onChange={(e) => onSettings({ commentAuthor: e.target.value })} className="comment-author" />
        <textarea value={text} rows={2} placeholder={t('comment_ph')} spellCheck={!!settings.spellCheck} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }} />
        <button type="button" className="btn small" disabled={!text.trim()} onClick={add}><Icon name="comment" size={12} /> {t('comment_add')}</button>
      </div>
    </div>
  );
}

// Custom properties (key = value rows) of the topic.
function PropsSection({ topic, edit }) {
  const rows = topic.props || [];
  const [draft, setDraft] = useState({ key: '', value: '' });
  const save = (next) => edit((m) => setProps(m, topic.id, next), `props:${topic.id}`);
  return (
    <div className="props">
      <h4 className="pane-h"><Icon name="list" size={13} /> {t('props')}</h4>
      <div className="props-grid">
        {rows.map((p, i) => (
          <React.Fragment key={i}>
            <input value={p.key} onChange={(e) => save(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} />
            <input value={p.value} onChange={(e) => save(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
            <button type="button" className="icon-btn" title={t('delete')} onClick={() => save(rows.filter((_, j) => j !== i))}><Icon name="trash" size={12} /></button>
          </React.Fragment>
        ))}
        <input value={draft.key} placeholder={t('prop_key_ph')} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
        <input value={draft.value} placeholder={t('prop_value_ph')} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.key.trim()) { save([...rows, draft]); setDraft({ key: '', value: '' }); } }} />
        <button type="button" className="icon-btn" title={t('prop_add')} disabled={!draft.key.trim()} onClick={() => { save([...rows, draft]); setDraft({ key: '', value: '' }); }}><Icon name="plus" size={12} /></button>
      </div>
    </div>
  );
}

function TaskTab({ topics, edit }) {
  const first = topics[0];
  if (!first) return <p className="pane-empty muted">{t('pane_no_selection')}</p>;
  const ids = topics.map((x) => x.id);
  const task = first.task || {};
  const set = (patch, key = '') => edit((m) => setTask(m, ids, patch), key ? `task:${key}` : '');
  const duration = task.start && task.due ? dayDiff(task.start, task.due) + 1 : '';
  return (
    <>
      <Section title={t('task_schedule')}>
        <Row label={t('task_start')}>
          <input type="date" value={task.start || ''} onChange={(e) => set({ start: e.target.value })} />
          <button type="button" className="icon-btn" title={t('task_today')} onClick={() => set({ start: today() })}><Icon name="calendar" size={14} /></button>
        </Row>
        <Row label={t('task_due')}>
          <input type="date" value={task.due || ''} min={task.start || undefined} onChange={(e) => set({ due: e.target.value })} />
          <button type="button" className="icon-btn" title={t('task_week')} onClick={() => set({ due: addDays(task.start || today(), 6) })}><Icon name="plus" size={14} /></button>
        </Row>
        <Row label={t('task_duration')}>
          <input type="number" min={1} value={duration} disabled={!task.start} placeholder={t('days')} style={{ width: 80 }} onChange={(e) => { const n = Number(e.target.value); if (task.start && n >= 1) set({ due: addDays(task.start, n - 1) }, 'dur'); }} />
          <span className="muted small">{t('days')}</span>
        </Row>
        <Row label=""><label className="check"><input type="checkbox" checked={!!task.milestone} onChange={(e) => set({ milestone: e.target.checked || null })} /><span>{t('task_milestone')}</span></label></Row>
      </Section>
      <Section title={t('task_work')}>
        <Row label={t('mk_priority')}>
          <IconSelect name="priority" value={task.priority || ''} options={priorityOptions(t('none'))} onChange={(v) => set({ priority: v ? Number(v) : null })} />
        </Row>
        <Row label={t('mk_progress')}>
          <input type="range" min={0} max={100} step={5} value={task.progress ?? 0} onChange={(e) => set({ progress: Number(e.target.value) }, 'progress')} />
          <span className="pane-num">{task.progress != null ? `${task.progress}%` : '—'}</span>
        </Row>
        <Row label={t('task_effort')}>
          <input type="number" min={0} step={0.5} value={task.effort || ''} style={{ width: 80 }} onChange={(e) => set({ effort: e.target.value ? Number(e.target.value) : null }, 'effort')} />
          <span className="muted small">{t('hours')}</span>
        </Row>
        <Row label={t('task_resources')}>
          <input value={task.resources || ''} placeholder={t('task_resources_ph')} onChange={(e) => set({ resources: e.target.value }, 'res')} />
        </Row>
      </Section>
      <div className="pane-btns end">
        <button type="button" className="btn small" onClick={() => edit((m) => setField(m, ids, 'task', null), '')}><Icon name="eraser" size={13} /> {t('task_clear')}</button>
      </div>
    </>
  );
}

function LinksTab({ map, topics, edit, onAction }) {
  const first = topics[0];
  const [url, setUrl] = useState(first && first.link ? first.link.url : '');
  const fid = first ? first.id : null;
  useEffect(() => { setUrl(first && first.link ? first.link.url : ''); }, [fid, first && first.link]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!first) return <p className="pane-empty muted">{t('pane_no_selection')}</p>;
  const ids = topics.map((x) => x.id);
  const topicLink = /^topic:/.test(url) ? url.slice(6) : '';
  const others = allTopics(map).filter((x) => x.id !== first.id && x.text).slice(0, 500);
  const img = first.image;
  return (
    <>
      <Section title={t('link_hyperlink')}>
        <div className="row">
          <input value={url} placeholder="https://… · C:\… · topic" onChange={(e) => setUrl(e.target.value)}
            onBlur={() => edit((m) => setField(m, ids, 'link', url.trim() ? { url: url.trim() } : null), '')}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} spellCheck={false} />
        </div>
        <div className="pane-btns">
          <button type="button" className="btn small" disabled={!first.link} onClick={() => onAction('openLink', first.id)}><Icon name="open" size={12} /> {t('link_open')}</button>
          <button type="button" className="btn small" onClick={() => onAction('linkFile', first.id)}><Icon name="fileOpen" size={12} /> {t('link_file')}</button>
          <button type="button" className="btn small" disabled={!first.link} onClick={() => { setUrl(''); edit((m) => setField(m, ids, 'link', null), ''); }}><Icon name="close" size={12} /> {t('remove')}</button>
        </div>
        <Row label={t('link_topic')}>
          <IconSelect name="topicLink" value={topicLink} icon="goTo" onChange={(id) => { const v = id ? `topic:${id}` : ''; setUrl(v); edit((m) => setField(m, ids, 'link', v ? { url: v } : null), ''); }}
            options={[{ value: '', label: t('none'), icon: 'close' }, ...others.map((o) => ({ value: o.id, label: String(o.text).split('\n')[0].slice(0, 60) }))]} />
        </Row>
      </Section>
      <Section title={t('link_attachments')}>
        {(first.attachments || []).length ? (
          <ul className="attach-list">
            {first.attachments.map((a, i) => (
              <li key={`${a.path}${i}`} className="attach-item" title={a.path}>
                <Icon name="attachment" size={13} />
                <span className="ellipsis">{a.name}</span>
                <button type="button" className="icon-btn" title={t('link_open')} onClick={() => onAction('openAttachment', a.path)}><Icon name="open" size={13} /></button>
                <button type="button" className="icon-btn" title={t('reveal')} onClick={() => onAction('revealAttachment', a.path)}><Icon name="explorer" size={13} /></button>
                <button type="button" className="icon-btn" title={t('remove')} onClick={() => edit((m) => setField(m, [first.id], 'attachments', first.attachments.filter((_, j) => j !== i)), '')}><Icon name="close" size={13} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">{t('link_no_attachments')}</p>}
        <button type="button" className="btn small" onClick={() => onAction('addAttachment', first.id)}><Icon name="plus" size={12} /> {t('link_add_attachment')}</button>
      </Section>
      <Section title={t('link_image')}>
        {img ? (
          <>
            <div className="image-box"><img src={img.src} alt="" /></div>
            <Row label={t('link_image_width')}>
              <input type="range" min={40} max={480} step={10} value={Math.round(Math.min(480, img.w || 160))} onChange={(e) => { const w = Number(e.target.value); edit((m) => setField(m, [first.id], 'image', { ...img, h: Math.round((img.h || 120) * (w / (img.w || 160))), w }), `img:${first.id}`); }} />
              <span className="pane-num">{Math.round(img.w || 160)}px</span>
            </Row>
          </>
        ) : <p className="muted small">{t('link_no_image')}</p>}
        <div className="pane-btns">
          <button type="button" className="btn small" onClick={() => onAction('imageFile', first.id)}><Icon name="image" size={12} /> {t('link_image_file')}</button>
          <button type="button" className="btn small" onClick={() => onAction('imagePaste', first.id)}><Icon name="paste" size={12} /> {t('link_image_paste')}</button>
          <button type="button" className="btn small" disabled={!img} onClick={() => edit((m) => setField(m, [first.id], 'image', null), '')}><Icon name="close" size={12} /> {t('remove')}</button>
        </div>
      </Section>
    </>
  );
}

function MapTab({ map, edit, onAction }) {
  const lang = getLanguage();
  const set = (patch, key = '') => edit((m) => ({ ...m, ...patch }), key ? `map:${key}` : '');
  const stats = useMemo(() => {
    const all = allTopics(map);
    return { topics: countTopics(map), notes: all.filter((x) => x.notes).length, tasks: all.filter((x) => x.task).length, done: all.filter((x) => x.task && x.task.progress === 100).length, rels: (map.relationships || []).length, floating: (map.floating || []).length };
  }, [map]);
  const [title, setTitle] = useState(map.title || '');
  useEffect(() => { setTitle(map.title || ''); }, [map.title]);
  return (
    <>
      <Section title={t('map_title_label')}>
        <input value={title} placeholder={mapTitle({ ...map, title: '' })} onChange={(e) => { setTitle(e.target.value); set({ title: e.target.value }, 'title'); }} />
      </Section>
      <Section title={t('map_layout')}>
        <div className="layout-grid">
          {LAYOUTS.map((l) => (
            <button key={l} type="button" className={`layout-btn ${map.layout === l ? 'on' : ''}`} title={t(`layout_${l}`)} onClick={() => onAction(`layout:${l}`)}>
              <Icon name={LAYOUT_ICONS[l]} size={22} /><span>{t(`layout_${l}`)}</span>
            </button>
          ))}
        </div>
        {map.layout === 'map' && <button type="button" className="btn small" style={{ marginTop: 6 }} onClick={() => onAction('balance')}><Icon name="balance" size={12} /> {t('map_balance')}</button>}
      </Section>
      <Section title={t('map_style')}>
        <div className="style-grid">
          {MAP_STYLES.map((s) => {
            const r = resolveMapStyle({ ...map, style: s.id, background: '', lineStyle: '', branchColors: null }, s.auto ? undefined : {});
            const branch = r.branch || [r.line.color];
            return (
              <button key={s.id} type="button" className={`style-card ${(map.style || 'auto') === s.id ? 'on' : ''}`} title={s.label[lang === 'ko' ? 0 : 1]} onClick={() => onAction(`style:${s.id}`)} style={{ background: s.auto ? 'var(--bg)' : r.bg }}>
                <svg width="84" height="40" viewBox="0 0 84 40" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => <path key={i} d={`M42 20 C ${i < 2 ? 58 : 26} 20, ${i < 2 ? 58 : 26} ${i % 2 ? 31 : 9}, ${i < 2 ? 66 : 18} ${i % 2 ? 31 : 9}`} stroke={s.auto ? 'var(--accent)' : branch[i % branch.length]} strokeWidth="2" fill="none" />)}
                  <rect x="30" y="13" width="24" height="14" rx="5" fill={s.auto ? 'var(--accent)' : r.root.fill} stroke={s.auto ? 'none' : r.root.border} strokeWidth={r.root.borderWidth ? 1 : 0} />
                  {[0, 1, 2, 3].map((i) => <rect key={i} x={i < 2 ? 64 : 4} y={i % 2 ? 27 : 5} width="16" height="8" rx="3" fill={s.auto ? 'var(--bg-elev)' : r.main.fill === '$branch' ? branch[i % branch.length] : r.main.fill === '$tint' || r.main.fill === 'none' ? r.bg : r.main.fill} stroke={s.auto ? 'var(--accent)' : r.main.border === '$branch' ? branch[i % branch.length] : r.main.border} strokeWidth="1" />)}
                </svg>
                <span className="style-name" style={{ color: s.auto ? 'var(--fg)' : r.dark ? '#f2f5f9' : '#1f2933' }}>{s.label[lang === 'ko' ? 0 : 1]}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={t('map_lines')}>
        <Row label={t('map_line_style')}>
          <IconSelect name="lineStyle" value={map.lineStyle || ''} onChange={(v) => set({ lineStyle: v })}
            options={[{ value: '', label: t('map_by_style'), icon: 'mapStyle' }, ...LINE_STYLES.map((s) => ({ value: s, label: t(`line_${s}`), iconEl: lineStyleIcon(s) }))]} />
        </Row>
        <Row label={t('map_branch_colors')}>
          <IconSelect name="branchColors" value={map.branchColors == null ? '' : map.branchColors ? 'on' : 'off'} onChange={(v) => set({ branchColors: v === '' ? null : v === 'on' })}
            options={[{ value: '', label: t('map_by_style'), icon: 'mapStyle' }, { value: 'on', label: t('on'), icon: 'palette' }, { value: 'off', label: t('off'), icon: 'circle' }]} />
        </Row>
        <Row label={t('map_background')}><ColorPicker value={map.background || ''} autoLabel={t('map_by_style')} onChange={(v) => set({ background: v }, 'bg')} /></Row>
      </Section>
      <Section title={t('map_spacing')}>
        <Row label={t('map_spacing_h')}>
          <input type="range" min={0.5} max={2.5} step={0.1} value={(map.spacing && map.spacing.h) || 1} onChange={(e) => set({ spacing: { ...(map.spacing || {}), h: Number(e.target.value) } }, 'sh')} />
          <span className="pane-num">{Math.round(((map.spacing && map.spacing.h) || 1) * 100)}%</span>
        </Row>
        <Row label={t('map_spacing_v')}>
          <input type="range" min={0.5} max={2.5} step={0.1} value={(map.spacing && map.spacing.v) || 1} onChange={(e) => set({ spacing: { ...(map.spacing || {}), v: Number(e.target.value) } }, 'sv')} />
          <span className="pane-num">{Math.round(((map.spacing && map.spacing.v) || 1) * 100)}%</span>
        </Row>
      </Section>
      <Section title={t('map_numbering')}>
        <label className="check"><input type="checkbox" checked={!!(map.numbering && map.numbering.enabled)} onChange={(e) => set({ numbering: { ...(map.numbering || {}), enabled: e.target.checked } })} /><span>{t('map_numbering_on')}</span></label>
        <Row label={t('map_numbering_style')}>
          <IconSelect name="numberingStyle" value={(map.numbering && map.numbering.style) || 'decimal'} onChange={(v) => set({ numbering: { ...(map.numbering || {}), style: v } })}
            options={[{ value: 'decimal', label: '1. 1.1. 1.1.1.', icon: 'listOrdered' }, { value: 'roman', label: 'I. I.A. I.A.1.', icon: 'numbering' }]} />
          <IconSelect name="numberingDepth" className="pane-select-sm" value={(map.numbering && map.numbering.depth) || 3} icon="listTree" onChange={(v) => set({ numbering: { ...(map.numbering || {}), depth: Number(v) } })}
            options={[1, 2, 3, 4, 5].map((d) => ({ value: d, label: t('map_numbering_depth', { n: d }) }))} />
        </Row>
      </Section>
      <Section title={t('map_stats')}>
        <div className="stats-grid">
          <span>{t('stat_topics')}</span><b>{stats.topics}</b>
          <span>{t('stat_notes')}</span><b>{stats.notes}</b>
          <span>{t('stat_tasks')}</span><b>{stats.done}/{stats.tasks}</b>
          <span>{t('stat_rels')}</span><b>{stats.rels}</b>
          <span>{t('stat_floating')}</span><b>{stats.floating}</b>
        </div>
      </Section>
    </>
  );
}

export function TaskPane({ doc, map, L, ms, settings, onSettings, edit, onAction, tab, onTab, notesFocus }) {
  useLanguage();
  const [clipStyle, setClipStyle] = useState(null);
  const topics = (doc ? doc.sel : []).map((id) => findTopic(map, id)).filter(Boolean);
  const primary = topics.length ? topics[topics.length - 1] : null;
  const primaryNode = primary && L ? L.nodes.get(primary.id) : null;
  const ordered = primary ? [primary, ...topics.filter((x) => x !== primary)] : topics;
  return (
    <aside className="task-pane" style={{ width: `var(--panel-w, ${settings.panelWidth}px)` }}>
      <div className="pane-tabs" role="tablist">
        {PANE_TABS.map(([id, icon, label]) => (
          <button key={id} type="button" role="tab" data-pane={id} className={`pane-tab ${tab === id ? 'active' : ''}`} title={t(label)} aria-selected={tab === id ? 'true' : 'false'} onClick={() => onTab(id)}>
            <Icon name={icon} size={15} /><span>{t(label)}</span>
          </button>
        ))}
        <button type="button" className="icon-btn pane-close" data-cmd="collapse-right" title={t('tip_panel_toggle')} onClick={() => onAction('toggle:panelVisible')}><Icon name="chevronRight" size={14} /></button>
      </div>
      <div className="pane-body">
        {!doc ? <p className="pane-empty muted">{t('pane_no_doc')}</p> : (
          <>
            {tab === 'format' && <FormatTab map={map} topics={ordered} edit={edit} ms={ms} primaryNode={primaryNode} clipStyle={clipStyle} setClipStyle={setClipStyle} />}
            {tab === 'markers' && <MarkersTab map={map} topics={ordered} edit={edit} settings={settings} onSettings={onSettings} />}
            {tab === 'notes' && <NotesTab topic={primary} edit={edit} settings={settings} onSettings={onSettings} focusSignal={notesFocus} />}
            {tab === 'task' && <TaskTab topics={ordered} edit={edit} />}
            {tab === 'links' && <LinksTab map={map} topics={ordered} edit={edit} onAction={onAction} />}
            {tab === 'map' && <MapTab map={map} edit={edit} onAction={onAction} />}
          </>
        )}
      </div>
    </aside>
  );
}

export default TaskPane;
