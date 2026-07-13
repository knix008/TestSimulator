import type { MediaInfoFactoryOptions } from './mediaInfoFactory.js';
import type { MediaInfoModule } from './MediaInfoModule.js';
import type { MediaInfoResult } from './MediaInfoResult.js';
/** Format of the result type */
type FormatType = 'object' | 'JSON' | 'XML' | 'HTML' | 'text';
type MediaInfoOptions<TFormat extends FormatType> = Required<Omit<MediaInfoFactoryOptions<TFormat>, 'locateFile'>>;
type SizeArg = (() => Promise<number> | number) | number;
type ReadChunkFunc = (size: number, offset: number) => Promise<Uint8Array> | Uint8Array;
interface ResultMap {
    object: MediaInfoResult;
    JSON: string;
    XML: string;
    HTML: string;
    text: string;
}
declare const FORMAT_CHOICES: readonly ["JSON", "XML", "HTML", "text"];
declare const DEFAULT_OPTIONS: {
    readonly coverData: false;
    readonly chunkSize: number;
    readonly format: "object";
    readonly full: false;
};
type ResultCallback<TFormat extends FormatType> = (result: ResultMap[TFormat] | null, err?: unknown) => void;
/**
 * Wrapper for the MediaInfoLib WASM module.
 *
 * This class should not be instantiated directly. Use the {@link mediaInfoFactory} function
 * to create instances of `MediaInfo`.
 *
 * @typeParam TFormat - The format type, defaults to `object`.
 */
declare class MediaInfo<TFormat extends FormatType = typeof DEFAULT_OPTIONS.format> {
    private readonly mediainfoModule;
    private ptr;
    private isAnalyzing;
    /** @group General Use */
    readonly options: MediaInfoOptions<TFormat>;
    /**
     * The constructor should not be called directly, instead use {@link mediaInfoFactory}.
     *
     * @hidden
     * @param mediainfoModule WASM module
     * @param options User options
     */
    constructor(mediainfoModule: MediaInfoModule, options: MediaInfoOptions<TFormat>);
    /**
     * Convenience method for analyzing a buffer chunk by chunk.
     *
     * @param size Return total buffer size in bytes.
     * @param readChunk Read chunk of data and return an {@link Uint8Array}.
     * @group General Use
     */
    analyzeData(size: SizeArg, readChunk: ReadChunkFunc): Promise<ResultMap[TFormat]>;
    /**
     * Convenience method for analyzing a buffer chunk by chunk.
     *
     * @param size Return total buffer size in bytes.
     * @param readChunk Read chunk of data and return an {@link Uint8Array}.
     * @param callback Function that is called once the processing is done
     * @group General Use
     */
    analyzeData(size: SizeArg, readChunk: ReadChunkFunc, callback: ResultCallback<TFormat>): void;
    /**
     * Close the MediaInfoLib WASM instance.
     *
     * @group General Use
     */
    close(): void;
    /**
     * Reset the MediaInfoLib WASM instance to its initial state.
     *
     * This method ensures that the instance is ready for a new parse.
     * @group General Use
     */
    reset(): void;
    /**
     * Receive result data from the WASM instance.
     *
     * (This is a low-level MediaInfoLib function.)
     *
     * @returns Result data (format can be configured in options)
     * @group Low-level
     */
    inform(): string;
    /**
     * Send more data to the WASM instance.
     *
     * (This is a low-level MediaInfoLib function.)
     *
     * @param data Data buffer
     * @param size Buffer size
     * @returns Processing state: `0` (no bits set) = not finished, Bit `0` set = enough data read for providing information
     * @group Low-level
     */
    openBufferContinue(data: Uint8Array, size: number): boolean;
    /**
     * Retrieve seek position from WASM instance.
     * The MediaInfoLib function `Open_Buffer_GoTo` returns an integer with 64 bit precision.
     * It would be cut at 32 bit due to the JavaScript bindings. Here we transport the low and high
     * parts separately and put them together.
     *
     * (This is a low-level MediaInfoLib function.)
     *
     * @returns Seek position (where MediaInfoLib wants go in the data buffer)
     * @group Low-level
     */
    openBufferContinueGotoGet(): number;
    /**
     * Inform MediaInfoLib that no more data is being read.
     *
     * (This is a low-level MediaInfoLib function.)
     *
     * @group Low-level
     */
    openBufferFinalize(): void;
    /**
     * Prepare MediaInfoLib to process a data buffer.
     *
     * (This is a low-level MediaInfoLib function.)
     *
     * @param size Expected buffer size
     * @param offset Buffer offset
     * @group Low-level
     */
    openBufferInit(size: number, offset: number): void;
    /**
     * Parse result JSON. Convert integer/float fields.
     *
     * @param result Serialized JSON from MediaInfo
     * @returns Parsed JSON object
     */
    private parseResultJson;
    /**
     * Instantiate a new WASM module instance.
     *
     * @returns MediaInfo module instance
     */
    private instantiateModuleInstance;
}
export type { FormatType, ReadChunkFunc, ResultMap, SizeArg };
export { DEFAULT_OPTIONS, FORMAT_CHOICES };
export default MediaInfo;
