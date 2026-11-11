// Users, passwords (scrypt) and sessions.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { newId, newToken } from '../ids.js';
import { AppError, NotFoundError, UnauthorizedError, ValidationError, ForbiddenError, check } from '../errors.js';
import { toApi, fromApi, requireUser, requireAdmin, isAdmin, emit, nowOf, requireText } from './common.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const SESSION_DAYS = 30;

/** 'scrypt$N$r$p$salt$hash' (base64). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scryptAsync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function publicUser(row) {
  if (!row) return null;
  const u = toApi('users', row);
  return u;
}

export function createUsers(core) {
  const db = () => core.db;

  async function load(id) {
    const row = await db().get('SELECT * FROM "users" WHERE "id" = ?', [id]);
    if (!row) throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    return row;
  }

  function checkPassword(pw) {
    check(typeof pw === 'string' && pw.length >= 4, 'PASSWORD_TOO_SHORT', 'The password must have at least 4 characters');
  }

  const svc = {
    hashPassword,
    verifyPassword,

    async list(ctx, q = {}) {
      requireUser(ctx);
      const rows = await db().select('users', q.all ? {} : { active: 1 }, { order: 'display_name' });
      return rows.map(publicUser);
    },

    async get(ctx, id) {
      requireUser(ctx);
      return publicUser(await load(id));
    },

    async count() { return db().count('users'); },

    /**
     * Create a user. Allowed for admins, or for anyone when no user exists yet (first-run setup).
     * @param {object} body { username, displayName, email?, password?, role?, avatar? }
     */
    async create(ctx, body, { bootstrap = false } = {}) {
      if (!bootstrap) requireAdmin(ctx);
      const username = requireText(body?.username, 'username', 64).toLowerCase();
      check(USERNAME_RE.test(username), 'INVALID_USERNAME', 'Usernames use letters, digits, dot, dash and underscore');
      if (await db().get('SELECT "id" FROM "users" WHERE "username" = ?', [username])) {
        throw new AppError('USERNAME_TAKEN', 'This username is already used', 409);
      }
      const patch = fromApi('users', body, ['email', 'avatar', 'role', 'prefs']);
      if (patch.role) check(['admin', 'user'].includes(patch.role), 'INVALID_ROLE', 'Role must be admin or user');
      let password_hash = null;
      if (body.password != null && body.password !== '') { checkPassword(body.password); password_hash = await hashPassword(body.password); }
      const row = await db().insert('users', {
        ...patch, id: newId(), username, display_name: requireText(body.displayName ?? body.display_name ?? username, 'displayName', 200),
        password_hash, active: body.active === false ? 0 : 1, created_at: nowOf(ctx), updated_at: nowOf(ctx),
      });
      emit(core, ctx, 'user.created', ['users'], { id: row.id, rev: row.rev, data: publicUser(row) });
      return publicUser(row);
    },

    /** Users edit themselves (except role/active); admins edit anyone. */
    async update(ctx, id, body) {
      const me = requireUser(ctx);
      const self = me && me.id === id;
      if (!self) requireAdmin(ctx);
      const existing = await load(id);
      const allowed = ['display_name', 'email', 'avatar', 'prefs'];
      if (isAdmin(ctx)) allowed.push('role', 'active');
      const patch = fromApi('users', body, allowed);
      if (patch.role) check(['admin', 'user'].includes(patch.role), 'INVALID_ROLE', 'Role must be admin or user');
      if (patch.display_name !== undefined) patch.display_name = requireText(patch.display_name, 'displayName', 200);
      if (body.username !== undefined && isAdmin(ctx)) {
        const username = requireText(body.username, 'username', 64).toLowerCase();
        check(USERNAME_RE.test(username), 'INVALID_USERNAME', 'Usernames use letters, digits, dot, dash and underscore');
        const other = await db().get('SELECT "id" FROM "users" WHERE "username" = ? AND "id" <> ?', [username, id]);
        if (other) throw new AppError('USERNAME_TAKEN', 'This username is already used', 409);
        patch.username = username;
      }
      if ((patch.role === 'user' || patch.active === 0) && existing.role === 'admin') await ensureAnotherAdmin(id);
      const row = await db().update('users', id, patch, { rev: body?.rev });
      if (patch.active === 0) await db().remove('sessions', { user_id: id });
      emit(core, ctx, 'user.updated', ['users'], { id, rev: row.rev, data: publicUser(row) });
      return publicUser(row);
    },

    /** Users are deactivated, not deleted (history and issues keep pointing at them). */
    async remove(ctx, id) {
      requireAdmin(ctx);
      const existing = await load(id);
      if (existing.role === 'admin') await ensureAnotherAdmin(id);
      await db().update('users', id, { active: 0 });
      await db().remove('sessions', { user_id: id });
      emit(core, ctx, 'user.deleted', ['users'], { id });
      return { ok: true };
    },

    /** Change a password: own (needs the current one unless none is set) or, for admins, anyone's. */
    async setPassword(ctx, { userId, currentPassword, newPassword }) {
      const me = requireUser(ctx);
      const id = userId || me.id;
      const row = await load(id);
      if (id !== me?.id) requireAdmin(ctx);
      else if (row.password_hash && !(await verifyPassword(currentPassword || '', row.password_hash))) {
        throw new ValidationError('WRONG_PASSWORD', 'The current password is wrong');
      }
      checkPassword(newPassword);
      const row2 = await db().update('users', id, { password_hash: await hashPassword(newPassword) });
      emit(core, ctx, 'user.updated', ['users'], { id, rev: row2.rev, data: publicUser(row2) });
      return { ok: true };
    },

    // ---- sessions -------------------------------------------------------------------------------------------
    async login({ username, password }, { days = SESSION_DAYS } = {}) {
      const name = String(username || '').trim().toLowerCase();
      const row = await db().get('SELECT * FROM "users" WHERE "username" = ? OR LOWER("email") = ?', [name, name]);
      if (!row || !Number(row.active) || !(await verifyPassword(password || '', row.password_hash))) {
        throw new UnauthorizedError('BAD_LOGIN', 'Wrong username or password');
      }
      return { ...(await svc.createSession(row.id, days)), user: publicUser(row) };
    },

    async createSession(userId, days = SESSION_DAYS) {
      const token = newToken(32);
      const expires_at = Date.now() + days * 86400000;
      await db().insert('sessions', { token, user_id: userId, expires_at, created_at: Date.now() });
      return { token, expiresAt: expires_at };
    },

    /** User row for a session token, or null. Expired sessions are removed. */
    async sessionUser(token) {
      if (!token) return null;
      const s = await db().get('SELECT * FROM "sessions" WHERE "token" = ?', [token]);
      if (!s) return null;
      if (s.expires_at < Date.now()) { await db().remove('sessions', { token }); return null; }
      const u = await db().get('SELECT * FROM "users" WHERE "id" = ?', [s.user_id]);
      return u && Number(u.active) ? u : null;
    },

    async logout(token) { if (token) await db().remove('sessions', { token }); return { ok: true }; },

    async pruneSessions() { return db().run('DELETE FROM "sessions" WHERE "expires_at" < ?', [Date.now()]); },

    /** Desktop: the local user (created on first start), i.e. the first active admin. */
    async ensureLocalUser(displayName = 'Me') {
      let row = await db().get('SELECT * FROM "users" WHERE "role" = ? AND "active" = 1 ORDER BY "created_at"', ['admin']);
      if (!row) {
        const u = await svc.create({ system: true }, { username: 'local', displayName, role: 'admin' }, { bootstrap: true });
        row = await db().get('SELECT * FROM "users" WHERE "id" = ?', [u.id]);
      }
      return row;
    },

    /** Desktop needs a login when the (shared) database has more than one active user with a password. */
    async needsLogin() {
      return Number(await db().value('SELECT COUNT(*) AS n FROM "users" WHERE "active" = 1 AND "password_hash" IS NOT NULL', [], 0)) > 1;
    },

    raw: load,
  };

  async function ensureAnotherAdmin(id) {
    const n = Number(await db().value('SELECT COUNT(*) AS n FROM "users" WHERE "role" = ? AND "active" = 1 AND "id" <> ?', ['admin', id], 0));
    if (!n) throw new ForbiddenError('LAST_ADMIN', 'At least one active administrator must remain');
  }

  return svc;
}
