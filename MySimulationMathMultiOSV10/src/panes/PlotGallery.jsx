// 플롯 갤러리 / Plot Gallery (left side of the plot screen, a tool): the plot
// types grouped (선, 막대, 분포, 3D, 등고선, 극좌표, 이미지) as icon cards. A card
// plots the Workspace selection with the same templates as the Plots ribbon
// (panels.js PLOTS / plotCommand); a card that does not fit the selection is
// disabled and says why.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { PLOTS, GALLERY_GROUPS, plotCommand } from './panels';
import { dimsText } from '../lib/valueFormat';

export function PlotGallery({ vars, onPlot, onFigures }) {
  useLanguage();
  const [hover, setHover] = useState(null); // { ok, text }
  const list = (vars || []).filter(Boolean);
  const names = list.map((v) => `${v.name} (${dimsText(v.dims)})`).join(', ');
  return (
    <div className="pane pg-pane">
      <div className="pane-tools pg-sel" title={t('px_sel_hint')}>
        <Icon name="variable" size={13} />
        <span className={`ellipsis small mono ${list.length ? '' : 'muted'}`}>{list.length ? t('px_sel', { names }) : t('px_sel_none')}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" title={t('fig_title')} aria-label={t('fig_title')} onClick={onFigures}><Icon name="figure" size={13} /></button>
      </div>
      <div className="pane-scroll pg-scroll">
        {!list.length && <div className="pane-empty small muted pg-hint"><Icon name="info" size={13} />{t('px_sel_hint')}</div>}
        {GALLERY_GROUPS.map(([gid, label, ids]) => (
          <section key={gid} className="pg-group" data-group={gid}>
            <div className="pg-group-title small">{t(label)}</div>
            <div className="pg-cards">
              {ids.map((id) => {
                const entry = PLOTS.find((p) => p[0] === id);
                const r = plotCommand(id, list);
                const tip = r.cmd ? t('pl_tip', { cmd: r.cmd }) : t(r.error);
                return (
                  <button key={id} type="button" className={`pg-card ${r.cmd ? '' : 'off'}`} data-plot={id} aria-disabled={!r.cmd} title={tip} aria-label={`${id} — ${tip}`} onClick={() => r.cmd && onPlot(r.cmd)}
                    onPointerEnter={() => setHover({ ok: !!r.cmd, text: r.cmd || t(r.error) })} onPointerLeave={() => setHover(null)}>
                    <Icon name={entry[1]} size={22} />
                    <span className="pg-name mono">{id}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className={`pg-status small ${hover && !hover.ok ? 'bad' : ''}`} aria-live="polite">
        {hover ? <><Icon name={hover.ok ? 'play' : 'ban'} size={12} /><span className={`ellipsis ${hover.ok ? 'mono' : ''}`}>{hover.text}</span></> : <span className="muted ellipsis">{t('px_sel_hint')}</span>}
      </div>
    </div>
  );
}
