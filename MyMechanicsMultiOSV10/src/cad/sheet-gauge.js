// Sheet metal gauge tables and bend calculation tables.
//   gauge tables   per material: gauges with their thickness, the bend radii the tooling offers and a K-factor.
//                  A base flange (or converted sheet) set to a gauge takes its thickness, radius and K from the row;
//                  'custom' uses the feature's own rows.
//   bend methods   how a bend's flat length (bend allowance BA) is found:
//                    kFactor     BA = θ · (r + K·t)
//                    kTable      K looked up by r / t in a table (linear between rows), then as kFactor
//                    din6935     the DIN 6935 correction: K = (0.65 + 0.5·log10(r / t)) / 2 for r / t < 5, else 0.5
//                    allowance   BA read from a table of (angle, radius) → BA
//                    deduction   bend deduction BD from a table; BA = 2·(r + t)·tan(θ / 2) − BD (θ < 180°)
//                  Table lookups interpolate linearly by angle among the rows of the nearest radius (by radius too
//                  when the bend's radius lies between two radii of the table) and extrapolate in proportion to θ.

const IN = 25.4;
const gaugeRows = (rows, k) => rows.map(([name, inch]) => {
  const t = Math.round(inch * IN * 1000) / 1000;
  return { name: String(name), thickness: t, radii: [t, 1.5 * t, 2 * t].map((r) => Math.round(r * 100) / 100), k };
});

/** Built-in gauge tables: { id: { rows: [{ name, thickness (mm), radii: [mm], k }] } }. */
export const GAUGE_TABLES = {
  // Manufacturers' Standard Gauge for sheet steel.
  steel: { rows: gaugeRows([[10, 0.1345], [11, 0.1196], [12, 0.1046], [13, 0.0897], [14, 0.0747], [15, 0.0673], [16, 0.0598], [17, 0.0538], [18, 0.0478], [19, 0.0418], [20, 0.0359], [22, 0.0299], [24, 0.0239], [26, 0.0179], [28, 0.0149]], 0.44) },
  galvanized: { rows: gaugeRows([[10, 0.1382], [12, 0.1084], [14, 0.0785], [16, 0.0635], [18, 0.0516], [20, 0.0396], [22, 0.0336], [24, 0.0276], [26, 0.0217], [28, 0.0187]], 0.44) },
  stainless: { rows: gaugeRows([[10, 0.1406], [12, 0.1094], [14, 0.0781], [16, 0.0625], [18, 0.05], [20, 0.0375], [22, 0.0313], [24, 0.025], [26, 0.0188], [28, 0.0156]], 0.45) },
  // Brown & Sharpe (American Wire Gauge) for aluminium sheet.
  aluminum: { rows: gaugeRows([[8, 0.1285], [10, 0.1019], [12, 0.0808], [14, 0.0641], [16, 0.0508], [18, 0.0403], [20, 0.032], [22, 0.0253], [24, 0.0201]], 0.43) },
  // Metric sheet thicknesses (mm).
  metric: { rows: [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map((t) => ({ name: `${t} mm`, thickness: t, radii: [t, 1.5 * t, 2 * t].map((r) => Math.round(r * 100) / 100), k: 0.44 })) },
};
export const GAUGE_TABLE_IDS = ['none', ...Object.keys(GAUGE_TABLES), 'custom'];
export const BEND_METHODS = ['kFactor', 'kTable', 'din6935', 'allowance', 'deduction'];

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The gauge rows of a feature's table (built-in, or its own custom rows). */
export function gaugeRowsOf(f) {
  if (f?.gaugeTable === 'custom') return (f.customGauges ?? []).filter((r) => num(r.thickness, 0) > 0).map((r, i) => ({ name: String(r.name ?? `${i + 1}`), thickness: num(r.thickness, 1), radii: [num(r.radius, num(r.thickness, 1))], k: clamp(num(r.k, 0.44), 0, 1) }));
  return GAUGE_TABLES[f?.gaugeTable]?.rows ?? [];
}

/** The gauge row a feature uses (null without a gauge table). */
export function gaugeOf(f) {
  const rows = gaugeRowsOf(f);
  if (!rows.length || !f?.gaugeTable || f.gaugeTable === 'none') return null;
  return rows.find((r) => r.name === String(f.gauge)) ?? rows[0];
}

/**
 * The sheet settings of a feature: { thickness, radius, k, rule } — from its gauge row when it has one (the radius
 * one the row offers: the feature's own when listed, else the row's first), and the bend rule from its method.
 */
export function sheetSettings(f, fallback = { thickness: 2, radius: 2, k: 0.44 }) {
  const g = gaugeOf(f);
  let thickness = Math.max(0.05, num(f?.thickness, fallback.thickness));
  let radius = Math.max(0, num(f?.radius, thickness));
  let k = clamp(num(f?.kFactor, fallback.k), 0, 1);
  if (g) {
    thickness = g.thickness;
    radius = g.radii.find((r) => Math.abs(r - num(f.radius, NaN)) < 1e-6) ?? g.radii[0];
    k = g.k;
  }
  return { thickness, radius, k, rule: bendRule(f, k) };
}

/** The bend rule of a feature (a number K when it bends by the K-factor). */
export function bendRule(f, k) {
  const method = BEND_METHODS.includes(f?.bendMethod) ? f.bendMethod : 'kFactor';
  if (method === 'kFactor') return k;
  if (method === 'din6935') return { method, k };
  if (method === 'kTable') return { method, k, rows: (f.kRows?.length ? f.kRows : DEFAULT_K_ROWS).map((r) => ({ ratio: num(r.ratio, 1), k: clamp(num(r.k, k), 0, 1) })).sort((a, b) => a.ratio - b.ratio) };
  const rows = (f.bendRows ?? []).map((r) => ({ angle: num(r.angle, 90), radius: num(r.radius, 0), value: num(r.value, 0) })).filter((r) => r.angle > 0);
  return { method, k, rows };
}

/** r / t → K (a common bending table; edited per feature). */
export const DEFAULT_K_ROWS = [{ ratio: 0.25, k: 0.3 }, { ratio: 0.5, k: 0.33 }, { ratio: 1, k: 0.38 }, { ratio: 2, k: 0.42 }, { ratio: 3, k: 0.44 }, { ratio: 5, k: 0.47 }, { ratio: 10, k: 0.5 }];

/** Linear interpolation in sorted [x, y] pairs (held at the ends). */
function lerpRows(pairs, x) {
  if (!pairs.length) return NaN;
  if (x <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) if (x <= pairs[i][0]) { const [x0, y0] = pairs[i - 1]; const [x1, y1] = pairs[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pairs[pairs.length - 1][1];
}

/** K by DIN 6935 (the neutral line's position as a share of t). */
export const dinK = (r, t) => (r / t >= 5 ? 0.5 : clamp((0.65 + 0.5 * Math.log10(Math.max(1e-6, r / t))) / 2, 0, 0.5));

/** The value of a (angle, radius) → value table for one bend: by angle in the radius' rows, between radii. */
function tableValue(rows, angle, r) {
  const radii = [...new Set(rows.map((x) => x.radius))].sort((a, b) => a - b);
  const at = (rad) => {
    const pairs = rows.filter((x) => x.radius === rad).map((x) => [x.angle, x.value]).sort((a, b) => a[0] - b[0]);
    // Outside the angles listed: in proportion to the angle from the nearest row.
    if (angle < pairs[0][0]) return (pairs[0][1] * angle) / pairs[0][0];
    const last = pairs[pairs.length - 1];
    if (angle > last[0]) return (last[1] * angle) / last[0];
    return lerpRows(pairs, angle);
  };
  if (r <= radii[0]) return at(radii[0]);
  if (r >= radii[radii.length - 1]) return at(radii[radii.length - 1]);
  const j = radii.findIndex((x) => x >= r); const r0 = radii[j - 1]; const r1 = radii[j];
  return at(r0) + ((at(r1) - at(r0)) * (r - r0)) / (r1 - r0);
}

/** The bend allowance of one bend (θ degrees, inner radius r, thickness t) by a rule (a K number or a rule object). */
export function ruleAllowance(rule, angleDeg, r, t) {
  const th = (Math.abs(angleDeg) * Math.PI) / 180;
  const byK = (k) => th * (r + k * t);
  if (typeof rule === 'number' || !rule) return byK(num(rule, 0.44));
  switch (rule.method) {
    case 'din6935': return byK(dinK(r, t));
    case 'kTable': return byK(lerpRows(rule.rows.map((x) => [x.ratio, x.k]), t > 0 ? r / t : 0));
    case 'allowance': return rule.rows.length ? tableValue(rule.rows, Math.abs(angleDeg), r) : byK(rule.k);
    case 'deduction': {
      if (!rule.rows.length || Math.abs(angleDeg) >= 179.999) return byK(rule.k);
      const bd = tableValue(rule.rows, Math.abs(angleDeg), r);
      return 2 * (r + t) * Math.tan(th / 2) - bd;
    }
    default: return byK(rule.k ?? 0.44);
  }
}

/** The K-factor a rule amounts to for one bend (what a bend table shows). */
export function ruleK(rule, angleDeg, r, t) {
  const th = (Math.abs(angleDeg) * Math.PI) / 180;
  if (!(th > 0) || !(t > 0)) return typeof rule === 'number' ? rule : rule?.k ?? 0.44;
  return (ruleAllowance(rule, angleDeg, r, t) / th - r) / t;
}

/**
 * Rows of a bend table filled from the K-factor (to start an allowance or deduction table from): the angles
 * 15° … 180° at the radius given (and the gauge's other radii).
 */
export function seedBendRows(method, t, radii, k) {
  const out = [];
  for (const radius of radii) for (const angle of [15, 30, 45, 60, 90, 120, 135, 150, 180]) {
    const ba = ruleAllowance(k, angle, radius, t);
    const value = method === 'deduction' ? (angle >= 180 ? null : 2 * (radius + t) * Math.tan((angle * Math.PI) / 360) - ba) : ba;
    if (value != null) out.push({ angle, radius: Math.round(radius * 1000) / 1000, value: Math.round(value * 1000) / 1000 });
  }
  return out;
}
