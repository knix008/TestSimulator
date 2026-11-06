// Icons for the minutes themselves: the program's icons as self-contained coloured SVG pictures,
// so they look the same in the editor, the preview, print and every export.
import { iconOf } from '../components/Icons'

/** The light-theme shade of each hue (styles/icons.css): documents are on white paper. */
const TONE_HEX: Record<string, string> = {
  blue: '#2563eb', sky: '#0284c7', indigo: '#4f46e5', purple: '#9333ea', pink: '#db2777', red: '#dc2626', orange: '#ea580c',
  amber: '#d97706', yellow: '#ca8a04', green: '#16a34a', teal: '#0d9488', cyan: '#0891b2', slate: '#526075', brown: '#92400e',
}

export const DOC_ICON_SIZES = [16, 20, 28, 40] as const

export const DOC_ICON_GROUPS: { id: string; icons: string[] }[] = [
  { id: 'status', icons: ['check', 'close', 'warning', 'question', 'info', 'star', 'heart', 'flag', 'bookmark', 'pin', 'bell', 'alarm', 'sparkle', 'fire', 'bolt', 'crown', 'medal', 'trophy', 'plus', 'minus', 'stop', 'play', 'pause'] },
  { id: 'people', icons: ['users', 'person', 'userPlus', 'handshake', 'smile', 'sad', 'thumbsUp', 'thumbsDown', 'megaphone', 'mic', 'discussion', 'memo', 'pen', 'edit'] },
  { id: 'work', icons: ['agenda', 'decision', 'action', 'idea', 'milestone', 'rocket', 'puzzle', 'briefcase', 'building', 'calendar', 'calendarCheck', 'clock', 'hourglass', 'checklist', 'tutorial', 'guide', 'template', 'gridIcon'] },
  { id: 'data', icons: ['chartBar', 'chartPie', 'trendUp', 'trendDown', 'line', 'money', 'coin', 'cart', 'database', 'server', 'table', 'filter', 'search', 'ruler', 'numbered', 'list'] },
  { id: 'comms', icons: ['mail', 'phone', 'video', 'camera', 'inbox', 'send', 'download', 'upload', 'link', 'at', 'hashtag', 'wifi', 'cloud', 'laptop', 'mobile', 'language', 'sync', 'eye'] },
  { id: 'things', icons: ['key', 'lock', 'unlock', 'shield', 'bug', 'wrench', 'settings', 'tag', 'paperclip', 'folder', 'file', 'image', 'gift', 'coffee', 'music', 'car', 'truck', 'plane', 'map', 'place', 'home', 'leaf', 'magnet', 'sun', 'moon', 'power', 'color', 'theme', 'print', 'save', 'delete', 'copy'] },
  { id: 'arrows', icons: ['arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown', 'up', 'down', 'collapseLeft', 'collapseRight', 'trendUp', 'undo', 'redo', 'export', 'fullscreen', 'zoomIn', 'zoomOut'] },
]

/** Every icon the picker offers, each once. */
export const DOC_ICONS = [...new Set(DOC_ICON_GROUPS.flatMap((group) => group.icons))]

/** The marker an inserted icon carries in its alt text, so it can be told from a photo. */
export const DOC_ICON_ALT = 'icon:'

/** The icon as a standalone SVG: its stroke in its hue, the first shape washed with it. */
export function docIconSvg(name: string): string {
  const [tone, body] = iconOf(name)
  const color = TONE_HEX[tone] ?? TONE_HEX.blue
  const washed = body.replace(/^<(\w+)/, `<$1 fill="${color}" fill-opacity="0.22"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 26 26" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${washed}</svg>`
}

export function docIconUrl(name: string): string {
  return `data:image/svg+xml;base64,${btoa(docIconSvg(name))}`
}

/** The <img> the editor inserts. */
export function docIconHtml(name: string, size: number): string {
  return `<img src="${docIconUrl(name)}" alt="${DOC_ICON_ALT}${name}" width="${size}">`
}
