async function Module(moduleArg = {}) {
  var moduleRtn
  var Module = moduleArg
  var ENVIRONMENT_IS_NODE = true
  if (ENVIRONMENT_IS_NODE) {
    const { createRequire } = await import('module')
    var require = createRequire(import.meta.url)
  }
  var arguments_ = []
  var thisProgram = './this.program'
  var quit_ = (status, toThrow) => {
    throw toThrow
  }
  var _scriptName = import.meta.url
  var scriptDirectory = ''
  function locateFile(path) {
    if (Module['locateFile']) {
      return Module['locateFile'](path, scriptDirectory)
    }
    return scriptDirectory + path
  }
  var readAsync, readBinary
  if (ENVIRONMENT_IS_NODE) {
    var fs = require('fs')
    if (_scriptName.startsWith('file:')) {
      scriptDirectory = require('path').dirname(require('url').fileURLToPath(_scriptName)) + '/'
    }
    readBinary = (filename) => {
      filename = isFileURI(filename) ? new URL(filename) : filename
      var ret = fs.readFileSync(filename)
      return ret
    }
    readAsync = async (filename, binary = true) => {
      filename = isFileURI(filename) ? new URL(filename) : filename
      var ret = fs.readFileSync(filename, binary ? undefined : 'utf8')
      return ret
    }
    if (process.argv.length > 1) {
      thisProgram = process.argv[1].replace(/\\/g, '/')
    }
    arguments_ = process.argv.slice(2)
    quit_ = (status, toThrow) => {
      process.exitCode = status
      throw toThrow
    }
  } else {
  }
  var out = console.log.bind(console)
  var err = console.error.bind(console)
  var wasmBinary
  var ABORT = false
  var EXITSTATUS
  var isFileURI = (filename) => filename.startsWith('file://')
  var readyPromiseResolve, readyPromiseReject
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64
  var HEAP64, HEAPU64
  var runtimeInitialized = false
  function updateMemoryViews() {
    var b = wasmMemory.buffer
    HEAP8 = new Int8Array(b)
    HEAP16 = new Int16Array(b)
    Module['HEAPU8'] = HEAPU8 = new Uint8Array(b)
    HEAPU16 = new Uint16Array(b)
    HEAP32 = new Int32Array(b)
    HEAPU32 = new Uint32Array(b)
    HEAPF32 = new Float32Array(b)
    HEAPF64 = new Float64Array(b)
    HEAP64 = new BigInt64Array(b)
    HEAPU64 = new BigUint64Array(b)
  }
  function preRun() {}
  function initRuntime() {
    runtimeInitialized = true
    wasmExports['n']()
  }
  function postRun() {}
  function abort(what) {
    Module['onAbort']?.(what)
    what = 'Aborted(' + what + ')'
    err(what)
    ABORT = true
    what += '. Build with -sASSERTIONS for more info.'
    var e = new WebAssembly.RuntimeError(what)
    readyPromiseReject?.(e)
    throw e
  }
  var wasmBinaryFile
  function findWasmBinary() {
    if (Module['locateFile']) {
      return locateFile('MediaInfoModule.wasm')
    }
    return new URL('MediaInfoModule.wasm', import.meta.url).href
  }
  function getBinarySync(file) {
    if (readBinary) {
      return readBinary(file)
    }
    throw 'both async and sync fetching of the wasm failed'
  }
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile)
        return new Uint8Array(response)
      } catch {}
    }
    return getBinarySync(binaryFile)
  }
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile)
      var instance = await WebAssembly.instantiate(binary, imports)
      return instance
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`)
      abort(reason)
    }
  }
  async function instantiateAsync(binary, binaryFile, imports) {
    if (!binary && !ENVIRONMENT_IS_NODE) {
      try {
        var response = fetch(binaryFile, { credentials: 'same-origin' })
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports)
        return instantiationResult
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`)
        err('falling back to ArrayBuffer instantiation')
      }
    }
    return instantiateArrayBuffer(binaryFile, imports)
  }
  function getWasmImports() {
    var imports = { a: wasmImports }
    return imports
  }
  async function createWasm() {
    function receiveInstance(instance, module) {
      wasmExports = instance.exports
      assignWasmExports(wasmExports)
      updateMemoryViews()
      return wasmExports
    }
    function receiveInstantiationResult(result) {
      return receiveInstance(result['instance'])
    }
    var info = getWasmImports()
    wasmBinaryFile ??= findWasmBinary()
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info)
    var exports = receiveInstantiationResult(result)
    return exports
  }
  class ExitStatus {
    name = 'ExitStatus'
    constructor(status) {
      this.message = `Program terminated with exit(${status})`
      this.status = status
    }
  }
  var __abort_js = () => abort('')
  var runtimeKeepaliveCounter = 0
  var __emscripten_runtime_keepalive_clear = () => {
    runtimeKeepaliveCounter = 0
  }
  var INT53_MAX = 9007199254740992
  var INT53_MIN = -9007199254740992
  var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX ? NaN : Number(num))
  function __gmtime_js(time, tmPtr) {
    time = bigintToI53Checked(time)
    var date = new Date(time * 1e3)
    HEAP32[tmPtr >> 2] = date.getUTCSeconds()
    HEAP32[(tmPtr + 4) >> 2] = date.getUTCMinutes()
    HEAP32[(tmPtr + 8) >> 2] = date.getUTCHours()
    HEAP32[(tmPtr + 12) >> 2] = date.getUTCDate()
    HEAP32[(tmPtr + 16) >> 2] = date.getUTCMonth()
    HEAP32[(tmPtr + 20) >> 2] = date.getUTCFullYear() - 1900
    HEAP32[(tmPtr + 24) >> 2] = date.getUTCDay()
    var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0)
    var yday = ((date.getTime() - start) / (1e3 * 60 * 60 * 24)) | 0
    HEAP32[(tmPtr + 28) >> 2] = yday
  }
  var timers = {}
  var handleException = (e) => {
    if (e instanceof ExitStatus || e == 'unwind') {
      return EXITSTATUS
    }
    quit_(1, e)
  }
  var keepRuntimeAlive = () => true
  var _proc_exit = (code) => {
    EXITSTATUS = code
    if (!keepRuntimeAlive()) {
      ABORT = true
    }
    quit_(code, new ExitStatus(code))
  }
  var exitJS = (status, implicit) => {
    EXITSTATUS = status
    _proc_exit(status)
  }
  var _exit = exitJS
  var maybeExit = () => {
    if (!keepRuntimeAlive()) {
      try {
        _exit(EXITSTATUS)
      } catch (e) {
        handleException(e)
      }
    }
  }
  var callUserCallback = (func) => {
    if (ABORT) {
      return
    }
    try {
      func()
      maybeExit()
    } catch (e) {
      handleException(e)
    }
  }
  var _emscripten_get_now = () => performance.now()
  var __setitimer_js = (which, timeout_ms) => {
    if (timers[which]) {
      clearTimeout(timers[which].id)
      delete timers[which]
    }
    if (!timeout_ms) return 0
    var id = setTimeout(() => {
      delete timers[which]
      callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()))
    }, timeout_ms)
    timers[which] = { id, timeout_ms }
    return 0
  }
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0
    var startIdx = outIdx
    var endIdx = outIdx + maxBytesToWrite - 1
    for (var i = 0; i < str.length; ++i) {
      var u = str.codePointAt(i)
      if (u <= 127) {
        if (outIdx >= endIdx) break
        heap[outIdx++] = u
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break
        heap[outIdx++] = 192 | (u >> 6)
        heap[outIdx++] = 128 | (u & 63)
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break
        heap[outIdx++] = 224 | (u >> 12)
        heap[outIdx++] = 128 | ((u >> 6) & 63)
        heap[outIdx++] = 128 | (u & 63)
      } else {
        if (outIdx + 3 >= endIdx) break
        heap[outIdx++] = 240 | (u >> 18)
        heap[outIdx++] = 128 | ((u >> 12) & 63)
        heap[outIdx++] = 128 | ((u >> 6) & 63)
        heap[outIdx++] = 128 | (u & 63)
        i++
      }
    }
    heap[outIdx] = 0
    return outIdx - startIdx
  }
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) =>
    stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
    var currentYear = new Date().getFullYear()
    var winter = new Date(currentYear, 0, 1)
    var summer = new Date(currentYear, 6, 1)
    var winterOffset = winter.getTimezoneOffset()
    var summerOffset = summer.getTimezoneOffset()
    var stdTimezoneOffset = Math.max(winterOffset, summerOffset)
    HEAPU32[timezone >> 2] = stdTimezoneOffset * 60
    HEAP32[daylight >> 2] = Number(winterOffset != summerOffset)
    var extractZone = (timezoneOffset) => {
      var sign = timezoneOffset >= 0 ? '-' : '+'
      var absOffset = Math.abs(timezoneOffset)
      var hours = String(Math.floor(absOffset / 60)).padStart(2, '0')
      var minutes = String(absOffset % 60).padStart(2, '0')
      return `UTC${sign}${hours}${minutes}`
    }
    var winterName = extractZone(winterOffset)
    var summerName = extractZone(summerOffset)
    if (summerOffset < winterOffset) {
      stringToUTF8(winterName, std_name, 17)
      stringToUTF8(summerName, dst_name, 17)
    } else {
      stringToUTF8(winterName, dst_name, 17)
      stringToUTF8(summerName, std_name, 17)
    }
  }
  var _emscripten_date_now = () => Date.now()
  var getHeapMax = () => 2147483648
  var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment
  var growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength
    var pages = ((size - oldHeapSize + 65535) / 65536) | 0
    try {
      wasmMemory.grow(pages)
      updateMemoryViews()
      return 1
    } catch (e) {}
  }
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length
    requestedSize >>>= 0
    var maxHeapSize = getHeapMax()
    if (requestedSize > maxHeapSize) {
      return false
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown)
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296)
      var newSize = Math.min(
        maxHeapSize,
        alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)
      )
      var replacement = growMemory(newSize)
      if (replacement) {
        return true
      }
    }
    return false
  }
  var ENV = {}
  var getExecutableName = () => thisProgram || './this.program'
  var getEnvStrings = () => {
    if (!getEnvStrings.strings) {
      var lang = (globalThis.navigator?.language ?? 'C').replace('-', '_') + '.UTF-8'
      var env = {
        USER: 'web_user',
        LOGNAME: 'web_user',
        PATH: '/',
        PWD: '/',
        HOME: '/home/web_user',
        LANG: lang,
        _: getExecutableName(),
      }
      for (var x in ENV) {
        if (ENV[x] === undefined) delete env[x]
        else env[x] = ENV[x]
      }
      var strings = []
      for (var x in env) {
        strings.push(`${x}=${env[x]}`)
      }
      getEnvStrings.strings = strings
    }
    return getEnvStrings.strings
  }
  var _environ_get = (__environ, environ_buf) => {
    var bufSize = 0
    var envp = 0
    for (var string of getEnvStrings()) {
      var ptr = environ_buf + bufSize
      HEAPU32[(__environ + envp) >> 2] = ptr
      bufSize += stringToUTF8(string, ptr, Infinity) + 1
      envp += 4
    }
    return 0
  }
  var lengthBytesUTF8 = (str) => {
    var len = 0
    for (var i = 0; i < str.length; ++i) {
      var c = str.charCodeAt(i)
      if (c <= 127) {
        len++
      } else if (c <= 2047) {
        len += 2
      } else if (c >= 55296 && c <= 57343) {
        len += 4
        ++i
      } else {
        len += 3
      }
    }
    return len
  }
  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
    var strings = getEnvStrings()
    HEAPU32[penviron_count >> 2] = strings.length
    var bufSize = 0
    for (var string of strings) {
      bufSize += lengthBytesUTF8(string) + 1
    }
    HEAPU32[penviron_buf_size >> 2] = bufSize
    return 0
  }
  var _fd_close = (fd) => 52
  var printCharBuffers = [null, [], []]
  var UTF8Decoder = new TextDecoder()
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead
    if (ignoreNul) return maxIdx
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx
    return idx
  }
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul)
    return UTF8Decoder.decode(
      heapOrArray.buffer
        ? heapOrArray.subarray(idx, endPtr)
        : new Uint8Array(heapOrArray.slice(idx, endPtr))
    )
  }
  var printChar = (stream, curr) => {
    var buffer = printCharBuffers[stream]
    if (curr === 0 || curr === 10) {
      ;(stream === 1 ? out : err)(UTF8ArrayToString(buffer))
      buffer.length = 0
    } else {
      buffer.push(curr)
    }
  }
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
    if (!ptr) return ''
    var end = findStringEnd(HEAPU8, ptr, maxBytesToRead, ignoreNul)
    return UTF8Decoder.decode(HEAPU8.subarray(ptr, end))
  }
  var _fd_write = (fd, iov, iovcnt, pnum) => {
    var num = 0
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2]
      var len = HEAPU32[(iov + 4) >> 2]
      iov += 8
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j])
      }
      num += len
    }
    HEAPU32[pnum >> 2] = num
    return 0
  }
  {
    if (Module['print']) out = Module['print']
    if (Module['printErr']) err = Module['printErr']
  }
  Module['UTF8ToString'] = UTF8ToString
  Module['stringToUTF8'] = stringToUTF8
  Module['lengthBytesUTF8'] = lengthBytesUTF8
  var _mi_new,
    _mi_delete,
    _mi_open_buffer_init,
    _mi_open_buffer_continue,
    _mi_open_buffer_continue_goto_get,
    _mi_open_buffer_finalize,
    _mi_inform,
    _mi_close,
    _malloc,
    _free,
    __emscripten_timeout,
    memory,
    __indirect_function_table,
    wasmMemory
  function assignWasmExports(wasmExports) {
    _mi_new = Module['_mi_new'] = wasmExports['o']
    _mi_delete = Module['_mi_delete'] = wasmExports['p']
    _mi_open_buffer_init = Module['_mi_open_buffer_init'] = wasmExports['q']
    _mi_open_buffer_continue = Module['_mi_open_buffer_continue'] = wasmExports['r']
    _mi_open_buffer_continue_goto_get = Module['_mi_open_buffer_continue_goto_get'] =
      wasmExports['s']
    _mi_open_buffer_finalize = Module['_mi_open_buffer_finalize'] = wasmExports['t']
    _mi_inform = Module['_mi_inform'] = wasmExports['u']
    _mi_close = Module['_mi_close'] = wasmExports['v']
    _malloc = Module['_malloc'] = wasmExports['w']
    _free = Module['_free'] = wasmExports['x']
    __emscripten_timeout = wasmExports['y']
    memory = wasmMemory = wasmExports['m']
    __indirect_function_table = wasmExports['__indirect_function_table']
  }
  var wasmImports = {
    l: __abort_js,
    i: __emscripten_runtime_keepalive_clear,
    d: __gmtime_js,
    j: __setitimer_js,
    e: __tzset_js,
    k: _emscripten_date_now,
    a: _emscripten_resize_heap,
    b: _environ_get,
    c: _environ_sizes_get,
    f: _fd_close,
    g: _fd_write,
    h: _proc_exit,
  }
  function run() {
    preRun()
    function doRun() {
      Module['calledRun'] = true
      if (ABORT) return
      initRuntime()
      readyPromiseResolve?.(Module)
      postRun()
    }
    {
      doRun()
    }
  }
  var wasmExports
  wasmExports = await createWasm()
  run()
  if (runtimeInitialized) {
    moduleRtn = Module
  } else {
    moduleRtn = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve
      readyPromiseReject = reject
    })
  }
  return moduleRtn
}
export default Module
