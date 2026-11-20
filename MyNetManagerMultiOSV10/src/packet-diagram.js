// View › Packet Diagram (Wireshark): each protocol header of the selected packet drawn as rows of 32 bits,
// one box per field. Bit fields ("0100 .... = Version") take only their bits, read from the label's bit
// pattern. Long fields (payload, options) are cut after MAX_ROWS rows per protocol.
import { FIELDS } from './domain/dissect/index.js';

const ROW_BITS = 32;
const BIT_W = 20;
const ROW_H = 30;
const LEFT = 34;
const MAX_ROWS = 16;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BITS = /^((?:[01.]{4} ?)+)= /;

/** A field's bits inside its bytes from its label ("..0. .... = More fragments") → { offset, width } or null. */
export function labelBits(label, length) {
  const m = BITS.exec(String(label ?? ''));
  if (!m) return null;
  const pattern = m[1].replace(/ /g, '');
  if (pattern.length !== length * 8) return null;
  const first = pattern.search(/[01]/);
  if (first < 0) return null;
  const last = pattern.length - 1 - [...pattern].reverse().join('').search(/[01]/);
  return { offset: first, width: last - first + 1 };
}

/** The fields a protocol's diagram shows: [{ abbrev, name, value, bit, bits }] (bit offsets from the protocol start). */
export function diagramFields(proto) {
  const base = proto.start * 8;
  const out = [];
  const add = (node) => {
    if (node.hidden || node.generated || !node.length || node.source !== proto.source) return false;
    const bits = labelBits(node.label, node.length);
    const bit = node.start * 8 - base + (bits ? bits.offset : 0);
    const width = bits ? bits.width : node.length * 8;
    if (bit < 0 || width <= 0) return false;
    out.push({ abbrev: node.abbrev, name: FIELDS.get(node.abbrev)?.name ?? (String(node.label ?? '').replace(BITS, '').split(':')[0].trim() || node.abbrev || '?'), value: node.value, label: node.label, bit, bits: width });
    return true;
  };
  for (const child of proto.children ?? []) {
    const kids = (child.children ?? []).filter((k) => !k.hidden && !k.generated && k.length);
    // A byte or word of flags is drawn as its bits when every part has a bit pattern (DSCP / ECN, TCP flags).
    // (Not a 6-byte MAC address whose LG / IG bits are listed under it: that stays one box.)
    if (!labelBits(child.label, child.length) && child.length <= 4 && kids.length && kids.every((k) => labelBits(k.label, k.length))) kids.forEach(add);
    else add(child);
  }
  // In bit order; a field overlapping one already placed (another view of the same bits) is left out.
  out.sort((a, b) => a.bit - b.bit || b.bits - a.bits);
  const placed = [];
  let end = 0;
  for (const f of out) {
    if (f.bit < end) continue;
    placed.push(f);
    end = f.bit + f.bits;
  }
  return placed;
}

/** One protocol as an SVG: rows of 32 bits with the bit numbers on top and byte offsets on the left. */
function protocolSvg(proto, fields, { showValues }) {
  const totalBits = Math.min(proto.length * 8, MAX_ROWS * ROW_BITS);
  const rows = Math.max(1, Math.ceil(totalBits / ROW_BITS));
  const width = LEFT + ROW_BITS * BIT_W + 2;
  const height = 18 + rows * ROW_H + 2;
  const parts = [];
  for (let b = 0; b < ROW_BITS; b += 1) if (b % 4 === 0 || b === ROW_BITS - 1) parts.push(`<text class="pd-bitno" x="${LEFT + b * BIT_W + BIT_W / 2}" y="12">${b}</text>`);
  for (let r = 0; r < rows; r += 1) parts.push(`<text class="pd-offset" x="${LEFT - 6}" y="${18 + r * ROW_H + ROW_H / 2 + 4}">${r * 4}</text>`);
  for (const f of fields) {
    if (f.bit >= totalBits) break;
    const label = showValues && f.value != null && typeof f.value !== 'object' ? `${f.name}: ${f.value}` : f.name;
    let bit = f.bit;
    const stop = Math.min(f.bit + f.bits, totalBits);
    while (bit < stop) {
      const row = Math.floor(bit / ROW_BITS);
      const col = bit % ROW_BITS;
      const span = Math.min(stop - bit, ROW_BITS - col);
      const x = LEFT + col * BIT_W;
      const y = 18 + row * ROW_H;
      const w = span * BIT_W;
      const chars = Math.max(0, Math.floor((w - 6) / 6.6));
      const text = label.length > chars ? (chars > 2 ? `${label.slice(0, chars - 1)}…` : '') : label;
      parts.push(`<g class="pd-field" data-field="${esc(f.abbrev)}"><title>${esc(f.label)}</title><rect class="pd-box" x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${ROW_H - 1}" rx="2"/><text class="pd-name" x="${x + w / 2}" y="${y + ROW_H / 2 + 4}">${esc(text)}</text></g>`);
      bit += span;
    }
  }
  const cut = proto.length * 8 > totalBits ? `<text class="pd-more" x="${LEFT}" y="${height + 12}">… ${proto.length - totalBits / 8} more bytes</text>` : '';
  return `<svg class="pd-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + (cut ? 16 : 0)}" style="width:${width}px;height:${height + (cut ? 16 : 0)}px" viewBox="0 0 ${width} ${height + (cut ? 16 : 0)}">${parts.join('')}${cut}</svg>`;
}

/**
 * The popup view of frame `index`: { view: 'diagram', sections: [{ title, abbrev, svg, fields }] }, one per
 * protocol in the packet (Frame itself left out), with the "Show field values" choice.
 */
export function packetDiagramView(doc, opts, t) {
  const index = opts.index ?? doc.selected;
  if (index == null || index < 0) return { error: t('notice.selectPacket') };
  const d = doc.dissection(index);
  const showValues = opts.showValues === 'on';
  const sections = [];
  for (const proto of d.tree ?? []) {
    if (proto.type !== 'protocol' || proto.hidden || proto.generated || proto.abbrev === 'frame' || !proto.length) continue;
    const fields = diagramFields(proto);
    if (!fields.length) continue;
    sections.push({ title: proto.label, abbrev: proto.abbrev, fields, svg: protocolSvg(proto, fields, { showValues }) });
  }
  // The same as text (copy, save, print): each protocol, then its fields with their bit ranges.
  const text = sections.map((s) => [s.title, ...s.fields.map((f) => `  ${String(f.bit).padStart(4)}–${String(f.bit + f.bits - 1).padEnd(5)} ${f.name}${showValues && f.value != null ? `: ${f.value}` : ''}`)].join('\n')).join('\n\n');
  return {
    view: 'diagram', sections, text, note: t('packetDiagram.note', { frame: index + 1 }),
    choices: [{ key: 'showValues', label: t('packetDiagram.values'), value: showValues ? 'on' : 'off', options: [{ id: 'off', label: t('packetDiagram.namesOnly') }, { id: 'on', label: t('packetDiagram.withValues') }] }],
  };
}
