import MediaInfo, { DEFAULT_OPTIONS, type FormatType } from './MediaInfo.js';
interface MediaInfoFactoryOptions<TFormat extends FormatType> {
    /** Output cover data as base64 */
    coverData?: boolean;
    /** Chunk size used by `analyzeData` (in bytes) */
    chunkSize?: number;
    /** Result format (`object`, `JSON`, `XML`, `HTML` or `text`) */
    format?: TFormat;
    /** Full information display (all internal tags) */
    full?: boolean;
    /**
     * This method will be called before loading the WASM file. It should return the actual URL to
     * `MediaInfoModule.wasm`.
     *
     * @see https://emscripten.org/docs/api_reference/module.html#Module.locateFile
     */
    locateFile?: (path: string, prefix: string) => string;
}
type FactoryCallback<TFormat extends FormatType> = (mediainfo: MediaInfo<TFormat>) => void;
type ErrorCallback = (error: unknown) => void;
/**
 * Creates a {@link MediaInfo} instance with the specified options.
 *
 * @typeParam TFormat - The format type, defaults to `object`.
 * @param options - Configuration options for creating the {@link MediaInfo} instance.
 * @returns A promise that resolves to a {@link MediaInfo} instance when no callback is provided.
 */
declare function mediaInfoFactory<TFormat extends FormatType = typeof DEFAULT_OPTIONS.format>(options?: MediaInfoFactoryOptions<TFormat>): Promise<MediaInfo<TFormat>>;
/**
 * Creates a {@link MediaInfo} instance with the specified options and executes the callback.
 *
 * @typeParam TFormat - The format type, defaults to `object`.
 * @param options - Configuration options for creating the {@link MediaInfo} instance.
 * @param callback - Function to call with the {@link MediaInfo} instance.
 * @param errCallback - Optional function to call on error.
 */
declare function mediaInfoFactory<TFormat extends FormatType = typeof DEFAULT_OPTIONS.format>(options: MediaInfoFactoryOptions<TFormat>, callback: FactoryCallback<TFormat>, errCallback?: ErrorCallback): void;
export type { MediaInfoFactoryOptions };
export default mediaInfoFactory;
