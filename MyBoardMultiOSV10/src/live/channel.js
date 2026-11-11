// Realtime client (ARCHITECTURE.md §6). Two implementations with one interface:
//
//   WsChannel   — web: WebSocket to /api/live (session cookie, or ?token=). Reconnects with
//                 exponential backoff (+ jitter), sends `hello` with this window's client id, re-subscribes
//                 every topic and re-sends the last presence after each reconnect, pings every 25 s.
//   NullChannel — desktop (the desktop core has no hub yet): accepts every call, never emits events.
//                 Enabling realtime on the desktop later means giving the core a hub; the UI stays.
//
// Interface:
//   connect()                    starts (idempotent)            close()   stops for good
//   subscribe(topics)            adds topics ('board:<id>', 'project:<id>', 'issue:<id>')
//   unsubscribe(topics)          removes topics
//   setPresence(topic, state)    { view: 'board'|'issue', issueId?, editing? } (null clears)
//   on(type, handler) → off()    'event' (event), 'presence' ({ topic, users }), 'state' ({ state, attempt, delay, resync }),
//                                'hello' ({ userId }), 'subscribed' ({ topics, denied }), 'error' ({ code, message })
//   state                        'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'disabled'
//
// Events whose `client` is this window's own id are dropped (its optimistic change is already shown).
// After a reconnect a 'state' event with `resync: true` tells the page to reload what it shows.
import { CLIENT_ID } from '../api/client.js';

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
  emit(type, payload) {
    for (const handler of this.handlers.get(type) ?? []) {
      try { handler(payload); } catch (error) { console.error('live handler', error); }
    }
  }
}

/** The desktop's channel: same interface, no traffic. */
export class NullChannel extends Emitter {
  constructor() { super(); this.state = 'disabled'; this.topics = new Set(); this.realtime = false; }
  connect() { this.emit('state', { state: this.state }); return this; }
  subscribe(topics) { for (const topic of [].concat(topics ?? [])) this.topics.add(topic); }
  unsubscribe(topics) { for (const topic of [].concat(topics ?? [])) this.topics.delete(topic); }
  setPresence() {}
  close() { this.state = 'closed'; }
}

/** Backoff delay (ms) for reconnect attempt n (1, 2, …): 0.5 s doubling to 30 s, ±20 % jitter. */
export function backoffDelay(attempt, random = Math.random) {
  const base = Math.min(30000, 500 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

export class WsChannel extends Emitter {
  /**
   * `url`: the WebSocket URL (default: ws(s)://<host>/api/live next to the page); `token`: bearer token for
   * a cross-origin core (sent as ?token=). `WebSocketImpl` for tests.
   */
  constructor({ url = null, token = null, clientId = CLIENT_ID, WebSocketImpl = globalThis.WebSocket, pingInterval = 25000 } = {}) {
    super();
    this.url = url ?? defaultUrl();
    this.token = token;
    this.clientId = clientId;
    this.WebSocketImpl = WebSocketImpl;
    this.pingInterval = pingInterval;
    this.topics = new Set();
    this.presence = new Map();
    this.state = 'idle';
    this.realtime = true;
    this.attempt = 0;
    this.socket = null;
    this.retryTimer = null;
    this.pingTimer = null;
    this.everOpened = false;
    this.closed = false;
  }

  setState(state, extra = {}) {
    this.state = state;
    this.emit('state', { state, attempt: this.attempt, ...extra });
  }

  connect() {
    if (this.closed || this.socket || this.retryTimer) return this;
    if (!this.WebSocketImpl) { this.setState('disabled'); return this; }
    this.setState(this.everOpened ? 'reconnecting' : 'connecting');
    let socket;
    try {
      const url = this.token ? `${this.url}${this.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}` : this.url;
      socket = new this.WebSocketImpl(url);
    } catch {
      this.scheduleRetry();
      return this;
    }
    this.socket = socket;
    socket.onopen = () => {
      const resync = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      this.send({ op: 'hello', clientId: this.clientId });
      if (this.topics.size) this.send({ op: 'sub', topics: [...this.topics] });
      for (const [topic, state] of this.presence) this.send({ op: 'presence', topic, state });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ op: 'ping' }), this.pingInterval);
      this.setState('open', { resync });
    };
    socket.onmessage = (message) => this.receive(message.data);
    socket.onerror = () => { /* onclose follows */ };
    socket.onclose = () => {
      clearInterval(this.pingTimer);
      this.socket = null;
      if (this.closed) { this.setState('closed'); return; }
      this.scheduleRetry();
    };
    return this;
  }

  scheduleRetry() {
    this.attempt += 1;
    const delay = backoffDelay(this.attempt);
    this.setState('reconnecting', { delay });
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.connect(); }, delay);
  }

  receive(data) {
    let message;
    try { message = JSON.parse(typeof data === 'string' ? data : String(data)); } catch { return; }
    if (message?.op === 'event' && message.event) {
      if (message.event.client && message.event.client === this.clientId) return;
      this.emit('event', message.event);
    } else if (message?.op === 'presence') {
      this.emit('presence', { topic: message.topic, users: message.users ?? [] });
    } else if (message?.op === 'hello') {
      // The hub knows who this is; it subscribes every socket to user:<id> (notifications) by itself.
      this.userId = message.userId ?? null;
      this.emit('hello', { userId: this.userId });
    } else if (message?.op === 'subscribed') {
      const denied = [].concat(message.denied ?? []);
      for (const topic of denied) { this.topics.delete(topic); this.presence.delete(topic); }
      this.emit('subscribed', { topics: message.topics ?? [], denied });
    } else if (message?.op === 'error') {
      this.emit('error', { code: message.code ?? 'ERROR', message: message.message ?? '' });
    }
  }

  send(message) {
    if (this.socket?.readyState !== 1) return false;
    try { this.socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  subscribe(topics) {
    const added = [].concat(topics ?? []).filter((topic) => topic && !this.topics.has(topic));
    for (const topic of added) this.topics.add(topic);
    if (added.length) this.send({ op: 'sub', topics: added });
  }

  unsubscribe(topics) {
    const removed = [].concat(topics ?? []).filter((topic) => this.topics.delete(topic));
    for (const topic of removed) this.presence.delete(topic);
    if (removed.length) this.send({ op: 'unsub', topics: removed });
  }

  setPresence(topic, state) {
    if (state) this.presence.set(topic, state); else this.presence.delete(topic);
    this.send({ op: 'presence', topic, state: state ?? null });
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.retryTimer = null;
    try { this.socket?.close(); } catch { /* already gone */ }
    this.socket = null;
    this.setState('closed');
  }
}

function defaultUrl() {
  const loc = globalThis.location;
  if (!loc) return 'ws://localhost/api/live';
  const path = new URL('api/live', loc.href).pathname;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${path}`;
}

/** The channel for this window: web with realtime → WsChannel, otherwise NullChannel. */
export function createChannel({ desktop = false, realtime = true, ...options } = {}) {
  return desktop || !realtime ? new NullChannel() : new WsChannel(options);
}
