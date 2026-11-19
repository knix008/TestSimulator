// Packet colouring rules (View → Coloring Rules). Defaults are Wireshark 4.6's `colorfilters`
// file; import/export uses the same file format:
//   @name@filter@[bg r,g,b][fg r,g,b]      (16-bit channels; a leading '!' marks a disabled rule)
import { compileFilter } from './index.js';

// [name, filter, bg16, fg16] — copied from Wireshark 4.6 (C:\Program Files\Wireshark\colorfilters).
const DEFAULTS_RAW = [
  ['Bad TCP', 'tcp.analysis.flags && !tcp.analysis.window_update && !tcp.analysis.keep_alive && !tcp.analysis.keep_alive_ack', [4718, 10030, 11796], [63479, 34695, 34695]],
  ['HSRP State Change', 'hsrp.state != 8 && hsrp.state != 16', [4718, 10030, 11796], [65535, 64764, 40092]],
  ['Spanning Tree Topology  Change', 'stp.type == 0x80', [4718, 10030, 11796], [65535, 64764, 40092]],
  ['OSPF State Change', 'ospf.msg != 1', [4718, 10030, 11796], [65535, 64764, 40092]],
  ['ICMP errors', 'icmp.type in { 3..5, 11 } || icmpv6.type in { 1..4 }', [4718, 10030, 11796], [47031, 63479, 29812]],
  ['ARP', 'arp', [64250, 61680, 55255], [4718, 10030, 11796]],
  ['ICMP', 'icmp || icmpv6', [64764, 57568, 65535], [4718, 10030, 11796]],
  ['TCP RST', 'tcp.flags.reset eq 1', [42148, 0, 0], [65535, 64764, 40092]],
  ['SCTP ABORT', 'sctp.chunk_type eq ABORT', [42148, 0, 0], [65535, 64764, 40092]],
  ['IPv4 TTL low or unexpected', '(ip.dst != 224.0.0.0/4 && ip.ttl < 5 && !(pim || ospf || eigrp || bgp || tcp.port==179)) || (ip.dst == 224.0.0.0/24 && ip.dst != 224.0.0.251 && ip.ttl != 1 && !(vrrp || carp || eigrp || rip || glbp))', [42148, 0, 0], [60652, 61680, 60395]],
  ['IPv6 hop limit low or unexpected', '(ipv6.dst != ff00::/8 && ipv6.hlim < 5 && !( ospf|| bgp || tcp.port==179)) || (ipv6.dst==ff00::/8 && ipv6.hlim not in {1, 64, 255})', [42148, 0, 0], [60652, 61680, 60395]],
  ['Checksum Errors', 'eth.fcs.status=="Bad" || ip.checksum.status=="Bad" || tcp.checksum.status=="Bad" || udp.checksum.status=="Bad" || sctp.checksum.status=="Bad" || mstp.checksum.status=="Bad" || cdp.checksum.status=="Bad" || edp.checksum.status=="Bad" || wlan.fcs.status=="Bad" || stt.checksum.status=="Bad"', [4718, 10030, 11796], [63479, 34695, 34695]],
  ['SMB', 'smb || nbss || nbns || netbios', [65278, 65535, 53456], [4718, 10030, 11796]],
  ['HTTP', 'http || tcp.port == 80 || http2', [58596, 65535, 51143], [4718, 10030, 11796]],
  ['DCERPC', 'dcerpc', [51199, 38706, 65533], [4718, 10030, 11796]],
  ['Routing', 'hsrp || eigrp || ospf || bgp || cdp || vrrp || carp || gvrp || igmp || ismp', [65534, 62325, 54808], [4718, 10030, 11796]],
  ['TCP SYN/FIN', 'tcp.flags & 0x02 || tcp.flags.fin == 1', [41026, 41026, 41026], [4718, 10030, 11796]],
  ['TCP', 'tcp', [59345, 58980, 65535], [4718, 10030, 11796]],
  ['UDP', 'udp', [56026, 61166, 65535], [4718, 10030, 11796]],
  ['Broadcast', 'eth[0] & 1', [65535, 65535, 65535], [47802, 48573, 46774]],
  ['System Event', 'systemd_journal || sysdig', [59110, 59110, 59110], [11565, 28527, 39578]],
];

const to8 = (v) => Math.max(0, Math.min(255, Math.round(v / 257)));
const hex2 = (n) => n.toString(16).padStart(2, '0');
export const rgb16ToHex = (c) => '#' + c.map((v) => hex2(to8(v))).join('');
export function hexToRgb16(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16) * 257);
}

/** Wireshark's default rules: [{ name, filter, fg, bg, enabled }] with '#rrggbb' colours. */
export const COLORING_RULES = Object.freeze(DEFAULTS_RAW.map(([name, filter, bg, fg]) => Object.freeze({
  name, filter, fg: rgb16ToHex(fg), bg: rgb16ToHex(bg), enabled: true,
})));

// ------------------------------------------------------------------------------------------------
// Dark theme: keep each rule's hue, but put light text on a dark background of that hue.

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => hex2(Math.max(0, Math.min(255, Math.round(v))))).join('');
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const luminance = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

/** Dark-theme variant of a colour pair. Rules that already use a dark background keep it. */
export function darkColor({ fg, bg }) {
  if (luminance(bg) < 0.4) return { fg, bg };
  const [h, s, l] = rgbToHsl(...hexToRgb(bg));
  // light pastel rows → deep tint of the same hue; text light grey
  const sat = s < 0.05 ? 0 : Math.min(0.45, Math.max(0.25, s * 0.5));
  const bgDark = rgbToHex(...hslToRgb(h, sat, l > 0.9 ? 0.2 : 0.24));
  const [fh, fs] = rgbToHsl(...hexToRgb(fg));
  const fgLight = luminance(fg) > 0.6 ? fg : rgbToHex(...hslToRgb(fh, Math.min(fs, 0.3), 0.88));
  return { fg: fgLight, bg: bgDark };
}

/** The same rules with dark-theme colours. */
export function darkColors(rules) {
  return rules.map((r) => ({ ...r, ...darkColor(r) }));
}
export const DARK_COLORING_RULES = Object.freeze(darkColors(COLORING_RULES).map(Object.freeze));

// ------------------------------------------------------------------------------------------------
// Compile + match

/**
 * Compile rules once. Rules whose filter does not compile are kept with `error` and never match
 * (Wireshark disables them and warns). Unknown fields count as absent so that rules for protocols
 * we do not dissect (hsrp, dcerpc …) still work for the rest of their expression.
 * → [{ name, fg, bg, enabled, filter, test|null, error|null }]
 */
export function compileRules(rules, opts = {}) {
  return rules.map((r) => {
    const c = compileFilter(r.filter, { fields: opts.fields, unknownFields: opts.strict ? 'error' : 'absent' });
    return {
      name: r.name, filter: r.filter, fg: r.fg, bg: r.bg, enabled: r.enabled !== false,
      test: c.ok && !c.empty ? c.test : null,
      error: c.ok ? (c.empty ? 'empty filter' : null) : c.error,
    };
  });
}

/** First enabled rule that matches the dissection → { name, fg, bg } | null. */
export function matchColor(compiled, d) {
  for (let i = 0; i < compiled.length; i++) {
    const r = compiled[i];
    if (!r.enabled || r.test === null) continue;
    let hit = false;
    try { hit = r.test(d); } catch { hit = false; }
    if (hit) return { name: r.name, fg: r.fg, bg: r.bg };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// colorfilters file format

/**
 * Parse Wireshark's colorfilters text → { rules: [{ name, filter, fg, bg, enabled }], errors: [{ line, message }] }.
 */
export function parseColorfilters(text) {
  const rules = [];
  const errors = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^(!?)@(.*?)@(.*)@\[(\d+),(\d+),(\d+)\]\[(\d+),(\d+),(\d+)\]\s*$/.exec(line);
    if (!m) { errors.push({ line: i + 1, message: `Could not parse colour filter line: ${line}` }); return; }
    const bg = [+m[4], +m[5], +m[6]], fg = [+m[7], +m[8], +m[9]];
    rules.push({ name: m[2], filter: m[3], fg: rgb16ToHex(fg), bg: rgb16ToHex(bg), enabled: m[1] !== '!' });
  });
  return { rules, errors };
}

/** Serialise rules to the colorfilters format (16-bit channels as Wireshark writes them). */
export function formatColorfilters(rules, { header = '# This file was created by MyNetManager. Edit with care.' } = {}) {
  const defaults = new Map(DEFAULTS_RAW.map(([name, , bg, fg]) => [name, { bg, fg }]));
  const chan = (hex, exact) => {
    // keep Wireshark's exact 16-bit values for unchanged default colours
    if (exact && rgb16ToHex(exact) === hex.toLowerCase()) return exact;
    return hexToRgb16(hex);
  };
  const out = [header];
  for (const r of rules) {
    const d = defaults.get(r.name);
    const bg = chan(r.bg, d && d.bg), fg = chan(r.fg, d && d.fg);
    out.push(`${r.enabled === false ? '!' : ''}@${r.name}@${r.filter}@[${bg.join(',')}][${fg.join(',')}]`);
  }
  return out.join('\n') + '\n';
}
