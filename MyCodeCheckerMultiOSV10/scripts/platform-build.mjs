// Installers are built on the OS they run on, then copied to the project root.
//   npm run build:win     NSIS installer
//   npm run build:linux   deb and AppImage
//   npm run build:mac     .app and .dmg
//   npm run build:web     dist/ plus the Node web host
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BUILDS = {
  win: { platform: 'win32', bundles: 'nsis', os: 'Windows' },
  linux: { platform: 'linux', bundles: 'deb,appimage', os: 'Linux' },
  mac: { platform: 'darwin', bundles: 'app,dmg', os: 'macOS' },
};

const HOST = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };

export function rejectReason(target, platform = process.platform) {
  const spec = BUILDS[target];
  if (!spec) return `[build] Unknown target "${target}". Use win, linux, or mac.`;
  if (platform !== spec.platform) {
    const here = HOST[platform] || platform;
    return `[build:${target}] Run this on ${spec.os}. This computer is ${here}.`;
  }
  return null;
}

const INSTALLER = /\.(exe|msi|dmg|deb|rpm|appimage)$/i;
const BUNDLE_DIR = { nsis: 'nsis', deb: 'deb', appimage: 'appimage', dmg: 'dmg', app: 'macos' };

export function releaseBundleDir(projectRoot = root) {
  const target = process.env.CARGO_TARGET_DIR
    ? path.resolve(process.env.CARGO_TARGET_DIR)
    : path.join(projectRoot, 'src-tauri', 'target');
  return path.join(target, 'release', 'bundle');
}

export function findInstallers(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) found.push(full);
      else findInstallers(full, found);
    } else if (INSTALLER.test(entry.name)) found.push(full);
  }
  return found;
}

export function copyInstallersToRoot(projectRoot, bundleDir, bundles) {
  const roots = String(bundles).split(',').map((name) => path.join(bundleDir, BUNDLE_DIR[name.trim()] || name.trim()));
  const copied = [];
  for (const dir of roots) {
    for (const file of findInstallers(dir)) {
      const dest = path.join(projectRoot, path.basename(file));
      fs.cpSync(file, dest, { recursive: true, force: true });
      copied.push(dest);
      console.log(`[build] ${path.basename(file)} → ${dest}`);
    }
  }
  return copied;
}

function main() {
  const target = process.argv[2];
  const reason = rejectReason(target);
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
  const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const result = spawnSync(process.execPath, [cli, 'build', '--bundles', BUILDS[target].bundles], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status) process.exit(result.status);
  const copied = copyInstallersToRoot(root, releaseBundleDir(root), BUILDS[target].bundles);
  if (!copied.length) {
    console.error(`[build:${target}] No installer was found to copy.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
