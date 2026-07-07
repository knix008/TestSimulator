import type { AppBuildInfo } from '../types/appInfo';
import type { AppLocale } from '../i18n/types';
import { getDateLocaleTag } from '../i18n/translate';

export function platformLabel(platform: string): string {
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

export function formatBuildDate(iso: string, locale: AppLocale): string {
  try {
    return new Intl.DateTimeFormat(getDateLocaleTag(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function buildInfoDetailLines(
  build: AppBuildInfo,
  locale: AppLocale,
  labels: {
    developmentBuild: string;
    buildDate: (date: string) => string;
    commit: (commit: string, branch: string) => string;
    platform: (platform: string, arch: string) => string;
    electron: (version: string) => string;
  },
): string[] {
  const lines: string[] = [];

  if (build.development) {
    lines.push(labels.developmentBuild);
  } else if (build.buildDate) {
    lines.push(labels.buildDate(formatBuildDate(build.buildDate, locale)));
  }

  if (build.commit) {
    lines.push(labels.commit(build.commit, build.branch));
  }

  lines.push(
    labels.platform(platformLabel(build.builtOnPlatform), build.builtOnArch),
  );

  if (build.electronVersion) {
    lines.push(labels.electron(build.electronVersion));
  }

  return lines;
}
