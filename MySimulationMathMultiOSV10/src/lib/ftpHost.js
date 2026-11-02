// The app's side of FTP (core/lib/io/ftp.js): the engine requests
//   { type: 'ftp', op, session, ... }
// and this forwards each one to the host API POST /api/ftp/<op> (server/ftp-client.js
// on the web, src-tauri/src/host.rs on the desktop), which keeps the sockets.
// Replies are the API's data ({ session, path }, { entries }, { bodyBase64 }, { ok })
// or { error: message } when the call failed.
//
//   installFtpHost(engine, { call }) → () => void (uninstall); call defaults to backend.js api()
import { api } from './backend.js';

const OPS = new Set(['open', 'close', 'pwd', 'cd', 'list', 'get', 'put', 'delete', 'mkdir', 'rmdir', 'rename']);

export function installFtpHost(engine, { call = api } = {}) {
  return engine.onRequest('ftp', async (m) => {
    const op = m && m.op;
    if (!OPS.has(op)) return { error: `Unknown FTP operation '${op}'.` };
    const { type, op: _op, ...args } = m;
    void type; void _op;
    try {
      const data = await call(`ftp/${op}`, args);
      return data && typeof data === 'object' ? data : { ok: true };
    } catch (e) {
      return { error: (e && e.message) || String(e) };
    }
  });
}
