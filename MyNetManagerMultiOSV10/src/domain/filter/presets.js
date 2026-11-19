// Preset filters: buttons under every filter box (display filter bar, the start page's capture
// filter, Capture Options). Presets combine with OR — most of them can never match the same packet,
// so AND would mostly show nothing. Nothing is remembered: which presets are on is read back from
// the filter text itself (its top-level "or" parts), so typed text stays and pressing one preset
// never turns another off.
//
// A few presets are switches instead (fourth field 'exclude'): ON lets their packets in (the default,
// nothing in the text), OFF keeps them out by AND-ing their filter onto the end of the text —
// "(tcp or udp) and (not arp and not dns)". OR would not work for them: "tcp or not arp" lets in
// every packet that is not ARP.

export const EXCLUDE = 'exclude';

/** Display filters (Wireshark language): [i18n name, filter, icon, kind?]. An 'exclude' filter is what OFF adds. */
export const DISPLAY_PRESETS = [
  ['tcp', 'tcp', 'protoBasics'], ['udp', 'udp', 'protoBasics'], ['http', 'http', 'protoWeb'], ['tls', 'tls', 'protoLock'],
  // One TLS version each: the Protocol column names the version negotiated for the session (TLS 1.3 records still say 0x0303).
  ['tls10', '_ws.col.protocol == "TLSv1"', 'protoLock'], ['tls11', '_ws.col.protocol == "TLSv1.1"', 'protoLock'],
  ['tls12', '_ws.col.protocol == "TLSv1.2"', 'protoLock'], ['tls13', '_ws.col.protocol == "TLSv1.3"', 'protoLock'],
  ['quic', 'quic', 'ioGraph'],
  ['dns', 'dns', 'dnsStats'], ['dhcp', 'dhcp || dhcpv6', 'netHost'], ['arp', 'arp', 'netSwitch'], ['icmp', 'icmp || icmpv6', 'protoRouting'],
  ['syn', 'tcp.flags.syn == 1 && tcp.flags.ack == 0', 'conversations'], ['retrans', 'tcp.analysis.retransmission', 'protoTrouble'],
  ['tcpProblems', 'tcp.analysis.flags && !tcp.analysis.window_update', 'protoTrouble'], ['broadcast', 'eth.dst == ff:ff:ff:ff:ff:ff', 'netCloud'],
  ['arpDns', 'not arp and not dns', 'filterApply', EXCLUDE],
];

/** Capture filters (libpcap / BPF language): [i18n name, filter, icon, kind?]. */
export const CAPTURE_PRESETS = [
  ['tcp', 'tcp', 'protoBasics'], ['udp', 'udp', 'protoBasics'], ['web', 'tcp port 80 or tcp port 443', 'protoWeb'], ['dns', 'port 53', 'dnsStats'],
  ['dhcp', 'udp port 67 or udp port 68', 'netHost'], ['arp', 'arp', 'netSwitch'], ['icmp', 'icmp or icmp6', 'protoRouting'], ['ipv6', 'ip6', 'protoRouting'],
  ['vlan', 'vlan', 'protocolHierarchy'], ['bcastMcast', 'not broadcast and not multicast', 'netCloud', EXCLUDE],
];

const isExclude = (preset) => preset[3] === EXCLUDE;

/** Top-level parts split by `or`/`||` (op 'or') or `and`/`&&` (op 'and'), with where each starts. */
function topParts(text, op) {
  const s = String(text ?? '').trim();
  if (!s) return [];
  const word = op === 'and' ? /^\s+and\s+/i : /^\s+or\s+/i;
  const sym = op === 'and' ? /^\s*&&\s*/ : /^\s*\|\|\s*/;
  const parts = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const rest = s.slice(i);
      const m = word.exec(rest) ?? sym.exec(rest);
      if (m && (/[|&]/.test(m[0]) || /\s/.test(s[i]))) {
        parts.push({ text: s.slice(start, i).trim(), at: start });
        start = i + m[0].length;
        i = start - 1;
      }
    }
  }
  parts.push({ text: s.slice(start).trim(), at: start });
  return parts.filter((p) => p.text);
}

/** The top-level "or" / "||" parts of a filter (outside parentheses and quotes), each trimmed. */
export function orParts(text) {
  return topParts(text, 'or').map((p) => p.text);
}

const unwrap = (part) => {
  let p = part.trim();
  // Only one pair of parentheses around the whole part, e.g. "(icmp || icmpv6)".
  while (p.startsWith('(') && p.endsWith(')') && orParts(p.slice(1, -1)).length >= 1 && balanced(p.slice(1, -1))) p = p.slice(1, -1).trim();
  return p;
};
function balanced(s) {
  let depth = 0;
  for (const ch of s) { if (ch === '(') depth++; else if (ch === ')' && --depth < 0) return false; }
  return depth === 0;
}
const same = (a, b) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * Reads a filter text back as { parts, excluded }: the OR parts (presets and typed text) and the
 * exclude presets that are OFF (their filter AND-ed on at the end, in any order).
 */
function parse(text, presets) {
  let whole = String(text ?? '').trim();
  const excludes = presets.filter(isExclude);
  const excluded = [];
  for (let found = true; found && whole;) {
    found = false;
    for (const [, f] of excludes) {
      if (excluded.includes(f)) continue;
      if (same(unwrap(whole), f)) { excluded.push(f); whole = ''; found = true; break; }
      // The exclusion as the last top-level AND part(s): "... and (not arp and not dns)" or "... and not arp and not dns".
      const ands = topParts(whole, 'and');
      const own = topParts(f, 'and').map((p) => p.text);
      for (const k of [1, own.length]) {
        if (ands.length <= k) continue;
        const tail = ands.slice(-k).map((p) => unwrap(p.text));
        if (k === 1 ? same(tail[0], f) : tail.every((p, i) => same(p, own[i]))) {
          excluded.push(f);
          whole = whole.slice(0, ands[ands.length - k].at).replace(/\s*(?:\band\b|&&)\s*$/i, '').trim();
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
  const base = unwrap(whole);
  const single = presets.find((p) => !isExclude(p) && same(p[1], base));
  const parts = !base ? [] : single ? [single[1]] : orParts(base).map(unwrap);
  return { parts, excluded };
}

/** Which OR presets the filter text has switched on (by filter string). */
export function activePresets(text, presets) {
  const { parts } = parse(text, presets);
  return presets.filter((p) => !isExclude(p) && parts.some((q) => same(q, p[1]))).map(([, f]) => f);
}

/** Which exclude presets are OFF, i.e. keep their packets out (by filter string). */
export function excludedPresets(text, presets) {
  return parse(text, presets).excluded;
}

/** The two buttons before the presets: every preset on (ALL) and every OR preset off (NONE). */
export const ALL = '*all';
export const NONE = '*none';

/**
 * The filter after pressing one preset: an OR preset is added as one more OR part, or (when it is on)
 * taken out; an exclude preset flips between letting its packets in and keeping them out. ALL turns
 * every preset on (nothing excluded), NONE turns the OR presets off and leaves the switches as they
 * are; typed parts that are not presets stay in every case.
 */
export function togglePreset(text, filter, presets) {
  let { parts, excluded } = parse(text, presets);
  const isPreset = (p) => presets.some((q) => !isExclude(q) && same(q[1], p));
  const exclude = presets.find((q) => isExclude(q) && same(q[1], filter));
  if (filter === ALL) { parts = [...parts.filter((p) => !isPreset(p)), ...presets.filter((q) => !isExclude(q)).map(([, f]) => f)]; excluded = []; }
  else if (filter === NONE) parts = parts.filter((p) => !isPreset(p));
  else if (exclude) excluded = excluded.includes(exclude[1]) ? excluded.filter((f) => f !== exclude[1]) : [...excluded, exclude[1]];
  else if (parts.some((p) => same(p, filter))) parts = parts.filter((p) => !same(p, filter));
  else parts = [...parts, filter];
  // Parentheses only around a part with operators of its own ("port 53" stays bare, "frame.len > 60" does not).
  const ops = (p) => /\b(or|and|not)\b|&&|\|\||!|[=<>~]/i.test(p);
  const wrap = (p) => (parts.length > 1 && ops(p) ? `(${p})` : p);
  const base = parts.map(wrap).join(' or ');
  if (!excluded.length) return base;
  // Keep the preset order for the exclusions, so the text does not depend on the order of the presses.
  const outs = presets.filter((q) => isExclude(q) && excluded.includes(q[1])).map(([, f]) => f);
  if (!base && outs.length === 1) return outs[0];
  const head = base ? [parts.length > 1 || ops(base) ? `(${base})` : base] : [];
  return [...head, ...outs.map((f) => `(${f})`)].join(' and ');
}

/** The preset row's HTML: one toggle button per preset, `data-<attr>` carrying the filter. */
export function presetButtons(presets, text, { t, icon, escapeHtml, attr = 'data-preset', label = '', i18n = 'filterPreset' }) {
  const on = new Set(activePresets(text, presets));
  const out = new Set(excludedPresets(text, presets));
  const pressed = (p) => (isExclude(p) ? !out.has(p[1]) : on.has(p[1]));
  const all = presets.every(pressed);
  const special = [[ALL, 'all', 'check', all], [NONE, 'none', 'close', false]].map(([value, name, glyph, isOn]) => `<button type="button" class="filter-preset preset-${name} ${isOn ? 'on' : ''}" ${attr}="${escapeHtml(value)}" title="${escapeHtml(t(`${i18n}.${name}`))}" ${name === 'all' ? `aria-pressed="${isOn}"` : ''} ${name === 'none' && !on.size ? 'disabled' : ''}>${icon(glyph)}<span>${escapeHtml(t(`${i18n}.${name}`))}</span></button>`).join('');
  const tip = (p) => (isExclude(p) ? `${t(`${i18n}.excludeTip`)} ${p[1]}` : p[1]);
  return `<div class="filter-presets" role="toolbar" aria-label="${escapeHtml(label)}">${special}<span class="preset-sep" aria-hidden="true"></span>${presets.map((p) => `<button type="button" class="filter-preset ${isExclude(p) ? 'preset-switch' : ''} ${pressed(p) ? 'on' : ''}" ${attr}="${escapeHtml(p[1])}" title="${escapeHtml(tip(p))}" aria-pressed="${pressed(p)}">${icon(p[2])}<span>${escapeHtml(t(`${i18n}.${p[0]}`))}</span></button>`).join('')}</div>`;
}
