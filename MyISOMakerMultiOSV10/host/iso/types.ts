export type JobProgress = {
  phase: string
  percent: number | null
  message: string
}

export type ExtractOptions = {
  isoPath: string
  outputDir: string
}

export type CreateIsoOptions = {
  sourceDir: string
  outputIso: string
  volumeLabel?: string
}

export type CreateBootableIsoOptions = CreateIsoOptions & {
  /** Relative path inside sourceDir to BIOS El Torito boot image (e.g. boot/grub/i386-pc/eltorito.img) */
  biosBootImage?: string
  /** Relative path inside sourceDir to EFI boot image (e.g. EFI/BOOT/efiboot.img) */
  efiBootImage?: string
  /** isohybrid MBR path relative to sourceDir (optional) */
  isohybridMbr?: string
}

export type MountResult = {
  mounted: boolean
  mountPoint?: string
  message: string
}

export type EngineInfo = {
  available: boolean
  binaryPath: string | null
  version: string | null
  platform: NodeJS.Platform
  hint: string
}
