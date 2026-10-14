// ICC colour profiles: pictures saved in Adobe RGB, ProPhoto, Display P3,
// a scanner's or a camera's own space look washed out or too strong when
// shown as if they were sRGB. The browser converts JPEG, PNG and WebP itself;
// this converts what our own decoders produce (TIFF, PSD …).
//
// Supported: matrix/TRC profiles (RGB: rXYZ gXYZ bXYZ + rTRC gTRC bTRC; grey:
// kTRC) with gamma, table or parametric curves, ICC v2 and v4. Profiles built
// on lookup tables only (A2B0 without the matrix tags, CMYK …) are reported
// and left unconverted.

const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));
const u32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u16 = (b, at) => (b[at] << 8) | b[at + 1];
const s15 = (b, at) => (u32(b, at) | 0) / 65536;

function readCurve(b, at) {
  const type = ascii(b, at, 4);
  if (type === 'curv') {
    const n = u32(b, at + 8);
    if (n === 0) return (x) => x;
    if (n === 1) { const g = u16(b, at + 12) / 256; return (x) => x ** g; }
    const table = new Float32Array(n);
    for (let i = 0; i < n; i++) table[i] = u16(b, at + 12 + i * 2) / 65535;
    return (x) => {
      const p = Math.max(0, Math.min(1, x)) * (n - 1);
      const i = Math.floor(p);
      return i >= n - 1 ? table[n - 1] : table[i] + (table[i + 1] - table[i]) * (p - i);
    };
  }
  if (type === 'para') {
    const fn = u16(b, at + 8);
    const count = [1, 3, 4, 5, 7][fn];
    if (count == null) return null;
    const [g, a = 1, bb = 0, c = 0, d = 0, e = 0, f = 0] = Array.from({ length: count }, (_, i) => s15(b, at + 12 + i * 4));
    switch (fn) {
      case 0: return (x) => x ** g;
      case 1: return (x) => (x >= -bb / a ? (a * x + bb) ** g : 0);
      case 2: return (x) => (x >= -bb / a ? (a * x + bb) ** g + c : c);
      case 3: return (x) => (x >= d ? (a * x + bb) ** g : c * x);
      default: return (x) => (x >= d ? (a * x + bb) ** g + e : c * x + f);
    }
  }
  return null;
}

function readText(b, at, size) {
  const type = ascii(b, at, 4);
  if (type === 'desc') { const n = u32(b, at + 8); return ascii(b, at + 12, Math.max(0, n - 1)).replace(/\0+$/, ''); }
  if (type === 'mluc') {
    const count = u32(b, at + 8);
    if (!count) return '';
    const length = u32(b, at + 20);
    const offset = u32(b, at + 24);
    let s = '';
    for (let i = 0; i < length; i += 2) s += String.fromCharCode(u16(b, at + offset + i));
    return s.replace(/\0+$/, '');
  }
  if (type === 'text') return ascii(b, at + 8, size - 8).replace(/\0+$/, '');
  return '';
}

/** Parses an ICC profile: { description, space, pcs, matrix (3 × 3, columns r g b in XYZ D50), curves, gray, supported }. */
export function parseIcc(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 132 || ascii(b, 36, 4) !== 'acsp') throw new Error('not an ICC profile');
  const space = ascii(b, 16, 4).trim();
  const pcs = ascii(b, 20, 4).trim();
  const tags = new Map();
  const count = u32(b, 128);
  for (let i = 0; i < count; i++) {
    const at = 132 + i * 12;
    tags.set(ascii(b, at, 4), { offset: u32(b, at + 4), size: u32(b, at + 8) });
  }
  const tag = (sig) => tags.get(sig);
  const xyz = (sig) => { const t = tag(sig); return t && ascii(b, t.offset, 4) === 'XYZ ' ? [s15(b, t.offset + 8), s15(b, t.offset + 12), s15(b, t.offset + 16)] : null; };
  const curve = (sig) => { const t = tag(sig); return t ? readCurve(b, t.offset) : null; };
  const desc = tag('desc');
  const profile = { description: desc ? readText(b, desc.offset, desc.size) : '', space, pcs, version: b[8], matrix: null, curves: null, gray: null, supported: false };
  if (space === 'RGB' && pcs === 'XYZ') {
    const r = xyz('rXYZ'); const g = xyz('gXYZ'); const bl = xyz('bXYZ');
    const curves = [curve('rTRC'), curve('gTRC'), curve('bTRC')];
    if (r && g && bl && curves.every(Boolean)) {
      profile.matrix = [r[0], g[0], bl[0], r[1], g[1], bl[1], r[2], g[2], bl[2]];
      profile.curves = curves;
      profile.supported = true;
    }
  } else if (space === 'GRAY') {
    const k = curve('kTRC');
    if (k) { profile.gray = k; profile.supported = true; }
  }
  return profile;
}

// XYZ (D50, the ICC connection space) → linear sRGB (Bradford-adapted, as in the sRGB ICC profile).
const XYZD50_TO_SRGB = [3.1338561, -1.6168667, -0.4906146, -0.9787684, 1.9161415, 0.0334540, 0.0719453, -0.2289914, 1.4052427];
const SRGB_MATRIX_D50 = [0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045, 0.7141733];

const mul = (a, b) => { const o = new Array(9).fill(0); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c]; return o; };
const srgbEncode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const srgbDecode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** True when the profile is (close to) sRGB: nothing to convert. */
export function isSrgb(profile) {
  if (!profile?.matrix) return false;
  if (profile.matrix.some((v, i) => Math.abs(v - SRGB_MATRIX_D50[i]) > 0.003)) return false;
  return [0.05, 0.2, 0.5, 0.8].every((x) => profile.curves.every((c) => Math.abs(c(x) - srgbDecode(x)) < 0.004));
}

/**
 * A function converting RGBA pixels (Uint8ClampedArray, in place) from the
 * profile's space to sRGB, or null when nothing needs doing / it cannot.
 */
export function toSrgb(profile) {
  if (!profile?.supported || isSrgb(profile)) return null;
  const ENC = 4096;
  const encode = new Uint8ClampedArray(ENC + 1);
  for (let i = 0; i <= ENC; i++) encode[i] = Math.round(srgbEncode(i / ENC) * 255);
  const out = (v) => encode[v <= 0 ? 0 : v >= 1 ? ENC : Math.round(v * ENC)];
  if (profile.gray) {
    const lin = Float32Array.from({ length: 256 }, (_, i) => profile.gray(i / 255));
    return (data) => {
      for (let i = 0; i < data.length; i += 4) { const v = out(lin[data[i]]); data[i] = v; data[i + 1] = v; data[i + 2] = v; }
      return data;
    };
  }
  const m = mul(XYZD50_TO_SRGB, profile.matrix);
  const lin = profile.curves.map((c) => Float32Array.from({ length: 256 }, (_, i) => c(i / 255)));
  return (data) => {
    for (let i = 0; i < data.length; i += 4) {
      const r = lin[0][data[i]]; const g = lin[1][data[i + 1]]; const b = lin[2][data[i + 2]];
      data[i] = out(m[0] * r + m[1] * g + m[2] * b);
      data[i + 1] = out(m[3] * r + m[4] * g + m[5] * b);
      data[i + 2] = out(m[6] * r + m[7] * g + m[8] * b);
    }
    return data;
  };
}

// ───────────────────────── profiles embedded in files

/** ICC bytes embedded in a PSD (image resource 1039), or null. */
export function psdIcc(bytes) {
  if (ascii(bytes, 0, 4) !== '8BPS') return null;
  let at = 26;
  at += 4 + u32(bytes, at); // colour mode data
  const end = at + 4 + u32(bytes, at);
  at += 4;
  while (at + 12 <= end) {
    if (ascii(bytes, at, 4) !== '8BIM') break;
    const id = u16(bytes, at + 4);
    const nameLength = bytes[at + 6];
    let p = at + 6 + 1 + nameLength;
    if ((1 + nameLength) % 2) p += 1;
    const size = u32(bytes, p);
    p += 4;
    if (id === 1039) return bytes.slice(p, p + size);
    at = p + size + (size % 2);
  }
  return null;
}
