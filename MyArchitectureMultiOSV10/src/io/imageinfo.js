// Image headers without decoding: pixel size and MIME type of PNG, JPEG,
// GIF, WebP, BMP and SVG data, and data: URI handling. Used by the SVG
// importer (embedded <image>s become tracing underlays) and the PDF writer.

const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

// bytes → {mime, width, height} or null.
export function imageInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b.length >= 24) return { mime: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  if (ascii(b, 0, 3) === "GIF") return { mime: "image/gif", width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  if (ascii(b, 0, 2) === "BM" && b.length >= 26) return { mime: "image/bmp", width: Math.abs(dv.getInt32(18, true)), height: Math.abs(dv.getInt32(22, true)) };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP" && b.length >= 30) {
    const kind = ascii(b, 12, 4);
    if (kind === "VP8 ") return { mime: "image/webp", width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (kind === "VP8L") { const v = dv.getUint32(21, true); return { mime: "image/webp", width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === "VP8X") return { mime: "image/webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return { mime: "image/webp", width: 0, height: 0 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = dv.getUint16(i + 2);
      // SOF0…SOF15 except DHT (C4), JPG (C8) and DAC (CC).
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mime: "image/jpeg", width: dv.getUint16(i + 7), height: dv.getUint16(i + 5), components: b[i + 9], bits: b[i + 4], progressive: m === 0xc2 };
      }
      i += 2 + len;
    }
    return { mime: "image/jpeg", width: 0, height: 0 };
  }
  const head = new TextDecoder("utf-8").decode(b.subarray(0, Math.min(b.length, 4096)));
  if (/<svg[\s>]/i.test(head)) {
    const tag = /<svg[^>]*>/i.exec(head)?.[0] || "";
    const attr = (k) => new RegExp(`\\s${k}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
    const px = (v) => { const n = parseFloat(v); if (!Number.isFinite(n) || /%$/.test(String(v).trim())) return 0; const u = String(v).trim().toLowerCase().replace(/[\d.\s+-]/g, ""); return n * ({ mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 4 / 3, pc: 16 }[u] || 1); };
    let w = px(attr("width")), h = px(attr("height"));
    const vb = (attr("viewBox") || "").split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      if (!w && !h) { w = vb[2]; h = vb[3]; } else if (!w) w = (h * vb[2]) / vb[3];
      else if (!h) h = (w * vb[3]) / vb[2];
    }
    return { mime: "image/svg+xml", width: w || 300, height: h || 150 };
  }
  return null;
}

export const MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml" };

function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function bytesToDataUri(bytes, mime) { return `data:${mime};base64,${base64(bytes)}`; }

// "data:…" → {mime, bytes} or null.
export function parseDataUri(uri) {
  const m = /^data:([^,]*?),(.*)$/s.exec(String(uri || "").trim());
  if (!m) return null;
  const meta = m[1].split(";").map((x) => x.trim());
  const isB64 = meta.some((x) => x.toLowerCase() === "base64");
  const mime = (meta[0] && meta[0].includes("/") ? meta[0] : "text/plain").toLowerCase();
  let bytes;
  if (isB64) {
    const bin = atob(m[2].replace(/[^A-Za-z0-9+/=]/g, ""));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else bytes = new TextEncoder().encode(decodeURIComponent(m[2]));
  return { mime, bytes };
}
