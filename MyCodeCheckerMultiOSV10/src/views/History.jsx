// View › Snapshots: snapshot compare, defect lifecycle, issue age, trend
// chart and activity events.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, textOf, useLanguage } from '../lib/i18n';
import { useApi, ApiState, Btn, IconSelect, Tabs, Stat, ViewHeader, Empty, fmtDate, NoProject, SevBadge, useRowWindow, openCodeRow } from './common';
import { msg } from './Panels';

const METRICS = ['bugs', 'vulnerabilities', 'code_smells', 'security_hotspots', 'sqale_index', 'coverage', 'duplicated_lines_density', 'ncloc'];
const METRIC_KEY = { bugs: 'bugs', vulnerabilities: 'vulns', code_smells: 'smells', security_hotspots: 'hotspots', sqale_index: 'debt', coverage: 'coverage', duplicated_lines_density: 'dup_density', ncloc: 'ncloc' };
const SERIES_VAR = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

export function HistoryView({ project, branch, stamp }) {
  useLanguage();
  const pid = project && project.id;
  const deps = [pid, branch, stamp];
  const list = useApi('snapshot.list', { projectId: pid, branch }, deps, !!project);
  const snaps = list.data || [];
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const fromN = from != null ? from : (snaps.length > 1 ? snaps[snaps.length - 2].snapshot : null);
  const toN = to != null ? to : (snaps.length ? snaps[snaps.length - 1].snapshot : null);
  const cmp = useApi('snapshot.compare', { projectId: pid, branch, from: fromN, to: toN }, [...deps, fromN, toN], !!project && snaps.length > 0);
  const life = useApi('defect.lifecycle', { projectId: pid, branch }, deps, !!project);
  const age = useApi('issue.age', { projectId: pid, branch }, deps, !!project);
  const events = useApi('activity.events', { projectId: pid, branch }, deps, !!project);
  const [metrics, setMetrics] = useState(['bugs', 'vulnerabilities', 'code_smells']);
  const trend = useApi('activity.trend', { projectId: pid, branch, metrics: METRICS }, deps, !!project);
  const [tab, setTab] = useState('newlyDetected');
  const [section, setSection] = useState('compare');

  const snapOptions = snaps.map((s) => ({ value: s.snapshot, label: `#${s.snapshot} · ${fmtDate(s.at)} (${s.count})`, icon: 'history' }));
  const c = cmp.data;
  const cmpTabs = ['newlyDetected', 'fixed', 'outstanding', 'triaged', 'newlyDismissed', 'reopened'];
  const lifeRows = life.data ? Object.values(life.data) : [];

  const refresh = () => { list.reload(); cmp.reload(); life.reload(); age.reload(); events.reload(); trend.reload(); };

  return (
    <div className="view">
      <ViewHeader icon="history" title={t('nav_snapshots')} hint={t('hs_hint')}>
        <Tabs value={section} onChange={setSection} tabs={[
          { id: 'compare', label: t('hs_compare'), icon: 'layers' },
          { id: 'lifecycle', label: t('hs_lifecycle'), icon: 'clock', count: lifeRows.length },
          { id: 'age', label: t('hs_age'), icon: 'calendar' },
          { id: 'trend', label: t('hs_trend'), icon: 'chart' },
          { id: 'events', label: t('hs_events'), icon: 'list', count: (events.data || []).length },
        ]} />
        <span className="spacer" />
        <Btn icon="refresh" label={t('pf_refresh')} onClick={refresh} />
      </ViewHeader>
      {!project && <NoProject />}
      <ApiState state={list} />
      {section === 'compare' && list.data && (
        <>
          <div className="split-2">
            <div className="panel tpanel">
              <div className="table-wrap short">
                <table>
                  <thead><tr><th>#</th><th>{t('when')}</th><th className="num">{t('nav_issues')}</th></tr></thead>
                  <tbody>
                    {[...snaps].reverse().map((s) => (
                      <tr key={s.snapshot} className={s.snapshot === toN || s.snapshot === fromN ? 'sel' : ''}>
                        <td>{s.snapshot}</td><td className="small">{fmtDate(s.at)}</td><td className="num">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {snaps.length === 0 && <Empty text={t('hs_no_snapshots')} />}
              </div>
            </div>
            <div>
              <div className="view-toolbar">
                <span className="tb-label">{t('cov_from')}</span>
                <IconSelect value={fromN} options={snapOptions} onChange={setFrom} title={t('cov_from')} width={250} />
                <span className="tb-label">{t('cov_to')}</span>
                <IconSelect value={toN} options={snapOptions} onChange={setTo} title={t('cov_to')} width={250} />
              </div>
              {c && (
                <div className="card-grid compact">
                  {cmpTabs.map((k) => <Stat key={k} icon={({ newlyDetected: 'sparkle', fixed: 'checkCircle', outstanding: 'alert', triaged: 'userCheck', newlyDismissed: 'xCircle', reopened: 'refresh' })[k]} label={t(`hs_${k}`)} value={c.counts[k]} tone={k === 'newlyDetected' && c.counts[k] ? 'bad' : k === 'fixed' && c.counts[k] ? 'ok' : ''} />)}
                </div>
              )}
            </div>
          </div>
          {c && (
            <>
              <Tabs value={tab} onChange={setTab} tabs={cmpTabs.map((k) => ({ id: k, label: t(`hs_${k}`), count: c.counts[k] }))} />
              <IssueList issues={c[tab] || []} />
            </>
          )}
        </>
      )}
      {section === 'lifecycle' && (
        <>
          <ApiState state={life} />
          {life.data && (
            <div className="panel tpanel">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>CID</th><th>{t('cov_checker')}</th><th>{t('location')}</th><th>{t('hs_first')}</th><th>{t('hs_last')}</th><th>{t('hs_fixed_in')}</th><th className="num">{t('hs_reintroduced')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {lifeRows.map((r) => (
                      <tr key={r.cid} className={r.file ? 'click' : ''} {...openCodeRow(r.file, r.line)}>
                        <td>{r.cid}</td>
                        <td className="small">{r.checker}</td>
                        <td className="small wrap">{r.file}</td>
                        <td className="small nowrap">{r.firstDetected ? `#${r.firstDetected.snapshot} ${fmtDate(r.firstDetected.at)}` : '—'}</td>
                        <td className="small nowrap">{r.lastDetected ? `#${r.lastDetected.snapshot} ${fmtDate(r.lastDetected.at)}` : '—'}</td>
                        <td className="small nowrap">{r.fixedIn ? `#${r.fixedIn.snapshot} ${fmtDate(r.fixedIn.at)}` : '—'}</td>
                        <td className="num">{r.reintroduced}</td>
                        <td className={r.status === 'Fixed' ? 'ok' : ''}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lifeRows.length === 0 && <Empty text={t('empty')} />}
              </div>
            </div>
          )}
        </>
      )}
      {section === 'age' && (
        <>
          <ApiState state={age} />
          {age.data && <AgeView age={age.data} />}
        </>
      )}
      {section === 'trend' && (
        <>
          <ApiState state={trend} />
          {trend.data && (
            <>
              <div className="view-toolbar chip-row">
                {METRICS.map((m, i) => {
                  const on = metrics.includes(m);
                  return (
                    <button key={m} type="button" className={`vbtn metric-chip ${on ? 'on' : ''}`} aria-pressed={on}
                      onClick={() => setMetrics(on ? metrics.filter((x) => x !== m) : [...metrics, m])}>
                      <span className="swatch" style={{ background: `var(${SERIES_VAR[i]})` }} />
                      <span>{t(METRIC_KEY[m])}</span>
                    </button>
                  );
                })}
              </div>
              <TrendChart series={METRICS.map((m, i) => ({ id: m, label: t(METRIC_KEY[m]), color: `var(${SERIES_VAR[i]})`, points: trend.data[m] || [] })).filter((s) => metrics.includes(s.id))} />
            </>
          )}
        </>
      )}
      {section === 'events' && (
        <>
          <ApiState state={events} />
          {events.data && (
            <div className="panel tpanel">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('when')}</th><th>{t('hs_category')}</th><th>{t('name')}</th><th>{t('hs_description')}</th></tr></thead>
                  <tbody>
                    {[...events.data].reverse().map((e, i) => (
                      <tr key={`${e.at}-${i}`}>
                        <td className="small nowrap">{fmtDate(e.at)}</td>
                        <td><span className="pill">{t(`hs_cat_${String(e.category).toLowerCase()}`)}</span></td>
                        <td className="wrap">{textOf(e.name)}</td>
                        <td className="small wrap">{textOf(e.description)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {events.data.length === 0 && <Empty text={t('hs_no_events')} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IssueList({ issues }) {
  useLanguage();
  const { rows, footer } = useRowWindow(issues);
  return (
    <div className="panel tpanel">
      <div className="table-wrap">
        <table>
          <thead><tr><th>CID</th><th>{t('severity')}</th><th>{t('message')}</th><th>{t('location')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`${i.cid}-${i.key}`} className={i.file ? 'click' : ''} {...openCodeRow(i.file, i.line)}>
                <td>{i.cid}</td>
                <td><SevBadge sev={i.severity} /></td>
                <td className="wrap">{msg(i)}<div className="small">{i.rule}{i.checker ? ` · ${i.checker}` : ''}</div></td>
                <td className="small wrap">{i.file}:{i.line}</td>
                <td className="small">{i.classification && i.classification !== 'Unclassified' ? i.classification : i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer}
        {issues.length === 0 && <Empty text={t('empty')} />}
      </div>
    </div>
  );
}

function AgeView({ age }) {
  useLanguage();
  const max = Math.max(1, ...age.buckets.map((b) => b.count));
  return (
    <>
      <div className="card-grid">
        <Stat icon="bug" label={t('hs_open_issues')} value={age.count} />
        <Stat icon="clock" label={t('hs_avg_days')} value={age.averageDays} sub={t('hs_days')} />
        <Stat icon="clock" label={t('hs_median_days')} value={age.medianDays} sub={t('hs_days')} />
        <Stat icon="hourglass" label={t('hs_oldest')} value={age.oldest ? `${age.oldest.days}` : '—'} sub={age.oldest ? `${age.oldest.file}:${age.oldest.line}` : ''} />
      </div>
      <div className="panel">
        <h3 className="sub-title">{t('hs_buckets')}</h3>
        <div className="hbars">
          {age.buckets.map((b) => (
            <div key={b.id} className="hbar-row" title={`${textOf(b.label)}: ${b.count}`}>
              <span className="hbar-label">{textOf(b.label)}</span>
              <span className="hbar-track"><span className="hbar" style={{ width: b.count ? `max(2px, ${(b.count / max) * 100}%)` : 0 }} /></span>
              <span className="hbar-value">{b.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel tpanel" style={{ marginTop: 12 }}>
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('type')}</th><th className="num">{t('hs_open_issues')}</th><th className="num">{t('hs_avg_days')}</th></tr></thead>
            <tbody>
              {Object.entries(age.byType || {}).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v.count}</td><td className="num">{v.averageDays}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// Inline SVG line chart: one y axis, 2px lines, a legend plus end labels,
// and a crosshair tooltip on hover.
export function TrendChart({ series }) {
  const box = useRef(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(760);
  const ready = series.some((sr) => sr.points.length > 0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setW(Math.max(320, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);
  const H = 260;
  const pad = { l: 46, r: 140, t: 14, b: 30 };
  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.at)))].sort(), [series]);
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v != null && Number.isFinite(v));
  if (!series.length || !xs.length) return <Empty text={t('hs_no_trend')} />;
  const maxV = Math.max(1, ...values);
  const niceMax = niceCeil(maxV);
  const x = (at) => pad.l + (xs.length === 1 ? (W - pad.l - pad.r) / 2 : (xs.indexOf(at) / (xs.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f * 100) / 100);
  const onMove = (e) => {
    const svg = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - svg.left) / svg.width) * W;
    let best = 0;
    let dist = Infinity;
    xs.forEach((at, i) => { const d = Math.abs(x(at) - px); if (d < dist) { dist = d; best = i; } });
    setHover(best);
  };
  const hAt = hover != null ? xs[hover] : null;
  const labelEvery = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor(W / 120))));
  const sameDay = new Set(xs.map((at) => fmtDate(at).slice(0, 10))).size === 1;
  return (
    <div className="panel chart-panel">
      <div className="legend">
        {series.map((s) => <span key={s.id} className="legend-item"><span className="swatch" style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div className="chart-box" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="trend" role="img" aria-label={t('hs_trend')} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={pad.l - 6} y={y(v) + 4} className="axis" textAnchor="end">{fmtNum(v)}</text>
            </g>
          ))}
          {xs.map((at, i) => (i % labelEvery === 0 || i === xs.length - 1) && (
            <text key={at} x={x(at)} y={H - 10} className="axis" textAnchor="middle">{sameDay ? fmtDate(at).slice(11) : fmtDate(at).slice(5, 10)}</text>
          ))}
          {series.map((s) => {
            const pts = s.points.filter((p) => p.value != null);
            if (!pts.length) return null;
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
            const last = pts[pts.length - 1];
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {pts.length === 1 && <circle cx={x(last.at)} cy={y(last.value)} r="4" fill={s.color} />}
                <text x={x(last.at) + 8} y={y(last.value) + 4} className="end-label">{s.label} {fmtNum(last.value)}</text>
              </g>
            );
          })}
          {hAt && (
            <g>
              <line x1={x(hAt)} x2={x(hAt)} y1={pad.t} y2={H - pad.b} className="crosshair" />
              {series.map((s) => {
                const p = s.points.find((q) => q.at === hAt);
                return p && p.value != null ? <circle key={s.id} cx={x(hAt)} cy={y(p.value)} r="4.5" fill={s.color} className="dot" /> : null;
              })}
            </g>
          )}
        </svg>
        {hAt && (
          <div className="chart-tip" style={{ left: `${(x(hAt) / W) * 100}%` }}>
            <div className="small">{fmtDate(hAt)}</div>
            {series.map((s) => {
              const p = s.points.find((q) => q.at === hAt);
              return <div key={s.id} className="tip-row"><span className="swatch" style={{ background: s.color }} />{s.label}<strong>{p && p.value != null ? fmtNum(p.value) : '—'}</strong></div>;
            })}
          </div>
        )}
      </div>
      <details className="small chart-table">
        <summary>{t('hs_table_view')}</summary>
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('when')}</th>{series.map((s) => <th key={s.id} className="num">{s.label}</th>)}</tr></thead>
            <tbody>{xs.map((at) => <tr key={at}><td className="nowrap">{fmtDate(at)}</td>{series.map((s) => { const p = s.points.find((q) => q.at === at); return <td key={s.id} className="num">{p && p.value != null ? fmtNum(p.value) : '—'}</td>; })}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function niceCeil(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function fmtNum(v) {
  if (v == null) return '—';
  if (Math.abs(v) >= 10000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v * 10) / 10);
}
