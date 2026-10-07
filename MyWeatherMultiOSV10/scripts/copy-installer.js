import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const exes = fs.readdirSync(dist).filter((name) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".exe") && !lower.includes("uninstaller");
});
if (exes.length !== 1) {
  throw new Error(`Expected one installer in dist, found ${exes.length}: ${exes.join(", ")}`);
}
const target = path.join(root, exes[0]);
fs.copyFileSync(path.join(dist, exes[0]), target);
console.log(target);
