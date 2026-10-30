// "공유 폴더" — the virtual name → folder table with 추가 / 편집 / 제거.
// Double-click edits; a row whose folder is missing is flagged.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export function SharesPanel({ shares, missing, locked, onAdd, onEdit, onRemove, onReveal, canReveal }) {
  useLanguage();
  const [sel, setSel] = useState(-1);
  const cur = sel >= 0 && sel < shares.length ? sel : -1;
  return (
    <section className="panel shares-panel">
      <div className="panel-head">
        <Icon name="folder" /><span className="panel-title">{t('shares')}</span>
        <span className="panel-hint ellipsis" title={t('shares_hint')}>{t('shares_hint')}</span>
        <span className="spacer" />
        <button className="tb-btn" onClick={onAdd} disabled={locked} title={t('add')}><Icon name="folderNew" size={14} /><span>{t('add')}</span></button>
        <button className="tb-btn" onClick={() => cur >= 0 && onEdit(cur)} disabled={locked || cur < 0} title={t('edit')}><Icon name="rename" size={14} /><span>{t('edit')}</span></button>
        <button className="tb-btn" onClick={() => cur >= 0 && onRemove(cur)} disabled={locked || cur < 0} title={t('remove')}><Icon name="trash" size={14} /><span>{t('remove')}</span></button>
      </div>
      <div className="table-wrap" tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'Delete' && cur >= 0 && !locked) onRemove(cur);
        if (e.key === 'ArrowDown') setSel(Math.min(shares.length - 1, cur + 1));
        if (e.key === 'ArrowUp') setSel(Math.max(0, cur - 1));
        if (e.key === 'Enter' && cur >= 0 && !locked) onEdit(cur);
      }}>
        {shares.length === 0 && <div className="panel-empty muted">{t('no_shares')}</div>}
        {shares.length > 0 && (
          <table className="file-table">
            <thead><tr><th className="c-name">{t('col_virtual')}</th><th className="c-name">{t('col_physical')}</th></tr></thead>
            <tbody>
              {shares.map((s, i) => (
                <tr key={`${s.virtualName}:${i}`} className={`${i === cur ? 'selected' : ''} ${missing.has(i) ? 'missing' : ''}`}
                  onMouseDown={() => setSel(i)} onDoubleClick={() => !locked && onEdit(i)} title={missing.has(i) ? t('share_missing') : s.physicalPath}>
                  <td className="c-name"><Icon name="folder" className="ic-folder" />/{s.virtualName}</td>
                  <td className="c-name mono">
                    {s.physicalPath}
                    {missing.has(i) && <span className="tag danger">{t('share_missing')}</span>}
                    {canReveal && !missing.has(i) && <button className="icon-btn inline" title={t('browse')} onClick={(e) => { e.stopPropagation(); onReveal(s.physicalPath); }}><Icon name="open" size={12} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default SharesPanel;
