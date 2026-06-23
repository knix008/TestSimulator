import type { DatabaseConfig, DbProvider } from '../config/database.js';
import { buildDatabaseUrl } from '../config/database.js';
import {
  ensureDatabaseExists,
  testDatabaseConnection,
  type DatabaseApplyResult,
} from './databaseConnectionService.js';
import { applyDatabaseSchema, updatePrismaProvider } from './schemaService.js';
import { reconnectPrisma, getDatabaseStatus, setDatabaseStatus } from '../lib/prisma.js';
import {
  fromDatabaseConfig,
  loadAppSettings,
  saveAppSettings,
  toDatabaseConfig,
} from './settingsStore.js';
import { ensureDefaultAdminUser } from './userService.js';
import { formatDatabaseConnectionError } from '../utils/databaseErrors.js';
import {
  isPrismaClientReady,
  isPrismaGenerateLockError,
} from '../lib/prismaClientFiles.js';

export async function initializeDatabaseFromSettings(): Promise<DatabaseApplyResult | null> {
  try {
    const settings = loadAppSettings();
    const config = toDatabaseConfig(settings.database);
    return await applyDatabaseSettings(config, { persist: false });
  } catch (error) {
    const message = formatDatabaseConnectionError(error);
    setDatabaseStatus(false, message);
    console.warn(`Database not ready: ${message}`);
    return null;
  }
}

export async function applyDatabaseSettings(
  config: DatabaseConfig,
  options: { persist?: boolean } = { persist: true },
): Promise<DatabaseApplyResult> {
  try {
    const databaseCreated = await ensureDatabaseExists(config);
    const databaseUrl = buildDatabaseUrl(config);

    process.env.DATABASE_URL = databaseUrl;
    process.env.DB_PROVIDER = config.provider;
    process.env.DB_HOST = config.host;
    process.env.DB_PORT = String(config.port);
    process.env.DB_NAME = config.database;
    process.env.DB_USER = config.user;
    process.env.DB_PASSWORD = config.password;
    if (config.file) process.env.DB_FILE = config.file;

    updatePrismaProvider(config.provider);
    try {
      await applyDatabaseSchema(config);
    } catch (error) {
      if (isPrismaGenerateLockError(error) && isPrismaClientReady()) {
        console.warn(
          'Ignored Prisma generate lock during schema apply; using the existing client.',
        );
      } else {
        throw error;
      }
    }
    await reconnectPrisma();
    await ensureDefaultAdminUser();

    if (options.persist !== false) {
      const settings = loadAppSettings();
      settings.database = fromDatabaseConfig(
        config,
        config.password ? undefined : settings.database.encryptedPassword,
      );
      saveAppSettings(settings);
    }

    setDatabaseStatus(true);
    const message = databaseCreated
      ? `데이터베이스 '${config.database}'를 생성하고 스키마를 적용했습니다.`
      : `MyProjectWinV10 데이터베이스 '${config.database}'에 연결하고 웹 전용 테이블을 확인했습니다.`;

    return {
      databaseCreated,
      schemaApplied: true,
      message,
    };
  } catch (error) {
    if (isPrismaGenerateLockError(error) && isPrismaClientReady()) {
      console.warn(
        'Ignored Prisma generate lock during database apply; using the existing client.',
      );
      try {
        await reconnectPrisma();
        await ensureDefaultAdminUser();
        if (options.persist !== false) {
          const settings = loadAppSettings();
          settings.database = fromDatabaseConfig(
            config,
            config.password ? undefined : settings.database.encryptedPassword,
          );
          saveAppSettings(settings);
        }
        setDatabaseStatus(true);
        return {
          databaseCreated: false,
          schemaApplied: true,
          message: `MyProjectWinV10 데이터베이스 '${config.database}'에 연결했습니다.`,
        };
      } catch (recoveryError) {
        error = recoveryError;
      }
    }
    const message = formatDatabaseConnectionError(error);
    setDatabaseStatus(false, message);
    throw new Error(message);
  }
}

export async function testDatabaseSettings(config: DatabaseConfig): Promise<DatabaseApplyResult> {
  return testDatabaseConnection(config);
}

export function getActiveDatabaseConfig(): DatabaseConfig {
  const settings = loadAppSettings();
  return toDatabaseConfig(settings.database);
}

export function getDatabaseConnectionInfo() {
  const config = getActiveDatabaseConfig();
  const status = getDatabaseStatus();
  return {
    provider: config.provider,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    file: config.file,
    hasPassword: Boolean(config.password),
    connected: status.connected,
    connectionError: status.error,
  };
}

export function getDefaultPortForProvider(provider: DbProvider): number {
  switch (provider) {
    case 'postgresql':
      return 5432;
    case 'sqlserver':
      return 1433;
    case 'sqlite':
      return 0;
    default:
      return 3306;
  }
}
