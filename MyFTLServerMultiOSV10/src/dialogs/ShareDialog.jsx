// "공유 폴더 추가 / 편집": virtual name + folder on disk, with 찾기.
// spec: { share?: {virtualName, physicalPath}, existing: [names], pickFolder(cur) → path|null, checkFolder(path) → bool }
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { DialogFrame } from './Dialogs';

export function ShareDialog({ spec, done }) {
  useLanguage();
  const editing = !!spec.share;
  const [name, setName] = useState(spec.share ? spec.share.virtualName : '');
  const [dir, setDir] = useState(spec.share ? spec.share.physicalPath : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const browse = async () => {
    const p = await spec.pickFolder(dir);
    if (p) {
      setDir(p);
      // A sensible default name: the folder's own name.
      if (!name.trim()) setName(p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '');
    }
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    const v = name.trim().replace(/^\/+|\/+$/g, '');
    if (!v) return setError(t('err_virtual_required'));
    if (v.includes('/') || v.includes('\\')) return setError(t('err_virtual_chars'));
    if ((spec.existing || []).some((x) => x.toLowerCase() === v.toLowerCase())) return setError(t('err_virtual_dup'));
    setBusy(true);
    const ok = await spec.checkFolder(dir.trim());
    setBusy(false);
    if (!ok) return setError(t('err_physical_missing'));
    return done({ virtualName: v, physicalPath: dir.trim() });
  };

  return (
    <DialogFrame title={editing ? t('dlg_share_edit') : t('dlg_share_add')} onClose={() => done(null)} icon="folder" width={560}
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={busy}>{t('ok')}</button>
      </>}>
      <form onSubmit={submit} className="form-grid">
        <label>{t('lbl_virtual')}</label>
        <span className="row">
          <span className="muted">/</span>
          <input value={name} placeholder={t('ph_virtual')} spellCheck={false} onChange={(e) => { setName(e.target.value); setError(''); }} />
        </span>
        <label>{t('lbl_physical')}</label>
        <span className="row">
          <input value={dir} spellCheck={false} onChange={(e) => { setDir(e.target.value); setError(''); }} />
          <button type="button" className="btn compact" onClick={browse}>{t('browse')}</button>
        </span>
        {error && <><span /><span className="danger small">{error}</span></>}
        <span /><span className="muted small">{t('shares_hint')}</span>
      </form>
    </DialogFrame>
  );
}
