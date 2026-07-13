import MediaInfo, { DEFAULT_OPTIONS } from './MediaInfo.js';
import mediaInfoModuleFactory from './MediaInfoModule.js';
const noopPrint = () => {
  // No-op
};
function defaultLocateFile(path, prefix) {
  try {
    const url = new URL(prefix);
    if (url.pathname === '/') {
      return `${prefix}mediainfo.js/dist/${path}`;
    }
  } catch {
    // empty
  }
  return `${prefix}../${path}`;
}

/**
 * Creates a {@link MediaInfo} instance with the specified options.
 *
 * @typeParam TFormat - The format type, defaults to `object`.
 * @param options - Configuration options for creating the {@link MediaInfo} instance.
 * @returns A promise that resolves to a {@link MediaInfo} instance when no callback is provided.
 */

/**
 * Creates a {@link MediaInfo} instance with the specified options and executes the callback.
 *
 * @typeParam TFormat - The format type, defaults to `object`.
 * @param options - Configuration options for creating the {@link MediaInfo} instance.
 * @param callback - Function to call with the {@link MediaInfo} instance.
 * @param errCallback - Optional function to call on error.
 */

function mediaInfoFactory(options = {}, callback, errCallback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      mediaInfoFactory(options, resolve, reject);
    });
  }
  const {
    locateFile,
    ...mergedOptions
  } = {
    ...DEFAULT_OPTIONS,
    ...options,
    format: options.format ?? DEFAULT_OPTIONS.format
  };

  // Options passed to the Emscripten module loader
  const mediaInfoModuleFactoryOpts = {
    // Silence all print in module
    print: noopPrint,
    printErr: noopPrint,
    locateFile: locateFile ?? defaultLocateFile,
    onAbort: err => {
      if (errCallback) {
        errCallback(err);
      }
    }
  };

  // Fetch and load WASM module
  mediaInfoModuleFactory(mediaInfoModuleFactoryOpts).then(wasmModule => {
    callback(new MediaInfo(wasmModule, mergedOptions));
  }).catch(error => {
    if (errCallback) {
      errCallback(error);
    }
  });
}
export default mediaInfoFactory;
//# sourceMappingURL=mediaInfoFactory.cjs.map
