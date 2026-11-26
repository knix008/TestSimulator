/** The left explorer: drives / quick places and folder listings. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type FsEntry = {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
  /** a disc image the app opens (.iso .img .appimage .tar .tgz …) */
  image: boolean
}

export type FsPlace = { id: string; name: string; path: string; kind: 'drive' | 'home' | 'desktop' | 'documents' | 'downloads' | 'root' }

const IMAGE_RE = /\.(iso|img|appimage|tar|tgz|tar\.gz)$/i

export function fsPlaces(): FsPlace[] {
  const home = os.homedir()
  const out: FsPlace[] = []
  const add = (id: string, name: string, p: string, kind: FsPlace['kind']) => {
    try {
      if (fs.statSync(p).isDirectory()) out.push({ id, name, path: p, kind })
    } catch {
      /* missing */
    }
  }
  add('home', path.basename(home) || home, home, 'home')
  add('desktop', 'Desktop', path.join(home, 'Desktop'), 'desktop')
  add('documents', 'Documents', path.join(home, 'Documents'), 'documents')
  add('downloads', 'Downloads', path.join(home, 'Downloads'), 'downloads')
  if (process.platform === 'win32') {
    for (let c = 67; c <= 90; c += 1) {
      const d = `${String.fromCharCode(c)}:\\`
      try {
        fs.accessSync(d)
        out.push({ id: `drive-${d[0]}`, name: `${d[0]}:`, path: d, kind: 'drive' })
      } catch {
        /* no such drive */
      }
    }
  } else {
    out.push({ id: 'root', name: '/', path: '/', kind: 'root' })
  }
  return out
}

export function fsList(dir: string): FsEntry[] {
  const names = fs.readdirSync(dir, { withFileTypes: true })
  const out: FsEntry[] = []
  for (const d of names) {
    if (d.name.startsWith('$') || d.name === 'System Volume Information') continue
    const p = path.join(dir, d.name)
    let isDir = d.isDirectory()
    let size = 0
    let mtime = 0
    try {
      const st = fs.statSync(p)
      isDir = st.isDirectory()
      size = isDir ? 0 : st.size
      mtime = st.mtimeMs
    } catch {
      if (d.isSymbolicLink()) continue
    }
    out.push({ name: d.name, path: p, isDir, size, mtime, image: !isDir && IMAGE_RE.test(d.name) })
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : a.isDir ? -1 : 1))
  return out
}

export function fsStat(p: string): FsEntry | null {
  try {
    const st = fs.statSync(p)
    return {
      name: path.basename(p) || p,
      path: p,
      isDir: st.isDirectory(),
      size: st.isDirectory() ? 0 : st.size,
      mtime: st.mtimeMs,
      image: !st.isDirectory() && IMAGE_RE.test(p),
    }
  } catch {
    return null
  }
}
