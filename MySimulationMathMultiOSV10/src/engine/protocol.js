// Engine ↔ GUI plumbing shared by the worker (src/engine/worker.js) and the
// GUI client (src/engine/client.js). Pure: no DOM, works in Node tests.
//
// Synchronous requests (CONTRACT §4 ctx.host.request): the worker posts
// { type: 'request', id, msg } and blocks in Atomics.wait on a shared control
// block until the GUI has written the answer (JSON) into a shared data
// buffer. Answers larger than the buffer go in chunks: after each chunk the
// worker posts { type: 'request.more', id } and waits for the next one.
//
// control Int32Array(4): [0] state (0 empty, 1 chunk ready), [1] chunk byte
// length, [2] more chunks follow (1/0), [3] request id.

export const CHUNK_BYTES = 1 << 20;
export const MAX_OUTPUT_ENTRIES = 5000;

export const hasSharedMemory = () => typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && (typeof crossOriginIsolated === 'undefined' || crossOriginIsolated === true);

/** GUI side: the shared buffers the worker gets in its init message. */
export function createChannel(chunkBytes = CHUNK_BYTES) {
  if (!hasSharedMemory()) return null;
  return {
    control: new SharedArrayBuffer(16),
    data: new SharedArrayBuffer(chunkBytes),
    interrupt: new SharedArrayBuffer(4),
  };
}

/** GUI side: writes answers into the channel, chunk by chunk. */
export function createReplyWriter(channel) {
  const ctrl = new Int32Array(channel.control);
  const data = new Uint8Array(channel.data);
  const enc = new TextEncoder();
  let pending = null; // { id, bytes, offset }
  const writeChunk = () => {
    const { id, bytes, offset } = pending;
    const n = Math.min(data.length, bytes.length - offset);
    data.set(bytes.subarray(offset, offset + n), 0);
    pending.offset = offset + n;
    const more = pending.offset < bytes.length ? 1 : 0;
    ctrl[1] = n;
    ctrl[2] = more;
    ctrl[3] = id;
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0);
    if (!more) pending = null;
  };
  return {
    /** Answers request `id` with any JSON value (undefined → null). */
    reply(id, value) {
      let text;
      try { text = JSON.stringify({ v: value === undefined ? null : value }); } catch (e) { text = JSON.stringify({ v: null, error: String((e && e.message) || e) }); }
      pending = { id, bytes: enc.encode(text), offset: 0 };
      writeChunk();
    },
    /** The worker read a chunk and wants the next one. */
    more(id) { if (pending && pending.id === id) writeChunk(); },
    get busy() { return !!pending; },
  };
}

/**
 * Worker side: blocks until the answer to request `id` is complete. postMore(id)
 * asks the GUI for the next chunk. Returns the answered value.
 */
export function readReply(channel, id, postMore) {
  const ctrl = new Int32Array(channel.control);
  const data = new Uint8Array(channel.data);
  const parts = [];
  let total = 0;
  for (;;) {
    while (Atomics.load(ctrl, 0) === 0) Atomics.wait(ctrl, 0, 0, 1000);
    const n = ctrl[1];
    const more = ctrl[2] === 1;
    const copy = new Uint8Array(n);
    copy.set(data.subarray(0, n));
    parts.push(copy);
    total += n;
    Atomics.store(ctrl, 0, 0);
    if (!more) break;
    postMore(id);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  const parsed = JSON.parse(new TextDecoder().decode(all));
  return parsed ? parsed.v : null;
}

/**
 * Worker side: output batching. print() collects text per stream and sends it
 * when the stream changes, when `intervalMs` has passed since the last send,
 * or on flush(); a long loop that prints keeps the Command Window moving
 * without one message per line.
 */
export function createOutputBuffer(send, { intervalMs = 30, now = () => Date.now() } = {}) {
  let stream = null;
  let text = '';
  let last = now();
  const flush = () => {
    if (text) send({ type: 'out', text, stream: stream || 'out' });
    text = '';
    stream = null;
    last = now();
  };
  return {
    print(t, s = 'out') {
      const str = String(t == null ? '' : t);
      if (!str) return;
      if (stream && stream !== s) flush();
      stream = s;
      text += str;
      if (now() - last >= intervalMs) flush();
    },
    flush,
  };
}

/** True when the line is an unfinished statement (block without end, open bracket, "..."). */
export function needsMoreInput(code) {
  const lines = String(code).split(/\r?\n/);
  let depth = 0;
  let bracket = 0;
  for (const raw of lines) {
    // Strip strings and comments in a cheap way: '...' after an operator / start, "..." always, % comments.
    let line = '';
    let inStr = null;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) { if (ch === inStr) { if (raw[i + 1] === inStr) { i++; continue; } inStr = null; } continue; }
      if (ch === '%' || ch === '#') break;
      if (ch === '"') { inStr = '"'; continue; }
      if (ch === "'") {
        // A quote right after a name, a closing bracket or another quote is a transpose.
        const prev = line.replace(/\s+$/, '').slice(-1);
        if (!prev || !/[\w)\]}.']/.test(prev)) { inStr = "'"; continue; }
      }
      line += ch;
    }
    if (/\.\.\.\s*$/.test(line)) return true;
    for (const ch of line) {
      if (ch === '(' || ch === '[' || ch === '{') bracket++;
      else if ((ch === ')' || ch === ']' || ch === '}') && bracket > 0) bracket--;
    }
    if (bracket > 0) continue;
    for (const m of line.matchAll(/\b(function|if|for|parfor|while|switch|try|classdef|properties|methods|events|enumeration|spmd|end|endfunction|endif|endfor|endwhile|endswitch|end_try_catch)\b/g)) {
      const w = m[1];
      const before = line.slice(0, m.index);
      // "end" inside an index expression (x(end)) is not a block end.
      const open = (before.match(/[([{]/g) || []).length - (before.match(/[)\]}]/g) || []).length;
      if (open > 0) continue;
      if (/^end/.test(w)) depth = Math.max(0, depth - 1);
      else depth++;
    }
  }
  return depth > 0 || bracket > 0;
}

/** "file.m:12", "foo.m (line 12)", "line 12 of foo.m" … → [{ start, end, file, line }]. */
export function findFileLinks(text) {
  const out = [];
  // An absolute path (may contain spaces) or a bare file name.
  const re = /((?:[A-Za-z]:)?[/\\][^\n:*?"<>|]*?\.(?:m|smdl|msim)|[\w.-]+\.(?:m|smdl|msim))(?::(\d+)| \(line (\d+)\)|, line (\d+)| at line (\d+))/g;
  for (const m of String(text).matchAll(re)) {
    const file = m[1].trim();
    const line = Number(m[2] || m[3] || m[4] || m[5]);
    const start = m.index + (m[0].length - m[0].trimStart().length);
    out.push({ start, end: m.index + m[0].length, file, line });
  }
  return out;
}
