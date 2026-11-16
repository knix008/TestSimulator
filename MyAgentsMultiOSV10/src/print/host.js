// The main window's side of printing: gathers what the print window (print/popup.js) lays out on pages — the
// agent's overview, its flow drawn as a picture (the same boxes and curves as the canvas, in print colours),
// every node with its settings, and the last run step by step. Answers the print window's 'print-content'.
import { nodeDef, categoryOf } from '../../core/nodes/defs.js';
import { nodeBox, portPoint, edgePath, nodeSummary } from '../editor/canvas.js';
import { escapeHtml as esc } from '../ui/dom.js';

const text = (v, n = 400) => {
  const s = typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const catOf = (type) => categoryOf(nodeDef(type)?.category ?? 'note');
const pick = (l, lang) => (l && typeof l === 'object' ? l[lang] ?? l.en ?? '' : String(l ?? ''));

/** The flow as one SVG picture (viewBox around the nodes); the page scales it to its width. */
export function diagramSvg(doc, lang) {
  const nodes = (doc?.nodes ?? []).filter((n) => !nodeDef(n.type)?.note);
  if (!nodes.length) return '';
  const boxes = new Map(nodes.map((n) => [n.id, { ...n, ...nodeBox(n) }]));
  const xs = [...boxes.values()].flatMap((b) => [b.x, b.x + b.w]);
  const ys = [...boxes.values()].flatMap((b) => [b.y, b.y + b.h]);
  const pad = 24;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - x0 + pad;
  const h = Math.max(...ys) - y0 + pad;
  const edges = (doc.edges ?? []).map((e) => {
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b) return '';
    const tools = e.fromPort === 'tools';
    const from = tools ? portPoint(a, 'tools') : portPoint(a, 'out', e.fromPort);
    const to = portPoint(b, 'in');
    const back = !tools && to.x <= from.x;
    return `<path d="${edgePath(from, to, tools)}" fill="none" stroke="${back ? '#e8590c' : '#7b8494'}" stroke-width="2"${back || tools ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>${e.fromPort && e.fromPort !== 'out' && !tools ? `<text x="${from.x + 6}" y="${from.y - 4}" font-size="11" fill="#5f6670">${esc(e.fromPort)}</text>` : ''}`;
  }).join('');
  const cards = [...boxes.values()].map((b) => {
    const def = nodeDef(b.type);
    const color = catOf(b.type)?.color ?? '#868e96';
    const summary = text(nodeSummary(b, lang, { agentName: () => '' }), 34);
    return `<g>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#ffffff" stroke="${color}" stroke-width="2"/>
      <rect x="${b.x}" y="${b.y}" width="6" height="${b.h}" rx="3" fill="${color}"/>
      <text x="${b.x + 16}" y="${b.y + 24}" font-size="14" font-weight="700" fill="#1b1f24">${esc(text(b.name, 26))}</text>
      <text x="${b.x + 16}" y="${b.y + 43}" font-size="11" fill="${color}">${esc(pick(def?.label, lang) || b.type)}${b.phase ? ` · ${esc(b.phase)}` : ''}</text>
      <text x="${b.x + 16}" y="${b.y + 61}" font-size="11" fill="#5f6670">${esc(summary)}</text>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" preserveAspectRatio="xMidYMid meet" font-family="Segoe UI, Malgun Gothic, Apple SD Gothic Neo, sans-serif">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7b8494"/></marker></defs>
    ${edges}${cards}</svg>`;
}

/** A node's settings as [label, value] pairs (empty values left out). */
function settingsOf(node, lang) {
  const def = nodeDef(node.type);
  const c = node.config ?? {};
  const out = [];
  for (const f of def?.fields ?? []) {
    const v = c[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const shown = f.type === 'select' && Array.isArray(f.options) ? pick(f.options.find((o) => String(o.value ?? o) === String(v))?.label, lang) || String(v) : text(v, 600);
    out.push([pick(f.label, lang) || f.key, shown]);
  }
  return out;
}

/**
 * deps: { doc(), run(), t, language() }
 * → content { at, lang, title, agent, diagram, nodes, run }
 */
export function gatherPrintContent(deps) {
  const doc = deps.doc();
  if (!doc || !doc.nodes) return null;
  const lang = deps.language();
  const run = deps.run?.() ?? null;
  const triggers = doc.nodes.filter((n) => nodeDef(n.type)?.trigger).map((n) => pick(nodeDef(n.type).label, lang));
  const byCategory = {};
  for (const n of doc.nodes) { const c = catOf(n.type)?.id ?? 'other'; byCategory[c] = (byCategory[c] ?? 0) + 1; }
  const nodes = doc.nodes.filter((n) => !nodeDef(n.type)?.note || n.config?.text).map((n) => ({
    id: n.id, name: n.name, type: pick(nodeDef(n.type)?.label, lang) || n.type, category: pick(catOf(n.type)?.label, lang), color: catOf(n.type)?.color ?? '#868e96',
    phase: n.phase ?? '', disabled: Boolean(n.disabled), description: n.description ?? '', settings: settingsOf(n, lang),
  }));
  return {
    at: Date.now(), lang, title: doc.name,
    agent: {
      name: doc.name, description: doc.description ?? '', nodes: doc.nodes.length, edges: (doc.edges ?? []).length, triggers, deployed: Boolean(doc.deployed),
      variables: (doc.variables ?? []).map((v) => [v.key, text(v.value, 120)]), byCategory, updatedAt: doc.updatedAt ?? null, tags: doc.tags ?? [],
    },
    flow: { nodes: doc.nodes.map((n) => ({ ...n })), edges: (doc.edges ?? []).map((e) => ({ ...e })) },
    nodes,
    run: run ? {
      id: run.id, status: run.status, ms: run.ms ?? null, startedAt: run.startedAt ?? null, error: run.error?.message ?? '',
      steps: (run.steps ?? []).map((s) => ({ name: s.name, type: pick(nodeDef(s.type)?.label, lang) || s.type, status: s.status, ms: s.ms ?? null, port: s.port ?? '', output: text(s.error?.message ?? s.output, 160) })),
    } : null,
  };
}
