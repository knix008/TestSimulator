import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import {
  authenticateUser,
  createUser,
  deleteUser,
  getDatabaseConfigInfo,
  getUserById,
  listUsers,
  updateOwnProfile,
  updateUser,
} from './userService';
import {
  getSession,
  requireAdminSession,
  requireSession,
  setSession,
} from './sessionManager';
import type { CreateUserInput, UpdateOwnProfileInput, UpdateUserInput } from './userTypes';

function authError(message: string): Error {
  return new Error(message);
}

export function registerAuthIpcHandlers(getUserDataPath: () => string): void {
  ipcMain.handle('auth:login', (_event, username: string, password: string) => {
    try {
      const session = authenticateUser(username, password);
      if (!session) {
        throw authError('사용자 이름 또는 비밀번호가 올바르지 않습니다.');
      }
      setSession(session);
      return {
        userId: session.userId,
        username: session.username,
        role: session.role,
        canRead: session.canRead,
        canModify: session.canModify,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Local database is not initialized')) {
        throw authError('사용자 데이터베이스를 초기화하지 못했습니다. 앱을 재시작해 주세요.');
      }
      throw error;
    }
  });

  ipcMain.handle('auth:logout', () => {
    setSession(null);
    return { ok: true };
  });

  ipcMain.handle('auth:session', () => {
    const session = getSession();
    if (!session) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      userId: session.userId,
      username: session.username,
      role: session.role,
      canRead: session.canRead,
      canModify: session.canModify,
      isAdmin: session.role === 'admin',
    };
  });

  ipcMain.handle('auth:profile', () => {
    const session = requireSession();
    const user = getUserById(session.userId);
    if (!user) {
      throw authError('User not found');
    }
    return { ...user, bootstrap: false, storedInDatabase: true };
  });

  ipcMain.handle('auth:update-profile', (_event, input: UpdateOwnProfileInput) => {
    const session = requireSession();
    const updated = updateOwnProfile(session.userId, input);
    setSession({
      userId: updated.id,
      username: updated.username,
      role: updated.role,
      canRead: updated.canRead,
      canModify: updated.canModify,
    });
    return { ...updated, bootstrap: false, storedInDatabase: true };
  });

  ipcMain.handle('auth:list-users', () => {
    requireAdminSession();
    return listUsers();
  });

  ipcMain.handle('auth:create-user', (_event, input: CreateUserInput) => {
    requireAdminSession();
    return createUser(input);
  });

  ipcMain.handle('auth:update-user', (_event, id: number, input: UpdateUserInput) => {
    const session = requireAdminSession();
    const updated = updateUser(id, input, session.userId);
    if (!updated) {
      throw authError('User not found');
    }
    if (session.userId === id) {
      setSession({
        userId: updated.id,
        username: updated.username,
        role: updated.role,
        canRead: updated.canRead,
        canModify: updated.canModify,
      });
    }
    return updated;
  });

  ipcMain.handle('auth:delete-user', (_event, id: number) => {
    const session = requireAdminSession();
    deleteUser(id, session.userId);
    return { ok: true };
  });

  ipcMain.handle('auth:database-config', () => {
    return getDatabaseConfigInfo(getUserDataPath());
  });

  ipcMain.handle('auth:startup-project', async () => {
    const userDataPath = getUserDataPath();
    const settingsPath = `${userDataPath}/settings.json`;
    let lastProjectPath: string | null = null;
    try {
      const raw = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(raw) as { lastProjectPath?: string | null };
      lastProjectPath = settings.lastProjectPath ?? null;
    } catch {
      lastProjectPath = null;
    }

    if (lastProjectPath) {
      try {
        await fs.access(lastProjectPath);
        return { filePath: lastProjectPath };
      } catch {
        lastProjectPath = null;
      }
    }

    return { filePath: null };
  });
}
