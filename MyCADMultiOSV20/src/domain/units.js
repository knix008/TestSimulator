// Display units. Drawings always store millimetres; the unit chosen in the
// settings only changes what is shown (fields, rulers, readouts, dimension
// text) and how typed lengths are read. A typed length may carry its own unit
// ("1in", "2.5cm", "3'6\"") and is converted automatically.
import { evaluate } from './expr.js';

/** Units offered in the settings, with their size in mm. */
export const LENGTH_UNITS = ['mm', 'cm', 'm', 'in', 'ft'];
const FACTORS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
/** Step of the − / + buttons, in the unit (about 1 mm, or a usual fraction). */
const STEPS = { mm: 1, cm: 0.1, m: 0.01, in: 0.125, ft: 0.1 };
/** Decimals worth showing in fields and readouts. */
const DIGITS = { mm: 3, cm: 4, m: 5, in: 4, ft: 5 };

/** Spellings accepted after a typed number, longest first. */
const SUFFIXES = [
  ['millimeters', 'mm'], ['millimetres', 'mm'], ['mm', 'mm'],
  ['centimeters', 'cm'], ['centimetres', 'cm'], ['cm', 'cm'],
  ['meters', 'm'], ['metres', 'm'], ['m', 'm'],
  ['inches', 'in'], ['inch', 'in'], ['in', 'in'], ['"', 'in'], ['″', 'in'],
  ['feet', 'ft'], ['foot', 'ft'], ['ft', 'ft'], ["'", 'ft'], ['′', 'ft'],
];
const SUFFIX_OF = new Map(SUFFIXES);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOKEN = new RegExp(`(\\d+\\.?\\d*|\\.\\d+)(e[-+]?\\d+)?\\s*(${SUFFIXES.map(([s]) => escape(s)).join('|')})(?![a-z])`, 'gi');

export const normalizeUnit = (unit) => (LENGTH_UNITS.includes(unit) ? unit : 'mm');
export const unitFactor = (unit) => FACTORS[normalizeUnit(unit)];
export const unitStep = (unit) => STEPS[normalizeUnit(unit)];
export const unitDigits = (unit) => DIGITS[normalizeUnit(unit)];

let current = 'mm';
/** The unit things are shown in (set from the settings). */
export const displayUnit = () => current;
export function setDisplayUnit(unit) {
  const next = normalizeUnit(unit);
  const changed = next !== current;
  current = next;
  return changed;
}

/** mm → the unit. */
export const toUnit = (mm, unit = current) => mm / unitFactor(unit);
/** The unit → mm. */
export const fromUnit = (value, unit = current) => value * unitFactor(unit);

/** "mm", "mm²", "in³"… */
export const unitLabel = (unit = current, power = 1) => `${normalizeUnit(unit)}${power === 2 ? '²' : power === 3 ? '³' : ''}`;

function trim(value, digits) {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const text = Object.is(rounded, -0) ? '0' : String(rounded);
  return text.includes('e') ? rounded.toFixed(digits).replace(/\.?0+$/, '') : text;
}

/** A length (mm) as a number in the unit, without the unit: "12.5". */
export const lengthValue = (mm, unit = current, digits = unitDigits(unit)) => trim(toUnit(mm, unit), digits);
/** A length (mm) with its unit: "12.5 mm", "0.4921 in". */
export const formatLength = (mm, unit = current, digits = unitDigits(unit)) => `${lengthValue(mm, unit, digits)} ${unitLabel(unit)}`;
/** An area (mm²) with its unit. */
export const formatArea = (mm2, unit = current, digits = unitDigits(unit)) => `${trim(mm2 / unitFactor(unit) ** 2, digits)} ${unitLabel(unit, 2)}`;
/** A volume (mm³) with its unit. */
export const formatVolume = (mm3, unit = current, digits = unitDigits(unit)) => `${trim(mm3 / unitFactor(unit) ** 3, digits)} ${unitLabel(unit, 3)}`;

/**
 * A typed length → mm (NaN when it is not valid). Plain numbers are in `unit`;
 * numbers followed by a unit are converted ("1in + 5" in mm = 30.4). Feet and
 * inches may be written together: 5'3" = 5 ft + 3 in.
 */
export function evaluateLength(text, unit = current) {
  const factor = unitFactor(unit);
  const source = String(text ?? '').trim().replace(/,/g, '.').replace(/(['′])\s*(?=[\d.])/g, '$1+');
  if (!source) return NaN;
  const replaced = source.replace(TOKEN, (_, digits, exponent = '', suffix) => {
    const value = Number(digits + exponent) * FACTORS[SUFFIX_OF.get(suffix.toLowerCase()) ?? SUFFIX_OF.get(suffix)];
    return `(${value / factor})`;
  });
  const value = evaluate(replaced);
  return Number.isFinite(value) ? value * factor : NaN;
}

/** Does the text carry a unit of its own? */
export const hasUnitSuffix = (text) => new RegExp(TOKEN.source, 'i').test(String(text ?? ''));

/**
 * The grid's base spacing (mm) for a grid size (mm) in a unit: the size itself
 * in mm, else the nearest round value (1, 2, 5 × 10ⁿ) of the unit, so grid
 * lines fall on ruler ticks.
 */
export function gridBaseFor(sizeMm, unit = current) {
  const size = sizeMm > 0 ? sizeMm : 10;
  const factor = unitFactor(unit);
  if (factor === 1) return size;
  const inUnit = size / factor;
  const power = 10 ** Math.floor(Math.log10(inUnit));
  const nice = [1, 2, 5, 10].map((k) => k * power).reduce((best, v) => (Math.abs(Math.log(v / inUnit)) < Math.abs(Math.log(best / inUnit)) ? v : best));
  return nice * factor;
}

/**
 * The unit the 3D axis numbers read in: short numbers in a unit that suits the
 * size — metres for a building (1 m, not 1000 mm), millimetres for a part;
 * feet past 6 ft in imperial drawings.
 */
export function axisUnitFor(reachMm, unit = current) {
  if (unit === 'in' || unit === 'ft') return reachMm >= 1828.8 ? 'ft' : 'in';
  return reachMm >= 1000 ? 'm' : 'mm';
}
