import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import pg from 'pg';
import sql from 'mssql';
import type { DatabaseConfig } from '../config/database.js';

/** True when MyProjectWinV10 schedule tables are already present. */
export async function hasWinScheduleTables(config: DatabaseConfig): Promise<boolean> {
  switch (config.provider) {
    case 'sqlite': {
      const path = resolve((config.file ?? `./data/${config.database}.db`).trim());
      if (!existsSync(path)) return false;
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const row = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mp_projects'")
          .get();
        return Boolean(row);
      } finally {
        db.close();
      }
    }
    case 'mariadb':
    case 'mysql': {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 10_000,
      });
      try {
        const [rows] = await connection.query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mp_projects'`,
          [config.database],
        );
        return Array.isArray(rows) && rows.length > 0;
      } finally {
        await connection.end();
      }
    }
    case 'postgresql': {
      const client = new pg.Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeoutMillis: 10_000,
      });
      await client.connect();
      try {
        const result = await client.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'mp_projects'`,
        );
        return result.rowCount !== null && result.rowCount > 0;
      } finally {
        await client.end();
      }
    }
    case 'sqlserver': {
      const pool = await sql.connect({
        server: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        options: { encrypt: true, trustServerCertificate: true },
        connectionTimeout: 10_000,
      });
      try {
        const result = await pool
          .request()
          .query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'mp_projects'`,
          );
        return result.recordset.length > 0;
      } finally {
        await pool.close();
      }
    }
    default:
      return false;
  }
}

const WEB_EXTENSION_STATEMENTS: Record<DatabaseConfig['provider'], string[]> = {
  mariadb: [
    `CREATE TABLE IF NOT EXISTS \`mp_users\` (
      \`id\` INTEGER NOT NULL AUTO_INCREMENT,
      \`username\` VARCHAR(64) NOT NULL,
      \`DisplayName\` VARCHAR(128) NOT NULL DEFAULT '',
      \`email\` VARCHAR(256) NOT NULL DEFAULT '',
      \`PasswordHash\` VARCHAR(256) NOT NULL,
      \`role\` VARCHAR(16) NOT NULL DEFAULT 'user',
      \`CanRead\` BOOLEAN NOT NULL DEFAULT true,
      \`CanModify\` BOOLEAN NOT NULL DEFAULT false,
      \`IsActive\` BOOLEAN NOT NULL DEFAULT true,
      \`CreatedUtc\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`UpdatedUtc\` DATETIME(3) NOT NULL,
      UNIQUE INDEX \`mp_users_username_key\`(\`username\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`mp_user_project_view_settings\` (
      \`UserId\` INTEGER NOT NULL,
      \`ProjectId\` INTEGER NOT NULL,
      \`ViewSettingsJson\` TEXT NOT NULL,
      \`UpdatedUtc\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`UserId\`, \`ProjectId\`),
      CONSTRAINT \`mp_user_project_view_settings_UserId_fkey\`
        FOREIGN KEY (\`UserId\`) REFERENCES \`mp_users\`(\`id\`)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`mp_user_project_view_settings_ProjectId_fkey\`
        FOREIGN KEY (\`ProjectId\`) REFERENCES \`mp_projects\`(\`Id\`)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
  mysql: [],
  sqlite: [
    `CREATE TABLE IF NOT EXISTS "mp_users" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "username" TEXT NOT NULL,
      "DisplayName" TEXT NOT NULL DEFAULT '',
      "email" TEXT NOT NULL DEFAULT '',
      "PasswordHash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'user',
      "CanRead" BOOLEAN NOT NULL DEFAULT true,
      "CanModify" BOOLEAN NOT NULL DEFAULT false,
      "IsActive" BOOLEAN NOT NULL DEFAULT true,
      "CreatedUtc" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "UpdatedUtc" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "mp_users_username_key" ON "mp_users"("username")`,
    `CREATE TABLE IF NOT EXISTS "mp_user_project_view_settings" (
      "UserId" INTEGER NOT NULL,
      "ProjectId" INTEGER NOT NULL,
      "ViewSettingsJson" TEXT NOT NULL,
      "UpdatedUtc" DATETIME NOT NULL,
      PRIMARY KEY ("UserId", "ProjectId"),
      FOREIGN KEY ("UserId") REFERENCES "mp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY ("ProjectId") REFERENCES "mp_projects"("Id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  ],
  postgresql: [
    `CREATE TABLE IF NOT EXISTS "mp_users" (
      "id" SERIAL NOT NULL,
      "username" VARCHAR(64) NOT NULL,
      "DisplayName" VARCHAR(128) NOT NULL DEFAULT '',
      "email" VARCHAR(256) NOT NULL DEFAULT '',
      "PasswordHash" VARCHAR(256) NOT NULL,
      "role" VARCHAR(16) NOT NULL DEFAULT 'user',
      "CanRead" BOOLEAN NOT NULL DEFAULT true,
      "CanModify" BOOLEAN NOT NULL DEFAULT false,
      "IsActive" BOOLEAN NOT NULL DEFAULT true,
      "CreatedUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "UpdatedUtc" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "mp_users_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "mp_users_username_key" ON "mp_users"("username")`,
    `CREATE TABLE IF NOT EXISTS "mp_user_project_view_settings" (
      "UserId" INTEGER NOT NULL,
      "ProjectId" INTEGER NOT NULL,
      "ViewSettingsJson" TEXT NOT NULL,
      "UpdatedUtc" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "mp_user_project_view_settings_pkey" PRIMARY KEY ("UserId", "ProjectId"),
      CONSTRAINT "mp_user_project_view_settings_UserId_fkey"
        FOREIGN KEY ("UserId") REFERENCES "mp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "mp_user_project_view_settings_ProjectId_fkey"
        FOREIGN KEY ("ProjectId") REFERENCES "mp_projects"("Id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  ],
  sqlserver: [
    `IF OBJECT_ID(N'mp_users', N'U') IS NULL
     CREATE TABLE [mp_users] (
       [id] INT NOT NULL IDENTITY(1,1),
       [username] NVARCHAR(64) NOT NULL,
       [DisplayName] NVARCHAR(128) NOT NULL CONSTRAINT [mp_users_DisplayName_df] DEFAULT '',
       [email] NVARCHAR(256) NOT NULL CONSTRAINT [mp_users_email_df] DEFAULT '',
       [PasswordHash] NVARCHAR(256) NOT NULL,
       [role] NVARCHAR(16) NOT NULL CONSTRAINT [mp_users_role_df] DEFAULT 'user',
       [CanRead] BIT NOT NULL CONSTRAINT [mp_users_CanRead_df] DEFAULT 1,
       [CanModify] BIT NOT NULL CONSTRAINT [mp_users_CanModify_df] DEFAULT 0,
       [IsActive] BIT NOT NULL CONSTRAINT [mp_users_IsActive_df] DEFAULT 1,
       [CreatedUtc] DATETIME2 NOT NULL CONSTRAINT [mp_users_CreatedUtc_df] DEFAULT CURRENT_TIMESTAMP,
       [UpdatedUtc] DATETIME2 NOT NULL,
       CONSTRAINT [mp_users_pkey] PRIMARY KEY ([id])
     )`,
    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'mp_users_username_key' AND object_id = OBJECT_ID('mp_users'))
     CREATE UNIQUE INDEX [mp_users_username_key] ON [mp_users]([username])`,
    `IF OBJECT_ID(N'mp_user_project_view_settings', N'U') IS NULL
     CREATE TABLE [mp_user_project_view_settings] (
       [UserId] INT NOT NULL,
       [ProjectId] INT NOT NULL,
       [ViewSettingsJson] NVARCHAR(MAX) NOT NULL,
       [UpdatedUtc] DATETIME2 NOT NULL,
       CONSTRAINT [mp_user_project_view_settings_pkey] PRIMARY KEY ([UserId], [ProjectId]),
       CONSTRAINT [mp_user_project_view_settings_UserId_fkey]
         FOREIGN KEY ([UserId]) REFERENCES [mp_users]([id]) ON DELETE CASCADE,
       CONSTRAINT [mp_user_project_view_settings_ProjectId_fkey]
         FOREIGN KEY ([ProjectId]) REFERENCES [mp_projects]([Id]) ON DELETE CASCADE
     )`,
  ],
};

WEB_EXTENSION_STATEMENTS.mysql = WEB_EXTENSION_STATEMENTS.mariadb;

/** Same incremental upgrades as MyProjectWinV10 DatabaseConnectionFactory.UpgradeSchema. */
const WIN_SCHEDULE_UPGRADE_STATEMENTS: Record<DatabaseConfig['provider'], string[]> = {
  mariadb: ['ALTER TABLE `mp_projects` ADD COLUMN `UpdatedBy` VARCHAR(256) NULL'],
  mysql: ['ALTER TABLE `mp_projects` ADD COLUMN `UpdatedBy` VARCHAR(256) NULL'],
  sqlite: ['ALTER TABLE mp_projects ADD COLUMN UpdatedBy TEXT NULL'],
  postgresql: ['ALTER TABLE mp_projects ADD COLUMN "UpdatedBy" VARCHAR(256) NULL'],
  sqlserver: ['ALTER TABLE mp_projects ADD UpdatedBy NVARCHAR(256) NULL'],
};

function isIgnorableSchemaUpgradeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Duplicate column') ||
    message.includes('duplicate column') ||
    message.includes('ER_DUP_FIELDNAME') ||
    message.includes('already exists')
  );
}

async function runDatabaseStatements(
  config: DatabaseConfig,
  statements: string[],
  options: { ignoreUpgradeErrors?: boolean } = {},
): Promise<void> {
  if (!statements.length) {
    throw new Error(`SQL statements are not defined for provider: ${config.provider}`);
  }

  const execute = async (statement: string) => {
    try {
      await executeDatabaseStatement(config, statement);
    } catch (error) {
      if (options.ignoreUpgradeErrors && isIgnorableSchemaUpgradeError(error)) {
        return;
      }
      throw error;
    }
  };

  for (const statement of statements) {
    await execute(statement);
  }
}

async function executeDatabaseStatement(config: DatabaseConfig, statement: string): Promise<void> {
  switch (config.provider) {
    case 'sqlite': {
      const path = resolve((config.file ?? `./data/${config.database}.db`).trim());
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path);
      try {
        db.exec(statement);
      } finally {
        db.close();
      }
      break;
    }
    case 'mariadb':
    case 'mysql': {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 10_000,
      });
      try {
        await connection.query(statement);
      } finally {
        await connection.end();
      }
      break;
    }
    case 'postgresql': {
      const client = new pg.Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeoutMillis: 10_000,
      });
      await client.connect();
      try {
        await client.query(statement);
      } finally {
        await client.end();
      }
      break;
    }
    case 'sqlserver': {
      const pool = await sql.connect({
        server: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        options: { encrypt: true, trustServerCertificate: true },
        connectionTimeout: 10_000,
      });
      try {
        await pool.request().query(statement);
      } finally {
        await pool.close();
      }
      break;
    }
    default:
      throw new Error(`Unsupported database provider: ${config.provider}`);
  }
}

/** Apply Win schedule schema upgrades without resetting existing project data. */
export async function ensureWinScheduleSchemaUpgrades(config: DatabaseConfig): Promise<void> {
  const statements = WIN_SCHEDULE_UPGRADE_STATEMENTS[config.provider];
  if (!statements.length) return;
  await runDatabaseStatements(config, statements, { ignoreUpgradeErrors: true });
}

/** Add web-only tables without altering MyProjectWinV10 schedule tables. */
export async function ensureWebExtensionTables(config: DatabaseConfig): Promise<void> {
  const statements = WEB_EXTENSION_STATEMENTS[config.provider];
  await runDatabaseStatements(config, statements);
}
