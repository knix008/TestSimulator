/**
 * Making AppImages without external tools: the AppImage type-2 runtime (an ELF program, the
 * same one appimagetool uses) followed by a SquashFS image of the AppDir (host/squashfs.ts).
 *
 * The runtime comes from, in order: ISOMAKER_APPIMAGE_RUNTIME (a file), the app's tools folder
 * (downloaded once from github.com/AppImage/type2-runtime), or the first bytes of an AppImage the
 * user opened (`runtimeFrom`). It is only copied into the output — never run here.
 *
 * An AppDir needs AppRun, a .desktop file and an icon at its root. What the source folder lacks
 * is added inside the image (the folder itself is not changed): a small AppRun shell script, a
 * .desktop entry named after the app, and the MyISOMaker icon.
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveResource } from './paths'
import { toolsDir } from './packages'
import { sourceFromDisk, writeSquashfs, type SquashSource } from './squashfs'

export type AppImageArch = 'x86_64' | 'aarch64'

export type CreateAppImageOptions = {
  sourceDir: string
  output: string
  /** Name shown in menus (the .desktop Name=); also the default file names inside. */
  name?: string
  arch?: AppImageArch
  /** An AppImage whose runtime can be reused (no download). */
  runtimeFrom?: { path: string; offset: number }
}

const RUNTIME_URL = (arch: AppImageArch) =>
  process.env.ISOMAKER_APPIMAGE_RUNTIME_URL || `https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-${arch}`

function isElf(buf: Buffer): boolean {
  return buf.length > 64 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46
}

/** The runtime bytes, downloading once into the tools folder when needed. */
export async function appImageRuntime(arch: AppImageArch = 'x86_64', runtimeFrom?: { path: string; offset: number }): Promise<Buffer> {
  if (process.env.ISOMAKER_APPIMAGE_RUNTIME) return fs.readFileSync(process.env.ISOMAKER_APPIMAGE_RUNTIME)
  if (runtimeFrom && runtimeFrom.offset > 0) {
    const fd = fs.openSync(runtimeFrom.path, 'r')
    try {
      const buf = Buffer.alloc(runtimeFrom.offset)
      fs.readSync(fd, buf, 0, runtimeFrom.offset, 0)
      if (isElf(buf)) return buf
    } finally {
      fs.closeSync(fd)
    }
  }
  const cached = path.join(toolsDir(), 'appimage', `runtime-${arch}`)
  if (fs.existsSync(cached)) {
    const buf = fs.readFileSync(cached)
    if (isElf(buf)) return buf
  }
  const res = await fetch(RUNTIME_URL(arch), { redirect: 'follow' }).catch((err) => {
    throw new Error(`Could not download the AppImage runtime (${err?.cause?.code ?? err?.message ?? err}). Check the internet connection.`)
  })
  if (!res.ok) throw new Error(`Could not download the AppImage runtime (HTTP ${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!isElf(buf)) throw new Error('The downloaded AppImage runtime is not an ELF program.')
  fs.mkdirSync(path.dirname(cached), { recursive: true })
  fs.writeFileSync(cached, buf)
  return buf
}

function slug(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'app'
}

/** The AppDir tree with AppRun, a .desktop entry and an icon added where missing. */
export function appDirTree(sourceDir: string, name: string): Extract<SquashSource, { kind: 'dir' }> {
  const tree = sourceFromDisk(sourceDir)
  const has = (re: RegExp) => tree.children.some((c) => re.test(c.name))
  const id = slug(name)
  const add = (file: SquashSource) => tree.children.push(file)
  if (!has(/^AppRun$/)) {
    // Runs the first program in usr/bin (or a same-named one at the root).
    const script = [
      '#!/bin/sh',
      'HERE="$(dirname "$(readlink -f "$0")")"',
      'export PATH="$HERE/usr/bin:$PATH"',
      'export LD_LIBRARY_PATH="$HERE/usr/lib:$LD_LIBRARY_PATH"',
      `for exe in "$HERE/usr/bin/${id}" "$HERE/${id}" "$HERE"/usr/bin/*; do`,
      '  [ -f "$exe" ] && [ -x "$exe" ] && exec "$exe" "$@"',
      'done',
      'echo "No program found in this AppImage (put one in usr/bin)." >&2',
      'exit 1',
      '',
    ].join('\n')
    add({ kind: 'file', name: 'AppRun', data: Buffer.from(script), size: Buffer.byteLength(script), mode: 0o755 })
  }
  let iconName = tree.children.find((c) => c.kind === 'file' && /\.(png|svg)$/i.test(c.name))?.name.replace(/\.(png|svg)$/i, '')
  if (!iconName) {
    const icon = resolveResource('assets', 'icon-256.png') ?? resolveResource('public', 'icon-256.png')
    if (icon) {
      const data = fs.readFileSync(icon)
      add({ kind: 'file', name: `${id}.png`, data, size: data.length, mode: 0o644 })
      if (!has(/^\.DirIcon$/)) add({ kind: 'file', name: '.DirIcon', data, size: data.length, mode: 0o644 })
      iconName = id
    }
  }
  if (!has(/\.desktop$/)) {
    const desktop = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${name || id}`,
      'Exec=AppRun',
      `Icon=${iconName ?? id}`,
      'Categories=Utility;',
      'Terminal=false',
      '',
    ].join('\n')
    add({ kind: 'file', name: `${id}.desktop`, data: Buffer.from(desktop), size: Buffer.byteLength(desktop), mode: 0o644 })
  }
  return tree
}

/** Builds the AppImage; returns its size and the SquashFS offset (= runtime size). */
export async function createAppImage(opts: CreateAppImageOptions, onFile?: (p: string) => void): Promise<{ size: number; offset: number }> {
  if (!fs.existsSync(opts.sourceDir) || !fs.statSync(opts.sourceDir).isDirectory()) throw new Error(`Not a folder: ${opts.sourceDir}`)
  const name = opts.name || path.basename(opts.sourceDir)
  const runtime = await appImageRuntime(opts.arch ?? 'x86_64', opts.runtimeFrom)
  const tree = appDirTree(opts.sourceDir, name)
  fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true })
  const tmp = `${opts.output}.part`
  const fd = fs.openSync(tmp, 'w')
  let sqSize = 0
  try {
    fs.writeSync(fd, runtime, 0, runtime.length, 0)
    sqSize = writeSquashfs(fd, runtime.length, tree, onFile)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, opts.output)
  if (process.platform !== 'win32') fs.chmodSync(opts.output, 0o755)
  return { size: runtime.length + sqSize, offset: runtime.length }
}
