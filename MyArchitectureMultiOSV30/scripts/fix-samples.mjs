// npm run fix:samples — repairs what the model check finds in the samples of sample/
// (core/fixes.js fixAll: furniture off windows and out of walls, doors opened the other way …),
// changing only the repaired fields of each file (ids, order and everything else stay; CRLF kept).
// scripts/create-samples.mjs runs the same repairs before it writes, so regenerated samples are clean too.
//
// Usage: node scripts/fix-samples.mjs [--dry-run] [file prefix …]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { parseProject } = await imp("src/core/project.js");
const { runCheck } = await imp("src/core/check.js");
const { fixAll } = await imp("src/core/fixes.js");

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));
const dir = path.join(root, "sample");
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));

// The fields a repair may change, per collection.
const FIELDS = { furniture: ["x", "y", "rot"], openings: ["at", "width", "height", "sill", "side", "hinge", "type"], walls: ["x1", "y1", "x2", "y2", "thickness"] };

let changed = 0, left = 0;
for (const s of index) {
  if (only.length && !only.some((o) => s.file.startsWith(o))) continue;
  const file = path.join(dir, s.file);
  const text = fs.readFileSync(file, "utf8");
  const p = parseProject(text);
  if (!runCheck(p).length) continue;
  const { fixed, left: rest } = fixAll(p);
  left += rest.length;
  if (!fixed.length) { console.log(`✖ ${s.file}: ${rest.length} problems, none repaired`); continue; }
  // Patch the original JSON with the repaired values only.
  const raw = JSON.parse(text);
  for (const [k, fields] of Object.entries(FIELDS)) {
    const byId = new Map((p[k] || []).map((x) => [x.id, x]));
    for (const it of raw[k] || []) {
      const now = byId.get(it.id);
      if (now) for (const f of fields) if (now[f] !== undefined && JSON.stringify(now[f]) !== JSON.stringify(it[f])) it[f] = now[f];
    }
    // Added items (a door for a room without one) come as they are.
    const have = new Set((raw[k] || []).map((x) => x.id));
    for (const x of p[k] || []) if (!have.has(x.id) && k === "openings") raw[k].push(x);
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const out = JSON.stringify(raw, null, 1).split("\n").join(eol);
  const still = runCheck(parseProject(out));
  if (still.length) { console.log(`✖ ${s.file}: patched file still has ${still.length} problems`); left += still.length; continue; }
  if (!dry) fs.writeFileSync(file, out);
  changed++;
  console.log(`${dry ? "would fix" : "✔ fixed"} ${s.file}: ${fixed.length} repairs (${[...new Set(fixed.map((x) => x.code))].join(", ")})${rest.length ? `, ${rest.length} left` : ""}`);
}
console.log(`fix-samples: ${changed} file(s) ${dry ? "would be " : ""}repaired${left ? `, ${left} problems left` : ""}`);
process.exit(left ? 1 : 0);
