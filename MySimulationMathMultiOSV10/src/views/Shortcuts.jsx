// 단축키 window: every shortcut (lib/shortcuts.js) in two columns of groups;
// in each group the keys line up in one column and the actions in the next.
// A filter narrows by key or action. Settings › 키보드 shows the same list.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Dialog, Icon } from '../components/Chrome';
import { Btn } from './common';
import { SHORTCUT_GROUPS, SHORTCUT_COUNT } from '../lib/shortcuts';

/** "Ctrl+Shift+[ / ]" → key caps: chords joined by +, alternatives by /. */
export function Keys({ keys }) {
  const alts = String(keys).split(' / ');
  return (
    <span className="sc-keys">
      {alts.map((alt, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sc-or">/</span>}
          {alt.split(/\+(?!$)/).map((k, j) => (
            <React.Fragment key={j}>{j > 0 && <span className="sc-plus">+</span>}<kbd>{k}</kbd></React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </span>
  );
}

/** The groups as a two-column grid; `filter` keeps matching rows (and their groups). */
export function ShortcutGroups({ filter = '' }) {
  useLanguage();
  const li = getLanguage() === 'en' ? 1 : 0;
  const q = filter.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    rows: g.keys.filter(([k, d]) => !q || k.toLowerCase().includes(q) || d[0].toLowerCase().includes(q) || d[1].toLowerCase().includes(q) || g.name[li].toLowerCase().includes(q)),
  })).filter((g) => g.rows.length);
  if (!groups.length) return <div className="sc-none small muted"><Icon name="info" size={13} />{t('sc_none')}</div>;
  return (
    <div className="sc-groups">
      {groups.map((g) => (
        <section key={g.id} className="sc-group" data-group={g.id}>
          <h3><Icon name={g.icon} size={14} /><span>{g.name[li]}</span><small>{g.rows.length}</small></h3>
          <dl className="sc-list">
            {g.rows.map(([k, d]) => (
              <React.Fragment key={k + d[1]}>
                <dt><Keys keys={k} /></dt>
                <dd>{d[li]}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function ShortcutsDialog({ onClose }) {
  useLanguage();
  const [filter, setFilter] = useState('');
  const input = useRef(null);
  useEffect(() => { if (input.current) input.current.focus(); }, []);
  const title = useMemo(() => `${t('sp_h_shortcuts')} (${SHORTCUT_COUNT})`, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog title={title} icon="key" onClose={onClose} className="sc-dialog" dataTour="shortcuts">
      <div className="sc-tools">
        <span className="pane-filter"><Icon name="search" size={13} /><input ref={input} value={filter} placeholder={t('sc_filter')} aria-label={t('sc_filter')}
          onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && filter) { e.stopPropagation(); setFilter(''); } }} /></span>
      </div>
      <div className="sc-scroll"><ShortcutGroups filter={filter} /></div>
      <div className="dialog-actions"><Btn icon="check" label={t('ok')} primary onClick={onClose} /></div>
    </Dialog>
  );
}
