// Server settings + named profiles, kept as JSON in the app's config folder
// (the WinForms original: server_settings.json next to the exe, profiles/*.json).
//
//   <configDir>/server_settings.json   the current settings (saved on every change)
//   <configDir>/profiles/<name>.json   named snapshots of the same shape
//
// Keys are camelCase; files written by the original (PascalCase) load too.
// User passwords and the certificate password are stored with a "b64:"
// prefix — obfuscation, not encryption, exactly like the sibling client.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS_VERSION = 3;
const DEFAULT_PORTS = { ftp: 21, ftps: 990, sftp: 22 };

const DEFAULTS = Object.freeze({
  settingsVersion: SETTINGS_VERSION,
  sharedFolders: [],                   // [{ virtualName, physicalPath }]
  protocols: { enableFtp: true, enableFtps: false, enableSftp: false, ftpPort: 21, ftpsPort: 990, sftpPort: 22, explicitTls: true },
  bindAddress: '',                     // '' = every interface
  certPath: '',                        // FTPS: .pem (cert, or cert+key) or .pfx/.p12
  certKeyPath: '',                     // FTPS: separate private-key PEM (optional)
  certPassword: '',                    // .pfx password / encrypted key passphrase
  sftpHostKeyPath: '',                 // '' = <configDir>/ssh_host_rsa.pem
  allowAnonymous: true,
  users: [],                           // [{ username, password, canRead, canWrite }]
  bufferSizeKb: 64,
  maxConnections: 10,                  // per protocol; 0 = unlimited
  pasvPortMin: 0,                      // 0 = any free port
  pasvPortMax: 0,
  pasvAddress: '',                     // external IP announced in PASV replies ('' = the local address)
});

function defaultConfigDir(appName = 'My FTP Server') {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', appName);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName);
}

// ── password obfuscation ──
function encodeSecret(s) { return s ? 'b64:' + Buffer.from(String(s), 'utf8').toString('base64') : ''; }
function decodeSecret(s) {
  if (typeof s !== 'string') return '';
  if (!s.startsWith('b64:')) return s;
  try { return Buffer.from(s.slice(4), 'base64').toString('utf8'); } catch { return ''; }
}

// PascalCase (original) → camelCase, recursively.
function camelKeys(v) {
  if (Array.isArray(v)) return v.map(camelKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k.charAt(0).toLowerCase() + k.slice(1)] = camelKeys(val);
    return out;
  }
  return v;
}

const clampPort = (n, def) => { n = Number(n); return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : def; };
const int = (n, def, min = 0, max = 1e9) => { n = Number(n); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def; };

// Fills gaps with defaults and drops anything malformed — every loader and
// the API go through here, so the rest of the code can trust the shape.
function normalize(raw) {
  const s = camelKeys(raw && typeof raw === 'object' ? raw : {});
  const p = s.protocols && typeof s.protocols === 'object' ? s.protocols : {};
  // The original kept one user in userId/userPassword before it had a list.
  const users = Array.isArray(s.users) ? s.users : [];
  if (!users.length && s.userId) users.push({ username: s.userId, password: s.userPassword || '', canRead: true, canWrite: true });
  return {
    settingsVersion: SETTINGS_VERSION,
    sharedFolders: (Array.isArray(s.sharedFolders) ? s.sharedFolders : [])
      .map((f) => ({ virtualName: String(f && f.virtualName || '').replace(/^[\/\s]+|[\/\s]+$/g, ''), physicalPath: String(f && f.physicalPath || '').trim() }))
      .filter((f) => f.virtualName && f.physicalPath),
    protocols: {
      enableFtp: p.enableFtp !== undefined ? !!p.enableFtp : DEFAULTS.protocols.enableFtp,
      enableFtps: !!p.enableFtps,
      enableSftp: !!p.enableSftp,
      ftpPort: clampPort(p.ftpPort, DEFAULT_PORTS.ftp),
      ftpsPort: clampPort(p.ftpsPort, DEFAULT_PORTS.ftps),
      sftpPort: clampPort(p.sftpPort, DEFAULT_PORTS.sftp),
      explicitTls: p.explicitTls !== undefined ? !!p.explicitTls : DEFAULTS.protocols.explicitTls,
    },
    bindAddress: String(s.bindAddress || '').trim(),
    certPath: String(s.certPath || '').trim(),
    certKeyPath: String(s.certKeyPath || '').trim(),
    certPassword: decodeSecret(s.certPassword || ''),
    sftpHostKeyPath: String(s.sftpHostKeyPath || '').trim(),
    allowAnonymous: s.allowAnonymous !== undefined ? !!s.allowAnonymous : DEFAULTS.allowAnonymous,
    users: users
      .map((u) => ({ username: String(u && u.username || '').trim(), password: decodeSecret(u && u.password || ''), canRead: u && u.canRead !== undefined ? !!u.canRead : true, canWrite: u && u.canWrite !== undefined ? !!u.canWrite : true }))
      .filter((u) => u.username),
    bufferSizeKb: int(s.bufferSizeKb, DEFAULTS.bufferSizeKb, 4, 4096),
    maxConnections: int(s.maxConnections !== undefined ? s.maxConnections : s.maxThreads, DEFAULTS.maxConnections, 0, 10000),
    pasvPortMin: int(s.pasvPortMin, 0, 0, 65535),
    pasvPortMax: int(s.pasvPortMax, 0, 0, 65535),
    pasvAddress: String(s.pasvAddress || '').trim(),
  };
}

// The on-disk form: secrets obfuscated.
function toFile(settings) {
  const s = normalize(settings);
  return {
    ...s,
    certPassword: encodeSecret(s.certPassword),
    users: s.users.map((u) => ({ ...u, password: encodeSecret(u.password) })),
  };
}

const PROFILE_NAME = /^[^<>:"/\\|?*\x00-\x1f]{1,80}$/;

class Settings {
  constructor(configDir) {
    this.configDir = configDir || defaultConfigDir();
    this.file = path.join(this.configDir, 'server_settings.json');
    this.profilesDir = path.join(this.configDir, 'profiles');
    this.data = normalize({});
  }

  load() {
    try { this.data = normalize(JSON.parse(fs.readFileSync(this.file, 'utf-8'))); }
    catch { this.data = normalize({}); }
    return this.get();
  }

  get() { return normalize(this.data); }

  save(next) {
    this.data = normalize(next);
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(toFile(this.data), null, 2), 'utf-8');
    return this.get();
  }

  // ── profiles ──
  profileNames() {
    try {
      return fs.readdirSync(this.profilesDir).filter((f) => f.toLowerCase().endsWith('.json')).map((f) => f.slice(0, -5)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch { return []; }
  }

  profileFile(name) {
    if (!PROFILE_NAME.test(name || '')) { const e = new Error(`Invalid profile name: ${name}`); e.code = 'EINVAL'; throw e; }
    return path.join(this.profilesDir, `${name}.json`);
  }

  saveProfile(name, settings) {
    const file = this.profileFile(String(name || '').trim());
    fs.mkdirSync(this.profilesDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(toFile(settings), null, 2), 'utf-8');
    return this.profileNames();
  }

  loadProfile(name) {
    const file = this.profileFile(name);
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return normalize(raw);
  }

  deleteProfile(name) {
    const file = this.profileFile(name);
    try { fs.unlinkSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    return this.profileNames();
  }
}

module.exports = { Settings, normalize, toFile, DEFAULTS, DEFAULT_PORTS, SETTINGS_VERSION, defaultConfigDir, encodeSecret, decodeSecret };
