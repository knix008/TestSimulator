// Units: the solver works in SI; the user sees either the millimetre system (mm, N, MPa, …) or SI.
// Each quantity kind has a factor (display = SI × factor) and a label per system.

const K = (mm, si = mm) => ({ mm, si });
export const KINDS = {
  length: K([1e3, 'mm'], [1, 'm']),
  displacement: K([1e3, 'mm'], [1, 'm']),
  area: K([1e6, 'mm²'], [1, 'm²']),
  volume: K([1e9, 'mm³'], [1, 'm³']),
  force: K([1, 'N']),
  moment: K([1e3, 'N·mm'], [1, 'N·m']),
  stress: K([1e-6, 'MPa'], [1, 'Pa']),
  pressure: K([1e-6, 'MPa'], [1, 'Pa']),
  modulus: K([1e-9, 'GPa'], [1, 'Pa']),
  density: K([1, 'kg/m³']),
  mass: K([1, 'kg']),
  strain: K([1, 'mm/mm'], [1, 'm/m']),
  ratio: K([1, '']),
  percent: K([100, '%']),
  temperature: K([1, '°C']),
  heatFlux: K([1, 'W/m²']),
  htc: K([1, 'W/m²·K']),
  power: K([1, 'W']),
  heatGen: K([1, 'W/m³']),
  conductivity: K([1, 'W/m·K']),
  specificHeat: K([1, 'J/kg·K']),
  cte: K([1e6, '×10⁻⁶/K']),
  velocity: K([1, 'm/s']),
  acceleration: K([1, 'm/s²']),
  angular: K([1, 'rad/s']),
  frequency: K([1, 'Hz']),
  time: K([1, 's']),
  energy: K([1, 'J']),
  voltage: K([1, 'V']),
  current: K([1, 'A']),
  efield: K([1e-3, 'V/mm'], [1, 'V/m']),
  currentDensity: K([1e-6, 'A/mm²'], [1, 'A/m²']),
  flux: K([1, 'T']),
  hfield: K([1, 'A/m']),
  charge: K([1, 'C/m³']),
  surfaceCharge: K([1, 'C/m²']),
  resistance: K([1e3, 'mΩ'], [1, 'Ω']),
  capacitance: K([1e12, 'pF'], [1, 'F']),
  inductance: K([1e6, 'µH'], [1, 'H']),
  resistivity: K([1, 'Ω·m']),
  stiffness: K([1e-9, 'N/mm³'], [1, 'N/m³']),
  viscosity: K([1, 'Pa·s']),
  spl: K([1, 'dB']),
  acousticPressure: K([1, 'Pa']),
  life: K([1, 'cycles']),
  count: K([1, '']),
  flowRate: K([1, 'kg/s']),
  impedance: K([1, 'Pa·s/m']),
  psd: K([1, 'g²/Hz']),
  angle: K([1, '°']),
  heat: K([1, 'W']),
  jouleDensity: K([1, 'W/m³']),
};

export const SYSTEMS = ['mm', 'si'];

const entry = (kind, system) => KINDS[kind]?.[system === 'si' ? 'si' : 'mm'] ?? [1, ''];
export const factor = (kind, system) => entry(kind, system)[0];
export const unitLabel = (kind, system) => entry(kind, system)[1];
export const toDisplay = (kind, si, system) => (Number.isFinite(si) ? si * factor(kind, system) : si);
export const toSI = (kind, shown, system) => (Number.isFinite(shown) ? shown / factor(kind, system) : shown);

/** A number for people: up to `digits` significant digits, exponent form when very large or small. */
export function fmt(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return '0';
  const a = Math.abs(value);
  if (a >= 1e6 || a < 1e-3) return value.toExponential(Math.max(1, digits - 1)).replace('e+', 'e').replace(/\.?0+e/, 'e');
  const s = Number(value.toPrecision(digits));
  return s.toLocaleString('en-US', { maximumFractionDigits: 8, useGrouping: a >= 1e4 });
}

/** "12.3 MPa" in the given system. */
export const fmtQ = (kind, si, system, digits = 4) => {
  const label = unitLabel(kind, system);
  return `${fmt(toDisplay(kind, si, system), digits)}${label ? ` ${label}` : ''}`;
};
