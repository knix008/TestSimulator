import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const releaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "release");
const rootDir = path.resolve(releaseDir, "..", "..");
const installers = fs.readdirSync(releaseDir).filter((name) => /^MyGitJS-(Setup|Web)-.+\.(exe|msi|dmg|AppImage|deb|rpm|zip)$/i.test(name));

if (installers.length === 0) {
  console.error(`No installer file in ${releaseDir}`);
  process.exit(1);
}

for (const name of installers) {
  const destination = path.join(rootDir, name);
  fs.copyFileSync(path.join(releaseDir, name), destination);
  const size = fs.statSync(destination).size;
  console.log(`Copied: ${destination} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
