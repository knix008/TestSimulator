import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(projectDir, "..");

const directories = ["dist", "dist-server", "release", "test-results"].map((name) => path.join(projectDir, name));
const generatedIcons = ["icon.ico", "icon.png", "icon.icns"].map((name) => path.join(projectDir, "build", name));
const rootFiles = fs.readdirSync(rootDir).filter((name) => /^MyGitJS-(Setup|Web)-/i.test(name)).map((name) => path.join(rootDir, name));

let removed = 0;
for (const target of [...directories, ...generatedIcons, ...rootFiles]) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
  removed += 1;
}
console.log(removed === 0 ? "Nothing to clean." : `Cleaned ${removed} item(s).`);
