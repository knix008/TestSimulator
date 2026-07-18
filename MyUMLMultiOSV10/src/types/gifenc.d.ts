declare module 'gifenc' {
  export type GifPalette = number[][];

  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options: { palette: GifPalette; transparent?: boolean; transparentIndex?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoder;
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string; oneBitAlpha?: boolean | number }): GifPalette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: string): Uint8Array;
}