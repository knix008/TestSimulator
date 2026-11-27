// The analysis report: an A4 page (SVG, for the print window and PDF) and an HTML document, with the
// project, the system, its model (bodies, materials, mesh, conditions), the picture of the current
// result with its colour scale, the result summary and the charts.
import { BCS, SYSTEMS } from './catalog.js';
import { OUTPUT_KINDS, outputsOf } from './project.js';
import { materialName } from './materials.js';
import { fmt, toDisplay, unitLabel } from './units.js';
import { chartsOf } from './results.js';
import { lineChart } from '../ui/charts.js';
import { cssColor } from '../view/simview.js';

const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function reportData(ctx, sys) {
  const { t } = ctx;
  const p = ctx.state.project;
  const us = ctx.units();
  const r = sys?.result;
  const outputs = r ? Object.entries(outputsOf(sys, r)).map(([k, v]) => [t(`out.${k}`), `${fmt(toDisplay(OUTPUT_KINDS[k] ?? 'ratio', v, us))} ${unitLabel(OUTPUT_KINDS[k] ?? 'ratio', us)}`]) : [];
  const model = [
    [t('outline.geometry'), p.bodies.filter((b) => !b.suppressed).map((b) => b.name).join(', ')],
    [t('outline.materials'), [...new Set(p.bodies.map((b) => b.material))].map((id) => materialName(p.materials.find((m) => m.id === id), ctx.lang())).join(', ')],
  ];
  if (r?.mesh) model.push([t('outline.mesh'), `${r.mesh.nodes.toLocaleString()} ${t('mesh.nodes')} · ${r.mesh.elements.toLocaleString()} ${t('mesh.elements')} · ${r.mesh.order === 2 ? 'TET10' : 'TET4'}`]);
  const bcs = (sys?.bcs ?? []).filter((b) => !b.suppressed).map((b) => [b.name || t(`bc.${b.type}`), BCS[b.type]?.fields.map((f) => {
    const v = b[f.key];
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return `${t(`bcf.${f.key}`)} (${v.map((x) => fmt(toDisplay(f.kind, x, us))).join(', ')}) ${unitLabel(f.kind, us)}`;
    if (typeof v === 'number') return `${t(`bcf.${f.key}`)} ${fmt(toDisplay(f.kind, v, us))} ${unitLabel(f.kind, us)}`;
    return `${t(`bcf.${f.key}`)} ${t(`opt.${v}`)}`;
  }).filter(Boolean).join(' · ') ?? '']);
  return { title: p.name || t('tabs.untitled', { n: 1 }), system: sys ? `${sys.name || t(`sys.${sys.type}`)} (${t(`sys.${sys.type}`)})` : '', date: new Date().toLocaleString(ctx.lang() === 'en' ? 'en-US' : 'ko-KR'), outputs, model, bcs, charts: r ? chartsOf(sys, r) : [] };
}

/** One A4 page as SVG (mm). image: data URL of the 3D view; legend: { title, unit, min, max, colormap, format }. */
export function reportSvg(ctx, sys, { image = null, legend = null } = {}) {
  const d = reportData(ctx, sys);
  const W = 210; const H = 297;
  const out = [];
  let y = 18;
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<text x="14" y="${y}" font-size="7" font-weight="700" fill="#111">${e(d.title)}</text>`);
  out.push(`<text x="${W - 14}" y="${y}" font-size="3.2" text-anchor="end" fill="#555">${e(d.date)}</text>`);
  y += 6;
  out.push(`<text x="14" y="${y}" font-size="4.2" fill="#2b4a8b">${e(d.system)}</text>`);
  y += 4;
  out.push(`<line x1="14" y1="${y}" x2="${W - 14}" y2="${y}" stroke="#2b4a8b" stroke-width="0.4"/>`);
  y += 4;
  if (image) {
    out.push(`<image href="${image}" x="14" y="${y}" width="${legend ? 150 : 182}" height="100" preserveAspectRatio="xMidYMid meet"/>`);
    out.push(`<rect x="14" y="${y}" width="${legend ? 150 : 182}" height="100" fill="none" stroke="#ccc" stroke-width="0.25"/>`);
    if (legend) {
      out.push(`<text x="168" y="${y + 4}" font-size="3" font-weight="700">${e(legend.title)}</text><text x="168" y="${y + 8}" font-size="2.6" fill="#555">${e(legend.unit)}</text>`);
      for (let i = 0; i < 9; i++) {
        const tt = (8 - i) / 8;
        const v = legend.min + tt * (legend.max - legend.min);
        out.push(`<rect x="168" y="${y + 11 + i * 9}" width="6" height="8.6" fill="${cssColor(legend.reverse ? 1 - tt : tt, legend.colormap, legend.bands)}"/><text x="176" y="${y + 16.5 + i * 9}" font-size="2.7">${e(legend.format(v))}</text>`);
      }
    }
    y += 106;
  }
  const table = (title, rows, cols = [60, 122]) => {
    if (!rows.length) return;
    out.push(`<text x="14" y="${y}" font-size="3.8" font-weight="700" fill="#2b4a8b">${e(title)}</text>`);
    y += 2;
    for (const r of rows) {
      if (y > H - 20) return;
      out.push(`<rect x="14" y="${y}" width="${cols[0] + cols[1]}" height="5.4" fill="${(rows.indexOf(r) % 2) ? '#f4f6fa' : '#fff'}"/><text x="16" y="${y + 3.8}" font-size="2.9">${e(r[0])}</text><text x="${16 + cols[0]}" y="${y + 3.8}" font-size="2.9">${e(String(r[1]).slice(0, 110))}</text>`);
      y += 5.4;
    }
    y += 5;
  };
  table(ctx.t('report.results'), d.outputs);
  table(ctx.t('report.model'), d.model);
  table(ctx.t('report.conditions'), d.bcs);
  for (const c of d.charts.slice(0, 1)) {
    if (y > H - 80) break;
    const svg = lineChart(c, { t: ctx.t, units: ctx.units(), width: 640, height: 260 }).replace('<svg ', `<svg x="14" y="${y}" width="182" height="74" `);
    out.push(svg);
    y += 78;
  }
  out.push(`<text x="${W / 2}" y="${H - 8}" font-size="2.6" text-anchor="middle" fill="#888">My3DMaker · ${e(d.title)}</text>`);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Roboto, 'Noto Sans KR', sans-serif">${out.join('')}</svg>`, sheetW: W, sheetH: H };
}

/** A stand-alone HTML report. */
export function reportHtml(ctx, sys, { image = null } = {}) {
  const d = reportData(ctx, sys);
  const tbl = (title, rows) => (rows.length ? `<h2>${e(title)}</h2><table>${rows.map((r) => `<tr><th>${e(r[0])}</th><td>${e(r[1])}</td></tr>`).join('')}</table>` : '');
  const charts = d.charts.map((c) => `<figure>${lineChart(c, { t: ctx.t, units: ctx.units() })}</figure>`).join('');
  return `<!doctype html><html lang="${ctx.lang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(d.title)}</title>
<style>body{font-family:Roboto,'Noto Sans KR',sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#1d2229}h1{margin:0}h2{color:#2b4a8b;border-bottom:1px solid #c9d2e3;padding-bottom:4px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e6e9ef;vertical-align:top}th{width:32%;color:#4a5361;font-weight:600}img{max-width:100%;border:1px solid #d6dbe3;border-radius:6px}figure{margin:12px 0}.chart{width:100%;height:auto}.chart-grid{stroke:#e3e7ee}.chart-frame{fill:none;stroke:#b5bdc9}.chart-tick,.chart-axis,.chart-legend,.chart-title{font-size:11px;fill:#4a5361}.meta{color:#666}</style></head>
<body><h1>${e(d.title)}</h1><p class="meta">${e(d.system)} · ${e(d.date)}</p>${image ? `<img src="${image}" alt="">` : ''}
${tbl(ctx.t('report.results'), d.outputs)}${tbl(ctx.t('report.model'), d.model)}${tbl(ctx.t('report.conditions'), d.bcs)}${charts}
<p class="meta">My3DMaker · ${e(SYSTEMS[sys?.type]?.analysis ?? '')}</p></body></html>`;
}
