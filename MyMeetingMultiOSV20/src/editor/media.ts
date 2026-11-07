// Pictures, video and sound put into the minutes: what a file is (Windows often gives no type for
// TIFF, HEIC or ICO), and pictures the WebView cannot draw turned into PNG by the desktop shell.
import { host, isDesktop } from '../host'

const TYPES: Record<string, string> = {
  png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', dib: 'image/bmp', svg: 'image/svg+xml', svgz: 'image/svg+xml',
  ico: 'image/x-icon', cur: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff', tga: 'image/x-tga', qoi: 'image/qoi', dds: 'image/vnd-ms.dds', hdr: 'image/vnd.radiance',
  ppm: 'image/x-portable-pixmap', pgm: 'image/x-portable-graymap', pbm: 'image/x-portable-bitmap', pnm: 'image/x-portable-anymap',
  heic: 'image/heic', heif: 'image/heif', jxl: 'image/jxl',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
}

/** For the file picker. */
export const MEDIA_ACCEPT = ['image/*', 'video/*', 'audio/*', ...Object.keys(TYPES).map((ext) => `.${ext}`)].join(',')

export const extensionOf = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()

/** The kinds a file beside the minutes can be: what the WebView shows as it is (src-tauri/src/assets.rs). */
const KEPT_BESIDE = new Set(['png', 'apng', 'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp', 'gif', 'webp', 'avif', 'bmp', 'dib', 'svg', 'svgz', 'ico', 'cur', 'mp4', 'm4v', 'webm', 'ogv', 'mov', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'])
export const isMediaName = (name: string) => KEPT_BESIDE.has(extensionOf(name))

/** The MIME type, from the file or, when the system gives none, from its extension. */
export const mediaType = (file: File) => {
  const given = file.type && file.type !== 'application/octet-stream' ? file.type : ''
  return given || TYPES[extensionOf(file.name)] || ''
}

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** True when the WebView can draw the picture. */
const drawable = (src: string) =>
  new Promise<boolean>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth > 0)
    image.onerror = () => resolve(false)
    image.src = src
  })

export class UnsupportedImage extends Error {}

/** The file as a data URL that every view (editor, preview, print, export) can show. */
export async function mediaDataUrl(file: File): Promise<{ kind: 'image' | 'video' | 'audio'; src: string } | null> {
  const type = mediaType(file)
  const kind = type.split('/')[0]
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') return null
  const data = await readBase64(file)
  const src = `data:${type};base64,${data}`
  if (kind !== 'image' || (await drawable(src))) return { kind, src }
  if (!isDesktop) throw new UnsupportedImage(type)
  try {
    return { kind, src: await host.convertImage(data) }
  } catch {
    throw new UnsupportedImage(type)
  }
}
