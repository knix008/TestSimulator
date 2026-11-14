// View › Improvement: bugs, vulnerabilities and code smells from the first
// committed analysis to the latest. Each series has its own scale, and a
// lower count is an improvement — the same reading as the report chart.
import React, { useMemo } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { useApi, ApiState, Btn, Stat, ViewHeader, Empty, NoProject } from './common';
import { TrendChart } from './History';

const SERIES = [
  { id: 'bugs', label: 'bugs', color: '#d64545' },
  { id: 'vulnerabilities', label: 'vulns', color: '#8e44ad' },
  { id: 'code_smells', label: 'smells', color: '#3f7fd6' },
];

function known(points) {
  return (points || []).filter((p) => p && Number.isFinite(p.value));
}

function deltaOf(points) {
  const rows = known(points);
  if (rows.length < 2) return { n: rows.length, text: '—', tone: '', from: rows[0] && rows[0].value, to: rows[0] && rows[0].value };
  const from = rows[0].value;
  const to = rows[rows.length - 1].value;
  const d = to - from;
  if (d < 0) return { n: rows.length, text: t('imp_better', { n: -d }), tone: 'ok', from, to };
  if (d > 0) return { n: rows.length, text: t('imp_worse', { n: d }), tone: 'bad', from, to };
  return { n: rows.length, text: t('imp_same'), tone: '', from, to };
}

export function ImprovementView({ project, branch, stamp }) {
  const lang = useLanguage();
  const pid = project && project.id;
  const trend = useApi('activity.trend', {
    projectId: pid, branch, metrics: SERIES.map((s) => s.id),
  }, [pid, branch, stamp], !!project);

  const series = useMemo(() => SERIES.map((s) => ({
    id: s.id,
    label: t(s.label),
    color: s.color,
    points: (trend.data && trend.data[s.id]) || [],
  })), [trend.data, lang]);

  const deltas = series.map((s) => ({ ...s, ...deltaOf(s.points) }));
  const any = deltas.some((d) => d.n > 0);
  const ready = deltas.some((d) => d.n > 1);

  return (
    <div className="view">
      <ViewHeader icon="chart" title={t('nav_improvement')} hint={t('imp_hint')}>
        <span className="spacer" />
        <Btn icon="refresh" label={t('pf_refresh')} onClick={() => trend.reload()} disabled={!project} />
      </ViewHeader>
      {!project && <NoProject />}
      <ApiState state={trend} />
      {project && trend.data && !any && <Empty text={t('imp_need_more')} />}
      {project && trend.data && any && (
        <>
          <div className="card-grid">
            {deltas.map((d) => (
              <Stat key={d.id} label={d.label} value={d.text} tone={d.tone}
                sub={d.n > 0 ? t('imp_span', { from: d.from, to: d.to }) : ''} />
            ))}
          </div>
          {!ready && <p className="small">{t('imp_need_more')}</p>}
          {series.map((s) => (
            <TrendChart key={s.id} series={[s]} height={168} label={`${t('nav_improvement')} · ${s.label}`} />
          ))}
        </>
      )}
    </div>
  );
}
