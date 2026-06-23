import { Router } from 'express';
import { z } from 'zod';
import { SUPPORTED_DB_PROVIDERS, getProviderDisplayName, type DbProvider } from '../config/database.js';
import { requireAdmin } from '../services/authService.js';
import {
  applyDatabaseSettings,
  getActiveDatabaseConfig,
  getDatabaseConnectionInfo,
  getDefaultPortForProvider,
  testDatabaseSettings,
} from '../services/databaseManager.js';
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from '../services/userService.js';
import { requireDatabase } from '../lib/prisma.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const dbSettingsSchema = z.object({
  provider: z.enum(['mariadb', 'mysql', 'sqlite', 'postgresql', 'sqlserver']),
  host: z.string().trim().min(1).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  database: z.string().trim().min(1).max(128),
  user: z.string().optional(),
  password: z.string().optional(),
  file: z.string().optional(),
});

function normalizeDbSettings(body: z.infer<typeof dbSettingsSchema>) {
  const provider = body.provider as DbProvider;
  const port = body.port ?? getDefaultPortForProvider(provider);
  return {
    provider,
    host: body.host ?? (provider === 'sqlite' ? '' : 'localhost'),
    port,
    database: body.database,
    user: body.user ?? (provider === 'sqlite' ? '' : provider === 'postgresql' ? 'postgres' : provider === 'sqlserver' ? 'sa' : 'root'),
    password: body.password ?? '',
    file: body.file,
  };
}

/** Keep stored password when the form leaves the field blank (empty string). */
function resolveDatabasePassword(
  bodyPassword: string | undefined,
  current: ReturnType<typeof getActiveDatabaseConfig>,
): string {
  if (bodyPassword != null && bodyPassword.length > 0) {
    return bodyPassword;
  }
  return current.password;
}

adminRouter.get('/database', (_req, res) => {
  const info = getDatabaseConnectionInfo();
  res.json({
    provider: info.provider,
    providerDisplayName: getProviderDisplayName(info.provider),
    host: info.host,
    port: info.port,
    database: info.database,
    user: info.user,
    file: info.file,
    hasPassword: info.hasPassword,
    connected: info.connected,
    connectionError: info.connectionError,
    supportedProviders: SUPPORTED_DB_PROVIDERS.map((p) => ({
      id: p,
      name: getProviderDisplayName(p),
      defaultPort: getDefaultPortForProvider(p),
    })),
  });
});

adminRouter.post('/database/test', async (req, res, next) => {
  try {
    const body = dbSettingsSchema.parse(req.body ?? {});
    const current = getActiveDatabaseConfig();
    const config = normalizeDbSettings({
      ...body,
      password: resolveDatabasePassword(body.password, current),
    });

    const result = await testDatabaseSettings(config);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/database', async (req, res, next) => {
  try {
    const body = dbSettingsSchema.parse(req.body ?? {});
    const current = getActiveDatabaseConfig();
    const config = normalizeDbSettings({
      ...body,
      password: resolveDatabasePassword(body.password, current),
    });

    const result = await applyDatabaseSettings(config);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const createUserSchema = z.object({
  username: z.string().trim().min(2).max(64),
  displayName: z.string().trim().max(128).optional(),
  email: z.union([z.string().trim().email().max(256), z.literal('')]).optional(),
  password: z.string().min(4).max(128),
  role: z.enum(['admin', 'user']),
  canRead: z.boolean().optional(),
  canModify: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z.object({
  username: z.string().trim().min(2).max(64).optional(),
  displayName: z.string().trim().max(128).optional(),
  email: z.union([z.string().trim().email().max(256), z.literal('')]).optional(),
  password: z.string().min(4).max(128).optional(),
  role: z.enum(['admin', 'user']).optional(),
  canRead: z.boolean().optional(),
  canModify: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get('/users', requireDatabase, async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users', requireDatabase, async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body ?? {});
    const user = await createUser(body);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/users/:id', requireDatabase, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateUserSchema.parse(req.body ?? {});
    const user = await updateUser(id, body, req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/users/:id', requireDatabase, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const currentUserId = req.user?.userId ?? -1;
    await deleteUser(id, currentUserId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
