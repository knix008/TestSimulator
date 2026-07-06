import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface BuildInfo {
  version: string;
  buildDate: string | null;
  commit: string;
  branch: string;
  builtOnPlatform: string;
  builtOnArch: string;
  electronVersion: string;
  development: boolean;
}

function readPackageVersion(appRoot: string): string {
  try {
    const raw = fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function resolveBuildInfoPath(appRoot: string): string {
  const candidates = [
    path.join(appRoot, 'config', 'build-info.json'),
    path.join(process.resourcesPath, 'app', 'config', 'build-info.json'),
    path.join(process.resourcesPath, 'config', 'build-info.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function readBuildInfoFile(appRoot: string): Omit<BuildInfo, 'development'> | null {
  const filePath = resolveBuildInfoPath(appRoot);
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<BuildInfo>;
    return {
      version: parsed.version ?? readPackageVersion(appRoot),
      buildDate: parsed.buildDate ?? null,
      commit: parsed.commit ?? '',
      branch: parsed.branch ?? '',
      builtOnPlatform: parsed.builtOnPlatform ?? process.platform,
      builtOnArch: parsed.builtOnArch ?? process.arch,
      electronVersion: process.versions.electron || parsed.electronVersion || '',
    };
  } catch {
    return null;
  }
}

function runtimeBuildInfo(appRoot: string): BuildInfo {
  return {
    version: readPackageVersion(appRoot),
    buildDate: null,
    commit: '',
    branch: '',
    builtOnPlatform: process.platform,
    builtOnArch: process.arch,
    electronVersion: process.versions.electron ?? '',
    development: true,
  };
}

export function getBuildInfo(): BuildInfo {
  const appRoot = app.getAppPath();
  const fromFile = readBuildInfoFile(appRoot);
  if (fromFile) {
    return { ...fromFile, development: false };
  }
  return runtimeBuildInfo(appRoot);
}

function platformLabel(platform: string): string {
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

function formatBuildDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatAboutDetail(build: BuildInfo): string {
  const lines = [
    '작업, 의존성, 리소스, 진행률, Gantt 메모를 관리하는 크로스 플랫폼 Gantt 프로젝트 관리 프로그램입니다.',
    '',
    `버전: ${build.version}`,
  ];

  if (build.development) {
    lines.push('빌드: 개발 빌드');
  } else if (build.buildDate) {
    lines.push(`빌드 일시: ${formatBuildDate(build.buildDate)}`);
  }

  if (build.commit) {
    const branchSuffix = build.branch ? ` (${build.branch})` : '';
    lines.push(`커밋: ${build.commit}${branchSuffix}`);
  }

  lines.push(`플랫폼: ${platformLabel(build.builtOnPlatform)} ${build.builtOnArch}`);

  if (build.electronVersion) {
    lines.push(`Electron: ${build.electronVersion}`);
  }

  lines.push('', `Copyright © ${new Date().getFullYear()} MyProject`);

  return lines.join('\n');
}
