import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { getDatabaseStatus } from '../lib/prisma.js';
import { getBootstrapAdminUsername } from './bootstrapAdmin.js';
import {
  authenticateBootstrapAdmin,
  ensureDefaultAdminUser,
  findUserByUsername,
} from './userService.js';
import { hashPassword, verifyPassword } from './settingsStore.js';
import { normalizePermissions, canRead as hasRead, canModify as hasModify } from './permissions.js';

const TOKEN_COOKIE = 'myproject_auth_token';
const TOKEN_TTL = '8h';

export type UserRole = 'admin' | 'user';

export interface UserSession {
  userId: number;
  username: string;
  role: UserRole;
  canRead: boolean;
  canModify: boolean;
  bootstrap?: boolean;
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? process.env.APP_SECRET ?? 'myproject-jwt-dev-secret';
}

export function createAuthToken(session: UserSession): string {
  return jwt.sign(session, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): UserSession | null {
  try {
    return jwt.verify(token, getJwtSecret()) as UserSession;
  } catch {
    return null;
  }
}

function sessionFromDbUser(user: {
  id: number;
  username: string;
  role: string;
  canRead: boolean;
  canModify: boolean;
}): UserSession {
  const role = user.role as UserRole;
  const permissions = normalizePermissions(user.canRead, user.canModify, role);
  return {
    userId: user.id,
    username: user.username,
    role,
    canRead: permissions.canRead,
    canModify: permissions.canModify,
  };
}

function bootstrapSession(): UserSession {
  return {
    userId: 0,
    username: getBootstrapAdminUsername(),
    role: 'admin',
    canRead: true,
    canModify: true,
    bootstrap: true,
  };
}

async function tryDatabaseLogin(username: string, password: string): Promise<UserSession | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;
  if (!user.isActive) return null;

  if (verifyPassword(password, user.passwordHash)) {
    return sessionFromDbUser(user);
  }

  // Recovery: default admin + bootstrap password resets a mismatched DB hash.
  if (
    user.role === 'admin' &&
    username === getBootstrapAdminUsername() &&
    authenticateBootstrapAdmin(username, password)
  ) {
    const { prisma } = await import('../lib/prisma.js');
    const updated = await prisma.mpUser.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    });
    return sessionFromDbUser(updated);
  }

  return null;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<UserSession | null> {
  const normalizedUsername = username.trim();
  if (!normalizedUsername || !password) return null;

  if (getDatabaseStatus().connected) {
    try {
      const dbSession = await tryDatabaseLogin(normalizedUsername, password);
      if (dbSession) return dbSession;
    } catch (error) {
      console.warn('Database login failed, trying bootstrap fallback:', error);
    }

    if (authenticateBootstrapAdmin(normalizedUsername, password)) {
      try {
        await ensureDefaultAdminUser();
        const seeded = await tryDatabaseLogin(normalizedUsername, password);
        if (seeded) return seeded;
      } catch (error) {
        console.warn('Failed to seed admin user after bootstrap login:', error);
      }
      return bootstrapSession();
    }

    return null;
  }

  if (!authenticateBootstrapAdmin(normalizedUsername, password)) {
    return null;
  }

  return bootstrapSession();
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(TOKEN_COOKIE);
  res.clearCookie('myproject_admin_token');
}

export function getTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const cookieName of [TOKEN_COOKIE, 'myproject_admin_token']) {
    const match = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`));
    if (match) {
      return decodeURIComponent(match.slice(cookieName.length + 1));
    }
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Login required' });
    return;
  }
  const session = verifyAuthToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  req.user = session;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Admin login required' });
    return;
  }
  const session = verifyAuthToken(token);
  if (!session || session.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required' });
    return;
  }
  req.user = session;
  next();
}

export function requireRead(req: Request, res: Response, next: NextFunction): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Login required' });
    return;
  }
  const session = verifyAuthToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  if (!hasRead(session)) {
    res.status(403).json({ error: 'Read permission required' });
    return;
  }
  req.user = session;
  next();
}

export function requireModify(req: Request, res: Response, next: NextFunction): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Login required' });
    return;
  }
  const session = verifyAuthToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  if (!hasModify(session)) {
    res.status(403).json({ error: 'Modify permission required' });
    return;
  }
  req.user = session;
  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

export { TOKEN_COOKIE };
