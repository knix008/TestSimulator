export const FALLBACK_FONTS = [
  'Segoe UI',
  'Malgun Gothic',
  'Arial',
  'Calibri',
  'Cambria',
  'Consolas',
  'Courier New',
  'Georgia',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Gulim',
  'Dotum',
  'Batang',
  'NanumGothic',
  'Apple SD Gothic Neo',
  'Noto Sans KR',
  'Noto Sans',
  'Helvetica Neue',
  'Liberation Sans'
]

export function mergeFonts(systemFonts: string[]): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const font of [...systemFonts, ...FALLBACK_FONTS]) {
    const name = font.trim().replace(/^"|"$/g, '')
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    list.push(name)
  }
  return list
}

export async function detectBrowserFonts(): Promise<string[]> {
  const found: string[] = []
  const query = (window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
  if (query) {
    try {
      const fonts = await query()
      for (const font of fonts) found.push(font.family)
    } catch {
      /* permission denied or unsupported */
    }
  }
  if (found.length > 0) return mergeFonts(found)
  if (typeof document === 'undefined' || !document.fonts?.check) return FALLBACK_FONTS.slice()
  for (const font of FALLBACK_FONTS) {
    try {
      if (document.fonts.check(`14px "${font}"`)) found.push(font)
    } catch {
      found.push(font)
    }
  }
  return mergeFonts(found.length ? found : FALLBACK_FONTS)
}
