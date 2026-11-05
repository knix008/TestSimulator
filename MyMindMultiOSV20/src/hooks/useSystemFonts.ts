import { useCallback, useState } from 'react'
import { host } from '../host'

/**
 * The installed font families, asked of the host the first time the font drop-down opens.
 * In the browser there are none: the preset list remains.
 */
export function useSystemFonts() {
  const [fonts, setFonts] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (loaded) return
    setLoaded(true)
    try {
      setFonts(await host.systemFonts())
    } catch {
      /* keep the preset list only */
    }
  }, [loaded])

  return { fonts, load }
}
