// The block library: every block definition, grouped like the familiar
// library sections (our own names). Used by the engine (make → runtime) and
// by the editor (library browser, dialogs, icons, ports).
import { L } from './util.js';
import * as sources from './sources.js';
import * as sinks from './sinks.js';
import * as continuous from './continuous.js';
import * as discrete from './discrete.js';
import * as math from './math.js';
import * as logic from './logic.js';
import * as discont from './discont.js';
import * as lookup from './lookup.js';
import * as routing from './routing.js';
import * as ports from './ports.js';
import * as userfn from './userfn.js';
import * as attributes from './attributes.js';

export const GROUPS = [
  { id: 'sources', label: L('Sources', '소스'), icon: 'source' },
  { id: 'sinks', label: L('Sinks', '싱크'), icon: 'sink' },
  { id: 'continuous', label: L('Continuous', '연속'), icon: 'continuous' },
  { id: 'discrete', label: L('Discrete', '이산'), icon: 'discrete' },
  { id: 'math', label: L('Math Operations', '수학 연산'), icon: 'math' },
  { id: 'logic', label: L('Logic and Bit Operations', '논리 및 비트 연산'), icon: 'logic' },
  { id: 'discont', label: L('Discontinuities', '불연속'), icon: 'discont' },
  { id: 'lookup', label: L('Lookup Tables', '룩업 테이블'), icon: 'lookup' },
  { id: 'routing', label: L('Signal Routing', '신호 라우팅'), icon: 'routing' },
  { id: 'ports', label: L('Ports & Subsystems', '포트 및 서브시스템'), icon: 'subsystem' },
  { id: 'userfn', label: L('User-Defined Functions', '사용자 정의 함수'), icon: 'function' },
  { id: 'attributes', label: L('Signal Attributes', '신호 속성'), icon: 'attributes' },
  { id: 'verification', label: L('Model Verification', '모델 검증'), icon: 'verify' },
];

export const BLOCKS = Object.create(null);
const items = [];
for (const mod of [sources, sinks, continuous, discrete, math, logic, discont, lookup, routing, ports, userfn, attributes]) {
  for (const d of mod.BLOCKS) {
    if (BLOCKS[d.type]) throw new Error(`Block type ${d.type} defined twice`);
    BLOCKS[d.type] = d;
    if (!d.hidden) items.push({ id: d.type, type: d.type, group: d.group, label: d.label, desc: d.desc });
  }
  for (const x of mod.LIBRARY_EXTRA || []) items.push(x);
}

/** Library entries [{ id, type, group, label, variant?, params? }] in group order. */
export const LIBRARY = GROUPS.flatMap((g) => items.filter((i) => i.group === g.id));

export const blockDef = (type) => BLOCKS[type] || null;

export function defaultParams(type) {
  const d = BLOCKS[type];
  const p = {};
  if (d) for (const q of d.params) p[q.name] = q.def;
  return p;
}

/** Port counts: { in, out, special:['enable'|'trigger'|'action'], inLabels, outLabels }. */
export function portsOf(block) {
  const d = BLOCKS[block.type];
  if (!d) return { in: 0, out: 0, special: [] };
  let r = typeof d.ports === 'function' ? d.ports(block.params || {}, block) : d.ports;
  r = { special: [], ...r };
  if (!(r.in >= 0)) r.in = 0;
  if (!(r.out >= 0)) r.out = 0;
  return r;
}

/** Icon hint for the editor: { text } | { glyph, text? } | { frac:[num, den] } … */
export function iconOf(block) {
  const d = BLOCKS[block.type];
  if (!d) return { text: block.type };
  try { return d.icon(block.params || {}, block) || { text: d.label.en }; } catch { return { text: d.label.en }; }
}

/** Library entries matching a search text (label in either language, or type). */
export function searchLibrary(text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return LIBRARY;
  // every word must appear in the type or one of the labels ('PID 제어기', 'transfer fcn', 'gain slider')
  const words = q.split(/\s+/).filter(Boolean);
  const hay = (i) => [i.type, i.label.en, i.label.ko || ''].map((s) => String(s).toLowerCase());
  return LIBRARY.filter((i) => {
    const h = hay(i);
    if (h.some((s) => s.includes(q))) return true;
    const all = h.join(' ');
    return words.every((w) => all.includes(w));
  });
}
