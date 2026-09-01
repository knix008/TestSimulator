// deviceClient.js
// Transport abstraction. Sends an AT command to the device over HTTPS and
// returns the raw text response. Works in two environments:
//   * Electron  -> uses window.vixapi.sendCommand (main process, node https,
//                  accepts self-signed device certificates)
//   * Web       -> uses fetch() directly (device must expose HTTPS + CORS)
//
// The device is expected to answer an HTTPS POST whose body is the AT command
// with a plain-text body such as "OK", "FAIL" or a data string (serial, mac...).

export const isElectron = typeof window !== 'undefined' && !!window.vixapi;

export class DeviceClient {
  /** @param {{ip:string, port:number, path:string, timeoutMs:number}} opts */
  constructor(opts) {
    this.ip = opts.ip;
    this.port = opts.port;
    this.path = opts.path || '/at';
    this.timeoutMs = opts.timeoutMs || 15000;
    this.connected = false;
  }

  update(opts = {}) {
    if (opts.ip !== undefined) this.ip = opts.ip;
    if (opts.port !== undefined) this.port = opts.port;
    if (opts.path !== undefined) this.path = opts.path;
    if (opts.timeoutMs !== undefined) this.timeoutMs = opts.timeoutMs;
  }

  get baseUrl() {
    return `https://${this.ip}:${this.port}${this.path}`;
  }

  /**
   * Send one AT command, return trimmed text response.
   * @param {string} command
   * @returns {Promise<string>}
   */
  async send(command) {
    if (isElectron) {
      const res = await window.vixapi.sendCommand({
        ip: this.ip,
        port: this.port,
        path: this.path,
        command,
        timeoutMs: this.timeoutMs
      });
      if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
      return (res.body || '').trim();
    }

    // Browser / Web
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: command,
        signal: ctrl.signal
      });
      const text = (await resp.text()).trim();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);
      return text;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`타임아웃 (${this.timeoutMs}ms)`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Run the connection handshake sequence (e.g. AT, AT+TEST=BEGIN).
   * @param {string[]} sequence
   * @param {(msg:string)=>void} log
   */
  async connect(sequence, log = () => {}) {
    this.connected = false;
    for (const cmd of sequence) {
      log(`핸드셰이크 전송: ${cmd}`);
      const resp = await this.send(cmd);
      log(`응답: ${resp}`);
      const up = resp.toUpperCase();
      if (up.includes('FAIL')) {
        throw new Error(`핸드셰이크 실패 (${cmd}) → ${resp}`);
      }
    }
    this.connected = true;
    return true;
  }

  disconnect() {
    this.connected = false;
  }
}

// Interpret a device response into a pass/fail/data verdict.
export function interpretResponse(kind, response) {
  const up = (response || '').toUpperCase();
  if (kind === 'read') {
    if (up.includes('FAIL') || response.trim().length < 1) {
      return { ok: false, value: response, verdict: 'fail' };
    }
    return { ok: true, value: response.trim(), verdict: 'data' };
  }
  // test / write -> expect OK / FAIL
  if (up.includes('OK')) return { ok: true, value: response, verdict: 'pass' };
  if (up.includes('FAIL')) return { ok: false, value: response, verdict: 'fail' };
  return { ok: false, value: response, verdict: 'unknown' };
}

// Map channel booleans -> LED color command using the config commandMap.
export function ledColorCommand(ledColorCfg, state) {
  const key = ledColorCfg.channels.map((c) => (state[c.id] ? '1' : '0')).join('');
  return ledColorCfg.commandMap[key] || ledColorCfg.commandMap['000'];
}
