import { useCallback, useState } from 'react'

type LocalFontData = { family: string }
type QueryLocalFonts = () => Promise<LocalFontData[]>

/**
 * Enumerate installed system fonts via the Local Font Access API
 * (`window.queryLocalFonts`). The API requires a user gesture and permission,
 * so `load` must be called from a click/interaction (e.g. opening the font
 * dropdown). Falls back to an empty list where the API is unavailable or denied.
 */
export function useSystemFonts() {
  const [fonts, setFonts] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (loaded) return
    const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts
    if (typeof query !== 'function') {
      setLoaded(true)
      return
    }
    try {
      const data = await query()
      const families = Array.from(new Set(data.map((f) => f.family))).sort((a, b) =>
        a.localeCompare(b),
      )
      setFonts(families)
    } catch {
      /* permission denied or unsupported — keep the preset list only */
    } finally {
      setLoaded(true)
    }
  }, [loaded])

  return { fonts, load }
}
