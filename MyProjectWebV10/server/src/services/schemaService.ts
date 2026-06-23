import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDatabaseUrl, getPrismaProvider, type DatabaseConfig, type DbProvider } from '../config/database.js';
import { ensureWebExtensionTables, ensureWinScheduleSchemaUpgrades, hasWinScheduleTables } from './winDatabaseSchema.js';
import { formatDatabaseConnectionError } from '../utils/databaseErrors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '../../prisma/schema.prisma');
const SERVER_ROOT = join(__dirname, '../..');

const DATASOURCE_PROVIDER_PATTERN =
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"[^"]+"/s;

export function updatePrismaProvider(provider: DbProvider): void {
  const prismaProvider = getPrismaProvider({
    provider,
    database: '',
    host: '',
    port: 0,
    user: '',
    password: '',
  });

  const content = readFileSync(SCHEMA_PATH, 'utf8');
  if (!DATASOURCE_PROVIDER_PATTERN.test(content)) {
    throw new Error('Failed to update Prisma provider in schema.prisma');
  }

  const updated = content.replace(
    DATASOURCE_PROVIDER_PATTERN,
    `$1"${prismaProvider}"`,
  );

  if (updated !== content) {
    writeFileSync(SCHEMA_PATH, updated, 'utf8');
  }
}

function runPrismaDbPush(databaseUrl: string): void {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  try {
    execSync('npx prisma db push --skip-generate', {
      cwd: SERVER_ROOT,
      env,
      stdio: 'pipe',
      shell,
      encoding: 'utf8',
    });
  } catch (error) {
    const output =
      error && typeof error === 'object' && 'stdout' in error
        ? `${String((error as { stdout?: string }).stdout ?? '')}${String((error as { stderr?: string }).stderr ?? '')}`
        : '';
    const detail = output.trim() || formatDatabaseConnectionError(error);
    throw new Error(`Prisma schema sync failed: ${detail}`);
  }
}

/**
 * Applies schema for the configured database.
 * When MyProjectWinV10 schedule tables already exist, only web extension tables
 * (mp_users, mp_user_project_view_settings) are added. Schedule data is never reset.
 */
export async function applyDatabaseSchema(config: DatabaseConfig): Promise<void> {
  const databaseUrl = buildDatabaseUrl(config);
  const winScheduleExists = await hasWinScheduleTables(config);

  if (winScheduleExists) {
    await ensureWinScheduleSchemaUpgrades(config);
    await ensureWebExtensionTables(config);
  } else {
    runPrismaDbPush(databaseUrl);
  }
}
