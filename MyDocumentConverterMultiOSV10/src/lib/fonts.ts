/**
 * The fonts installed on this machine, for the font settings.
 *
 * Chromium's `queryLocalFonts()` is asked first (it needs a permission the
 * desktop shell grants and a browser asks for); the desktop falls back to the
 * main process reading the system font list; and both fall back to a list of
 * common families so the control is never empty.
 */

const FALLBACK = [
  'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'D2Coding', 'Georgia', 'Helvetica', 'Malgun Gothic', 'Menlo', 'Monaco',
  'Nanum Gothic', 'Nanum Gothic Coding', 'Noto Sans', 'Noto Sans KR', 'Noto Serif', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana',
]

let cache: string[] | null = null

export async function listFonts(): Promise<string[]> {
  if (cache) return cache
  const names = new Set<string>()
  try {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
    if (query) {
      const fonts = await query.call(window)
      for (const font of fonts) names.add(font.family)
    }
  } catch {
    // Permission refused, or not supported: the fallbacks below cover it.
  }
  if (names.size === 0 && window.electronFontApi) {
    try {
      for (const name of await window.electronFontApi.list()) names.add(name)
    } catch {
      // Same as above.
    }
  }
  if (names.size === 0) for (const name of FALLBACK) names.add(name)
  cache = [...names].sort((a, b) => a.localeCompare(b))
  return cache
}

/** Families that look monospaced, listed first in the editor font control. */
export function isLikelyMonospace(name: string) {
  return /mono|code|consolas|courier|menlo|fixed|typewriter|d2coding|source code|fira code|jetbrains|cascadia|hack|inconsolata|ubuntu mono/i.test(name)
}

/* ------------------------------------------------------- bundled fonts */

const bundled = new Map<string, Promise<Uint8Array | null>>()

/**
 * One of the TrueType fonts shipped in `public/fonts/` (the Nanum families,
 * OFL), fetched relative to the page so the same code serves the web build
 * and the `app://` bundle under Electron. Cached for the session; a missing
 * file yields null and the PostScript writer falls back to base fonts.
 */
export function loadBundledFont(file: string): Promise<Uint8Array | null> {
  let pending = bundled.get(file)
  if (!pending) {
    pending = fetch(`./fonts/${file}`)
      .then(async (response) => (response.ok ? new Uint8Array(await response.arrayBuffer()) : null))
      .catch(() => null)
    bundled.set(file, pending)
  }
  return pending
}
