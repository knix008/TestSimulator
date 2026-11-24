/// <reference types="vite/client" />

declare module '*.wasm?url' {
  const src: string;
  export default src;
}

declare module 'gifenc' {
  /** `rgba4444` is the only one that keeps an alpha channel through quantizing. */
  export type GifPixelFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        /** Enables the one-bit transparency flag for this frame. */
        transparent?: boolean;
        /** Palette entry that disappears when `transparent` is set. */
        transparentIndex?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(
    data: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    options?: {
      format?: GifPixelFormat;
      /** Snap alpha to 0 or 255 — GIF has no partial transparency. */
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    },
  ): number[][];
  export function applyPalette(
    data: Uint8ClampedArray | Uint8Array,
    palette: number[][],
    format?: GifPixelFormat,
  ): Uint8Array;
}

declare const __BUILD_TIME__: string;
declare const __REACT_VERSION__: string;
declare const __VITE_VERSION__: string;
declare const __APP_PACKAGE_VERSION__: string;
