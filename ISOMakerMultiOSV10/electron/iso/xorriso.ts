import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveResource, resourceRoots } from '../paths'
import type {
  CreateBootableIsoOptions,
  CreateIsoOptions,
  EngineInfo,
  ExtractOptions,
  JobProgress,
} from './types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function vendorBinaryName(): string {
  if (process.platform === 'win32') return 'xorriso.exe'
  return 'xorriso'
}

function windowsExtraCandidates(): string[] {
  if (process.platform !== 'win32') return []
  const roots = [
    process.env.MSYS2_ROOT,
    'C:\\msys64',
    'C:\\msys32',
    process.env.CYGWIN_ROOT,
    'C:\\cygwin64',
    'C:\\cygwin',
  ].filter((v): v is string => Boolean(v))

  const out: string[] = []
  for (const root of roots) {
    out.push(path.join(root, 'usr', 'bin', 'xorriso.exe'))
    out.push(path.join(root, 'bin', 'xorriso.exe'))
    out.push(path.join(root, 'mingw64', 'bin', 'xorriso.exe'))
  }
  return out
}

/** Resolve MSYS2/Cygwin, then vendor binary, then PATH. */
export function resolveXorrisoPath(): string | null {
  const vendorRel = ['vendor', 'xorriso', process.platform, vendorBinaryName()] as const
  const candidates = [
    // Prefer full installs (DLL path is next to the exe / on PATH)
    ...windowsExtraCandidates(),
    ...resourceRoots().map((root) => path.join(root, ...vendorRel)),
    resolveResource(...vendorRel) ?? '',
    path.join(__dirname, '..', '..', ...vendorRel),
    path.join(__dirname, '..', '..', '..', ...vendorRel),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  // Last resort: bare name on PATH
  return process.platform === 'win32' ? 'xorriso.exe' : 'xorriso'
}

/** MSYS2/Cygwin xorriso expects POSIX paths like /c/Users/... not C:\Users\... */
function usesPosixPaths(binary: string): boolean {
  if (process.platform !== 'win32') return false
  if (!path.isAbsolute(binary)) return false
  const n = binary.replace(/\\/g, '/').toLowerCase()
  if (n.includes('/msys') || n.includes('/cygwin') || n.includes('/usr/bin/')) return true
  // Bundled MSYS-built exe usually ships with msys-2.0.dll beside it
  const dir = path.dirname(binary)
  return (
    fs.existsSync(path.join(dir, 'msys-2.0.dll')) ||
    fs.existsSync(path.join(dir, 'cygwin1.dll'))
  )
}

/** Convert Windows absolute path to MSYS-style (/c/Users/...). */
export function toXorrisoPath(filePath: string): string {
  if (process.platform !== 'win32') return filePath
  let p = filePath
  // Strip \\?\ prefix
  if (p.startsWith('\\\\?\\')) p = p.slice(4)
  const resolved = path.resolve(p)
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(resolved)
  if (!match) return resolved.replace(/\\/g, '/')
  const drive = match[1]!.toLowerCase()
  const rest = match[2]!.replace(/\\/g, '/')
  return rest ? `/${drive}/${rest}` : `/${drive}`
}

function adaptArgsForXorriso(binary: string, args: string[]): string[] {
  if (!usesPosixPaths(binary)) return args
  return args.map((arg) => {
    // Only rewrite Windows absolute / drive-letter paths
    if (/^[a-zA-Z]:[\\/]/.test(arg) || arg.startsWith('\\\\?\\')) {
      return toXorrisoPath(arg)
    }
    return arg
  })
}

function runXorriso(
  args: string[],
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const binary = resolveXorrisoPath()
  if (!binary) {
    return Promise.reject(new Error('xorriso binary not found'))
  }

  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }

  const env = { ...process.env }
  if (process.platform === 'win32' && path.isAbsolute(binary)) {
    const binDir = path.dirname(binary)
    env.PATH = `${binDir};${env.PATH ?? ''}`
    // Prevent MSYS/Cygwin from mangling Windows paths we already converted
    env.MSYS2_ARG_CONV_EXCL = '*'
    env.MSYS_NO_PATHCONV = '1'
  }

  const adaptedArgs = adaptArgsForXorriso(binary, args)

  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(binary, adaptedArgs, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })

    const abort = () => {
      if (settled) return
      child.kill()
    }

    signal?.addEventListener('abort', abort, { once: true })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      onProgress?.({
        phase: 'running',
        percent: null,
        message: text.trim(),
      })
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      // xorriso writes progress-like lines to stderr
      onProgress?.({
        phase: 'running',
        percent: parsePercent(text),
        message: text.trim(),
      })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) {
        reject(createAbortError())
        return
      }
      reject(
        new Error(
          `Failed to start xorriso (${binary}): ${err.message}. Install xorriso or place a binary under vendor/xorriso/${process.platform}/`,
        ),
      )
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) {
        reject(createAbortError())
        return
      }
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

function createAbortError(): Error {
  return new Error('JOB_CANCELED')
}

function parsePercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!match) return null
  return Math.min(100, Math.max(0, Number(match[1])))
}

export async function getEngineInfo(): Promise<EngineInfo> {
  const binaryPath = resolveXorrisoPath()
  const hint =
    process.platform === 'win32'
      ? 'MSYS2: pacman -S xorriso  (또는 vendor/xorriso/win32/xorriso.exe 에 복사)'
      : process.platform === 'darwin'
        ? 'Install with: brew install xorriso — or copy binary to vendor/xorriso/darwin/'
        : 'Install with: sudo apt install xorriso — or copy binary to vendor/xorriso/linux/'

  if (!binaryPath) {
    return {
      available: false,
      binaryPath: null,
      version: null,
      platform: process.platform,
      hint,
    }
  }

  // Bare PATH name without an absolute vendor/MSYS match — probe carefully
  const looksAbsolute = path.isAbsolute(binaryPath)
  if (!looksAbsolute) {
    // still try spawn; failure → not available
  }

  try {
    const result = await runXorriso(['-version'])
    const combined = `${result.stdout}\n${result.stderr}`
    const versionMatch =
      combined.match(/xorriso\s+version\s+([\d.]+)/i) ||
      combined.match(/GNU xorriso\s+([\d.]+)/i)
    const available = result.code === 0 || /xorriso/i.test(combined)
    return {
      available,
      binaryPath,
      version: versionMatch?.[1] ?? (available ? 'unknown' : null),
      platform: process.platform,
      hint: available ? 'xorriso ready' : hint,
    }
  } catch {
    return {
      available: false,
      binaryPath: looksAbsolute ? binaryPath : null,
      version: null,
      platform: process.platform,
      hint,
    }
  }
}

export async function extractIso(
  options: ExtractOptions,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const isoPath = path.resolve(options.isoPath)
  const outputDir = path.resolve(options.outputDir)
  assertFile(isoPath, 'ISO file')
  fs.mkdirSync(outputDir, { recursive: true })

  onProgress?.({ phase: 'extract', percent: 0, message: 'Extracting ISO…' })

  // On Windows, Rock Ridge symlinks (e.g. Ubuntu's /ubuntu -> .) often cannot be
  // restored. Continue extracting other files and only fail on FATAL errors.
  const winExtractFlags =
    process.platform === 'win32'
      ? ([
          '-abort_on',
          'NEVER',
          '-return_with',
          'FATAL',
          '32',
          '-error_behavior',
          'file_extraction',
          'best_effort',
          '-hardlinks',
          'discard_extract',
        ] as string[])
      : []

  const result = await runXorriso(
    [
      ...winExtractFlags,
      '-osirrox',
      'on',
      '-indev',
      isoPath,
      '-extract',
      '/',
      outputDir,
    ],
    onProgress,
    signal,
  )

  if (result.code !== 0) {
    throw new Error(formatXorrisoError('extract', result.stderr || result.stdout))
  }

  const skippedLinks = countSkippedSymlinks(result.stderr || result.stdout)
  onProgress?.({
    phase: 'extract',
    percent: 100,
    message:
      skippedLinks > 0
        ? `Extraction complete (${skippedLinks} symlink(s) skipped on Windows)`
        : 'Extraction complete',
  })
}

function countSkippedSymlinks(log: string): number {
  const matches = log.match(/Cannot restore symbolic link/gi)
  return matches?.length ?? 0
}

export async function createIso(
  options: CreateIsoOptions,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const sourceDir = path.resolve(options.sourceDir)
  const outputIso = path.resolve(options.outputIso)
  assertDir(sourceDir, 'Source directory')
  fs.mkdirSync(path.dirname(outputIso), { recursive: true })

  const volumeLabel = sanitizeVolumeLabel(options.volumeLabel ?? 'ISOMAKER')

  onProgress?.({ phase: 'create', percent: 0, message: 'Creating ISO…' })

  const result = await runXorriso(
    [
      '-as',
      'mkisofs',
      '-r',
      '-J',
      '-joliet-long',
      '-V',
      volumeLabel,
      '-o',
      outputIso,
      sourceDir,
    ],
    onProgress,
    signal,
  )

  if (result.code !== 0) {
    throw new Error(formatXorrisoError('create', result.stderr || result.stdout))
  }

  onProgress?.({ phase: 'create', percent: 100, message: 'ISO created' })
}

/**
 * Create a bootable ISO (BIOS and/or UEFI) using xorriso mkisofs compatibility mode.
 * Source tree must already contain the boot loader images referenced by the options.
 */
export async function createBootableIso(
  options: CreateBootableIsoOptions,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const sourceDir = path.resolve(options.sourceDir)
  const outputIso = path.resolve(options.outputIso)
  assertDir(sourceDir, 'Source directory')
  fs.mkdirSync(path.dirname(outputIso), { recursive: true })

  if (!options.biosBootImage && !options.efiBootImage) {
    throw new Error('At least one of biosBootImage or efiBootImage is required for a bootable ISO')
  }

  const volumeLabel = sanitizeVolumeLabel(options.volumeLabel ?? 'BOOTISO')
  const args = ['-as', 'mkisofs', '-r', '-J', '-joliet-long', '-V', volumeLabel]

  if (options.isohybridMbr) {
    const mbr = path.join(sourceDir, options.isohybridMbr)
    assertFile(mbr, 'isohybrid MBR')
    args.push('-isohybrid-mbr', mbr)
  }

  if (options.biosBootImage) {
    const bios = path.join(sourceDir, options.biosBootImage)
    assertFile(bios, 'BIOS boot image')
    args.push(
      '-b',
      options.biosBootImage,
      '-c',
      'boot.catalog',
      '-no-emul-boot',
      '-boot-load-size',
      '4',
      '-boot-info-table',
    )
  }

  if (options.efiBootImage) {
    const efi = path.join(sourceDir, options.efiBootImage)
    assertFile(efi, 'EFI boot image')
    args.push('-eltorito-alt-boot', '-e', options.efiBootImage, '-no-emul-boot')
    if (!options.isohybridMbr) {
      args.push('-isohybrid-gpt-basdat')
    }
  }

  args.push('-o', outputIso, sourceDir)

  onProgress?.({ phase: 'bootable', percent: 0, message: 'Creating bootable ISO…' })

  const result = await runXorriso(args, onProgress, signal)

  if (result.code !== 0) {
    throw new Error(formatXorrisoError('bootable create', result.stderr || result.stdout))
  }

  onProgress?.({ phase: 'bootable', percent: 100, message: 'Bootable ISO created' })
}

/**
 * Rebuild workflow: extract → (caller edits folder) → create / createBootable.
 * This helper only validates and re-packs from an edited directory.
 */
export async function rebuildFromDirectory(
  options: CreateBootableIsoOptions | CreateIsoOptions,
  bootable: boolean,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (bootable) {
    await createBootableIso(options as CreateBootableIsoOptions, onProgress, signal)
  } else {
    await createIso(options, onProgress, signal)
  }
}

function assertFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`)
  }
}

function assertDir(dirPath: string, label: string): void {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} not found: ${dirPath}`)
  }
}

function sanitizeVolumeLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 32) || 'ISOMAKER'
}

function formatXorrisoError(action: string, detail: string): string {
  const trimmed = detail.trim().slice(-2000)
  return `xorriso ${action} failed:\n${trimmed || 'Unknown error'}`
}
