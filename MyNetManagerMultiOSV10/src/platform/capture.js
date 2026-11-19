// Live capture client (desktop only). The Rust side (src-tauri/src/capture.rs) loads libpcap/Npcap
// at run time and streams packets as binary batches through a Channel:
//   [u32 count] then per packet [u32 sec][u32 nsec][u32 caplen][u32 len][caplen bytes]   (little endian)
// The web build has no live capture: listInterfaces() → [], captureBackend() → { available: false, error: 'web' }
// (the UI offers the demo interface itself).
import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const isTauri = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

/** Rust errors arrive as { code, message }: turn them into Error objects that keep the code. */
function toError(e) {
  if (e instanceof Error) return e;
  if (e && typeof e === 'object') return Object.assign(new Error(e.message ?? String(e.code)), { code: e.code ?? 'internal' });
  return Object.assign(new Error(String(e)), { code: 'internal' });
}

const call = (command, args) => invoke(command, args).catch((e) => { throw toError(e); });

// A reloaded page lost the channels of the captures it started: stop them once, before the first start.
let reset = null;
const resetOnce = () => (reset ??= call('capture_reset').catch(() => {}));

/** { available, library, version, error, code, adminOnly, elevated, needsPrompt }
 * needsPrompt: Npcap is for administrators only and the app is not elevated; the first startCapture()
 * shows a Windows permission (UAC) prompt and waits for the answer (declined → Error code 'permission'). */
export async function captureBackend() {
  if (!isTauri()) return { available: false, library: null, version: null, error: 'web', code: 'web', adminOnly: false, elevated: false, needsPrompt: false };
  return call('capture_backend');
}

/** [{ name, description, friendly, addresses, loopback, up, running, wireless, linktype }] */
export async function listInterfaces() {
  if (!isTauri()) return [];
  return call('capture_interfaces');
}

/** [{ name, packets }] — every interface's packet counter from the system (no capture); [] in the browser. */
export async function interfaceActivity() {
  if (!isTauri()) return [];
  return call('capture_activity');
}

/** BPF capture filter check → { ok, error } (an empty filter is ok). */
export async function checkCaptureFilter(linktype, filter) {
  if (!isTauri()) return { ok: true, error: null };
  return call('capture_check_filter', { linktype, filter: filter ?? '' });
}

/**
 * Decodes one batch into frames `{ sec, nsec, caplen, len, data, linktype }` (`no` and `iface` are the caller's).
 * Each `data` is its own copy, so frames do not keep the whole batch alive.
 */
export function decodeBatch(message, linktype) {
  let bytes;
  if (message instanceof ArrayBuffer) bytes = new Uint8Array(message);
  else if (ArrayBuffer.isView(message)) bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  else if (Array.isArray(message)) bytes = Uint8Array.from(message);
  else return [];
  if (bytes.byteLength < 4) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  const frames = new Array(count);
  let o = 4;
  let n = 0;
  for (; n < count && o + 16 <= bytes.byteLength; n++) {
    const sec = view.getUint32(o, true);
    const nsec = view.getUint32(o + 4, true);
    const caplen = view.getUint32(o + 8, true);
    const len = view.getUint32(o + 12, true);
    o += 16;
    if (o + caplen > bytes.byteLength) break;
    frames[n] = { sec, nsec, caplen, len, data: bytes.slice(o, o + caplen), linktype };
    o += caplen;
  }
  frames.length = n;
  return frames;
}

/**
 * Starts a live capture.
 * options: { iface, snaplen = 262144, promisc = true, filter = '', bufferMb = 4, timeoutMs = 100, monitor = false }
 * onFrames(frames[]) is called for every batch (about every 100 ms while packets arrive).
 * → { id, linktype, snaplen, nanosecond, warning, stop(): Promise<stats>, stats(): Promise<stats> }   stats = { recv, drop, ifdrop }
 * Rejects with an Error whose `code` is no_library, permission, no_such_device, activate_failed, filter_invalid, …
 */
export async function startCapture(options, onFrames) {
  if (!isTauri()) throw Object.assign(new Error('Live capture needs the desktop app'), { code: 'web' });
  await resetOnce();
  const channel = new Channel();
  let linktype = null;
  const early = [];
  channel.onmessage = (message) => {
    // Batches may arrive before capture_start has answered with the link type.
    if (linktype === null) early.push(message);
    else onFrames(decodeBatch(message, linktype));
  };
  const opts = {
    iface: options.iface,
    snaplen: options.snaplen ?? 262144,
    promisc: options.promisc ?? true,
    filter: options.filter ?? '',
    bufferMb: options.bufferMb ?? 4,
    timeoutMs: options.timeoutMs ?? 100,
    monitor: options.monitor ?? false,
  };
  const started = await call('capture_start', { options: opts, onPackets: channel });
  linktype = started.linktype;
  for (const message of early.splice(0)) onFrames(decodeBatch(message, linktype));
  let stopped = null;
  return {
    ...started,
    stop: () => (stopped ??= call('capture_stop', { id: started.id })),
    stats: () => call('capture_stats', { id: started.id }),
  };
}

/**
 * cb({ id, error, code }) when a capture ends on its own (interface gone, driver error).
 * Returns a function that removes the listener.
 */
export function onCaptureStopped(cb) {
  if (!isTauri()) return () => {};
  let unlisten = null;
  let removed = false;
  listen('capture-stopped', (event) => cb(event.payload)).then((fn) => {
    if (removed) fn();
    else unlisten = fn;
  });
  return () => {
    removed = true;
    unlisten?.();
  };
}
