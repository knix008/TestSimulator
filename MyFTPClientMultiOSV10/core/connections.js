// Registry of open server connections: id → client.
//
// The UI keeps one connection at a time (like the WinForms original), but the
// registry allows several so a browser tab that reloads can pick its
// connection up again and the web server can serve more than one tab.
'use strict';

const { createClient } = require('./remote');

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
    this.map.set(id, { client, info });
    return info;
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
