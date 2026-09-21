import { useEffect, useRef } from 'react'
import { isAdjusting, onAdjustEnd } from './adjusting'
import type { DialogResult } from './dialogMeta'

/**
 * Sends the current values as a preview whenever they change, if enabled —
 * but not while a slider is being dragged.
 *
 * A preview redraws the whole picture through the filter. Doing that for every
 * pixel of a drag makes the drag as slow as the filter, and each frame of the
 * work is discarded by the next one; only the value the user stops on is worth
 * drawing. So while an adjustment is in progress the preview waits, and the
 * picture is redrawn once, from the values the drag ended on.
 */
export function useLivePreview(enabled: boolean, values: Record<string, unknown>, onResult: (result: DialogResult) => void) {
  const key = JSON.stringify(values)
  const first = useRef(true)
  useEffect(() => {
    if (!enabled) return undefined
    // The very first render is what the window opened with; previewing it
    // would only redraw the picture as it already is.
    if (first.current) {
      first.current = false
      return undefined
    }
    const send = () => onResult({ action: 'preview', ...values })
    if (!isAdjusting()) {
      send()
      return undefined
    }
    /*
     * Registered afresh on every change, so the values that finally reach the
     * preview are the ones from the last change before the drag ended: the
     * cleanup drops the previous registration each time.
     */
    return onAdjustEnd(send)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
}
