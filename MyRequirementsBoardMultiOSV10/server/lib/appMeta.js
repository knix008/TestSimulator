import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..', '..');

export const APP_META = {
  productName: 'MyRequirementsBoard',
  description: '요구사항 관리 및 추적 시스템 (Electron + Web)',
  copyright: `Copyright © ${new Date().getFullYear()} SHKWON`,
  author: 'SHKWON(knix008@naver.com)',
  contactEmail: 'knix008@naver.com',
};

function readPackageJson() {
  try {
    const raw = fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: '0.1.0' };
  }
}

function resolveBuildInfoPath() {
  const candidates = [
    path.join(appRoot, 'config', 'build-info.json'),
    process.env.BUILD_INFO_PATH,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function readBuildInfoFile() {
  const filePath = resolveBuildInfoPath();
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed;
  } catch {
    return null;
  }
}

function platformLabel(platform) {
  switch (platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return platform;
  }
}

export function getAppInfo() {
  const pkg = readPackageJson();
  const fromFile = readBuildInfoFile();
  const development = !fromFile;

  const build = {
    version: fromFile?.version || pkg.version || '0.1.0',
    buildDate: fromFile?.buildDate || null,
    commit: fromFile?.commit || '',
    branch: fromFile?.branch || '',
    builtOnPlatform: fromFile?.builtOnPlatform || process.platform,
    builtOnArch: fromFile?.builtOnArch || process.arch,
    electronVersion: process.env.ELECTRON_VERSION || fromFile?.electronVersion || '',
    runMode: process.env.RUN_MODE || 'standalone',
    development,
  };

  return {
    ...APP_META,
    version: build.version,
    build,
    platformLabel: platformLabel(build.builtOnPlatform),
  };
}
