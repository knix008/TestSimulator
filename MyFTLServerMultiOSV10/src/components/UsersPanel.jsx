// "인증" — the anonymous switch and the user table (name · masked password ·
// rights) with 추가 / 편집 / 삭제; double-click edits, like the original.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { permSummary } from '../lib/format';
import { Icon } from './Icons';

export function UsersPanel({ settings, onChange, locked, onAdd, onEdit, onRemove }) {
  useLanguage();
  const [sel, setSel] = useState(-1);
  const users = settings.users;
  const cur = sel >= 0 && sel < users.length ? sel : -1;
  return (
    <section className="panel users-panel">
      <div className="panel-head">
        <Icon name="users" /><span className="panel-title">{t('auth')}</span>
        <span className="spacer" />
        <button className="tb-btn" onClick={onAdd} disabled={locked}><Icon name="userPlus" size={14} /><span>{t('add')}</span></button>
        <button className="tb-btn" onClick={() => cur >= 0 && onEdit(cur)} disabled={locked || cur < 0}><Icon name="rename" size={14} /><span>{t('edit')}</span></button>
        <button className="tb-btn" onClick={() => cur >= 0 && onRemove(cur)} disabled={locked || cur < 0}><Icon name="trash" size={14} /><span>{t('remove')}</span></button>
      </div>
      <div className="panel-sub">
        <label className="check" title={t('tip_anonymous')}>
          <input type="checkbox" checked={!!settings.allowAnonymous} disabled={locked} onChange={(e) => onChange({ allowAnonymous: e.target.checked })} />
          <span>{t('allow_anonymous')}</span>
        </label>
      </div>
      <div className="table-wrap" tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'Delete' && cur >= 0 && !locked) onRemove(cur);
        if (e.key === 'ArrowDown') setSel(Math.min(users.length - 1, cur + 1));
        if (e.key === 'ArrowUp') setSel(Math.max(0, cur - 1));
        if (e.key === 'Enter' && cur >= 0 && !locked) onEdit(cur);
      }}>
        {users.length === 0 && <div className="panel-empty muted">{t('no_users')}</div>}
        {users.length > 0 && (
          <table className="file-table">
            <thead><tr><th className="c-name">{t('col_user')}</th><th className="c-pass">{t('col_pass')}</th><th className="c-perm">{t('col_perm')}</th></tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={`${u.username}:${i}`} className={i === cur ? 'selected' : ''} onMouseDown={() => setSel(i)} onDoubleClick={() => !locked && onEdit(i)}>
                  <td className="c-name"><Icon name="user" className="ic-user" />{u.username}</td>
                  <td className="c-pass mono">{'•'.repeat(Math.max(1, Math.min(12, (u.password || '').length)))}</td>
                  <td className="c-perm"><span className={`tag ${u.canWrite ? 'rw' : 'ro'}`}>{permSummary(u, t)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default UsersPanel;
