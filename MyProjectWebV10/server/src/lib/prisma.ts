import { createRequire } from 'node:module';
import type { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl, type DatabaseConfig } from '../config/database.js';
import { loadAppSettings, toDatabaseConfig } from '../services/settingsStore.js';

const PrismaClientCtor = createRequire(import.meta.url)('@prisma/client')
  .PrismaClient as new () => PrismaClient;

let prismaInstance: PrismaClient | null = null;
let databaseReady = false;
let databaseError: string | null = null;

function resolveDatabaseUrl(config?: DatabaseConfig): string {
  if (config) {
    return buildDatabaseUrl(config);
  }
  const settings = loadAppSettings();
  return buildDatabaseUrl(toDatabaseConfig(settings.database));
}

function createClient(config?: DatabaseConfig): PrismaClient {
  process.env.DATABASE_URL = resolveDatabaseUrl(config);
  return new PrismaClientCtor();
}

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = createClient();
  }
  return prismaInstance;
}

/** @deprecated Use getPrisma() for dynamic reconnect support. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrisma(), property, receiver);
  },
});

export async function reconnectPrisma(config?: DatabaseConfig): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
  prismaInstance = createClient(config);
  await prismaInstance.$connect();
  databaseReady = true;
  databaseError = null;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

export function setDatabaseStatus(connected: boolean, error: string | null = null): void {
  databaseReady = connected;
  databaseError = error;
}

export function getDatabaseStatus(): { connected: boolean; error: string | null } {
  return { connected: databaseReady, error: databaseError };
}

export function requireDatabase(_req: unknown, res: import('express').Response, next: import('express').NextFunction): void {
  if (!databaseReady) {
    res.status(503).json({
      error: 'Database is not configured or unavailable',
      connectionError: databaseError,
      requiresAdminSetup: true,
    });
    return;
  }
  next();
}
