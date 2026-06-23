import { Router } from 'express';
import { z } from 'zod';
import {
  authenticateUser,
  clearAuthCookie,
  createAuthToken,
  getTokenFromRequest,
  requireAuth,
  setAuthCookie,
  verifyAuthToken,
} from '../services/authService.js';
import { getDatabaseStatus } from '../lib/prisma.js';
import { getUserById, updateOwnProfile } from '../services/userService.js';
import { normalizePermissions } from '../services/permissions.js';
import type { UserRole } from '../services/userService.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  currentPassword: z.string().min(1),
  username: z.string().trim().min(2).max(64).optional(),
  password: z.string().min(4).max(128).optional(),
  displayName: z.string().trim().max(128).optional(),
  email: z.union([z.string().trim().email().max(256), z.literal('')]).optional(),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body ?? {});
    const session = await authenticateUser(body.username, body.password);
    if (!session) {
      res.status(401).json({ error: '사용자 이름 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    const token = createAuthToken(session);
    setAuthCookie(res, token);
    res.json({
      userId: session.userId,
      username: session.username,
      role: session.role,
      canRead: session.canRead,
      canModify: session.canModify,
      bootstrap: session.bootstrap ?? false,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.json({ authenticated: false });
    return;
  }
  const session = verifyAuthToken(token);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    userId: session.userId,
    username: session.username,
    role: session.role,
    canRead: session.canRead,
    canModify: session.canModify,
    isAdmin: session.role === 'admin',
    bootstrap: session.bootstrap ?? false,
  });
});

authRouter.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const session = req.user!;

    if (session.bootstrap || session.userId === 0 || !getDatabaseStatus().connected) {
      res.json({
        id: 0,
        username: session.username,
        displayName: 'Administrator',
        email: '',
        role: session.role,
        canRead: session.canRead,
        canModify: session.canModify,
        isActive: true,
        bootstrap: true,
        storedInDatabase: false,
      });
      return;
    }

    const user = await getUserById(session.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ ...user, bootstrap: false, storedInDatabase: true });
  } catch (error) {
    next(error);
  }
});

authRouter.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const session = req.user!;
    const body = updateProfileSchema.parse(req.body ?? {});

    if (session.bootstrap || session.userId === 0 || !getDatabaseStatus().connected) {
      res.status(400).json({
        error: 'DB 연결 후 mp_users에 저장된 계정으로 로그인해야 ID와 비밀번호를 변경할 수 있습니다.',
      });
      return;
    }

    const updated = await updateOwnProfile(session.userId, body);
    const permissions = normalizePermissions(updated.canRead, updated.canModify, updated.role as UserRole);
    const newSession = {
      userId: updated.id,
      username: updated.username,
      role: updated.role,
      canRead: permissions.canRead,
      canModify: permissions.canModify,
    };
    setAuthCookie(res, createAuthToken(newSession));

    res.json({ ...updated, bootstrap: false, storedInDatabase: true });
  } catch (error) {
    next(error);
  }
});
