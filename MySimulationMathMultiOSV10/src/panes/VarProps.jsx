// 변수 속성 / Variable Properties (right side of the variable screen): class,
// size, element count; min / max / mean / std for numbers, the fields of a
// struct, the columns of a table, what a cell holds (panels.js variableStats).
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { variableStats } from './panels';
import { dimsText, formatNumber } from '../lib/valueFormat';

export function VarPropsPane({ engine, name, refreshKey, onOpen }) {
  useLanguage();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!name) { setStats(null); return undefined; }
    engine.getVariable(name).then((v) => { if (alive) setStats(variableStats(v)); }, () => { if (alive) setStats(null); });
    return () => { alive = false; };
  }, [engine, name, refreshKey]);
  if (!name || !stats) return <div className="pane"><div className="pane-empty small muted"><Icon name="variable" size={14} />{t('px_vp_none')}</div></div>;
  const num = (x) => formatNumber(x, stats.cls === 'logical' ? 'double' : stats.cls, 'short');
  const rows = [
    ['package', t('px_vp_class'), stats.cls],
    ['grid', t('px_vp_size'), dimsText(stats.dims)],
    ['hash', t('px_vp_numel'), String(stats.numel)],
  ];
  if (stats.kind === 'numeric') {
    rows.push(['arrowUp', t('px_vp_min'), num(stats.min)], ['chevronsUp', t('px_vp_max'), num(stats.max)], ['target', t('px_vp_mean'), num(stats.mean)],
      ['waves', t('px_vp_std'), num(stats.std)], ['circleDot', t('px_vp_nnz'), String(stats.nnz)], ['alert', t('px_vp_nan'), String(stats.nan)],
      ['sparkle', t('px_vp_complex'), stats.complex ? `${t('px_yes')} ${t('px_vp_real_part')}` : t('px_no')]);
  }
  if (stats.kind === 'text') rows.push(['edit', t('px_vp_length'), String(stats.length)]);
  if (stats.kind === 'table') rows.push(['list', t('px_vp_rows'), String(stats.rows)]);
  const sub = stats.kind === 'struct' ? [t('px_vp_fields'), stats.fields] : stats.kind === 'table' ? [t('px_vp_columns'), stats.columns] : null;
  return (
    <div className="pane vp-pane" data-var={name}>
      <div className="pane-tools"><Icon name="variable" size={13} /><strong className="mono ellipsis">{name}</strong><span className="spacer" />
        <button type="button" className="vbtn vbtn-sm" onClick={() => onOpen(name)} title={t('px_vp_open')}><Icon name="table" size={13} /><span>{t('px_vp_open')}</span></button>
      </div>
      <div className="pane-scroll">
        <dl className="prop-list">
          {rows.map(([icon, k, v]) => <div key={k} className="prop-row"><dt><Icon name={icon} size={12} />{k}</dt><dd className="mono" title={v}>{v}</dd></div>)}
        </dl>
        {sub && (
          <>
            <div className="fp-section small">{sub[0]} ({sub[1].length})</div>
            <table className="ws-table vp-table"><tbody>
              {sub[1].map((f) => <tr key={f.name}><td className="mono">{f.name}</td><td className="mono">{dimsText(f.dims)}</td><td>{f.cls}</td></tr>)}
            </tbody></table>
          </>
        )}
        {stats.kind === 'cell' && (
          <>
            <div className="fp-section small">{t('px_vp_cells')}</div>
            <table className="ws-table vp-table"><tbody>
              {stats.classes.map((c) => <tr key={c.cls}><td>{c.cls}</td><td className="mono">{c.n}</td></tr>)}
            </tbody></table>
          </>
        )}
      </div>
    </div>
  );
}
