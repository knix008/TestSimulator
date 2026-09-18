declare module 'libheif-js/wasm-bundle.js' {
  export interface HeifImage {
    get_width(): number
    get_height(): number
    is_primary(): boolean
    has_alpha_channel(): boolean
    /** Fills `image` with RGBA pixels, then hands it back — or null on failure. */
    display(image: ImageData, callback: (result: ImageData | null) => void): void
    free(): void
  }

  export interface HeifDecoder {
    decode(buffer: Uint8Array | ArrayBuffer): HeifImage[]
  }

  export interface LibHeif {
    HeifDecoder: new () => HeifDecoder
  }

  const libheif: LibHeif
  export default libheif
}
