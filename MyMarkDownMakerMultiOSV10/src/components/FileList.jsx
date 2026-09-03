import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconGrip, IconUp, IconDown, IconX } from './Icons';

// Checkable, reorderable list of source Markdown files.
// The whole row is NOT draggable (that interfered with checkbox clicks) — only
// the grip handle starts a drag. The checkbox + name are wrapped in a <label>
// so clicking anywhere on the name toggles the file.
export default function FileList({ files, onToggle, onCheckAll, onRemove, onRemoveChecked, onMove, onReorder, onRowContextMenu }) {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const checked = files.filter((f) => f.checked).length;

  if (!files.length) {
    return (
      <div className="empty">
        <p>{t('files.none')}</p>
        <p className="muted">{t('files.hint')}</p>
      </div>
    );
  }

  return (
    <div className="filelist">
      <div className="filelist-head">
        <span>{t('files.count', { checked, total: files.length })}</span>
        <div className="filelist-head-actions">
          <button className="link" onClick={() => onCheckAll(true)}>{t('files.checkAll')}</button>
          <button className="link" onClick={() => onCheckAll(false)}>{t('files.uncheckAll')}</button>
          <button className="link danger" disabled={!checked} onClick={() => onRemoveChecked?.()}>{t('files.removeChecked')}</button>
        </div>
      </div>
      <ul>
        {files.map((f, i) => (
          <li
            key={f.id}
            className={`filerow${dragIdx === i ? ' dragging' : ''}${overIdx === i ? ' dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
            onContextMenu={(e) => onRowContextMenu?.(e, f, i)}
          >
            <span
              className="drag-handle"
              draggable
              title={t('files.dragReorder')}
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            >
              <IconGrip size={16} />
            </span>

            <label className="filerow-main">
              <input type="checkbox" checked={f.checked} onChange={() => onToggle(f.id)} />
              <span className="filerow-name" title={f.relPath || f.name}>
                <span>{f.name}</span>
                {f.relPath && f.relPath !== f.name && <span className="filerow-path">{f.relPath}</span>}
              </span>
            </label>

            <span className="filerow-actions">
              <button className="iconbtn sm" title={t('files.moveUp')} disabled={i === 0} onClick={() => onMove(i, -1)}><IconUp size={15} /></button>
              <button className="iconbtn sm" title={t('files.moveDown')} disabled={i === files.length - 1} onClick={() => onMove(i, 1)}><IconDown size={15} /></button>
              <button className="iconbtn sm danger" title={t('files.remove')} onClick={() => onRemove(f.id)}><IconX size={15} /></button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
