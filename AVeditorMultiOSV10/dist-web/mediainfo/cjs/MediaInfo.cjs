"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.FORMAT_CHOICES = exports.DEFAULT_OPTIONS = void 0;
var _error = require("./error.cjs");
var _MediaInfoResult = require("./MediaInfoResult.cjs");
/** Format of the result type */

const FORMAT_CHOICES = exports.FORMAT_CHOICES = ['JSON', 'XML', 'HTML', 'text'];
const DEFAULT_OPTIONS = exports.DEFAULT_OPTIONS = {
  coverData: false,
  chunkSize: 256 * 1024,
  format: 'object',
  full: false
};
/**
 * Wrapper for the MediaInfoLib WASM module.
 *
 * This class should not be instantiated directly. Use the {@link mediaInfoFactory} function
 * to create instances of `MediaInfo`.
 *
 * @typeParam TFormat - The format type, defaults to `object`.
 */
class MediaInfo {
  isAnalyzing = false;

  /** @group General Use */

  /**
   * The constructor should not be called directly, instead use {@link mediaInfoFactory}.
   *
   * @hidden
   * @param mediainfoModule WASM module
   * @param options User options
   */
  constructor(mediainfoModule, options) {
    this.mediainfoModule = mediainfoModule;
    this.options = options;
    this.ptr = this.instantiateModuleInstance();
  }

  /**
   * Convenience method for analyzing a buffer chunk by chunk.
   *
   * @param size Return total buffer size in bytes.
   * @param readChunk Read chunk of data and return an {@link Uint8Array}.
   * @group General Use
   */

  /**
   * Convenience method for analyzing a buffer chunk by chunk.
   *
   * @param size Return total buffer size in bytes.
   * @param readChunk Read chunk of data and return an {@link Uint8Array}.
   * @param callback Function that is called once the processing is done
   * @group General Use
   */

  analyzeData(size, readChunk, callback) {
    // Support promise signature
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        const resultCb = (result, error) => {
          this.isAnalyzing = false;
          if (error || !result) {
            reject((0, _error.unknownToError)(error));
          } else {
            resolve(result);
          }
        };
        this.analyzeData(size, readChunk, resultCb);
      });
    }
    if (this.isAnalyzing) {
      callback(null, new Error('cannot start a new analysis while another is in progress'));
      return;
    }
    this.reset();
    this.isAnalyzing = true;
    const finalize = () => {
      try {
        this.openBufferFinalize();
        const result = this.inform();
        if (this.options.format === 'object') {
          callback(this.parseResultJson(result));
        } else {
          callback(result);
        }
      } finally {
        this.isAnalyzing = false;
      }
    };
    let offset = 0;
    const runReadDataLoop = fileSize => {
      const readNextChunk = data => {
        if (continueBuffer(data)) {
          getChunk();
        } else {
          finalize();
        }
      };
      const getChunk = () => {
        let dataValue;
        try {
          const safeSize = Math.min(this.options.chunkSize, fileSize - offset);
          dataValue = readChunk(safeSize, offset);
        } catch (error) {
          this.isAnalyzing = false;
          callback(null, (0, _error.unknownToError)(error));
          return;
        }
        if (dataValue instanceof Promise) {
          dataValue.then(readNextChunk).catch(error => {
            this.isAnalyzing = false;
            callback(null, (0, _error.unknownToError)(error));
          });
        } else {
          readNextChunk(dataValue);
        }
      };
      const continueBuffer = data => {
        if (data.length === 0 || this.openBufferContinue(data, data.length)) {
          return false;
        }
        const seekTo = this.openBufferContinueGotoGet();
        if (seekTo === -1) {
          offset += data.length;
        } else {
          offset = seekTo;
          this.openBufferInit(fileSize, seekTo);
        }
        return true;
      };
      this.openBufferInit(fileSize, offset);
      getChunk();
    };
    const fileSizeValue = typeof size === 'function' ? size() : size;
    if (fileSizeValue instanceof Promise) {
      fileSizeValue.then(runReadDataLoop).catch(error => {
        callback(null, (0, _error.unknownToError)(error));
      });
    } else {
      runReadDataLoop(fileSizeValue);
    }
  }

  /**
   * Close the MediaInfoLib WASM instance.
   *
   * @group General Use
   */
  close() {
    if (this.ptr) {
      this.mediainfoModule._mi_close(this.ptr);
    }
  }

  /**
   * Reset the MediaInfoLib WASM instance to its initial state.
   *
   * This method ensures that the instance is ready for a new parse.
   * @group General Use
   */
  reset() {
    if (this.ptr) {
      this.mediainfoModule._mi_delete(this.ptr);
    }
    this.ptr = this.instantiateModuleInstance();
  }

  /**
   * Receive result data from the WASM instance.
   *
   * (This is a low-level MediaInfoLib function.)
   *
   * @returns Result data (format can be configured in options)
   * @group Low-level
   */
  inform() {
    const resPtr = this.mediainfoModule._mi_inform(this.ptr);
    return this.mediainfoModule.UTF8ToString(resPtr);
  }

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
  openBufferContinue(data, size) {
    // Copy data to Wasm heap
    const dataPtr = this.mediainfoModule._malloc(size);
    this.mediainfoModule.HEAPU8.set(data, dataPtr);
    const result = this.mediainfoModule._mi_open_buffer_continue(this.ptr, dataPtr, size);
    this.mediainfoModule._free(dataPtr);
    // Bit 3 set (0x08) means processing is complete
    return !!(result & 0x08);
  }

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
  openBufferContinueGotoGet() {
    // BigInt return value converted to standard JS number
    const seekTo = this.mediainfoModule._mi_open_buffer_continue_goto_get(this.ptr);
    return Number(seekTo);
  }

  /**
   * Inform MediaInfoLib that no more data is being read.
   *
   * (This is a low-level MediaInfoLib function.)
   *
   * @group Low-level
   */
  openBufferFinalize() {
    this.mediainfoModule._mi_open_buffer_finalize(this.ptr);
  }

  /**
   * Prepare MediaInfoLib to process a data buffer.
   *
   * (This is a low-level MediaInfoLib function.)
   *
   * @param size Expected buffer size
   * @param offset Buffer offset
   * @group Low-level
   */
  openBufferInit(size, offset) {
    // Use BigInt for 64-bit compatibility
    this.mediainfoModule._mi_open_buffer_init(this.ptr, BigInt(size), BigInt(offset));
  }

  /**
   * Parse result JSON. Convert integer/float fields.
   *
   * @param result Serialized JSON from MediaInfo
   * @returns Parsed JSON object
   */
  parseResultJson(resultString) {
    const intFields = _MediaInfoResult.INT_FIELDS;
    const floatFields = _MediaInfoResult.FLOAT_FIELDS;

    // Parse JSON
    const result = JSON.parse(resultString);
    if (result.media) {
      const newMedia = {
        ...result.media,
        track: []
      };
      if (Array.isArray(result.media.track)) {
        for (const track of result.media.track) {
          let newTrack = {
            '@type': track['@type']
          };
          for (const [key, val] of Object.entries(track)) {
            if (key === '@type') {
              continue;
            }
            if (typeof val === 'string' && intFields.includes(key)) {
              newTrack = {
                ...newTrack,
                [key]: Number.parseInt(val, 10)
              };
            } else if (typeof val === 'string' && floatFields.includes(key)) {
              newTrack = {
                ...newTrack,
                [key]: Number.parseFloat(val)
              };
            } else {
              newTrack = {
                ...newTrack,
                [key]: val
              };
            }
          }
          newMedia.track.push(newTrack);
        }
      }
      return {
        ...result,
        media: newMedia
      };
    }
    return result;
  }

  /**
   * Instantiate a new WASM module instance.
   *
   * @returns MediaInfo module instance
   */
  instantiateModuleInstance() {
    const format = this.options.format === 'object' ? 'JSON' : this.options.format;
    const bytesNeeded = this.mediainfoModule.lengthBytesUTF8(format) + 1;
    const formatPtr = this.mediainfoModule._malloc(bytesNeeded);
    try {
      this.mediainfoModule.stringToUTF8(format, formatPtr, bytesNeeded);
      return this.mediainfoModule._mi_new(formatPtr, this.options.coverData ? 1 : 0, this.options.full ? 1 : 0);
    } finally {
      this.mediainfoModule._free(formatPtr);
    }
  }
}
var _default = exports.default = MediaInfo;
//# sourceMappingURL=MediaInfo.cjs.map
