// Registry of open server connections: id → client.
//
// The UI keeps one connection at a time (like the WinForms original), but the
// registry allows several so a browser tab that reloads can pick its
// connection up again and the web server can serve more than one tab.
'use strict';

const { createClient } = require('./remote');
const { cancelledError } = require('./jobs');

let nextId = 1;

class Connections {
  constructor() {
    this.map = new Map();
  }

  // Connects and registers the client. Runs inside a job so the UI can show
  // "연결 중…" and cancel; the job result is the connection info.
  async connect(opts, job) {
    const client = createClient(opts);
    const ac = new AbortController();
    job.onCancel(() => ac.abort());
    job.begin(`${client.protocol}://${client.opts.host}:${client.opts.port}`);
    await client.connect(ac.signal);
    const id = nextId++;
    const info = { id, protocol: client.protocol, host: client.opts.host, port: client.opts.port, user: client.opts.user || '', connectedAt: Date.now() };
    this.map.set(id, { client, info, opts: { ...client.opts } });
    return info;
  }

  // Extra logins used as transfer workers (FTP cannot multiplex on one
  // control connection). Failures are ignored so a server that rejects a
  // second session still transfers on the browse connection.
  async acquireTransferPool(id, count, signal) {
    const entry = this.map.get(Number(id));
    if (!entry || !entry.client.connected) {
      const e = new Error('Not connected'); e.code = 'NOT_CONNECTED'; throw e;
    }
    const n = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
    const extras = [];
    if (n > 1) {
      const pending = [];
      for (let i = 1; i < n; i++) {
        pending.push((async () => {
          const extra = createClient(entry.opts);
          try {
            await extra.connect(signal);
            extras.push(extra);
          } catch {
            try { await extra.close(); } catch { /* ignore */ }
          }
        })());
      }
      await Promise.all(pending);
      if (signal && signal.aborted) {
        for (const c of extras) { try { await c.close(); } catch { /* ignore */ } }
        extras.length = 0;
        throw cancelledError();
      }
    }
    return {
      clients: [entry.client, ...extras],
      async release() {
        for (const c of extras) { try { await c.close(); } catch { /* ignore */ } }
      },
    };
  }

  get(id) {
    const c = this.map.get(Number(id));
    if (!c || !c.client.connected) {
      if (c) this.map.delete(Number(id));
      const e = new Error('Not connected'); e.code = 'NOT_CONNECTED'; throw e;
    }
    return c.client;
  }

  info(id) {
    const c = this.map.get(Number(id));
    return c ? { ...c.info, connected: c.client.connected } : null;
  }

  // Credentials + protocol for a second channel (SSH shell, extra transfers).
  getOpts(id) {
    const c = this.map.get(Number(id));
    if (!c || !c.client.connected) {
      if (c) this.map.delete(Number(id));
      const e = new Error('Not connected'); e.code = 'NOT_CONNECTED'; throw e;
    }
    return { ...c.opts, protocol: c.info.protocol, id: c.info.id };
  }

  async disconnect(id) {
    const c = this.map.get(Number(id));
    this.map.delete(Number(id));
    if (c) await c.client.close();
    return !!c;
  }

  list() {
    return Array.from(this.map.values()).map((c) => ({ ...c.info, connected: c.client.connected }));
  }

  async closeAll() {
    for (const c of this.map.values()) { try { await c.client.close(); } catch { /* ignore */ } }
    this.map.clear();
  }
}

module.exports = { Connections };
