/** Image / archive extensions supported for open / browse / edit / save. */
export const DISC_IMAGE_EXTENSIONS = ['iso', 'img'] as const
export const APPIMAGE_EXTENSIONS = ['appimage'] as const
export const DOCKER_IMAGE_EXTENSIONS = ['tar', 'tgz', 'docker'] as const

export type DiscImageExt = (typeof DISC_IMAGE_EXTENSIONS)[number]

export type DiscImageFileFilter = {
  name: string
  extensions: string[]
}

export type OpenImageKind = 'iso' | 'img' | 'appimage' | 'docker' | 'unknown'

export function discImageFileFilters(lang: 'ko' | 'en' = 'ko'): DiscImageFileFilter[] {
  return [
    {
      name:
        lang === 'en'
          ? 'Supported images (*.iso, *.img, *.AppImage, *.tar)'
          : '지원 이미지 (*.iso, *.img, *.AppImage, *.tar)',
      extensions: ['iso', 'img', 'AppImage', 'appimage', 'tar', 'tgz', 'docker'],
    },
    {
      name: 'ISO / IMG',
      extensions: [...DISC_IMAGE_EXTENSIONS],
    },
    {
      name: 'AppImage',
      extensions: ['AppImage', 'appimage'],
    },
    {
      name: lang === 'en' ? 'Docker save / tar' : 'Docker 저장본 / tar',
      extensions: ['tar', 'tgz', 'docker'],
    },
    {
      name: lang === 'en' ? 'All files' : '모든 파일',
      extensions: ['*'],
    },
  ]
}

/** Filters for Save As — preferred format first when known. */
export function saveImageFileFilters(
  lang: 'ko' | 'en' = 'ko',
  preferred?: OpenImageKind,
): DiscImageFileFilter[] {
  const iso: DiscImageFileFilter = { name: 'ISO', extensions: ['iso'] }
  const img: DiscImageFileFilter = { name: 'IMG', extensions: ['img'] }
  const app: DiscImageFileFilter = {
    name: 'AppImage',
    extensions: ['AppImage', 'appimage'],
  }
  const docker: DiscImageFileFilter = {
    name: lang === 'en' ? 'Docker save / tar' : 'Docker 저장본 / tar',
    extensions: ['tar', 'tgz', 'docker'],
  }
  const tgz: DiscImageFileFilter = {
    name: lang === 'en' ? 'Compressed tar (.tgz)' : '압축 tar (.tgz)',
    extensions: ['tgz'],
  }
  const all: DiscImageFileFilter = {
    name: lang === 'en' ? 'All files' : '모든 파일',
    extensions: ['*'],
  }

  const byKind: Record<Exclude<OpenImageKind, 'unknown'>, DiscImageFileFilter[]> = {
    iso: [iso, img, app, docker, tgz],
    img: [img, iso, app, docker, tgz],
    appimage: [app, iso, img, docker, tgz],
    docker: [docker, tgz, iso, img, app],
  }

  const ordered =
    preferred && preferred !== 'unknown' ? byKind[preferred] : [iso, img, app, docker, tgz]
  return [...ordered, all]
}

export function guessImageKindByName(filePath: string): OpenImageKind {
  const base = filePath.replace(/^.*[/\\]/, '').toLowerCase()
  if (base.endsWith('.appimage')) return 'appimage'
  if (base.endsWith('.iso')) return 'iso'
  if (base.endsWith('.img')) return 'img'
  if (
    base.endsWith('.tar.gz') ||
    base.endsWith('.tgz') ||
    base.endsWith('.tar') ||
    base.endsWith('.docker')
  ) {
    return 'docker'
  }
  return 'unknown'
}

/** True when the file should be opened via archive extract (not ISO9660). */
export function isArchiveImageKind(kind: OpenImageKind): kind is 'appimage' | 'docker' {
  return kind === 'appimage' || kind === 'docker'
}

export function isDiscImagePath(filePath: string): boolean {
  const kind = guessImageKindByName(filePath)
  return kind === 'iso' || kind === 'img'
}

/** Suggest an edited output name, preserving the source format extension. */
export function editedImageName(sourcePathOrName: string): string {
  const base = sourcePathOrName.replace(/^.*[/\\]/, '')
  if (/\.tar\.gz$/i.test(base)) {
    const stem = base.replace(/\.tar\.gz$/i, '') || 'image'
    return `${stem}-edited.tar.gz`
  }
  const m = base.match(/^(.*)\.(iso|img|appimage|tar|tgz|docker)$/i)
  if (m) {
    const rawExt = m[2]!
    const ext = rawExt.toLowerCase() === 'appimage' ? 'AppImage' : rawExt.toLowerCase()
    return `${m[1]}-edited.${ext}`
  }
  return `${base || 'image'}-edited.iso`
}

/** @deprecated Use editedImageName */
export function editedDiscImageName(sourcePathOrName: string): string {
  return editedImageName(sourcePathOrName)
}

export function discImageExtension(sourcePathOrName: string): DiscImageExt {
  const lower = sourcePathOrName.toLowerCase()
  if (lower.endsWith('.img')) return 'img'
  return 'iso'
}

export function isGzipTarPath(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return lower.endsWith('.tgz') || lower.endsWith('.tar.gz')
}
