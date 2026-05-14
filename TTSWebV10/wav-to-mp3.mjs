import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

const lameAllPath = fileURLToPath(new URL("./node_modules/lamejs/lame.all.js", import.meta.url));

/**
 * lamejs npm의 `src/js` 모듈 그래프는 Node에서 누락 전역 참조로 깨짐.
 * 브라우저용 `lame.all.js` 번들을 vm에서 실행해 `lamejs.Mp3Encoder` / `WavHeader`를 얻는다.
 */
function loadBundledLamejs() {
  const code = fs.readFileSync(lameAllPath, "utf8");
  const sandbox = {
    console,
    Buffer,
    Uint8Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    DataView,
    ArrayBuffer,
    SharedArrayBuffer,
    Math,
    Reflect,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    BigInt,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Atomics,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename: "lame.all.js" });
  const lj = ctx.lamejs;
  if (typeof lj !== "function" || !lj.Mp3Encoder || !lj.WavHeader) {
    throw new Error("lame.all.js에서 lamejs를 찾지 못했습니다.");
  }
  return lj;
}

let lamejsBundle;
function getLamejs() {
  if (!lamejsBundle) lamejsBundle = loadBundledLamejs();
  return lamejsBundle;
}

/**
 * PCM WAV(16비트) → MP3 바이너리. lamejs(LGPL) 사용.
 * @param {Buffer | Uint8Array} wavBuffer
 * @returns {Buffer}
 */
export function wavBufferToMp3Buffer(wavBuffer) {
  const lamejs = getLamejs();
  const u8 = wavBuffer instanceof Uint8Array ? wavBuffer : new Uint8Array(wavBuffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const wh = lamejs.WavHeader.readHeader(dv);
  if (!wh?.dataOffset) {
    throw new Error("WAV 헤더를 읽을 수 없습니다.");
  }

  const channels = wh.channels;
  const sampleRate = wh.sampleRate;
  if (channels !== 1 && channels !== 2) {
    throw new Error(`채널 수 ${channels}는 지원하지 않습니다. (1 또는 2)`);
  }

  const pcmByteLength = wh.dataLen;
  if (pcmByteLength % (2 * channels) !== 0) {
    throw new Error("WAV PCM 데이터 길이가 올바르지 않습니다.");
  }

  const sampleCount = pcmByteLength / (2 * channels);
  const pcmOffset = u8.byteOffset + wh.dataOffset;
  const interleaved = new Int16Array(u8.buffer, pcmOffset, sampleCount * channels);

  let left;
  let right;
  if (channels === 1) {
    left = Int16Array.from(interleaved);
    right = null;
  } else {
    left = new Int16Array(sampleCount);
    right = new Int16Array(sampleCount);
    for (let i = 0, j = 0; j < sampleCount; j++) {
      left[j] = interleaved[i++];
      right[j] = interleaved[i++];
    }
  }

  const kbps = 192;
  const enc = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const block = 1152;
  const chunks = [];

  if (channels === 1) {
    for (let i = 0; i < left.length; i += block) {
      const chunk = left.subarray(i, Math.min(i + block, left.length));
      const mp3buf = enc.encodeBuffer(chunk);
      if (mp3buf.length > 0) chunks.push(Buffer.from(mp3buf));
    }
  } else {
    for (let i = 0; i < left.length; i += block) {
      const end = Math.min(i + block, left.length);
      const mp3buf = enc.encodeBuffer(left.subarray(i, end), right.subarray(i, end));
      if (mp3buf.length > 0) chunks.push(Buffer.from(mp3buf));
    }
  }

  const flushed = enc.flush();
  if (flushed.length > 0) chunks.push(Buffer.from(flushed));

  return Buffer.concat(chunks);
}
