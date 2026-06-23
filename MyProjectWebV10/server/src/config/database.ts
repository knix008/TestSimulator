import { loadAppSettings, toDatabaseConfig } from '../services/settingsStore.js';

export type DbProvider = 'mariadb' | 'mysql' | 'sqlite' | 'postgresql' | 'sqlserver';

export interface DatabaseConfig {
  provider: DbProvider;
  database: string;
  host: string;
  port: number;
  user: string;
  password: string;
  file?: string;
}

const DEFAULT_DB_NAME = 'myproject';

export function getDatabaseConfig(): DatabaseConfig {
  try {
    return toDatabaseConfig(loadAppSettings().database);
  } catch {
    return getDatabaseConfigFromEnv();
  }
}

function getDatabaseConfigFromEnv(): DatabaseConfig {
  const provider = (process.env.DB_PROVIDER ?? 'mariadb').toLowerCase() as DbProvider;

  return {
    provider,
    database: process.env.DB_NAME ?? DEFAULT_DB_NAME,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? defaultPort(provider)),
    user: process.env.DB_USER ?? defaultUser(provider),
    password: process.env.DB_PASSWORD ?? '',
    file: process.env.DB_FILE,
  };
}

function defaultPort(provider: DbProvider): number {
  switch (provider) {
    case 'postgresql':
      return 5432;
    case 'sqlserver':
      return 1433;
    case 'sqlite':
      return 0;
    case 'mariadb':
    case 'mysql':
    default:
      return 3306;
  }
}

function defaultUser(provider: DbProvider): string {
  switch (provider) {
    case 'postgresql':
      return 'postgres';
    case 'sqlserver':
      return 'sa';
    case 'sqlite':
      return '';
    default:
      return 'root';
  }
}

/** Build a Prisma-compatible DATABASE_URL for the configured provider. */
export function buildDatabaseUrl(config: DatabaseConfig): string {
  const encodedPassword = encodeURIComponent(config.password);
  const encodedUser = encodeURIComponent(config.user);

  switch (config.provider) {
    case 'sqlite':
      return `file:${config.file ?? `./data/${config.database}.db`}`;
    case 'postgresql':
      return `postgresql://${encodedUser}:${encodedPassword}@${config.host}:${config.port}/${config.database}?schema=public`;
    case 'sqlserver':
      return `sqlserver://${config.host}:${config.port};database=${config.database};user=${encodedUser};password=${encodedPassword};encrypt=true;trustServerCertificate=true`;
    case 'mariadb':
    case 'mysql':
    default:
      return `mysql://${encodedUser}:${encodedPassword}@${config.host}:${config.port}/${config.database}`;
  }
}

export function getPrismaProvider(config: DatabaseConfig): string {
  switch (config.provider) {
    case 'sqlite':
      return 'sqlite';
    case 'postgresql':
      return 'postgresql';
    case 'sqlserver':
      return 'sqlserver';
    case 'mariadb':
    case 'mysql':
    default:
      return 'mysql';
  }
}

export function applyDatabaseEnv(): void {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = buildDatabaseUrl(getDatabaseConfig());
  }
}

export const SUPPORTED_DB_PROVIDERS: DbProvider[] = [
  'mariadb',
  'mysql',
  'sqlite',
  'postgresql',
  'sqlserver',
];

export function getProviderDisplayName(provider: DbProvider): string {
  switch (provider) {
    case 'mariadb':
      return 'MariaDB';
    case 'mysql':
      return 'MySQL';
    case 'sqlite':
      return 'SQLite';
    case 'postgresql':
      return 'PostgreSQL';
    case 'sqlserver':
      return 'SQL Server';
    default:
      return provider;
  }
}
