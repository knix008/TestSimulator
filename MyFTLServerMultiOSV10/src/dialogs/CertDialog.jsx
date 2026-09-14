// "FTPS 자체 서명 SSL 인증서 생성": CN, validity, key size, save path.
// spec: { hostname, defaultPath, pickSavePath(cur) → path|null }
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { DialogFrame } from './Dialogs';

export function CertDialog({ spec, done }) {
  useLanguage();
  const [cn, setCn] = useState(spec.hostname || 'localhost');
  const [years, setYears] = useState(5);
  const [bits, setBits] = useState(2048);
  const [path, setPath] = useState(spec.defaultPath || '');
  const [error, setError] = useState('');

  const submit = (e) => {
    if (e) e.preventDefault();
    if (!cn.trim()) return setError(t('err_cn_required'));
    if (!path.trim()) return setError(t('err_path_required'));
    return done({ commonName: cn.trim(), validityYears: Math.max(1, Math.min(30, Number(years) || 5)), bits, path: path.trim() });
  };

  return (
    <DialogFrame title={t('dlg_cert_gen')} onClose={() => done(null)} icon="lock" width={560}
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('generate')}</button>
      </>}>
      <form onSubmit={submit} className="form-grid">
        <label title={t('tip_cn')}>{t('lbl_cn')}</label>
        <input value={cn} spellCheck={false} onChange={(e) => { setCn(e.target.value); setError(''); }} title={t('tip_cn')} />
        <label>{t('lbl_years')}</label>
        <input type="number" min={1} max={30} value={years} style={{ width: 100 }} onChange={(e) => setYears(e.target.value)} />
        <label>{t('lbl_bits')}</label>
        <select value={bits} style={{ width: 140 }} onChange={(e) => setBits(Number(e.target.value))}>
          <option value={2048}>RSA 2048</option>
          <option value={4096}>RSA 4096</option>
        </select>
        <label>{t('lbl_save_path')}</label>
        <span className="row">
          <input value={path} spellCheck={false} onChange={(e) => { setPath(e.target.value); setError(''); }} />
          {spec.pickSavePath && <button type="button" className="btn compact" onClick={async () => { const p = await spec.pickSavePath(path); if (p) setPath(p); }}>{t('browse')}</button>}
        </span>
        {error && <><span /><span className="danger small">{error}</span></>}
        <span /><span className="muted small">{t('tip_cert_generate')} {t('ph_cert_key')}</span>
      </form>
    </DialogFrame>
  );
}
