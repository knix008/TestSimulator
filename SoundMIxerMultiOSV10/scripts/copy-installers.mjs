import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');

const INSTALLER_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.dmg',
  '.pkg',
  '.appimage',
  '.deb',
  '.rpm',
  '.zip'
]);

function isInstallerArtifact(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  if (!INSTALLER_EXTENSIONS.has(ext)) return false;
  if (base.includes('uninstaller')) return false;
  if (base.endsWith('.blockmap')) return false;
  return true;
}

async function listFilesRecursive(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'win-unpacked' || entry.name === 'mac' || entry.name === 'linux-unpacked') {
        continue;
      }
      out.push(...(await listFilesRecursive(fullPath)));
    } else {
      out.push(fullPath);
    }
  }

  return out;
}

async function main() {
  try {
    await fs.access(releaseDir);
  } catch {
    console.log('[copy-installers] release directory not found. Skipping.');
    return;
  }

  const allFiles = await listFilesRecursive(releaseDir);
  const installerFiles = allFiles.filter(isInstallerArtifact);

  if (!installerFiles.length) {
    console.log('[copy-installers] No installer artifacts found in release/.');
    return;
  }

  for (const src of installerFiles) {
    const dest = path.join(projectRoot, path.basename(src));
    await fs.copyFile(src, dest);
    console.log(`[copy-installers] Copied: ${path.relative(projectRoot, src)} -> ${path.basename(dest)}`);
  }
}

main().catch((err) => {
  console.error('[copy-installers] Failed:', err);
  process.exitCode = 1;
});
