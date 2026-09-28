import { cloneSolid, type ClipboardPayload, type Solid } from './model'

export function encodeClipboard(solids: Solid[]): string {
  const payload: ClipboardPayload = {
    kind: 'mycad-solids',
    solids: solids.map((solid) => cloneSolid(solid, solid.id))
  }
  return JSON.stringify(payload)
}

export function decodeClipboard(text: string): Solid[] | null {
  try {
    const data = JSON.parse(text) as ClipboardPayload
    if (!data || data.kind !== 'mycad-solids' || !Array.isArray(data.solids)) return null
    return data.solids
  } catch {
    return null
  }
}
