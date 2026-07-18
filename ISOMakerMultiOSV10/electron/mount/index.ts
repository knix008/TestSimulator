import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { MountResult } from '../iso/types'

const execFileAsync = promisify(execFile)

export async function mountIso(isoPath: string): Promise<MountResult> {
  if (!fs.existsSync(isoPath)) {
    return { mounted: false, message: `ISO not found: ${isoPath}` }
  }

  switch (process.platform) {
    case 'win32':
      return mountWindows(isoPath)
    case 'darwin':
      return mountMac(isoPath)
    case 'linux':
      return mountLinux(isoPath)
    default:
      return { mounted: false, message: `Mount not supported on ${process.platform}` }
  }
}

export async function unmountIso(mountPointOrIso: string): Promise<MountResult> {
  switch (process.platform) {
    case 'win32':
      return unmountWindows(mountPointOrIso)
    case 'darwin':
      return unmountMac(mountPointOrIso)
    case 'linux':
      return unmountLinux(mountPointOrIso)
    default:
      return { mounted: false, message: `Unmount not supported on ${process.platform}` }
  }
}

async function mountWindows(isoPath: string): Promise<MountResult> {
  const script = `
$ErrorActionPreference = 'Stop'
$img = Mount-DiskImage -ImagePath '${escapePs(isoPath)}' -PassThru
$vol = $img | Get-Volume
if (-not $vol.DriveLetter) { throw 'No drive letter assigned' }
Write-Output ($vol.DriveLetter + ':\\')
`
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { windowsHide: true },
    )
    const mountPoint = stdout.trim()
    return { mounted: true, mountPoint, message: `Mounted at ${mountPoint}` }
  } catch (err) {
    return { mounted: false, message: errorMessage(err) }
  }
}

async function unmountWindows(isoPath: string): Promise<MountResult> {
  const script = `
$ErrorActionPreference = 'Stop'
Dismount-DiskImage -ImagePath '${escapePs(isoPath)}'
`
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
    })
    return { mounted: false, message: 'Unmounted' }
  } catch (err) {
    return { mounted: true, message: errorMessage(err) }
  }
}

async function mountMac(isoPath: string): Promise<MountResult> {
  try {
    const { stdout } = await execFileAsync('hdiutil', ['attach', '-readonly', isoPath])
    const lines = stdout.trim().split('\n')
    const last = lines[lines.length - 1] ?? ''
    const parts = last.split(/\s{2,}|\t+/).filter(Boolean)
    const mountPoint = parts.find((p) => p.startsWith('/Volumes/')) ?? parts[parts.length - 1]
    return {
      mounted: true,
      mountPoint,
      message: mountPoint ? `Mounted at ${mountPoint}` : 'Mounted',
    }
  } catch (err) {
    return { mounted: false, message: errorMessage(err) }
  }
}

async function unmountMac(mountPoint: string): Promise<MountResult> {
  try {
    await execFileAsync('hdiutil', ['detach', mountPoint])
    return { mounted: false, message: 'Unmounted' }
  } catch (err) {
    return { mounted: true, message: errorMessage(err) }
  }
}

async function mountLinux(isoPath: string): Promise<MountResult> {
  const mountPoint = path.join(os.tmpdir(), `isomaker-mnt-${Date.now()}`)
  fs.mkdirSync(mountPoint, { recursive: true })
  try {
    await execFileAsync('mount', ['-o', 'loop,ro', isoPath, mountPoint])
    return { mounted: true, mountPoint, message: `Mounted at ${mountPoint}` }
  } catch (err) {
    // Fallback: fuseiso if available
    try {
      await execFileAsync('fuseiso', [isoPath, mountPoint])
      return { mounted: true, mountPoint, message: `Mounted via fuseiso at ${mountPoint}` }
    } catch {
      try {
        fs.rmdirSync(mountPoint)
      } catch {
        /* ignore */
      }
      return {
        mounted: false,
        message: `${errorMessage(err)} (tip: run with privileges or install fuseiso)`,
      }
    }
  }
}

async function unmountLinux(mountPoint: string): Promise<MountResult> {
  try {
    await execFileAsync('umount', [mountPoint])
    try {
      fs.rmdirSync(mountPoint)
    } catch {
      /* ignore */
    }
    return { mounted: false, message: 'Unmounted' }
  } catch (err) {
    try {
      await execFileAsync('fusermount', ['-u', mountPoint])
      return { mounted: false, message: 'Unmounted (fuse)' }
    } catch {
      return { mounted: true, message: errorMessage(err) }
    }
  }
}

function escapePs(value: string): string {
  return value.replace(/'/g, "''")
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const stderr = String((err as { stderr?: Buffer | string }).stderr ?? '')
    if (stderr.trim()) return stderr.trim()
  }
  return err instanceof Error ? err.message : String(err)
}
