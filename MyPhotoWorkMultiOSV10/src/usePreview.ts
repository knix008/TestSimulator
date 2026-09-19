import { useEffect, useRef } from 'react'
import type { DialogResult } from './dialogMeta'

/** Sends the current values as a preview whenever they change, if enabled. */
export function useLivePreview(enabled: boolean, values: Record<string, unknown>, onResult: (result: DialogResult) => void) {
  const key = JSON.stringify(values)
  const first = useRef(true)
  useEffect(() => {
    if (!enabled) return
    // The very first render is what the window opened with; previewing it
    // would only redraw the picture as it already is.
    if (first.current) {
      first.current = false
      return
    }
    onResult({ action: 'preview', ...values })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
}

