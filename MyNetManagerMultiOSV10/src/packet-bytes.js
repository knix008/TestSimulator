// Analyze › Show Packet Bytes (Wireshark's dialog): the bytes of the selected field (or the whole packet),
// first decoded (None, Base64, Hex digits, Percent-encoding, Quoted-printable, ROT13), then shown as
// ASCII, ASCII & control, EBCDIC, Hex dump, C array, Rust array, Raw (hex), UTF-8, UTF-16 or JSON.

export const DECODE_AS = ['none', 'base64', 'hex', 'percent', 'quotedPrintable', 'rot13'];
export const SHOW_AS = ['ascii', 'asciiControl', 'ebcdic', 'hexdump', 'carray', 'rustarray', 'raw', 'utf8', 'utf16', 'json'];

const latin = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const fromLatin = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** The bytes after "Decode as". Bytes that do not decode (bad Base64 …) are left as they were, with the reason. */
export function decodeBytes(bytes, how) {
  try {
    switch (how) {
      case 'base64': {
        const s = latin(bytes).replace(/[\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('not Base64');
        const bin = globalThis.atob(s.padEnd(Math.ceil(s.length / 4) * 4, '='));
        return { bytes: fromLatin(bin) };
      }
      case 'hex': {
        const s = latin(bytes).replace(/[^0-9a-fA-F]/g, '');
        if (!s.length) throw new Error('no hex digits');
        return { bytes: Uint8Array.from(s.slice(0, s.length - (s.length % 2)).match(/../g) ?? [], (h) => parseInt(h, 16)) };
      }
      case 'percent': {
        const out = [];
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i] === 0x25 && i + 2 < bytes.length && /^[0-9a-fA-F]{2}$/.test(String.fromCharCode(bytes[i + 1], bytes[i + 2]))) { out.push(parseInt(String.fromCharCode(bytes[i + 1], bytes[i + 2]), 16)); i += 2; } else out.push(bytes[i]);
        }
        return { bytes: Uint8Array.from(out) };
      }
      case 'quotedPrintable': {
        const s = latin(bytes).replace(/=\r?\n/g, '');
        const out = [];
        for (let i = 0; i < s.length; i++) {
          if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else out.push(s.charCodeAt(i) & 0xff);
        }
        return { bytes: Uint8Array.from(out) };
      }
      case 'rot13':
        return { bytes: Uint8Array.from(bytes, (b) => (b >= 65 && b <= 90 ? ((b - 65 + 13) % 26) + 65 : b >= 97 && b <= 122 ? ((b - 97 + 13) % 26) + 97 : b)) };
      default:
        return { bytes };
    }
  } catch (error) {
    return { bytes, error: String(error?.message ?? error) };
  }
}

// EBCDIC (code page 037) → Latin-1 for the printable part.
const EBCDIC = (() => {
  const map = new Array(256).fill('.');
  const set = (from, chars) => { for (let i = 0; i < chars.length; i++) map[from + i] = chars[i]; };
  map[0x40] = ' ';
  set(0x4a, '¢.<(+|&'); set(0x5a, '!$*);¬-/'); set(0x6a, '¦,%_>?'); set(0x79, '`:#@\'="');
  set(0x81, 'abcdefghi'); set(0x91, 'jklmnopqr'); set(0xa1, '~stuvwxyz'); set(0xc0, '{ABCDEFGHI'); set(0xd0, '}JKLMNOPQR'); set(0xe0, '\\'); set(0xe2, 'STUVWXYZ'); set(0xf0, '0123456789');
  return map;
})();

const hex2 = (b) => b.toString(16).padStart(2, '0');

/** The decoded bytes as text in one of SHOW_AS. */
export function showBytes(bytes, as) {
  switch (as) {
    case 'asciiControl': return Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : b === 10 ? '\n' : b === 13 ? '' : b === 9 ? '\t' : b < 32 ? String.fromCharCode(0x2400 + b) : '.')).join('');
    case 'ebcdic': return Array.from(bytes, (b) => EBCDIC[b]).join('');
    case 'hexdump': {
      const lines = [];
      for (let i = 0; i < bytes.length; i += 16) {
        const row = bytes.subarray(i, i + 16);
        lines.push(`${i.toString(16).padStart(4, '0')}  ${Array.from(row, hex2).join(' ').padEnd(47)}   ${Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}`);
      }
      return lines.join('\n');
    }
    case 'carray': return `char packet_bytes[] = {\n${chunks(bytes, 8).map((row) => `  ${row.map((b) => `0x${hex2(b)}`).join(', ')}`).join(',\n')}\n};`;
    case 'rustarray': return `let packet_bytes: [u8; ${bytes.length}] = [\n${chunks(bytes, 8).map((row) => `    ${row.map((b) => `0x${hex2(b)}u8`).join(', ')}`).join(',\n')}\n];`;
    case 'raw': return Array.from(bytes, hex2).join('');
    case 'utf8': return new TextDecoder('utf-8').decode(bytes);
    case 'utf16': return new TextDecoder('utf-16le').decode(bytes);
    case 'json': {
      const text = new TextDecoder('utf-8').decode(bytes);
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
    }
    default: return Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : b === 10 ? '\n' : b === 9 ? '\t' : b === 13 ? '' : '.')).join('');
  }
}

function chunks(bytes, size) {
  const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(Array.from(bytes.subarray(i, i + size)));
  return out;
}

/**
 * The popup view: the selected field's bytes (opts.start / opts.length within frame opts.index, or the
 * whole frame), decoded as opts.decodeAs, shown as opts.showAs, with the two choices as button rows.
 */
export function packetBytesView(doc, opts, t) {
  const index = opts.index ?? doc.selected;
  if (index == null || index < 0) return { error: t('notice.selectPacket') };
  // A field of a reassembled or decrypted part lives in another data source of the dissection.
  const data = (opts.source ? doc.dissection(index).sources?.[opts.source]?.data : null) ?? doc.frames[index].data;
  const start = Number.isInteger(opts.start) && opts.start >= 0 && opts.start < data.length ? opts.start : 0;
  const length = Number.isInteger(opts.length) && opts.length > 0 ? Math.min(opts.length, data.length - start) : data.length - start;
  const decodeAs = DECODE_AS.includes(opts.decodeAs) ? opts.decodeAs : 'none';
  const showAs = SHOW_AS.includes(opts.showAs) ? opts.showAs : 'ascii';
  const decoded = decodeBytes(data.subarray(start, start + length), decodeAs);
  const what = opts.label ? `${opts.label} — ` : '';
  return {
    view: 'text',
    text: showBytes(decoded.bytes, showAs),
    note: `${what}${t('packetBytes.summary', { frame: index + 1, start, length, decoded: decoded.bytes.length })}${decoded.error ? ` · ${t('packetBytes.decodeFailed', { error: decoded.error })}` : ''}`,
    choices: [
      { key: 'decodeAs', label: t('packetBytes.decodeAs'), value: decodeAs, options: DECODE_AS.map((id) => ({ id, label: t(`packetBytes.decode.${id}`) })) },
      { key: 'showAs', label: t('packetBytes.showAs'), value: showAs, options: SHOW_AS.map((id) => ({ id, label: t(`packetBytes.show.${id}`) })) },
    ],
  };
}
