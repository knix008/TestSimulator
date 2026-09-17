declare module 'utif' {
  export interface TiffImageFileDirectory {
    width?: number
    height?: number
    data?: Uint8Array
    [key: string]: unknown
  }

  export function decode(buffer: ArrayBuffer): TiffImageFileDirectory[]
  export function decodeImage(buffer: ArrayBuffer, ifd: TiffImageFileDirectory): void
  export function toRGBA8(ifd: TiffImageFileDirectory): Uint8Array
  export function encodeImage(rgba: Uint8Array, width: number, height: number): ArrayBuffer
}
