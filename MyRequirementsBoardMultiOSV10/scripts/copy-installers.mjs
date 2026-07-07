import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

const INSTALLER_EXTENSIONS = new Set(['.exe', '.msi', '.dmg', '.zip', '.deb', '.7z']);

function isInstaller(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return INSTALLER_EXTENSIONS.has(ext) || filePath.endsWith('.AppImage');
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  try {
    await fs.access(releaseDir);
  } catch {
    console.log('[copy-installers] release/ folder not found — skipped.');
    return;
  }

  const files = await collectFiles(releaseDir);
  const installers = files.filter((filePath) => {
    const relativePath = path.relative(releaseDir, filePath);
    const segments = relativePath.split(path.sep);
    // Only copy installer artifacts at release/ root (not win-unpacked etc.)
    return segments.length === 1 && isInstaller(filePath);
  });

  if (installers.length === 0) {
    console.log('[copy-installers] No installer artifacts found in release/.');
    return;
  }

  for (const sourcePath of installers) {
    const fileName = path.basename(sourcePath);
    const destPath = path.join(rootDir, fileName);
    await fs.copyFile(sourcePath, destPath);
    console.log(`[copy-installers] ${fileName} -> project root`);
  }
}

main().catch((error) => {
  console.error('[copy-installers] failed:', error);
  process.exit(1);
});
