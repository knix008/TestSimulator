export type BuiltInWallpaper = {
  id: string
  name: string
  fileName: string
  url: string
}

/** Extensions accepted for custom wallpaper selection and built-in assets. */
export const wallpaperFileExtensions = [
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'png',
  'gif',
  'webp',
  'bmp',
  'dib',
  'tif',
  'tiff',
  'svg',
  'svgz',
  'ico',
  'avif',
  'apng',
] as const

// Built-in assets must be webview-renderable (TIFF is converted only for custom files).
const wallpaperModules = import.meta.glob(
  '../background/*.{jpg,jpeg,jpe,jfif,png,gif,webp,bmp,dib,svg,svgz,ico,avif,apng,JPG,JPEG,JPE,JFIF,PNG,GIF,WEBP,BMP,DIB,SVG,SVGZ,ICO,AVIF,APNG}',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>

const fileNameFromPath = (path: string) => path.split(/[\\/]/).pop() || path

const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  apng: 'image/apng',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  dib: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  svgz: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

export const wallpaperMimeFromPath = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return mimeByExtension[extension] || 'application/octet-stream'
}

export const builtInWallpapers: BuiltInWallpaper[] = Object.entries(wallpaperModules)
  .map(([path, url]) => {
    const fileName = fileNameFromPath(path)
    return {
      id: `builtin:${fileName}`,
      fileName,
      name: fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      url,
    }
  })
  .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { sensitivity: 'base' }))

export const defaultBuiltInWallpaperId = builtInWallpapers[0]?.id ?? ''

export const isBuiltInWallpaperId = (value: string) => value.startsWith('builtin:')

export const findBuiltInWallpaper = (id: string) => builtInWallpapers.find((item) => item.id === id)

export const wallpaperDisplayName = (path: string) => {
  if (!path) {
    return ''
  }

  if (isBuiltInWallpaperId(path)) {
    return findBuiltInWallpaper(path)?.name || path.slice('builtin:'.length)
  }

  return fileNameFromPath(path)
}
