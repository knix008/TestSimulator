// Tick values, tick labels and automatic axis limits. Pure ESM; shared by the
// engine (get(ax,'XTick')) and the GUI renderers (zoom / pan recompute ticks).

/** A "nice" number (1, 2, 5 × 10^n) near x; round=true picks the nearest, else the next larger. */
export function niceNum(x, round = true) {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** e;
}

/** Cleans float noise: 0.30000000000000004 → 0.3. */
export function clean(x, step) {
  if (!Number.isFinite(x)) return x;
  const d = step > 0 ? Math.max(0, -Math.floor(Math.log10(step)) + 2) : 12;
  const r = Number(x.toFixed(Math.min(20, d)));
  return Object.is(r, -0) ? 0 : r;
}

/** Tick step for a range so that at most maxTicks ticks fit (1-2-5 sequence). */
export function tickStep(lo, hi, maxTicks = 8) {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, maxTicks - 1);
  const e = Math.floor(Math.log10(raw));
  for (const f of [1, 2, 2.5, 5, 10]) {
    const s = f * 10 ** e;
    if (f === 2.5 && e < 0 && maxTicks > 3) continue; // 0.25 steps only for wide ranges
    if (s >= raw * 0.999) return s;
  }
  return 10 ** (e + 1);
}

/** Linear ticks inside [lo, hi]. */
export function linearTicks(lo, hi, maxTicks = 8) {
  if (!(hi > lo)) return Number.isFinite(lo) ? [lo] : [];
  const step = tickStep(lo, hi, maxTicks);
  const out = [];
  const first = Math.ceil(lo / step - 1e-9);
  for (let i = first; ; i++) {
    const v = i * step;
    if (v > hi + step * 1e-9) break;
    out.push(clean(v, step));
    if (out.length > 1000) break;
  }
  return out;
}

/** Ticks for a log axis (decades, or every k-th decade). */
export function logTicks(lo, hi, maxTicks = 8) {
  if (!(lo > 0) || !(hi > lo)) return [];
  const a = Math.floor(Math.log10(lo) + 1e-9), b = Math.ceil(Math.log10(hi) - 1e-9);
  const n = b - a + 1;
  const k = Math.max(1, Math.ceil(n / maxTicks));
  const out = [];
  for (let e = a; e <= b; e++) if ((e - a) % k === 0) { const v = 10 ** e; if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v); }
  if (out.length < 2) {
    // narrow range: 1-2-5 within the decade
    const lin = linearTicks(lo, hi, maxTicks);
    return lin.filter((v) => v > 0);
  }
  return out;
}

/** Minor tick values between the major ones (linear: 5 per step or 4 for 2-steps; log: 2..9). */
export function minorTicks(ticks, lo, hi, scale = 'linear') {
  const out = [];
  if (scale === 'log') {
    if (!(lo > 0)) return out;
    const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
    if (b - a > 12) return out;
    for (let e = a; e <= b; e++) for (let m = 2; m <= 9; m++) { const v = m * 10 ** e; if (v > lo && v < hi) out.push(v); }
    return out;
  }
  if (ticks.length < 2) return out;
  const step = ticks[1] - ticks[0];
  const lead = Math.round(step / 10 ** Math.floor(Math.log10(step)));
  const div = lead === 2 ? 4 : 5;
  const ms = step / div;
  const first = Math.ceil(lo / ms - 1e-9);
  for (let i = first; ; i++) {
    const v = i * ms;
    if (v > hi + ms * 1e-9) break;
    if (Math.abs(v / step - Math.round(v / step)) > 1e-6) out.push(clean(v, ms));
    if (out.length > 5000) break;
  }
  return out;
}

/** Tick values for an axis. */
export function ticksFor(lo, hi, scale = 'linear', maxTicks = 8) {
  return scale === 'log' ? logTicks(lo, hi, maxTicks) : linearTicks(lo, hi, maxTicks);
}

/** Max tick count for an axis length in px (labels need room). */
export function maxTicksFor(px, horizontal = true) {
  return Math.max(2, Math.min(11, Math.floor(px / (horizontal ? 64 : 42)) + 1));
}

function shortNum(x) {
  if (x === 0) return '0';
  let s = String(Number(x.toPrecision(10)));
  if (s.includes('e')) {
    const [m, e] = s.split('e');
    s = `${m}e${e[0] === '-' ? '-' : '+'}${e.replace(/^[-+]/, '').padStart(2, '0')}`;
  }
  return s;
}

/**
 * Labels for linear ticks with a shared exponent like "×10^4" when the
 * numbers are large or small. Returns { labels, exponent } (exponent 0 = none).
 */
export function tickLabels(ticks, scale = 'linear') {
  if (scale === 'log') {
    return { labels: ticks.map((v) => { const e = Math.log10(v); return Math.abs(e - Math.round(e)) < 1e-9 ? `10^{${Math.round(e)}}` : shortNum(v); }), exponent: 0 };
  }
  const maxAbs = ticks.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  let exponent = 0;
  if (maxAbs >= 1e4 || (maxAbs > 0 && maxAbs < 1e-3)) exponent = Math.floor(Math.log10(maxAbs));
  const scaled = ticks.map((v) => v / 10 ** exponent);
  // common number of decimals
  let dec = 0;
  for (const v of scaled) {
    const s = shortNum(Number(v.toPrecision(10)));
    if (s.includes('e')) { dec = Math.max(dec, 4); continue; }
    const i = s.indexOf('.');
    if (i >= 0) dec = Math.max(dec, s.length - i - 1);
  }
  dec = Math.min(dec, 6);
  const labels = scaled.map((v) => {
    if (Math.abs(v) < 1e-12 * (maxAbs / 10 ** exponent || 1)) return '0';
    const s = v.toFixed(dec);
    return s === '-0' ? '0' : s.replace(/^-0(\.0+)?$/, '0');
  });
  return { labels, exponent };
}

/**
 * Automatic limits from data extents. method: 'tickaligned' | 'tight' | 'padded'.
 * Returns [lo, hi].
 */
export function autoLimits(lo, hi, scale = 'linear', method = 'tickaligned', maxTicks = 8) {
  if (!(lo <= hi) || !Number.isFinite(lo) || !Number.isFinite(hi)) return scale === 'log' ? [1, 10] : [0, 1];
  if (scale === 'log') {
    if (!(lo > 0)) return [1, 10];
    if (lo === hi) return [lo / 10, hi * 10];
    if (method === 'tight') return [lo, hi];
    if (method === 'padded') { const a = Math.log10(lo), b = Math.log10(hi), p = (b - a) * 0.07; return [10 ** (a - p), 10 ** (b + p)]; }
    return [10 ** Math.floor(Math.log10(lo) + 1e-9), 10 ** Math.ceil(Math.log10(hi) - 1e-9)];
  }
  if (lo === hi) {
    const d = lo === 0 ? 1 : Math.abs(lo) * 0.1 > 1 ? 1 : Math.max(Math.abs(lo) * 0.1, 1e-12);
    if (method === 'tight') return [lo - d, hi + d];
    lo -= d; hi += d;
  }
  if (method === 'tight') return [lo, hi];
  if (method === 'padded') { const p = (hi - lo) * 0.07; return [lo - p, hi + p]; }
  const step = tickStep(lo, hi, maxTicks);
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  return [clean(a, step), clean(b, step)];
}

// ---------------------------------------------------------------- dates (datenum days)

const DAY_UNITS = [
  [1 / 86400, 's'], [5 / 86400, 's'], [15 / 86400, 's'], [30 / 86400, 's'],
  [1 / 1440, 'm'], [5 / 1440, 'm'], [15 / 1440, 'm'], [30 / 1440, 'm'],
  [1 / 24, 'h'], [3 / 24, 'h'], [6 / 24, 'h'], [12 / 24, 'h'],
  [1, 'd'], [2, 'd'], [7, 'd'], [14, 'd'],
  [30.44, 'M'], [91.31, 'M'], [182.6, 'M'], [365.25, 'y'], [365.25 * 2, 'y'], [365.25 * 5, 'y'], [365.25 * 10, 'y'], [365.25 * 25, 'y'], [365.25 * 50, 'y'],
];

/** Days since 0000-01-00 (datenum) → JS Date (UTC fields). */
export function datenumToDate(d) { return new Date((d - 719529) * 86400000); }
export function dateToDatenum(dt) { return dt.getTime() / 86400000 + 719529; }

/** Date ticks for a datenum range: { ticks, labels }. */
export function dateTicks(lo, hi, maxTicks = 7) {
  const span = hi - lo;
  if (!(span > 0)) return { ticks: [lo], labels: [fmtDate(lo, 'd')] };
  let unit = DAY_UNITS[DAY_UNITS.length - 1];
  for (const u of DAY_UNITS) if (span / u[0] <= maxTicks) { unit = u; break; }
  const ticks = [];
  const [step, kind] = unit;
  if (kind === 'M' || kind === 'y') {
    const months = kind === 'y' ? Math.round(step / 365.25) * 12 : Math.round(step / 30.44);
    const d0 = datenumToDate(lo);
    let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    m = Math.floor(m / months) * months;
    for (let i = 0; i < 400; i++) {
      const t = dateToDatenum(new Date(Date.UTC(y, m, 1)));
      if (t > hi + 1e-9) break;
      if (t >= lo - 1e-9) ticks.push(t);
      m += months; while (m >= 12) { m -= 12; y++; }
    }
  } else {
    const first = Math.ceil(lo / step - 1e-9);
    for (let i = first; ; i++) { const t = i * step; if (t > hi + 1e-9) break; ticks.push(t); if (ticks.length > 400) break; }
  }
  return { ticks, labels: ticks.map((t) => fmtDate(t, kind)) };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
export function fmtDate(t, kind = 'd') {
  const d = datenumToDate(t + 1e-9);
  const Y = d.getUTCFullYear(), M = MON[d.getUTCMonth()], D = p2(d.getUTCDate());
  const hh = p2(d.getUTCHours()), mm = p2(d.getUTCMinutes()), ss = p2(d.getUTCSeconds());
  if (kind === 's') return `${hh}:${mm}:${ss}`;
  if (kind === 'm' || kind === 'h') return `${hh}:${mm}`;
  if (kind === 'd') return `${M} ${D}`;
  if (kind === 'M') return `${M} ${Y}`;
  return String(Y);
}
