// The fonts installed on this machine, for the report font picker.
//
// Chromium's Local Font Access API (`queryLocalFonts`) is the only way to read
// the real list. It needs a permission the user can refuse, and it does not
// exist in every browser, so this always has something to fall back on rather
// than handing the picker an empty list.

interface LocalFont {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFont[]>;
  }
}

/**
 * Families almost certainly present on one of the supported platforms, with the
 * Korean faces first — this is a Korean-language tool and those are the ones
 * that matter for a report. Used when the real list is unavailable.
 */
export const COMMON_FONTS = [
  'Malgun Gothic',
  'Noto Sans KR',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Batang',
  'Gulim',
  'Dotum',
  'Apple SD Gothic Neo',
  'Arial',
  'Calibri',
  'Cambria',
  'Consolas',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Verdana',
];

export interface SystemFontList {
  families: string[];
  /** True when these came from the OS rather than the fallback list. */
  fromSystem: boolean;
}

let cached: SystemFontList | null = null;

/**
 * Installed font families, sorted and de-duplicated.
 *
 * The result is cached: the permission prompt should appear once, and the list
 * does not change while the app is open. A refusal caches the fallback too, so
 * the user is not prompted again every time the dialog opens.
 */
export async function listSystemFonts(): Promise<SystemFontList> {
  if (cached) return cached;

  if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map((f) => f.family).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      );
      if (families.length > 0) {
        cached = { families, fromSystem: true };
        return cached;
      }
    } catch {
      // Permission refused, or the API is present but unusable here.
    }
  }

  cached = { families: [...COMMON_FONTS].sort((a, b) => a.localeCompare(b)), fromSystem: false };
  return cached;
}

/** Drop the cache so the next call asks again — used after a permission change. */
export function forgetSystemFonts(): void {
  cached = null;
}
