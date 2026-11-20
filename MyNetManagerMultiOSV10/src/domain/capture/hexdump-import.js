// File › Import from Hex Dump (Wireshark's text2pcap): turns a hex dump back into packets.
//
// Accepted text, as text2pcap / Wireshark's import dialog:
//   - offset lines: "0000  00 1a a0 01 02 03 …  ........" — a hexadecimal offset (2–8 digits, an optional
//     colon), then bytes as two hex digits separated by spaces; anything after the bytes (the ASCII column)
//     is ignored. Offset 0 starts a new packet. When the next line's offset is known, a line holds exactly
//     (next − this) bytes, so an ASCII column that happens to look like hex ("ab cd") is not read as bytes.
//   - a line of hex digits only, without spaces (a "hex stream", e.g. Copy › …as Hex Stream): one packet.
// Other lines (titles, "Frame 1: …", blank lines) are skipped.

const OFFSET_LINE = /^\s*([0-9a-fA-F]{2,8}):?\s+(.*)$/;
const HEX_STREAM = /^\s*(?:[0-9a-fA-F]{2}){2,}\s*$/;

/** The packets of a hex dump: [Uint8Array]. */
export function parseHexDump(text) {
  const parsed = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ');
    if (!line.trim()) continue;
    if (HEX_STREAM.test(line)) {
      const hex = line.trim();
      if (hex.length % 2 === 0) { parsed.push({ stream: true, bytes: hex.match(/../g).map((h) => parseInt(h, 16)) }); continue; }
    }
    const m = OFFSET_LINE.exec(line);
    if (!m) continue;
    // Bytes until the first token that is not two hex digits, or a gap of three or more spaces after
    // some bytes (where the ASCII column starts — it may contain "ab cd" on the last line of a packet).
    const bytes = [];
    for (const [, gap, token] of m[2].matchAll(/(\s*)(\S+)/g)) {
      if (bytes.length && gap.length >= 3) break;
      if (!/^[0-9a-fA-F]{2}$/.test(token)) break;
      bytes.push(parseInt(token, 16));
    }
    if (bytes.length) parsed.push({ offset: parseInt(m[1], 16), bytes });
  }
  const packets = [];
  let current = null;
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (p.stream) { if (current?.length) packets.push(current); current = null; packets.push(p.bytes); continue; }
    if (p.offset === 0 || !current) { if (current?.length) packets.push(current); current = []; }
    // A gap: text2pcap cannot place the bytes, so it drops the line; an overlap rewrites from that offset.
    if (p.offset > current.length) continue;
    current.length = p.offset;
    let bytes = p.bytes;
    const next = parsed[i + 1];
    if (next && !next.stream && next.offset > p.offset) bytes = bytes.slice(0, next.offset - p.offset);
    current.push(...bytes);
  }
  if (current?.length) packets.push(current);
  return packets.filter((p) => p.length).map((p) => Uint8Array.from(p));
}

/** Link types the import offers (pcap LINKTYPE_*). */
export const IMPORT_LINKTYPES = [
  { id: 1, name: 'Ethernet' }, { id: 101, name: 'Raw IP' }, { id: 105, name: 'IEEE 802.11' }, { id: 113, name: 'Linux cooked (SLL)' },
];

/** The link type a packet most likely has: Raw IP when it starts with an IPv4 / IPv6 header, else Ethernet. */
export function guessLinktype(packets) {
  const p = packets[0];
  if (!p?.length) return 1;
  const version = p[0] >> 4;
  if ((version === 4 && (p[0] & 0x0f) >= 5 && p.length >= 20 && ((p[2] << 8) | p[3]) === p.length) || (version === 6 && p.length >= 40 && ((p[4] << 8) | p[5]) + 40 === p.length)) return 101;
  return 1;
}

/** A classic pcap file of `packets` (microsecond stamps from `start`, one per `stepUs`). */
export function packetsToPcap(packets, { linktype = 1, start = Date.now() / 1000, stepUs = 1000 } = {}) {
  const size = 24 + packets.reduce((n, p) => n + 16 + p.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0xa1b2c3d4, true); view.setUint16(4, 2, true); view.setUint16(6, 4, true);
  view.setInt32(8, 0, true); view.setUint32(12, 0, true); view.setUint32(16, 262144, true); view.setUint32(20, linktype, true);
  let at = 24;
  let us = Math.round(start * 1e6);
  for (const p of packets) {
    view.setUint32(at, Math.floor(us / 1e6), true); view.setUint32(at + 4, us % 1e6, true);
    view.setUint32(at + 8, p.length, true); view.setUint32(at + 12, p.length, true);
    out.set(p, at + 16);
    at += 16 + p.length;
    us += stepUs;
  }
  return out;
}
