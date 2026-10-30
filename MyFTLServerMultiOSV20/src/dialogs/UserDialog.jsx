// "사용자 추가 / 편집": name (fixed while editing, like the original),
// password, read / write. spec: { user?, existing: [names] }
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { DialogFrame } from './Dialogs';
import { Icon } from '../components/Icons';

export function UserDialog({ spec, done }) {
  useLanguage();
  const editing = !!spec.user;
  const [name, setName] = useState(spec.user ? spec.user.username : '');
  const [pw, setPw] = useState(spec.user ? spec.user.password : '');
  const [show, setShow] = useState(false);
  const [read, setRead] = useState(spec.user ? !!spec.user.canRead : true);
  const [write, setWrite] = useState(spec.user ? !!spec.user.canWrite : true);
  const [error, setError] = useState('');

  const submit = (e) => {
    if (e) e.preventDefault();
    const v = name.trim();
    if (!v) return setError(t('err_user_required'));
    if (v.toLowerCase() === 'anonymous') return setError(t('err_user_anon'));
    if (!editing && (spec.existing || []).some((x) => x.toLowerCase() === v.toLowerCase())) return setError(t('err_user_dup'));
    if (!read && !write) return setError(t('err_perm_required'));
    return done({ username: v, password: pw, canRead: read, canWrite: write });
  };

  return (
    <DialogFrame title={editing ? t('dlg_user_edit') : t('dlg_user_add')} onClose={() => done(null)} icon={editing ? 'user' : 'userPlus'} width={440}
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <form onSubmit={submit} className="form-grid">
        <label>{t('lbl_username')}</label>
        <input value={name} readOnly={editing} spellCheck={false} autoComplete="off" onChange={(e) => { setName(e.target.value); setError(''); }} />
        <label>{t('lbl_password')}</label>
        <span className="row">
          <input type={show ? 'text' : 'password'} value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="icon-btn" title={show ? 'hide' : 'show'} onClick={() => setShow(!show)}><Icon name={show ? 'lock' : 'key'} size={14} /></button>
        </span>
        <span />
        <label className="check"><input type="checkbox" checked={read} onChange={(e) => { setRead(e.target.checked); setError(''); }} /> {t('chk_read')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={write} onChange={(e) => { setWrite(e.target.checked); setError(''); }} /> {t('chk_write')}</label>
        {error && <><span /><span className="danger small">{error}</span></>}
        <span /><span className="muted small">{t('user_note')}</span>
      </form>
    </DialogFrame>
  );
}
