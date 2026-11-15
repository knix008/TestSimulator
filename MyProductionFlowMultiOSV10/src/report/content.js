// The report as a document model (no format yet): title, sections of headings, paragraphs, KPI lists, tables,
// bullet lists and pictures. The print window (pages), and the Markdown / HTML / Word / PDF writers all start
// from this one model, so every output has the same content.
//
// Block kinds: { t: 'h1'|'h2'|'h3'|'p'|'note', text } · { t: 'kpis', items: [[label, value]] }
//   · { t: 'table', head: [...], rows: [[...]], align: ['l'|'r', …] } · { t: 'bullets', items: [...] }
//   · { t: 'image', src: dataURL (PNG/JPEG), w, h, caption }
// Every block carries `section` (the id of the section it belongs to) so a reader can leave sections out.

/** The sections a report can have, in order (the print and report windows let the user pick them). */
export const REPORT_SECTIONS = ['overview', 'layout2d', 'view3d', 'kpis', 'diagnosis', 'tables', 'charts', 'sd', 'experiment'];

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

/**
 * ctx: { model, results, series: { t: [], data: Map } | null, issues, experiment, images: { layout2d, view3d },
 *        charts: [{ title, src, w, h }], t(key, params), fmt(v, digits), docName, date }
 */
export function buildReport(ctx) {
  const { model: m, results, t, fmt } = ctx;
  const s = m.settings;
  const u = s.timeUnit;
  const blocks = [];
  const add = (section, block) => blocks.push({ section, ...block });

  // ── overview
  add('overview', { t: 'h2', text: t('report.settings') });
  add('overview', { t: 'table', head: [t('report.item'), t('report.value')], align: ['l', 'l'], rows: [
    [t('model.timeUnit'), t(`unit.${u}`)],
    [t('model.duration'), `${fmt(s.duration)} ${u}`],
    [t('model.warmup'), `${fmt(s.warmup)} ${u}`],
    [t('model.seed'), String(results?.seed ?? s.seed)],
    [t('report.blocks'), `${m.blocks.length} · ${t('explorer.links')} ${m.links.length}`],
  ] });
  if (m.description) add('overview', { t: 'p', text: m.description });

  // ── pictures of the model
  if (ctx.images?.layout2d) add('layout2d', { t: 'h2', text: t('report.layout2d') }), add('layout2d', { t: 'image', ...ctx.images.layout2d, caption: t('report.layout2dCaption') });
  if (ctx.images?.view3d) add('view3d', { t: 'h2', text: t('report.view3d') }), add('view3d', { t: 'image', ...ctx.images.view3d, caption: t('report.view3dCaption') });

  if (!results) {
    add('kpis', { t: 'note', text: t('report.noRun') });
    return { title: m.name || ctx.docName, subtitle: t('report.generated', { date: ctx.date }), blocks };
  }
  const k = results.kpi;

  // ── KPIs
  add('kpis', { t: 'h2', text: t('report.results') });
  add('kpis', { t: 'kpis', items: [
    [t('kpi.completed'), fmt(k.completed, 0)],
    [t('kpi.throughput'), `${fmt(k.throughput, 3)} /${u}`],
    [t('kpi.cycle'), `${fmt(k.cycleMean, 2)} ${u}`],
    [t('kpi.wip'), fmt(k.wipMean, 2)],
    [t('metric.lost'), fmt(k.lost, 0)],
    [t('metric.cost'), fmt(k.cost, 2)],
    ...(k.bottleneck ? [[t('kpi.bottleneck'), `${k.bottleneck.name} (${pct(k.bottleneck.utilization)})`]] : []),
  ] });

  // ── diagnosis: problems, evidence, cause, fixes
  const issues = (ctx.issues ?? []).filter((x) => x.severity !== 'success');
  add('diagnosis', { t: 'h2', text: t('diag.heading') });
  if (!issues.length) add('diagnosis', { t: 'note', text: t('report.noIssues') });
  for (const x of issues) {
    add('diagnosis', { t: 'h3', text: `${t(`report.sev.${x.severity}`)} · ${t(`diag.${x.id}.title`, x.params)}` });
    add('diagnosis', { t: 'p', text: t(`diag.${x.id}.cause`, x.params) });
    if (x.evidence?.length) add('diagnosis', { t: 'bullets', items: x.evidence.map(([key, v]) => `${t(`ev.${key}`)}: ${v}`) });
    if (x.fixes?.length) add('diagnosis', { t: 'bullets', items: x.fixes.map((f) => `→ ${t(`fix.${f.key}`, f.params)}`) });
  }

  // ── block tables
  const entries = Object.entries(results.blocks);
  const of = (bases) => entries.filter(([, b]) => bases.includes(b.base ?? b.type));
  const procs = of(['process', 'delay', 'robot', 'dock']);
  const queues = of(['queue']);
  const sinks = of(['sink']);
  const pools = of(['resourcePool']);
  add('tables', { t: 'h2', text: t('report.tables') });
  if (procs.length) {
    add('tables', { t: 'h3', text: t('report.processes') });
    add('tables', { t: 'table', head: [t('report.name'), t('stat.in'), t('stat.out'), t('stat.util'), t('stat.blocked'), t('stat.down'), `${t('stat.time')} (${u})`], align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'],
      rows: procs.map(([n, b]) => [n, fmt(b.in, 0), fmt(b.out, 0), pct(b.utilization), pct(b.blockedShare), pct(b.downShare), fmt(b.processMean, 2)]) });
  }
  if (queues.length) {
    add('tables', { t: 'h3', text: t('report.queues') });
    add('tables', { t: 'table', head: [t('report.name'), t('stat.lenMean'), t('stat.lenMax'), `${t('stat.waitMean')} (${u})`, `${t('stat.waitMax')} (${u})`, t('stat.reneged')], align: ['l', 'r', 'r', 'r', 'r', 'r'],
      rows: queues.map(([n, b]) => [n, fmt(b.lengthMean, 2), fmt(b.lengthMax, 0), fmt(b.waitMean, 2), fmt(b.waitMax, 2), fmt(b.reneged ?? 0, 0)]) });
  }
  if (pools.length) {
    add('tables', { t: 'h3', text: t('report.pools') });
    add('tables', { t: 'table', head: [t('report.name'), t('stat.util'), t('stat.capacity')], align: ['l', 'r', 'r'], rows: pools.map(([n, b]) => [n, pct(b.utilization), fmt(b.capacityMean ?? b.capacity, 2)]) });
  }
  if (sinks.length) {
    add('tables', { t: 'h3', text: t('report.sinks') });
    add('tables', { t: 'table', head: [t('report.name'), t('kpi.completed'), `${t('kpi.throughput')} (/${u})`, `${t('kpi.cycle')} (${u})`], align: ['l', 'r', 'r', 'r'],
      rows: sinks.map(([n, b]) => [n, fmt(b.in, 0), fmt(b.throughput, 3), fmt(b.cycleMean, 2)]) });
  }

  // ── charts (pictures drawn by the app)
  if (ctx.charts?.length) {
    add('charts', { t: 'h2', text: t('report.charts') });
    for (const c of ctx.charts) add('charts', { t: 'image', src: c.src, w: c.w, h: c.h, caption: c.title });
  }

  // ── system dynamics values at the end
  const sd = Object.entries(results.sd ?? {});
  if (sd.length) {
    add('sd', { t: 'h2', text: t('report.sd') });
    add('sd', { t: 'table', head: [t('report.name'), t('report.final')], align: ['l', 'r'], rows: sd.map(([n, v]) => [n, fmt(v.value, 3)]) });
  }

  // ── the last experiment
  const ex = ctx.experiment;
  if (ex) {
    add('experiment', { t: 'h2', text: `${t('bottom.experiments')} — ${t(`exp.kind.${ex.kind}`)}` });
    if (ex.kind === 'montecarlo') add('experiment', { t: 'kpis', items: [[t('exp.mean'), fmt(ex.mean, 4)], [t('exp.ci'), `±${fmt(ex.ci, 4)}`], [t('exp.runs'), String(ex.runs.length)]] });
    else if (ex.kind === 'sensitivity') add('experiment', { t: 'table', head: [t('exp.parameter'), t('exp.low'), t('exp.high'), t('exp.swing')], align: ['l', 'r', 'r', 'r'], rows: ex.rows.map((r) => [r.label, `${fmt(r.low, 4)} → ${fmt(r.lowValue, 4)}`, `${fmt(r.high, 4)} → ${fmt(r.highValue, 4)}`, fmt(r.swing, 4)]) });
    else if (ex.kind === 'multiopt') add('experiment', { t: 'p', text: t('exp.multiBest', { params: ex.params.map((p, i) => `${p.label} = ${fmt(ex.best.values[i], 4)}`).join(' · '), obj: ex.objective, v: fmt(ex.best.value, 4), n: ex.evaluations, space: ex.space }) });
    else if (ex.best) add('experiment', { t: 'p', text: t('exp.best', { param: ex.parameter, x: fmt(ex.best.x, 4), obj: ex.objective, v: fmt(ex.best.value, 4) }) });
  }
  return { title: m.name || ctx.docName, subtitle: t('report.generated', { date: ctx.date }), blocks };
}

/** The model with only the chosen sections. */
export const pickSections = (doc, sections) => ({ ...doc, blocks: doc.blocks.filter((b) => !sections || sections.includes(b.section)) });
