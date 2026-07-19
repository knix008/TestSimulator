import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeKey } from '../../src/iso9660/reader'
import type { IsoDirNode, IsoNode } from '../../src/iso9660/types'
import type { OpenImageKind } from '../../src/iso9660/image-formats'

const SQUASHFS_MAGIC = Buffer.from('hsqs', 'ascii')
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46])

/**
 * Probe AppImage (ELF + embedded squashfs) or docker-save / tar archives.
 * Extension hints win when unambiguous; otherwise use file magic.
 */
export async function detectOpenKind(filePath: string, hinted: OpenImageKind): Promise<OpenImageKind> {
  if (hinted === 'iso' || hinted === 'img' || hinted === 'appimage' || hinted === 'docker') {
    return hinted
  }
  if (await isAppImageFile(filePath)) return 'appimage'
  if (await looksLikeTarArchive(filePath)) return 'docker'
  return 'unknown'
}

export async function isAppImageFile(filePath: string): Promise<boolean> {
  try {
    const fh = await fs.promises.open(filePath, 'r')
    try {
      const head = Buffer.alloc(4)
      const { bytesRead } = await fh.read(head, 0, 4, 0)
      if (bytesRead < 4 || !head.equals(ELF_MAGIC)) return false
    } finally {
      await fh.close()
    }
    const offset = await findSquashfsOffset(filePath)
    return offset >= 0
  } catch {
    return false
  }
}

export async function looksLikeTarArchive(filePath: string): Promise<boolean> {
  try {
    const fh = await fs.promises.open(filePath, 'r')
    try {
      const head = Buffer.alloc(512)
      const { bytesRead } = await fh.read(head, 0, 512, 0)
      if (bytesRead < 265) return false
      if (head[0] === 0x1f && head[1] === 0x8b) return true // gzip
      const ustar = head.subarray(257, 262).toString('ascii')
      return ustar === 'ustar'
    } finally {
      await fh.close()
    }
  } catch {
    return false
  }
}

/** Extract AppImage or docker/tar into a fresh temp directory; return the tree root path. */
export async function extractArchiveToTemp(
  filePath: string,
  kind: 'appimage' | 'docker',
): Promise<{ extractRoot: string; treeRoot: string; squashfsOffset: number | null }> {
  const extractRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isomaker-extract-'))
  try {
    if (kind === 'appimage') {
      const { treeRoot, squashfsOffset } = await extractAppImage(filePath, extractRoot)
      return { extractRoot, treeRoot, squashfsOffset }
    }
    await extractTarArchive(filePath, extractRoot)
    return { extractRoot, treeRoot: extractRoot, squashfsOffset: null }
  } catch (err) {
    try {
      fs.rmSync(extractRoot, { recursive: true, force: true })
    } catch {
      // ignore
    }
    throw err
  }
}

export async function buildTreeFromDirectory(dirPath: string): Promise<IsoDirNode> {
  const root: IsoDirNode = { kind: 'dir', name: '', children: new Map() }
  await walkDir(dirPath, root)
  return root
}

export function volumeLabelFromPath(filePath: string): string {
  const base = path.basename(filePath)
  const stem = base
    .replace(/\.tar\.gz$/i, '')
    .replace(/\.(appimage|tar|tgz|docker|iso|img)$/i, '')
  const cleaned = stem.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
  return (cleaned || 'IMAGE').slice(0, 32).toUpperCase()
}

async function walkDir(absDir: string, parent: IsoDirNode): Promise<void> {
  let names: string[]
  try {
    names = await fs.promises.readdir(absDir)
  } catch {
    return
  }
  names.sort((a, b) => a.localeCompare(b))
  for (const name of names) {
    if (name === '.' || name === '..') continue
    const abs = path.join(absDir, name)
    let st: fs.Stats
    try {
      st = await fs.promises.lstat(abs)
    } catch {
      continue
    }
    // Skip symlinks — Windows extract of Linux images often has broken links.
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) {
      const dirNode: IsoDirNode = { kind: 'dir', name, children: new Map() }
      parent.children.set(normalizeKey(name), dirNode)
      await walkDir(abs, dirNode)
      continue
    }
    if (!st.isFile()) continue
    const fileNode: IsoNode = {
      kind: 'file',
      name,
      size: st.size,
      source: { type: 'path', absolutePath: abs },
    }
    parent.children.set(normalizeKey(name), fileNode)
  }
}

async function extractAppImage(
  filePath: string,
  destDir: string,
): Promise<{ treeRoot: string; squashfsOffset: number }> {
  const offset = await findSquashfsOffset(filePath)
  if (offset < 0) {
    throw new Error('AppImage에서 squashfs(hsqs) 시그니처를 찾지 못했습니다.')
  }

  const unsquashfs = resolveSquashfsTool('unsquashfs')
  if (unsquashfs) {
    const outDir = path.join(destDir, 'root')
    await fs.promises.mkdir(outDir, { recursive: true })
    await runCommand(
      unsquashfs,
      ['-f', '-o', String(offset), '-d', outDir, filePath],
      path.dirname(unsquashfs),
    )
    return { treeRoot: outDir, squashfsOffset: offset }
  }

  if (process.platform === 'linux') {
    try {
      await fs.promises.chmod(filePath, 0o755)
    } catch {
      // may be on a noexec / already executable FS
    }
    await runCommand(filePath, ['--appimage-extract'], destDir)
    const squashRoot = path.join(destDir, 'squashfs-root')
    if (fs.existsSync(squashRoot)) {
      return { treeRoot: squashRoot, squashfsOffset: offset }
    }
  }

  throw new Error(
    'AppImage를 풀 수 없습니다. squashfs-tools(unsquashfs)를 설치한 뒤 다시 시도하세요.\n' +
      'Windows: MSYS2에서 `pacman -S squashfs-tools`\n' +
      'macOS: `brew install squashfs`\n' +
      'Linux: `sudo apt install squashfs-tools` (또는 AppImage 실행 권한)',
  )
}

async function extractTarArchive(filePath: string, destDir: string): Promise<void> {
  const tar = resolveTar()
  if (!tar) {
    throw new Error('tar 명령을 찾을 수 없습니다. Docker 저장본(.tar)을 열려면 OS tar가 필요합니다.')
  }
  const gzip = isGzipFile(filePath) || /\.(tgz|tar\.gz)$/i.test(filePath)
  const args = gzip
    ? ['-xzf', filePath, '-C', destDir]
    : ['-xf', filePath, '-C', destDir]
  await runCommand(tar, args, destDir)
}

function isGzipFile(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(2)
    const n = fs.readSync(fd, buf, 0, 2, 0)
    return n === 2 && buf[0] === 0x1f && buf[1] === 0x8b
  } finally {
    fs.closeSync(fd)
  }
}

export async function findSquashfsOffset(filePath: string): Promise<number> {
  const size = (await fs.promises.stat(filePath)).size
  const chunkSize = 1024 * 1024
  const overlap = SQUASHFS_MAGIC.length - 1
  const buf = Buffer.alloc(chunkSize)
  const fh = await fs.promises.open(filePath, 'r')
  try {
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await fh.read(buf, 0, chunkSize, offset)
      if (bytesRead <= 0) break
      const idx = buf.subarray(0, bytesRead).indexOf(SQUASHFS_MAGIC)
      if (idx >= 0) return offset + idx
      if (bytesRead <= overlap) break
      offset += bytesRead - overlap
    }
  } finally {
    await fh.close()
  }
  return -1
}

export function resolveMksquashfs(): string | null {
  return resolveSquashfsTool('mksquashfs')
}

export function resolveTar(): string | null {
  if (process.platform === 'win32') {
    const systemTar = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'tar.exe',
    )
    if (fs.existsSync(systemTar)) return systemTar
    return whichSync('tar.exe') ?? whichSync('tar')
  }
  return whichSync('tar')
}

export function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const detail = stderr.trim() || `exit ${code}`
      reject(new Error(`${path.basename(command)} 실패: ${detail}`))
    })
  })
}

function resolveSquashfsTool(baseName: 'unsquashfs' | 'mksquashfs'): string | null {
  const names =
    process.platform === 'win32' ? [`${baseName}.exe`, baseName] : [baseName]
  const extras: string[] = []
  if (process.platform === 'win32') {
    for (const root of [
      process.env.MSYS2_ROOT,
      'C:\\msys64',
      'C:\\msys32',
      process.env.CYGWIN_ROOT,
      'C:\\cygwin64',
    ].filter((v): v is string => Boolean(v))) {
      extras.push(path.join(root, 'usr', 'bin', `${baseName}.exe`))
      extras.push(path.join(root, 'bin', `${baseName}.exe`))
    }
  }
  for (const candidate of extras) {
    if (fs.existsSync(candidate)) return candidate
  }
  for (const name of names) {
    const found = whichSync(name)
    if (found) return found
  }
  return null
}

function whichSync(command: string): string | null {
  try {
    const result =
      process.platform === 'win32'
        ? execFileSync('where', [command], { encoding: 'utf8', windowsHide: true })
        : execFileSync('which', [command], { encoding: 'utf8' })
    const line = String(result)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return line && fs.existsSync(line) ? line : null
  } catch {
    return null
  }
}