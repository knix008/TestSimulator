// Block library browser: groups as a tree, search, previews; drag an entry
// onto the canvas (or double-click it) to add the block.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, LIBRARY, searchLibrary } from '../../core/sim/blocks/index.js';
import { newModel, makeBlock } from '../../core/sim/model.js';
import { drawPreview, themeColors } from './render';
import { SimIcon } from './icons';
import { tr, lbl } from './i18n';

export const DND_TYPE = 'application/x-sim-block';

const scratch = newModel('lib');
const previewCache = new Map();
export function previewBlock(item) {
  let b = previewCache.get(item.id);
  if (!b) {
    try { b = makeBlock(scratch, item.type, { variant: item.variant, params: item.params }); } catch { b = null; }
    previewCache.set(item.id, b);
  }
  return b;
}

function Preview({ item, colorsRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const b = previewBlock(item);
    if (b && ref.current && colorsRef.current) { try { drawPreview(ref.current, b, colorsRef.current); } catch { /* skip */ } }
  });
  return <canvas ref={ref} className="sim-lib-preview" />;
}

export function LibraryPanel({ lang, onAdd, width }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sim.lib.open') || 'null') || { sources: true }; } catch { return { sources: true }; }
  });
  const root = useRef(null);
  const colorsRef = useRef(null);
  if (!colorsRef.current && typeof document !== 'undefined') colorsRef.current = themeColors(document.documentElement);
  useEffect(() => { if (root.current) colorsRef.current = themeColors(root.current); });
  useEffect(() => { try { localStorage.setItem('sim.lib.open', JSON.stringify(open)); } catch { /* storage blocked */ } }, [open]);
  const found = useMemo(() => (q.trim() ? searchLibrary(q) : null), [q]);
  const groups = GROUPS.map((g) => ({ ...g, items: (found || LIBRARY).filter((i) => i.group === g.id) })).filter((g) => g.items.length);
  const item = (it) => (
    <div key={it.id} className="sim-lib-item" draggable title={lbl(lang, it.desc) || lbl(lang, it.label)}
      onDragStart={(e) => { e.dataTransfer.setData(DND_TYPE, it.id); e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={() => onAdd(it)}>
      <Preview item={it} colorsRef={colorsRef} />
      <span className="sim-lib-name">{lbl(lang, it.label)}</span>
    </div>
  );
  return (
    <aside ref={root} className="sim-lib" style={{ width }}>
      <div className="sim-lib-head"><SimIcon name="library" size={15} /><span>{tr(lang, 'libraryTitle')}</span></div>
      <div className="sim-lib-search">
        <SimIcon name="search" size={14} />
        <input type="text" value={q} placeholder={tr(lang, 'search')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setQ(''); }} />
        {q && <button type="button" className="sim-mini" onClick={() => setQ('')}><SimIcon name="close" size={12} /></button>}
      </div>
      <div className="sim-lib-tree">
        {!groups.length && <p className="muted sim-lib-empty">{tr(lang, 'noMatch')}</p>}
        {groups.map((g) => {
          const isOpen = !!found || !!open[g.id];
          return (
            <div key={g.id} className="sim-lib-group">
              <button type="button" className="sim-lib-ghead" onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
                <SimIcon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} />
                <SimIcon name={g.icon} size={15} />
                <span className="ellipsis">{lbl(lang, g.label)}</span>
                <span className="sim-lib-count">{g.items.length}</span>
              </button>
              {isOpen && <div className="sim-lib-items">{g.items.map(item)}</div>}
            </div>
          );
        })}
      </div>
      <div className="sim-lib-hint muted">{tr(lang, 'dragHint')}</div>
    </aside>
  );
}
