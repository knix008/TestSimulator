// Adds translations from a JSON file ({ "English key": "한국어" }) to
// src/ui/i18n-ko.js, skipping keys that already exist.
//   node scripts/i18n-add.mjs path/to/ko.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src/ui/i18n-ko.js");
const add = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let text = fs.readFileSync(file, "utf8");
const lines = [];
for (const [k, v] of Object.entries(add)) {
  if (text.includes(`${JSON.stringify(k)}:`)) continue;
  lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
}
text = text.replace(/\n};\s*$/, `\n${lines.join("\n")}\n};\n`);
fs.writeFileSync(file, text);
console.log(`i18n-add: ${lines.length} added`);
