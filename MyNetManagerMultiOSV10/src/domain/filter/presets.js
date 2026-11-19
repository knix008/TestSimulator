// Preset filters: buttons under every filter box (display filter bar, the start page's capture
// filter, Capture Options). Presets combine with OR — most of them can never match the same packet,
// so AND would mostly show nothing. Nothing is remembered: which presets are on is read back from
// the filter text itself (its top-level "or" parts), so typed text stays and pressing one preset
// never turns another off.

/** Display filters (Wireshark language): [i18n name, filter, icon]. */
export const DISPLAY_PRESETS = [
  ['tcp', 'tcp', 'protoBasics'], ['udp', 'udp', 'protoBasics'], ['http', 'http', 'protoWeb'], ['tls', 'tls', 'protoLock'],
  // One TLS version each: the Protocol column names the version negotiated for the session (TLS 1.3 records still say 0x0303).
  ['tls10', '_ws.col.protocol == "TLSv1"', 'protoLock'], ['tls11', '_ws.col.protocol == "TLSv1.1"', 'protoLock'],
  ['tls12', '_ws.col.protocol == "TLSv1.2"', 'protoLock'], ['tls13', '_ws.col.protocol == "TLSv1.3"', 'protoLock'],
  ['quic', 'quic', 'ioGraph'],
  ['dns', 'dns', 'dnsStats'], ['dhcp', 'dhcp || dhcpv6', 'netHost'], ['arp', 'arp', 'netSwitch'], ['icmp', 'icmp || icmpv6', 'protoRouting'],
  ['syn', 'tcp.flags.syn == 1 && tcp.flags.ack == 0', 'conversations'], ['retrans', 'tcp.analysis.retransmission', 'protoTrouble'],
  ['tcpProblems', 'tcp.analysis.flags && !tcp.analysis.window_update', 'protoTrouble'], ['broadcast', 'eth.dst == ff:ff:ff:ff:ff:ff', 'netCloud'],
  ['noArpDns', 'not arp and not dns', 'filterApply'],
];

/** Capture filters (libpcap / BPF language): [i18n name, filter, icon]. */
export const CAPTURE_PRESETS = [
  ['tcp', 'tcp', 'protoBasics'], ['udp', 'udp', 'protoBasics'], ['web', 'tcp port 80 or tcp port 443', 'protoWeb'], ['dns', 'port 53', 'dnsStats'],
  ['dhcp', 'udp port 67 or udp port 68', 'netHost'], ['arp', 'arp', 'netSwitch'], ['icmp', 'icmp or icmp6', 'protoRouting'], ['ipv6', 'ip6', 'protoRouting'],
  ['vlan', 'vlan', 'protocolHierarchy'], ['noBroadcast', 'not broadcast and not multicast', 'netCloud'],
];

/** The top-level "or" / "||" parts of a filter (outside parentheses and quotes), each trimmed. */
export function orParts(text) {
  const s = String(text ?? '').trim();
  if (!s) return [];
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
      const m = /^\s+or\s+/i.exec(rest) ?? /^\s*\|\|\s*/.exec(rest);
      if (m && (m[0].includes('|') || /\s/.test(s[i]))) {
        parts.push(s.slice(start, i).trim());
        start = i + m[0].length;
        i = start - 1;
      }
    }
  }
  parts.push(s.slice(start).trim());
  return parts.filter(Boolean);
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

/** Which presets the filter text has switched on (by filter string). */
export function activePresets(text, presets) {
  const whole = String(text ?? '').trim();
  const single = presets.find(([, f]) => same(f, whole));
  if (single) return [single[1]];
  const parts = orParts(whole).map(unwrap);
  return presets.filter(([, f]) => parts.some((p) => same(p, f))).map(([, f]) => f);
}

/** The filter after pressing one preset: added as one more OR part, or (when it is on) taken out. Other parts stay. */
export function togglePreset(text, filter, presets) {
  const whole = String(text ?? '').trim();
  let parts = presets.some(([, f]) => same(f, whole)) ? [whole] : orParts(whole).map(unwrap);
  if (parts.some((p) => same(p, filter))) parts = parts.filter((p) => !same(p, filter));
  else parts = [...parts, filter];
  // Parentheses only around a part with operators of its own ("port 53" stays bare, "frame.len > 60" does not).
  const wrap = (p) => (parts.length > 1 && /\b(or|and|not)\b|&&|\|\||!|[=<>~]/i.test(p) ? `(${p})` : p);
  return parts.map(wrap).join(' or ');
}

/** The preset row's HTML: one toggle button per preset, `data-<attr>` carrying the filter. */
export function presetButtons(presets, text, { t, icon, escapeHtml, attr = 'data-preset', label = '', i18n = 'filterPreset' }) {
  const on = new Set(activePresets(text, presets));
  return `<div class="filter-presets" role="toolbar" aria-label="${escapeHtml(label)}">${presets.map(([name, filter, glyph]) => `<button type="button" class="filter-preset ${on.has(filter) ? 'on' : ''}" ${attr}="${escapeHtml(filter)}" title="${escapeHtml(filter)}" aria-pressed="${on.has(filter)}">${icon(glyph)}<span>${escapeHtml(t(`${i18n}.${name}`))}</span></button>`).join('')}</div>`;
}
