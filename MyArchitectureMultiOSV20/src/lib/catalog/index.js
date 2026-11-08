// The furniture library: every catalogue file in category order.
import living from "./living.js";
import dining from "./dining.js";
import kitchen from "./kitchen.js";
import bedroom from "./bedroom.js";
import bathroom from "./bathroom.js";
import office from "./office.js";
import lighting from "./lighting.js";
import decor from "./decor.js";
import outdoor from "./outdoor.js";
import publicSpaces from "./public.js";
import props from "./props.js";
import appliances from "./appliances.js";
import { VARIANTS } from "./variants.js";

// Items whose height is the furniture's own, with things standing on top of
// it (a TV on its unit, a lamp on a nightstand, a laptop on a desk); older
// projects saved these heights, so they stay.
const OVER = new Set(["tvUnit", "doubleBed", "singleBed", "nightstand", "desk", "counter", "sinkCounter", "washbasin", "officeDesk", "teacherDesk", "poolTable", "tableTennis", "displayTable", "prepTable"]);

// The appliances file replaces older entries of the same kind in place and adds the rest.
const NEWER = new Map(appliances.map((d) => [d.kind, d]));
const FIRST = [...living, ...dining, ...kitchen, ...bedroom, ...bathroom, ...office, ...lighting, ...decor, ...outdoor, ...publicSpaces, ...props];
const BASE = [...FIRST.map((d) => NEWER.get(d.kind) || d), ...appliances.filter((d) => !FIRST.some((f) => f.kind === d.kind))];
const byKind = new Map(BASE.map((d) => [d.kind, d]));
for (const [base] of VARIANTS) if (!byKind.has(base)) throw new Error(`catalogue variant of unknown kind ${base}`);
// Variants come right after their base product.
const LIST = [];
for (const d of BASE) {
  LIST.push(d);
  for (const [base, kind, name, over] of VARIANTS) if (base === d.kind) LIST.push({ ...d, kind, name, ...over, variantOf: base });
}

export const CATALOG = LIST.map((d) => (OVER.has(d.kind) || OVER.has(d.variantOf) ? { ...d, over: true } : d));
