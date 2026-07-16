/** Graphic EQ band definitions (Hz). */
export const EQ_BANDS = [
  { id: 'eq60', freq: 60, label: '60' },
  { id: 'eq150', freq: 150, label: '150' },
  { id: 'eq400', freq: 400, label: '400' },
  { id: 'eq1k', freq: 1000, label: '1k' },
  { id: 'eq2k4', freq: 2400, label: '2.4k' },
  { id: 'eq6k', freq: 6000, label: '6k' },
  { id: 'eq12k', freq: 12000, label: '12k' },
  { id: 'eq16k', freq: 16000, label: '16k' }
];

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;
export const EQ_Q = 1.1;

export function defaultEqGains() {
  const gains = {};
  for (const band of EQ_BANDS) gains[band.id] = 0;
  return gains;
}

export function clampEqGain(db) {
  return Math.min(EQ_GAIN_MAX, Math.max(EQ_GAIN_MIN, db));
}

export function formatHz(freq) {
  if (freq >= 1000) return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k`;
  return String(freq);
}
