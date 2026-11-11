/* TCP transports for DicomNet (src/js/dicomNet.js) over the Tauri host's raw sockets (src-tauri/src/net.rs).
 *
 *   NetTransport.connect(host, port, { timeoutMs }) → Promise<transport>
 *   NetTransport.listen(port, onConnection(transport, { peer, listener })) → Promise<{ id, port, close() }>
 *   NetTransport.client({ host, port, callingAE, calledAE, … }) → DicomNet.Client over a fresh socket per call
 *   NetTransport.available() → true when the host bridge is there
 *   NetTransport.create(api) → the same object over another bridge (tests: a fake api backed by Node sockets)
 *   transport: { id, peer, write(Uint8Array) → Promise, onData(cb), onClose(cb), close() → Promise }
 *
 * Host contract (commands registered in lib.rs; `window.desktopAPI.net*` wrappers are used when present,
 * otherwise this file calls `__TAURI__.core.invoke` / `__TAURI__.event.listen` itself):
 *   desktopAPI.netConnect(host, port, timeoutMs) → invoke('net_connect', { host, port, timeoutMs })   → id (u32)
 *   desktopAPI.netSend(id, bytes)                → invoke('net_send', bytes, { headers: { 'x-id': String(id) } })  (raw body)
 *   desktopAPI.netClose(id)                      → invoke('net_close', { id })        → bool
 *   desktopAPI.netListen(port)                   → invoke('net_listen', { port })     → { id, port }   (port 0 = any free port)
 *   desktopAPI.netStopListen(id)                 → invoke('net_stop_listen', { id })  → bool
 *   desktopAPI.onNetData(cb)    ← event 'net-data'   { id, data }   data: base64 string (number[] also accepted)
 *   desktopAPI.onNetClosed(cb)  ← event 'net-closed' { id }
 *   desktopAPI.onNetAccept(cb)  ← event 'net-accept' { listener, id, peer }   peer: "ip:port"
 * Data for a socket id may arrive before net_connect resolves (or before net-accept is handled): it is held briefly.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.NetTransport = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const HOLD_MS = 10000;   // how long data / accepts for an unknown id are kept

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (typeof data === 'string') {
      if (typeof atob === 'function') {
        const s = atob(data), b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        return b;
      }
      if (typeof Buffer !== 'undefined') { const b = Buffer.from(data, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
    }
    return new Uint8Array(0);
  }

  // The bridge: desktopAPI.net* if desktop-bridge.js provides them, else Tauri directly.
  function defaultApi() {
    const D = root && root.desktopAPI;
    if (D && typeof D.netConnect === 'function') {
      return {
        connect: (host, port, timeoutMs) => D.netConnect(host, port, timeoutMs),
        send: (id, bytes) => D.netSend(id, bytes),
        close: (id) => D.netClose(id),
        listen: (port) => D.netListen(port),
        stopListen: (id) => D.netStopListen(id),
        onData: (cb) => D.onNetData(cb), onClosed: (cb) => D.onNetClosed(cb), onAccept: (cb) => D.onNetAccept && D.onNetAccept(cb),
      };
    }
    const T = root && root.__TAURI__;
    if (!T || !T.core || typeof T.core.invoke !== 'function') return null;
    const invoke = T.core.invoke;
    const on = (event) => (cb) => {
      const p = T.event && T.event.listen ? T.event.listen(event, (e) => cb(e.payload))
        : T.webviewWindow.getCurrentWebviewWindow().listen(event, (e) => cb(e.payload));
      p.catch((err) => console.error(err));
    };
    return {
      connect: (host, port, timeoutMs) => invoke('net_connect', { host: String(host), port: Number(port), timeoutMs: Number(timeoutMs) || 10000 }),
      send: (id, bytes) => invoke('net_send', bytes, { headers: { 'x-id': String(id) } }),
      close: (id) => invoke('net_close', { id }),
      listen: (port) => invoke('net_listen', { port: Number(port) || 0 }),
      stopListen: (id) => invoke('net_stop_listen', { id }),
      onData: on('net-data'), onClosed: on('net-closed'), onAccept: on('net-accept'),
    };
  }

  function create(apiOrGetter) {
    let api = null, hooked = false;
    const sockets = new Map();     // id → transport
    const held = new Map();        // id → { chunks, closed, t } (socket not claimed yet)
    const listeners = new Map();   // listener id → onConnection
    const heldAccepts = [];        // accepts for a listener we don't know yet

    function bridge() {
      if (!api) api = typeof apiOrGetter === 'function' ? apiOrGetter() : apiOrGetter;
      if (!api) throw new Error('Network sockets are only available in the desktop app');
      if (!hooked) {
        hooked = true;
        api.onData((p) => {
          const t = sockets.get(p.id);
          const bytes = toBytes(p.data);
          if (t) t._data(bytes); else hold(p.id).chunks.push(bytes);
        });
        api.onClosed((p) => {
          const t = sockets.get(p.id);
          if (t) t._closed(); else hold(p.id).closed = true;
        });
        if (api.onAccept) api.onAccept((p) => {
          const fn = listeners.get(p.listener);
          if (fn) accept(fn, p); else { heldAccepts.push({ p, at: Date.now() }); prune(); }
        });
      }
      return api;
    }
    function hold(id) {
      let h = held.get(id);
      if (!h) { h = { chunks: [], closed: false, at: Date.now() }; held.set(id, h); prune(); }
      return h;
    }
    function prune() {
      const now = Date.now();
      for (const [id, h] of held) if (now - h.at > HOLD_MS) held.delete(id);
      while (heldAccepts.length && now - heldAccepts[0].at > HOLD_MS) heldAccepts.shift();
    }
    function accept(fn, p) {
      const t = makeTransport(p.id, p.peer || '');
      try { fn(t, { peer: p.peer || '', listener: p.listener }); } catch (e) { console.error(e); t.close(); }
    }

    function makeTransport(id, peer) {
      let onData = null, closed = false;
      const queue = [], closeCbs = [];
      const t = {
        id, peer,
        write: (bytes) => (closed ? Promise.reject(new Error('Socket closed')) : Promise.resolve(api.send(id, toBytes(bytes)))),
        onData(cb) { onData = cb; while (queue.length) cb(queue.shift()); },
        onClose(cb) { if (closed) cb(); else closeCbs.push(cb); },
        close: async () => {
          if (closed) return;
          try { await api.close(id); } catch { /* already gone */ }
          t._closed();
        },
        _data(bytes) { if (onData) onData(bytes); else queue.push(bytes); },
        _closed() {
          if (closed) return;
          closed = true;
          sockets.delete(id);
          for (const cb of closeCbs.splice(0)) { try { cb(); } catch (e) { console.error(e); } }
        },
      };
      sockets.set(id, t);
      const h = held.get(id);
      if (h) { held.delete(id); h.chunks.forEach((c) => t._data(c)); if (h.closed) queueMicrotask(() => t._closed()); }
      return t;
    }

    async function connect(host, port, opts) {
      const a = bridge();
      const id = await a.connect(String(host), Number(port), (opts && opts.timeoutMs) || 10000);
      return makeTransport(id, `${host}:${port}`);
    }
    async function listen(port, onConnection) {
      const a = bridge();
      const r = await a.listen(Number(port) || 0);
      const id = typeof r === 'object' ? r.id : r;
      const bound = typeof r === 'object' ? r.port : port;
      listeners.set(id, onConnection);
      for (let i = heldAccepts.length - 1; i >= 0; i--) if (heldAccepts[i].p.listener === id) accept(onConnection, heldAccepts.splice(i, 1)[0].p);
      return { id, port: bound, close: async () => { listeners.delete(id); await a.stopListen(id); } };
    }
    function client(opts) {
      const DN = (root && root.DicomNet) || (typeof require === 'function' ? require('./dicomNet') : null);
      return new DN.Client(Object.assign({}, opts, { connect: () => connect(opts.host, opts.port, { timeoutMs: opts.timeout }) }));
    }
    const available = () => { try { return !!bridge(); } catch { return false; } };
    return { connect, listen, client, available, create, toBytes };
  }

  return create(defaultApi);
});
