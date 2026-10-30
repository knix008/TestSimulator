// Login check shared by FTP, FTPS and SFTP.
//
//   anonymous  → allowed only when `allowAnonymous`; read-only, any password
//   user       → case-insensitive name, exact password; permissions from the entry
//
// Returns the session permissions or null when the login is refused.
'use strict';

const ANONYMOUS = { canRead: true, canWrite: false, anonymous: true };
const DENY = { canRead: false, canWrite: false };

function authenticate(username, password, { allowAnonymous = false, users = [] } = {}) {
  const name = String(username || '').trim();
  if (!name) return null;
  if (name.toLowerCase() === 'anonymous') return allowAnonymous ? { ...ANONYMOUS, user: 'anonymous' } : null;
  const u = users.find((x) => String(x.username || '').toLowerCase() === name.toLowerCase());
  if (!u) return null;
  if (String(u.password || '') !== String(password || '')) return null;
  const perms = { canRead: !!u.canRead, canWrite: !!u.canWrite, anonymous: false, user: u.username };
  return perms.canRead || perms.canWrite ? perms : null;
}

// "읽기+쓰기" style summary used in logs and the user table.
function permissionSummary(p, lang = 'ko') {
  const ko = { rw: '읽기+쓰기', r: '읽기', w: '쓰기', none: '없음' };
  const en = { rw: 'read+write', r: 'read', w: 'write', none: 'none' };
  const d = lang === 'en' ? en : ko;
  if (p.canRead && p.canWrite) return d.rw;
  if (p.canRead) return d.r;
  if (p.canWrite) return d.w;
  return d.none;
}

module.exports = { authenticate, permissionSummary, ANONYMOUS, DENY };
