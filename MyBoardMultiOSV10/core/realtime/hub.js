// WebSocket realtime hub (ARCHITECTURE §6) — enabled by the web server only.
//
// Client → server: {op:'hello', clientId} {op:'sub', topics} {op:'unsub', topics} {op:'presence', topic, state} {op:'ping'}
// Server → client: {op:'event', event} {op:'presence', topic, users:[{userId, name, avatar, state}]} {op:'pong'}
//                  {op:'subscribed', topics, denied} {op:'error', code, message}
//
// Events flow  EventBus → transport.publish → transport delivers → hub → sockets subscribed to any event topic.
// The transport is pluggable: `memory` now; pg-notify / redis / change_log polling can implement the same
// interface later so several servers (or desktop apps on one shared DB) share events.
import { WebSocketServer } from 'ws';

/**
 * @typedef {{ publish(event: object): void, subscribe(handler: (event: object) => void): () => void, close(): void, name: string }} Transport
 */

/** In-process transport: publish delivers synchronously to the local hub. */
export function createMemoryTransport() {
  const handlers = new Set();
  return {
    name: 'memory',
    publish(event) { for (const h of handlers) h(event); },
    subscribe(h) { handlers.add(h); return () => handlers.delete(h); },
    close() { handlers.clear(); },
  };
}

const MAX_TOPICS = 200;

/**
 * @param {{ events: import('../events.js').EventBus,
 *           authenticate: (req) => Promise<object|null>,   user row (snake or camel) or null
 *           canSubscribe: (user, topic) => Promise<boolean>,
 *           transport?: Transport, heartbeatMs?: number }} opts
 */
export function createHub(opts) {
  const transport = opts.transport || createMemoryTransport();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  /** @type {Set<any>} */
  const clients = new Set();
  /** topic → Map(ws → presence entry) */
  const presence = new Map();

  const offBus = opts.events.on('*', (ev) => { if (ev.topics && ev.topics.length) transport.publish(ev); });
  const offTransport = transport.subscribe((ev) => deliver(ev));

  function send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function deliver(ev) {
    const msg = JSON.stringify({ op: 'event', event: ev });
    for (const ws of clients) {
      if (ws.readyState !== 1) continue;
      if (ev.topics.some((t) => ws.topics.has(t))) ws.send(msg);
    }
  }

  function presenceList(topic) {
    const m = presence.get(topic);
    if (!m) return [];
    // one entry per user (the latest state wins when a user has several tabs)
    const byUser = new Map();
    for (const e of m.values()) byUser.set(e.userId, e);
    return [...byUser.values()];
  }

  function broadcastPresence(topic) {
    const users = presenceList(topic);
    for (const ws of clients) if (ws.topics.has(topic)) send(ws, { op: 'presence', topic, users });
  }

  function leave(ws, topic) {
    const m = presence.get(topic);
    if (m && m.delete(ws)) {
      if (!m.size) presence.delete(topic);
      broadcastPresence(topic);
    }
  }

  async function onMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { send(ws, { op: 'error', code: 'BAD_MESSAGE', message: 'Messages are JSON' }); return; }
    switch (msg && msg.op) {
      case 'hello':
        ws.clientId = typeof msg.clientId === 'string' ? msg.clientId.slice(0, 64) : null;
        send(ws, { op: 'hello', userId: ws.user.id });
        return;
      case 'ping': send(ws, { op: 'pong' }); return;
      case 'sub': {
        const topics = Array.isArray(msg.topics) ? msg.topics.filter((t) => typeof t === 'string').slice(0, MAX_TOPICS) : [];
        const ok = []; const denied = [];
        for (const t of topics) {
          if (ws.topics.size >= MAX_TOPICS) { denied.push(t); continue; }
          let allowed = false;
          try { allowed = await opts.canSubscribe(ws.user, t); } catch { allowed = false; }
          if (allowed) { ws.topics.add(t); ok.push(t); } else denied.push(t);
        }
        send(ws, { op: 'subscribed', topics: ok, denied });
        for (const t of ok) if (presence.has(t)) send(ws, { op: 'presence', topic: t, users: presenceList(t) });
        return;
      }
      case 'unsub': {
        for (const t of Array.isArray(msg.topics) ? msg.topics : []) { ws.topics.delete(t); leave(ws, t); }
        return;
      }
      case 'presence': {
        const topic = msg.topic;
        if (typeof topic !== 'string' || !ws.topics.has(topic)) { send(ws, { op: 'error', code: 'NOT_SUBSCRIBED', message: 'Subscribe to the topic first' }); return; }
        if (msg.state == null) { leave(ws, topic); return; }
        let m = presence.get(topic);
        if (!m) { m = new Map(); presence.set(topic, m); }
        const st = msg.state && typeof msg.state === 'object' ? { view: msg.state.view, issueId: msg.state.issueId, editing: msg.state.editing } : {};
        m.set(ws, { userId: ws.user.id, name: ws.user.display_name || ws.user.displayName || ws.user.username, avatar: ws.user.avatar || null, state: st, clientId: ws.clientId });
        broadcastPresence(topic);
        return;
      }
      default:
        send(ws, { op: 'error', code: 'UNKNOWN_OP', message: `Unknown op: ${msg && msg.op}` });
    }
  }

  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      try { ws.ping(); } catch { /* closed */ }
    }
  }, opts.heartbeatMs || 30000);
  heartbeat.unref?.();

  return {
    transport,
    clients,

    /** Handle an HTTP upgrade for the live path. Returns false if it is not ours. */
    async handleUpgrade(req, socket, head) {
      let user = null;
      try { user = await opts.authenticate(req); } catch { user = null; }
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = user;
        ws.topics = new Set([`user:${user.id}`]);
        ws.alive = true;
        clients.add(ws);
        ws.on('pong', () => { ws.alive = true; });
        ws.on('message', (data) => { onMessage(ws, data).catch(() => {}); });
        ws.on('close', () => {
          clients.delete(ws);
          for (const t of [...presence.keys()]) leave(ws, t);
        });
        ws.on('error', () => {});
      });
    },

    /** Close every socket and detach from the bus. */
    close() {
      clearInterval(heartbeat);
      offBus();
      offTransport();
      transport.close();
      for (const ws of clients) ws.terminate();
      clients.clear();
      wss.close();
    },
  };
}
