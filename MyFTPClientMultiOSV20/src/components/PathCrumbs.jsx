// The full path shown in a panel header, split so each directory is a button.
import React from 'react';
import { t } from '../lib/i18n';

export function pathCrumbs(p) {
  if (!p) return [];
  const win = /^[a-zA-Z]:\\/.test(p);
  const unc = p.startsWith('\\\\');
  let parts;
  let sep;
  if (win) {
    const m = /^([a-zA-Z]:\\)(.*)$/.exec(p);
    parts = [m[1], ...m[2].split(/[\\/]+/).filter(Boolean)];
    sep = '\\';
  } else if (unc) {
    const bits = p.slice(2).split('\\').filter(Boolean);
    parts = bits.length ? [`\\\\${bits[0]}`, ...bits.slice(1)] : [p];
    sep = '\\';
  } else if (p.startsWith('/')) {
    parts = ['/', ...p.split('/').filter(Boolean)];
    sep = '/';
  } else {
    sep = p.includes('\\') ? '\\' : '/';
    parts = p.split(/[\\/]+/).filter(Boolean);
  }
  let acc = '';
  return parts.map((name, i) => {
    if (i === 0) acc = name;
    else acc = (acc.endsWith('/') || acc.endsWith('\\')) ? acc + name : acc + sep + name;
    const lead = i > 0 && !(parts[i - 1].endsWith('/') || parts[i - 1].endsWith('\\'));
    return { name, path: acc, sep: lead ? sep : '' };
  });
}

export function PathCrumbs({ path, onJump, mark = true }) {
  const crumbs = pathCrumbs(path);
  if (!crumbs.length) return null;
  return (
    <span className="panel-path mono" title={path}>
      {mark && <span className="path-mark" aria-hidden="true">│</span>}
      {crumbs.map((c) => (
        <React.Fragment key={c.path}>
          {c.sep ? <span className="path-sep" aria-hidden="true">{c.sep}</span> : null}
          <button type="button" className="path-crumb" title={t('path_jump', { path: c.path })} onClick={() => onJump(c.path)}>
            {c.name}
          </button>
        </React.Fragment>
      ))}
    </span>
  );
}
