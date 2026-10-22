'use strict';

// JSON-RPC 2.0 with LSP "Content-Length" framing for the VS Code client.
// A copy of core/lsp/jsonrpc.js so the extension does not depend on the
// layout of whichever core it starts.

const ERR = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerNotInitialized: -32002,
  RequestCancelled: -32800,
};

// Splits an incoming byte stream into JSON messages.
function createReader(onMessage, onError) {
  let buf = Buffer.alloc(0);
  return function feed(chunk) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    for (;;) {
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = buf.slice(0, headerEnd).toString('ascii');
      const m = /content-length\s*:\s*(\d+)/i.exec(header);
      if (!m) {
        // Garbage before a header: drop it and resync on the next header.
        buf = buf.slice(headerEnd + 4);
        if (onError) onError(new Error('Missing Content-Length header'));
        continue;
      }
      const length = Number(m[1]);
      const start = headerEnd + 4;
      if (buf.length < start + length) return;
      const body = buf.slice(start, start + length).toString('utf8');
      buf = buf.slice(start + length);
      let msg;
      try { msg = JSON.parse(body); } catch (err) {
        if (onError) onError(err);
        continue;
      }
      onMessage(msg);
    }
  };
}

function encode(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

// A bidirectional endpoint: request/notify outwards, dispatch inwards.
function createConnection(input, output, options = {}) {
  const handlers = new Map();
  const notificationHandlers = new Map();
  const pending = new Map();
  let nextId = 1;
  let closed = false;
  let fallback = null;

  function write(msg) {
    if (closed) return;
    try { output.write(encode(msg)); } catch { /* stream gone */ }
  }

  function respond(id, result, error) {
    if (error) write({ jsonrpc: '2.0', id, error });
    else write({ jsonrpc: '2.0', id, result: result === undefined ? null : result });
  }

  async function dispatch(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.method === undefined && msg.id !== undefined) {
      const wait = pending.get(msg.id);
      if (!wait) return;
      pending.delete(msg.id);
      if (msg.error) {
        const err = new Error(msg.error.message || 'Request failed');
        err.code = msg.error.code;
        err.data = msg.error.data;
        wait.reject(err);
      } else wait.resolve(msg.result);
      return;
    }
    if (typeof msg.method !== 'string') {
      if (msg.id !== undefined) respond(msg.id, null, { code: ERR.InvalidRequest, message: 'Invalid request' });
      return;
    }
    const isRequest = msg.id !== undefined && msg.id !== null;
    if (isRequest) {
      const fn = handlers.get(msg.method) || (fallback && ((p) => fallback(msg.method, p, true)));
      if (!fn) {
        respond(msg.id, null, { code: ERR.MethodNotFound, message: `Unhandled method ${msg.method}` });
        return;
      }
      try {
        const result = await fn(msg.params, msg);
        respond(msg.id, result);
      } catch (err) {
        respond(msg.id, null, {
          code: typeof (err && err.code) === 'number' ? err.code : ERR.InternalError,
          message: String((err && err.message) || err),
        });
      }
      return;
    }
    const fn = notificationHandlers.get(msg.method) || (fallback && ((p) => fallback(msg.method, p, false)));
    if (!fn) return;
    try { await fn(msg.params, msg); } catch (err) {
      if (options.onError) options.onError(err);
    }
  }

  const feed = createReader((msg) => { dispatch(msg); }, options.onError);
  input.on('data', feed);
  input.on('end', () => { closed = true; if (options.onClose) options.onClose(); });

  return {
    onRequest(method, fn) { handlers.set(method, fn); },
    onNotification(method, fn) { notificationHandlers.set(method, fn); },
    onUnhandled(fn) { fallback = fn; },
    notify(method, params) { write({ jsonrpc: '2.0', method, params }); },
    request(method, params, timeoutMs) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        let timer = null;
        if (timeoutMs) {
          timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
          if (timer.unref) timer.unref();
        }
        pending.set(id, {
          resolve: (v) => { if (timer) clearTimeout(timer); resolve(v); },
          reject: (e) => { if (timer) clearTimeout(timer); reject(e); },
        });
        write({ jsonrpc: '2.0', id, method, params });
      });
    },
    close() { closed = true; input.removeListener('data', feed); },
  };
}

module.exports = { createReader, encode, createConnection, ERR };
