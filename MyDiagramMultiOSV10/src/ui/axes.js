// Chart axes shared by the graphs and reports: round ("nice") tick values for a
// value axis, evenly spaced date ticks for a time axis, and short labels so the
// numbers fit on the ruler.

/**
 * Tick values from 0 up to at least `max`, in steps of 1, 2, 2.5 or 5 × 10ⁿ,
 * about `count` steps. Returns { step, top, ticks }; `top` is the axis end.
 */
export function niceTicks(max, count = 5, maxIntervals = 8) {
  if (!(max > 0) || !Number.isFinite(max)) return { step: 1, top: 1, ticks: [0, 1] };
  // Of the round steps giving 3–8 intervals, the one whose axis end is closest
  // above `max` (ties: fewer intervals), so the chart uses its height.
  const magnitude = 10 ** Math.floor(Math.log10(max / count));
  const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].map((m) => m * magnitude);
  let best = null;
  for (const s of candidates) {
    const end = Math.ceil(max / s - 1e-9) * s;
    const intervals = Math.round(end / s);
    if (intervals < 3 || intervals > maxIntervals) continue;
    if (!best || end < best.end - 1e-9 || (Math.abs(end - best.end) < 1e-9 && intervals < best.intervals)) best = { step: s, end, intervals };
  }
  const step = best?.step ?? magnitude * 10;
  const top = best?.end ?? Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Number(v.toFixed(10)));
  return { step, top, ticks };
}

/** A number without needless decimals: 2.5 → "2.5", 3 → "3", 1234 → "1,234". */
export function plainNumber(value, language = 'ko') {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  return rounded.toLocaleString(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
}

/** Short money for an axis: ₩300만 / ₩1.2억 (Korean), $3.5K / $1.2M (others). */
export function compactMoney(value, currency = 'KRW', language = 'ko') {
  // A currency code (KRW) or the symbol itself (₩, as projects store it).
  const symbol = { KRW: '₩', USD: '$', EUR: '€', JPY: '¥', GBP: '£', CNY: '¥' }[currency] ?? (/^[A-Za-z]{3}$/.test(currency ?? '') ? '' : (currency ?? ''));
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  let text;
  if (language === 'ko') {
    if (abs >= 1e8) text = `${plainNumber(abs / 1e8, language)}억`;
    else if (abs >= 1e4) text = `${plainNumber(abs / 1e4, language)}만`;
    else text = plainNumber(abs, language);
  } else if (abs >= 1e9) text = `${plainNumber(abs / 1e9, language)}B`;
  else if (abs >= 1e6) text = `${plainNumber(abs / 1e6, language)}M`;
  else if (abs >= 1e3) text = `${plainNumber(abs / 1e3, language)}K`;
  else text = plainNumber(abs, language);
  return `${sign}${symbol}${text}`;
}

/**
 * Which of `count` evenly spaced points get a date label so that labels are at
 * least `minGap` pixels apart over `width`: returns the indexes (always the first,
 * then every k-th).
 */
export function labelIndexes(count, width, minGap = 64) {
  if (count <= 0) return [];
  const every = Math.max(1, Math.ceil((minGap * count) / Math.max(1, width)));
  const out = [];
  for (let i = 0; i < count; i += every) out.push(i);
  return out;
}

/** Value-axis kinds the charts use: how to scale a raw value and how to write a tick. */
export function axisKind(kind, { currency = 'KRW', language = 'ko' } = {}) {
  switch (kind) {
    case 'hours': // raw values are minutes
      return { unit: 60, label: (v) => `${plainNumber(v, language)}${language === 'en' ? 'h' : '시간'}` };
    case 'money':
      return { unit: 1, label: (v) => compactMoney(v, currency, language) };
    case 'percent':
      return { unit: 1, fixed: { step: 25, top: 100, ticks: [0, 25, 50, 75, 100] }, label: (v) => `${plainNumber(v, language)}%` };
    default:
      return { unit: 1, label: (v) => plainNumber(v, language) };
  }
}

/** Ticks for raw values up to `maxRaw` of an axis kind: { top (raw), ticks: [{ value (raw), at (0–1), text }] }. */
export function valueAxis(maxRaw, kind, options = {}, count = 5, maxIntervals = 8) {
  const k = axisKind(kind, options);
  const scale = k.fixed ?? niceTicks(maxRaw / k.unit, count, maxIntervals);
  return {
    top: scale.top * k.unit,
    ticks: scale.ticks.map((v) => ({ value: v * k.unit, at: scale.top ? v / scale.top : 0, text: k.label(v) })),
  };
}
