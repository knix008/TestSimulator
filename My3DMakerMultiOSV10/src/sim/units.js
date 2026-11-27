// Units: the solver works in SI; the user sees one of several unit systems (mm·N·MPa, SI, SI with kelvin,
// cm·g·s, µm for MEMS, US customary inch and foot).
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
  psdResponse: K([1e6, 'mm²/Hz'], [1, 'm²/Hz']),
  angle: K([1, '°']),
  compliance: K([1e6, '1/MPa'], [1, '1/Pa']),
  heat: K([1, 'W']),
  jouleDensity: K([1, 'W/m³']),
};

// Further unit systems: SI with kelvin, centimetre–gram–second, micrometre (MEMS), and the US
// customary inch and foot systems. Each lists what differs from SI ([factor, label] or [factor, label,
// offset] for temperatures: display = SI × factor + offset). Kinds not listed show as in SI.
const T_F = [1.8, '°F', 32];
const US_COMMON = {
  force: [0.224809, 'lbf'], mass: [2.20462, 'lbm'], temperature: T_F, cte: [1e6 / 1.8, '×10⁻⁶/°F'],
  heatFlux: [0.316998, 'BTU/h·ft²'], htc: [0.176110, 'BTU/h·ft²·°F'], conductivity: [0.577789, 'BTU/h·ft·°F'],
  specificHeat: [2.38846e-4, 'BTU/lbm·°F'], heatGen: [0.0966211, 'BTU/h·ft³'], power: [3.41214, 'BTU/h'], heat: [3.41214, 'BTU/h'],
  flowRate: [2.20462, 'lbm/s'], energy: [0.737562, 'ft·lbf'],
};
const EXTRA = {
  siK: { temperature: [1, 'K', 273.15], strain: [1, 'm/m'] },
  cgs: {
    length: [100, 'cm'], displacement: [100, 'cm'], area: [1e4, 'cm²'], volume: [1e6, 'cm³'], force: [1e5, 'dyn'], moment: [1e7, 'dyn·cm'],
    stress: [10, 'dyn/cm²'], pressure: [10, 'dyn/cm²'], modulus: [10, 'dyn/cm²'], density: [1e-3, 'g/cm³'], mass: [1e3, 'g'], strain: [1, 'cm/cm'],
    velocity: [100, 'cm/s'], acceleration: [100, 'cm/s²'], energy: [1e7, 'erg'], power: [1e7, 'erg/s'], heat: [1e7, 'erg/s'], heatFlux: [1e3, 'erg/s·cm²'],
    htc: [1e3, 'erg/s·cm²·K'], conductivity: [1e5, 'erg/s·cm·K'], specificHeat: [1e4, 'erg/g·K'], heatGen: [10, 'erg/s·cm³'], jouleDensity: [10, 'erg/s·cm³'],
    viscosity: [10, 'P'], efield: [0.01, 'V/cm'], currentDensity: [1e-4, 'A/cm²'], resistivity: [100, 'Ω·cm'], stiffness: [1e-1, 'dyn/cm³'],
    flowRate: [1e3, 'g/s'], acousticPressure: [10, 'dyn/cm²'], psdResponse: [1e4, 'cm²/Hz'], charge: [1e-6, 'C/cm³'], surfaceCharge: [1e-4, 'C/cm²'],
  },
  um: {
    length: [1e6, 'µm'], displacement: [1e6, 'µm'], area: [1e12, 'µm²'], volume: [1e18, 'µm³'], force: [1e6, 'µN'], moment: [1e12, 'µN·µm'],
    stress: [1e-6, 'MPa'], pressure: [1e-6, 'MPa'], modulus: [1e-9, 'GPa'], density: [1e-18, 'kg/µm³'], strain: [1, 'µm/µm'],
    velocity: [1e6, 'µm/s'], acceleration: [1e6, 'µm/s²'], energy: [1e12, 'pJ'], power: [1e12, 'pW'], heat: [1e12, 'pW'], heatFlux: [1, 'pW/µm²'],
    htc: [1, 'pW/µm²·K'], conductivity: [1e6, 'pW/µm·K'], specificHeat: [1e12, 'pJ/kg·K'], heatGen: [1e-6, 'pW/µm³'], jouleDensity: [1e-6, 'pW/µm³'],
    efield: [1e-6, 'V/µm'], currentDensity: [1e-12 * 1e12, 'pA/µm²'], current: [1e12, 'pA'], resistivity: [1e6, 'Ω·µm'], stiffness: [1e-12, 'µN/µm³'],
    capacitance: [1e12, 'pF'], psdResponse: [1e12, 'µm²/Hz'], viscosity: [1e-6, 'µN·s/µm²'],
  },
  us: {
    ...US_COMMON, length: [39.3701, 'in'], displacement: [39.3701, 'in'], area: [1550.0031, 'in²'], volume: [61023.744, 'in³'], moment: [8.85075, 'lbf·in'],
    stress: [1.45038e-4, 'psi'], pressure: [1.45038e-4, 'psi'], modulus: [1.45038e-10, 'Msi'], density: [3.61273e-5, 'lbm/in³'], strain: [1, 'in/in'],
    velocity: [39.3701, 'in/s'], acceleration: [39.3701, 'in/s²'], efield: [0.0254, 'V/in'], currentDensity: [6.4516e-4, 'A/in²'], resistivity: [39.3701, 'Ω·in'],
    stiffness: [3.68396e-6, 'lbf/in³'], viscosity: [1.45038e-4, 'lbf·s/in²'], psdResponse: [1550.0031, 'in²/Hz'], acousticPressure: [1.45038e-4, 'psi'],
  },
  ft: {
    ...US_COMMON, length: [3.28084, 'ft'], displacement: [3.28084, 'ft'], area: [10.7639, 'ft²'], volume: [35.3147, 'ft³'], moment: [0.737562, 'lbf·ft'],
    stress: [0.0208854, 'psf'], pressure: [0.0208854, 'psf'], modulus: [1.45038e-7, 'ksi'], density: [0.0624280, 'lbm/ft³'], strain: [1, 'ft/ft'],
    velocity: [3.28084, 'ft/s'], acceleration: [3.28084, 'ft/s²'], efield: [0.3048, 'V/ft'], currentDensity: [0.0929030, 'A/ft²'], resistivity: [3.28084, 'Ω·ft'],
    stiffness: [6.36588e-3, 'lbf/ft³'], viscosity: [0.0208854, 'lbf·s/ft²'], psdResponse: [10.7639, 'ft²/Hz'], acousticPressure: [0.0208854, 'psf'],
  },
};

/** The unit systems (Settings and the toolbar's drop-down), with their short names. */
export const SYSTEMS = ['mm', 'si', 'siK', 'cgs', 'um', 'us', 'ft'];
export const SYSTEM_SHORT = { mm: 'mm·N·MPa', si: 'm·N·Pa', siK: 'm·kg·s·K', cgs: 'cm·g·s', um: 'µm·µN·MPa', us: 'in·lbf·psi', ft: 'ft·lbf·psf' };

const entry = (kind, system) => {
  if (system === 'mm' || system === 'si') return KINDS[kind]?.[system] ?? [1, ''];
  return EXTRA[system]?.[kind] ?? KINDS[kind]?.si ?? KINDS[kind]?.mm ?? [1, ''];
};
export const factor = (kind, system) => entry(kind, system)[0];
export const unitLabel = (kind, system) => entry(kind, system)[1];
/** Temperatures: an offset as well (°F, K); other kinds are a pure factor. */
export const offset = (kind, system) => entry(kind, system)[2] ?? 0;
export const toDisplay = (kind, si, system) => (Number.isFinite(si) ? si * factor(kind, system) + offset(kind, system) : si);
export const toSI = (kind, shown, system) => (Number.isFinite(shown) ? (shown - offset(kind, system)) / factor(kind, system) : shown);

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
