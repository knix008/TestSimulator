/**
 * Shapes of what the engine (src-tauri/isohost, Rust) sends back to the page.
 * Keep in step with the JSON built there.
 */

/** `job:progress` events (isohost/src/util.rs progress_value). */
export type JobProgress = {
  phase: string
  percent: number | null
  message: string
}

/** `engine:info` (isohost/src/xorriso.rs engine_info). */
export type EngineInfo = {
  available: boolean
  binaryPath: string | null
  version: string | null
  platform: 'win32' | 'darwin' | 'linux'
  hint: string
}

/** `iso:mount` / `iso:unmount` (isohost/src/mount.rs). */
export type MountResult = {
  mounted: boolean
  mountPoint?: string
  message: string
}

/** `fs:list` / `fs:stat` rows (isohost/src/fsx.rs). */
export type FsEntry = {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
  /** a disc image the app opens (.iso .img .appimage .tar .tgz …) */
  image: boolean
}

/** `fs:places` (isohost/src/fsx.rs). */
export type FsPlace = {
  id: string
  name: string
  path: string
  kind: 'drive' | 'home' | 'desktop' | 'documents' | 'downloads' | 'root'
}

/** `iso:extract` (isohost/src/xorriso.rs extract). */
export type ExtractOptions = {
  isoPath: string
  outputDir: string
}

/** `iso:create` (isohost/src/xorriso.rs create). */
export type CreateIsoOptions = {
  sourceDir: string
  outputIso: string
  volumeLabel?: string
}

/** `iso:createBootable`: paths inside sourceDir. */
export type CreateBootableIsoOptions = CreateIsoOptions & {
  /** BIOS El Torito boot image (e.g. boot/grub/i386-pc/eltorito.img) */
  biosBootImage?: string
  /** EFI boot image (e.g. EFI/BOOT/efiboot.img) */
  efiBootImage?: string
  /** isohybrid MBR (optional) */
  isohybridMbr?: string
}
