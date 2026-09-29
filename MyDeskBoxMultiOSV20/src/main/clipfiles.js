'use strict';

// 파일 목록을 클립보드에 올리고 내려 읽는다.
//
// 탐색기가 복사(Ctrl+C)와 잘라내기(Ctrl+X)에 쓰는 형식 그대로다.
// 파일 목록은 CF_HDROP, 복사인지 옮기기인지는 Preferred DropEffect 다.
// 그래서 박스에서 복사한 것을 바탕화면에서 붙여넣을 수 있고, 그 반대도 된다.
//
// 검사에서는 useMemory 로 메모리만 쓴다. 쓰는 사람의 클립보드를 건드리지 않으려고다.

const COPY = 1;
const MOVE = 2;
const CF_HDROP = 15;
const GMEM_MOVEABLE = 0x0002;
const GMEM_ZEROINIT = 0x0040;

// null 이면 운영체제 클립보드. 객체면 검사에서 대신 쓰는 기억.
let memory = null;

function useMemory() {
  memory = { paths: [], effect: 0 };
}

// 잘라내기인가. 탐색기의 복사는 복사와 연결을 함께 켜므로(5), 옮기기만 켜진 것을 자른 것으로 본다.
function isCut(effect) {
  const value = Number(effect) || 0;
  return (value & MOVE) !== 0 && (value & COPY) === 0;
}

// DROPFILES. 넓은 글자(UTF-16)로 적는다. 한글 이름이 깨지지 않게 하려는 것이다.
function encodeDrop(paths) {
  const list = (paths || []).map((item) => String(item || '')).filter(Boolean);
  const body = Buffer.from(`${list.join('\0')}\0\0`, 'utf16le');
  const head = Buffer.alloc(20);
  head.writeUInt32LE(20, 0);
  head.writeInt32LE(1, 16);
  return Buffer.concat([head, body]);
}

function decodeDrop(buffer) {
  if (!buffer || buffer.length < 20) return [];
  const offset = buffer.readUInt32LE(0);
  if (offset >= buffer.length) return [];
  const wide = buffer.readInt32LE(16) !== 0;
  const body = buffer.slice(offset);
  if (!wide) return body.toString('latin1').split('\0').filter(Boolean);
  const found = [];
  let start = 0;
  for (let at = 0; at + 1 < body.length; at += 2) {
    if (body.readUInt16LE(at) !== 0) continue;
    const text = body.slice(start, at).toString('utf16le');
    if (!text) break;
    found.push(text);
    start = at + 2;
  }
  return found;
}

function read() {
  if (memory) {
    return {
      paths: memory.paths.slice(),
      effect: memory.effect,
      cut: isCut(memory.effect),
    };
  }
  if (process.platform !== 'win32') return { paths: [], effect: 0, cut: false };
  return readWindows();
}

function write(paths, effect) {
  const list = (paths || []).map((item) => String(item || '')).filter(Boolean);
  if (!list.length) return false;
  const drop = effect === MOVE ? MOVE : COPY;
  if (memory) {
    memory.paths = list.slice();
    memory.effect = drop;
    return true;
  }
  if (process.platform !== 'win32') return false;
  return writeWindows(list, drop);
}

function clear() {
  if (memory) {
    memory.paths = [];
    memory.effect = 0;
    return true;
  }
  if (process.platform !== 'win32') return false;
  return clearWindows();
}

let win = null;

function win32() {
  if (win) return win;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const shell32 = koffi.load('shell32.dll');
  win = {
    OpenClipboard: user32.func('int __stdcall OpenClipboard(void *hwnd)'),
    CloseClipboard: user32.func('int __stdcall CloseClipboard()'),
    EmptyClipboard: user32.func('int __stdcall EmptyClipboard()'),
    SetClipboardData: user32.func('void * __stdcall SetClipboardData(uint32 format, void *mem)'),
    GetClipboardData: user32.func('void * __stdcall GetClipboardData(uint32 format)'),
    RegisterClipboardFormatW: user32.func('uint32 __stdcall RegisterClipboardFormatW(str16 name)'),
    GlobalAlloc: kernel32.func('void * __stdcall GlobalAlloc(uint32 flags, uintptr bytes)'),
    GlobalLock: kernel32.func('void * __stdcall GlobalLock(void *mem)'),
    GlobalUnlock: kernel32.func('int __stdcall GlobalUnlock(void *mem)'),
    GlobalFree: kernel32.func('void * __stdcall GlobalFree(void *mem)'),
    RtlMoveMemory: kernel32.func('void __stdcall RtlMoveMemory(void *dest, void *src, uintptr len)'),
    DragQueryFileW: shell32.func('uint32 __stdcall DragQueryFileW(void *drop, uint32 index, void *name, uint32 cch)'),
  };
  return win;
}

// 다른 프로그램이 클립보드를 쥐고 있으면 잠깐 기다렸다가 다시 연다.
function withClipboard(fn) {
  const api = win32();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (api.OpenClipboard(null)) {
      try {
        return fn(api);
      } finally {
        api.CloseClipboard();
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  return null;
}

function putGlobal(api, bytes) {
  const mem = api.GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.length);
  if (!mem) return null;
  const locked = api.GlobalLock(mem);
  if (!locked) {
    api.GlobalFree(mem);
    return null;
  }
  api.RtlMoveMemory(locked, bytes, bytes.length);
  api.GlobalUnlock(mem);
  return mem;
}

function giveClipboard(api, format, bytes) {
  const mem = putGlobal(api, bytes);
  if (!mem) return false;
  if (api.SetClipboardData(format, mem)) return true;
  api.GlobalFree(mem);
  return false;
}

function effectFormat(api) {
  return api.RegisterClipboardFormatW('Preferred DropEffect');
}

function readWindows() {
  const found = withClipboard((api) => {
    const paths = [];
    const drop = api.GetClipboardData(CF_HDROP);
    if (drop) {
      const count = api.DragQueryFileW(drop, 0xFFFFFFFF, null, 0);
      for (let index = 0; index < count; index += 1) {
        const chars = api.DragQueryFileW(drop, index, null, 0);
        if (!chars) continue;
        const buf = Buffer.alloc((chars + 1) * 2);
        const wrote = api.DragQueryFileW(drop, index, buf, chars + 1);
        if (wrote > 0) paths.push(buf.toString('utf16le', 0, wrote * 2));
      }
    }
    let effect = 0;
    const format = effectFormat(api);
    const mem = format ? api.GetClipboardData(format) : null;
    if (mem) {
      const locked = api.GlobalLock(mem);
      if (locked) {
        const buf = Buffer.alloc(4);
        api.RtlMoveMemory(buf, locked, 4);
        api.GlobalUnlock(mem);
        effect = buf.readUInt32LE(0);
      }
    }
    return { paths, effect };
  });
  const effect = found ? found.effect : 0;
  return {
    paths: found ? found.paths : [],
    effect,
    cut: isCut(effect),
  };
}

function writeWindows(paths, effect) {
  const wrote = withClipboard((api) => {
    if (!api.EmptyClipboard()) return false;
    if (!giveClipboard(api, CF_HDROP, encodeDrop(paths))) return false;
    const format = effectFormat(api);
    if (!format) return false;
    const mark = Buffer.alloc(4);
    mark.writeUInt32LE(effect, 0);
    return giveClipboard(api, format, mark);
  });
  return !!wrote;
}

function clearWindows() {
  const cleared = withClipboard((api) => !!api.EmptyClipboard());
  return !!cleared;
}

module.exports = {
  COPY,
  MOVE,
  useMemory,
  isCut,
  encodeDrop,
  decodeDrop,
  read,
  write,
  clear,
};
