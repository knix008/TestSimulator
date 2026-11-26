/** Default names for a new image made from a source folder or file (Create / Bootable tabs). */

/** D:\work\mydisc → D:\work\mydisc.iso; a file source drops its extension. */
export function defaultIsoFor(source: string): string {
  return defaultOutputFor(source, 'iso')
}

/** Same as defaultIsoFor with another extension (AppImage …). */
export function defaultOutputFor(source: string, ext: string): string {
  const trimmed = source.trim().replace(/[\\/]+$/, '')
  if (!trimmed) return ''
  const sep = trimmed.includes('\\') ? '\\' : '/'
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  const parent = idx >= 0 ? trimmed.slice(0, idx) : ''
  let name = idx >= 0 ? trimmed.slice(idx + 1) : trimmed
  if (/^[a-zA-Z]:$/.test(trimmed)) return `${trimmed}\\disc.${ext}`
  const dot = name.lastIndexOf('.')
  if (dot > 0 && name.length - dot <= 6) name = name.slice(0, dot)
  return parent ? `${parent}${sep}${name}.${ext}` : `${name}.${ext}`
}

/** ISO9660 volume label from the source name: A–Z 0–9 _ , 32 characters. */
export function volumeLabelFor(source: string): string {
  const name = source.trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
  const label = name.replace(/\.[^.]{1,5}$/, '').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return label || 'ISOMAKER'
}
