// Connection profiles: profiles.json next to session.json.
//
//   [{ name, protocol: 'FTP' | 'FTPS' | 'SFTP', host, port, user, password }]
//
// Passwords are stored obfuscated (base64 with a marker) so they are not
// readable at a glance — that is NOT encryption; the file has the same
// protection as the WinForms original's profiles.json (none beyond the OS
// user account). The API never sends the password back to the UI in the
// clear unless the profile is loaded into the connection form.
'use strict';

const fs = require('fs');
const path = require('path');

const PROTOCOLS = ['FTP', 'FTPS', 'SFTP'];
const MARK = 'b64:';

function hide(pw) { return pw ? MARK + Buffer.from(String(pw), 'utf8').toString('base64') : ''; }
function reveal(pw) {
  if (!pw) return '';
  if (!String(pw).startsWith(MARK)) return String(pw);           // a plain file from an earlier build
  try { return Buffer.from(String(pw).slice(MARK.length), 'base64').toString('utf8'); } catch { return ''; }
}

function normalize(p) {
  const protocol = PROTOCOLS.includes(String(p.protocol).toUpperCase()) ? String(p.protocol).toUpperCase() : 'FTP';
  return {
    name: String(p.name || '').trim(),
    protocol,
    host: String(p.host || '').trim(),
    port: String(p.port || '').trim(),
    user: String(p.user || '').trim(),
    password: String(p.password || ''),
  };
}

class Profiles {
  constructor(configDir) {
    this.file = path.join(configDir, 'profiles.json');
    this.items = [];
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.items = Array.isArray(raw) ? raw.map((p) => normalize({ ...p, password: reveal(p.password) })).filter((p) => p.name) : [];
    } catch {
      this.items = [];
    }
    return this.list();
  }

  list() {
    return this.items.map((p) => ({ ...p }));
  }

  // Adds or replaces (same name) a profile. Returns the stored list.
  save(profile) {
    const p = normalize(profile);
    if (!p.name) throw Object.assign(new Error('Profile name is required'), { code: 'PROFILE_NAME' });
    const i = this.items.findIndex((x) => x.name === p.name);
    const replaced = i >= 0;
    if (replaced) this.items[i] = p; else this.items.push(p);
    this._write();
    return { profiles: this.list(), replaced };
  }

  remove(names) {
    const set = new Set((names || []).map(String));
    const before = this.items.length;
    this.items = this.items.filter((p) => !set.has(p.name));
    this._write();
    return { profiles: this.list(), removed: before - this.items.length };
  }

  _write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const out = this.items.map((p) => ({ ...p, password: hide(p.password) }));
    fs.writeFileSync(this.file, JSON.stringify(out, null, 2), 'utf-8');
  }
}

module.exports = { Profiles, PROTOCOLS, hide, reveal };
