// Folders to leave out of the analysis: a lazily loaded tree of the source
// folder (project.dirs) with a check box per folder. The result is a list of
// root-relative folders (project.excludeDirs); a checked folder covers
// everything below it.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon, Dialog } from './Chrome';
import { Btn, BtnGroup, Empty } from '../views/common';

const norm = (rel) => String(rel || '').replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '');
const covers = (dir, rel) => {
  const d = dir.toLowerCase();
  const r = rel.toLowerCase();
  return r === d || r.startsWith(`${d}/`);
};

export function ExcludeDirsDialog({ root, value, onSave, onClose }) {
  useLanguage();
  const [chosen, setChosen] = useState(() => (value || []).map(norm).filter(Boolean));
  const [kids, setKids] = useState({}); // rel ('' = root) → [{ name, rel, hasChildren, skipped }] | 'loading' | { error }
  const [open, setOpen] = useState(() => new Set(['']));

  const load = async (rel) => {
    if (kids[rel] && kids[rel] !== 'error') return;
    setKids((k) => ({ ...k, [rel]: 'loading' }));
    try {
      const list = await call('project.dirs', { path: root, sub: rel });
      setKids((k) => ({ ...k, [rel]: list }));
    } catch (err) {
      setKids((k) => ({ ...k, [rel]: { error: err.message } }));
    }
  };
  useEffect(() => { load(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [root]);

  const toggleOpen = (rel) => {
    const next = new Set(open);
    if (next.has(rel)) next.delete(rel); else { next.add(rel); load(rel); }
    setOpen(next);
  };
  const toggle = (rel) => {
    if (chosen.some((d) => d.toLowerCase() === rel.toLowerCase())) setChosen(chosen.filter((d) => d.toLowerCase() !== rel.toLowerCase()));
    // Checking a folder replaces the folders below it.
    else setChosen([...chosen.filter((d) => !covers(rel, d)), rel].sort((a, b) => a.localeCompare(b)));
  };

  const rows = (rel, depth) => {
    const list = kids[rel];
    if (list === 'loading') return <div className="xd-row xd-note" style={{ paddingLeft: 8 + depth * 18 }}><Icon name="spinner" size={13} /> {t('loading')}</div>;
    if (list && list.error) return <div className="xd-row xd-note bad" style={{ paddingLeft: 8 + depth * 18 }}>{list.error}</div>;
    if (!Array.isArray(list)) return null;
    if (!list.length && depth === 0) return <Empty icon="folder" text={t('xd_no_folders')} />;
    return list.map((d) => {
      const self = chosen.some((c) => c.toLowerCase() === d.rel.toLowerCase());
      const parent = !self && chosen.some((c) => covers(c, d.rel));
      const isOpen = open.has(d.rel);
      return (
        <React.Fragment key={d.rel}>
          <div className={`xd-row ${self || parent || d.skipped ? 'off' : ''}`} style={{ paddingLeft: 8 + depth * 18 }} data-rel={d.rel}>
            <button type="button" className="xd-twisty" disabled={!d.hasChildren} aria-label={isOpen ? t('collapse') : t('expand')} onClick={() => toggleOpen(d.rel)}>
              {d.hasChildren && <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} />}
            </button>
            <label className="xd-label">
              <input type="checkbox" checked={self || parent || d.skipped} disabled={parent || d.skipped} onChange={() => toggle(d.rel)} />
              <Icon name="folder" size={14} />
              <span className="xd-name">{d.name}</span>
              {d.skipped && <span className="small xd-tag">{t('xd_always')}</span>}
            </label>
          </div>
          {isOpen && d.hasChildren && rows(d.rel, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <Dialog title={t('xd_title')} icon="filter" onClose={onClose} className="xd-dialog" dataTour="exclude-dirs">
      <p className="small">{t('xd_hint')}</p>
      <div className="xd-root small mono"><Icon name="folder" size={13} /> {root}</div>
      <div className="xd-tree">{rows('', 0)}</div>
      <div className="xd-chosen">
        <strong className="small">{t('xd_chosen', { n: chosen.length })}</strong>
        <div className="chips">
          {chosen.map((d) => (
            <span key={d} className="chip">
              <Icon name="folder" size={11} />{d}
              <button type="button" className="chip-x" aria-label={t('remove')} title={t('remove')} onClick={() => setChosen(chosen.filter((c) => c !== d))}><Icon name="close" size={10} /></button>
            </span>
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="check" label={t('save')} primary onClick={() => onSave(chosen)} />
          <Btn icon="trash" label={t('xd_clear')} disabled={!chosen.length} onClick={() => setChosen([])} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}
