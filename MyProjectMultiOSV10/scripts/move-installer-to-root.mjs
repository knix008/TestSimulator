import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(repoRoot, 'release');

const INSTALLER_EXTENSIONS = new Set(['.exe', '.dmg', '.deb', '.appimage']);

function isInstallerArtifact(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (INSTALLER_EXTENSIONS.has(ext)) return true;
  if (ext === '.zip' && /-mac-/i.test(fileName)) return true;
  return false;
}

function moveInstallerToRoot() {
  if (!fs.existsSync(releaseDir)) {
    console.warn('[move-installer-to-root] release/ directory not found; skipping.');
    return;
  }

  const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
  const installers = entries
    .filter((entry) => entry.isFile() && isInstallerArtifact(entry.name))
    .map((entry) => entry.name);

  if (installers.length === 0) {
    console.warn('[move-installer-to-root] No installer artifacts found in release/.');
    return;
  }

  for (const fileName of installers) {
    const sourcePath = path.join(releaseDir, fileName);
    const targetPath = path.join(repoRoot, fileName);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    fs.renameSync(sourcePath, targetPath);
    console.log(`[move-installer-to-root] ${fileName} -> ${targetPath}`);
  }
}

moveInstallerToRoot();
