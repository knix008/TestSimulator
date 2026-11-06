import { useCallback, useState } from 'react'
import { host } from './host'

/** The installed font families, asked of the host the first time they are needed. */
export function useSystemFonts() {
  const [fonts, setFonts] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (loaded) return
    setLoaded(true)
    try {
      setFonts(await host.systemFonts())
    } catch {
      /* the preset list only */
    }
  }, [loaded])

  return { fonts, load }
}
