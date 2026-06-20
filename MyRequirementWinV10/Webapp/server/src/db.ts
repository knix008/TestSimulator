import knexFactory, { Knex } from "knex";
import { ConnectionSettings } from "./types";

const VALID_DB_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

let activeKnex: Knex | null = null;
let activeSettings: ConnectionSettings | null = null;

export function getKnex(): Knex {
  if (!activeKnex) throw new Error("Not connected to a database. Connect first.");
  return activeKnex;
}

export function getActiveSettings(): ConnectionSettings | null {
  return activeSettings;
}

function baseConnection(settings: ConnectionSettings, database: string | undefined) {
  switch (settings.provider) {
    case "mysql":
    case "mariadb":
      return {
        host: settings.server,
        port: settings.port,
        user: settings.username,
        password: settings.password,
        database
      };
    case "postgresql":
      return {
        host: settings.server,
        port: settings.port,
        user: settings.username,
        password: settings.password,
        database
      };
    case "mssql":
      return {
        server: settings.server,
        port: settings.port,
        user: settings.username,
        password: settings.password,
        database,
        options: { trustServerCertificate: true, encrypt: false }
      };
    case "sqlite":
      return { filename: settings.sqliteFilePath };
  }
}

function clientNameFor(provider: ConnectionSettings["provider"]) {
  switch (provider) {
    case "mysql":
    case "mariadb":
      return "mysql2";
    case "postgresql":
      return "pg";
    case "mssql":
      return "mssql";
    case "sqlite":
      return "better-sqlite3";
  }
}

function buildKnexConfig(settings: ConnectionSettings, database: string | undefined): Knex.Config {
  return {
    client: clientNameFor(settings.provider),
    connection: baseConnection(settings, database),
    useNullAsDefault: settings.provider === "sqlite"
  };
}

async function ensureDatabaseExists(settings: ConnectionSettings): Promise<void> {
  if (settings.provider === "sqlite") return;

  if (!VALID_DB_NAME.test(settings.database)) {
    throw new Error(`Invalid database name: '${settings.database}'. Use letters, digits, and underscores only.`);
  }

  if (settings.provider === "mysql" || settings.provider === "mariadb") {
    const admin = knexFactory(buildKnexConfig(settings, undefined));
    try {
      await admin.raw(`CREATE DATABASE IF NOT EXISTS \`${settings.database}\``);
    } finally {
      await admin.destroy();
    }
    return;
  }

  if (settings.provider === "postgresql") {
    const admin = knexFactory(buildKnexConfig(settings, "postgres"));
    try {
      const result = await admin.raw("SELECT 1 FROM pg_database WHERE datname = ?", [settings.database]);
      if (result.rows.length === 0) {
        await admin.raw(`CREATE DATABASE "${settings.database}"`);
      }
    } finally {
      await admin.destroy();
    }
    return;
  }

  if (settings.provider === "mssql") {
    const admin = knexFactory(buildKnexConfig(settings, "master"));
    try {
      await admin.raw(
        `IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${settings.database}') CREATE DATABASE [${settings.database}]`
      );
    } finally {
      await admin.destroy();
    }
  }
}

async function ensureSchema(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable("requirements"))) {
    await db.schema.createTable("requirements", (t) => {
      t.string("id", 36).primary();
      t.string("code", 64).notNullable();
      t.string("title", 255).notNullable();
      t.text("description").notNullable();
      t.string("category", 128).notNullable();
      t.integer("priority").notNullable();
      t.integer("status").notNullable();
      t.string("source", 255).notNullable();
      t.string("parentId", 36).nullable();
      t.dateTime("createdUtc").notNullable();
      t.dateTime("modifiedUtc").notNullable();
    });
  }

  if (!(await db.schema.hasTable("test_cases"))) {
    await db.schema.createTable("test_cases", (t) => {
      t.string("id", 36).primary();
      t.string("requirementId", 36).notNullable();
      t.string("code", 64).notNullable();
      t.string("title", 255).notNullable();
      t.text("preconditions").notNullable();
      t.text("expectedResult").notNullable();
    });
  }

  if (!(await db.schema.hasTable("test_steps"))) {
    await db.schema.createTable("test_steps", (t) => {
      t.string("testCaseId", 36).notNullable();
      t.integer("stepOrder").notNullable();
      t.text("action").notNullable();
      t.text("expectedOutcome").notNullable();
    });
  }

  if (!(await db.schema.hasTable("test_runs"))) {
    await db.schema.createTable("test_runs", (t) => {
      t.string("id", 36).primary();
      t.string("testCaseId", 36).notNullable();
      t.integer("status").notNullable();
      t.dateTime("executedUtc").notNullable();
      t.string("executedBy", 255).notNullable();
      t.text("notes").notNullable();
      t.string("buildOrVersion", 128).notNullable();
    });
  }
}

export async function connect(settings: ConnectionSettings): Promise<void> {
  await ensureDatabaseExists(settings);

  const targetDatabase = settings.provider === "sqlite" ? undefined : settings.database;
  const next = knexFactory(buildKnexConfig(settings, targetDatabase));

  await next.raw("SELECT 1");
  await ensureSchema(next);

  if (activeKnex) {
    await activeKnex.destroy();
  }
  activeKnex = next;
  activeSettings = settings;
}

export function isConnected(): boolean {
  return activeKnex !== null;
}
