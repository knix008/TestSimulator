// Check groups (core/checks.js): a group that is off is not run / not
// reported. Settings › Analysis edits the workspace's choice; Project settings
// the project's own (readOnly: shows the workspace's while the project follows it).
import React, { useEffect, useState } from 'react';
import { t, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Chrome';
import { Btn } from '../views/common';

export function ChecksBox({ checks, onChange, readOnly = false }) {
  const [list, setList] = useState(null);
  const lang = getLanguage();
  useEffect(() => { call('checks.list').then(setList).catch(() => setList([])); }, []);
  const on = (id) => (checks || {})[id] !== false;
  const setAll = (value) => onChange(Object.fromEntries((list || []).map((g) => [g.id, value])));
  return (
    <div className={`st-checks ${readOnly ? 'read-only' : ''}`} data-tour="check-groups">
      <div className="st-checks-head">
        <strong><Icon name="list" size={14} /> {t('ck_title')}</strong>
        <span className="small">{t('ck_count', { on: (list || []).filter((g) => on(g.id)).length, total: (list || []).length })}</span>
        <span className="spacer" />
        {!readOnly && <Btn icon="check" label={t('ck_all_on')} onClick={() => setAll(true)} />}
        {!readOnly && <Btn icon="close" label={t('ck_all_off')} onClick={() => setAll(false)} />}
      </div>
      <p className="small">{t('ck_hint')}</p>
      <div className="st-checks-grid">
        {(list || []).map((g) => (
          <label key={g.id} className={`st-check ${on(g.id) ? 'on' : ''}`} data-check={g.id} title={g.hint ? g.hint[lang] || g.hint.en : undefined}>
            <input type="checkbox" checked={on(g.id)} disabled={readOnly} onChange={(e) => onChange({ ...checks, [g.id]: e.target.checked })} />
            <span><b>{g.label[lang] || g.label.en}</b>{g.hint && <span className="small">{g.hint[lang] || g.hint.en}</span>}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
