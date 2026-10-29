// Check groups (core/checks.js): a group that is off is not run / not
// reported. Settings › Analysis edits the workspace's choice; Project settings
// the project's own (readOnly: shows the workspace's while the project follows it).
// languages: the project's languages — a group that checks none of them is
// marked, and "Choose for the languages" (or autoInit, once) turns on exactly
// the groups of those languages; the user can then add others.
import React, { useEffect, useRef, useState } from 'react';
import { t, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Chrome';
import { Btn } from '../views/common';

const applies = (g, languages) => !g.langs || g.langs.some((l) => languages.includes(l));

/** The choice for these languages: every group on, except those that check none of them. */
export function checksFor(list, languages) {
  return Object.fromEntries((list || []).map((g) => [g.id, applies(g, languages)]));
}

export function ChecksBox({ checks, onChange, readOnly = false, languages = null, autoInit = false, onAutoDone }) {
  const [list, setList] = useState(null);
  const lang = getLanguage();
  const auto = useRef(autoInit);
  auto.current = autoInit;
  useEffect(() => { call('checks.list').then(setList).catch(() => setList([])); }, []);
  useEffect(() => {
    if (!list || !auto.current || !languages) return;
    onChange(checksFor(list, languages));
    if (onAutoDone) onAutoDone();
  }, [list, autoInit]); // eslint-disable-line react-hooks/exhaustive-deps
  const on = (id) => (checks || {})[id] !== false;
  const setAll = (value) => onChange(Object.fromEntries((list || []).map((g) => [g.id, value])));
  const none = languages && languages.length === 0;
  return (
    <div className={`st-checks ${readOnly ? 'read-only' : ''}`} data-tour="check-groups">
      <div className="st-checks-head">
        <strong><Icon name="list" size={14} /> {t('ck_title')}</strong>
        <span className="small">{t('ck_count', { on: (list || []).filter((g) => on(g.id)).length, total: (list || []).length })}</span>
        <span className="spacer" />
        {!readOnly && languages && <Btn icon="code" label={t('ck_auto')} title={t('ck_auto_tip')} disabled={none} onClick={() => onChange(checksFor(list, languages))} />}
        {!readOnly && <Btn icon="check" label={t('ck_all_on')} onClick={() => setAll(true)} />}
        {!readOnly && <Btn icon="close" label={t('ck_all_off')} onClick={() => setAll(false)} />}
      </div>
      <p className="small">{t('ck_hint')}</p>
      <div className="st-checks-grid">
        {(list || []).map((g) => {
          const na = languages && !none && !applies(g, languages);
          return (
            <label key={g.id} className={`st-check ${on(g.id) ? 'on' : ''} ${na ? 'na' : ''}`} data-check={g.id} title={g.hint ? g.hint[lang] || g.hint.en : undefined}>
              <input type="checkbox" checked={on(g.id)} disabled={readOnly} onChange={(e) => onChange({ ...checks, [g.id]: e.target.checked })} />
              <span>
                <b>{g.label[lang] || g.label.en}</b>
                {g.hint && <span className="small">{g.hint[lang] || g.hint.en}</span>}
                {na && <span className="small muted"><Icon name="info" size={11} /> {t('ck_na')}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
