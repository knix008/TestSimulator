import bcrypt from "bcryptjs";
import knexFactory, { Knex } from "knex";
import { v4 as uuid } from "uuid";
import { ConnectionSettings } from "./types";

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin";

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

  if (!(await db.schema.hasTable("users"))) {
    await db.schema.createTable("users", (t) => {
      t.string("id", 36).primary();
      t.string("username", 64).notNullable().unique();
      t.string("passwordHash", 255).notNullable();
      t.string("role", 16).notNullable();
      t.dateTime("createdUtc").notNullable();
    });

    // First-time setup: seed a default admin account so there is always a way to log in.
    // The operator must change this password immediately after first login.
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await db("users").insert({
      id: uuid(),
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash,
      role: "admin",
      createdUtc: new Date().toISOString()
    });
    console.warn(
      `[ReqTrace] Created default admin account — username: "${DEFAULT_ADMIN_USERNAME}", password: "${DEFAULT_ADMIN_PASSWORD}". Change this password immediately.`
    );
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

/**
 * The DB connection is server-side configuration, not something the browser client
 * controls — it's read once from environment variables when the process starts.
 */
export function settingsFromEnv(): ConnectionSettings | null {
  const provider = process.env.DB_PROVIDER as ConnectionSettings["provider"] | undefined;
  if (!provider) return null;

  return {
    provider,
    server: process.env.DB_SERVER ?? "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 0,
    database: process.env.DB_DATABASE ?? "",
    username: process.env.DB_USERNAME ?? "",
    password: process.env.DB_PASSWORD ?? "",
    sqliteFilePath: process.env.DB_SQLITE_PATH ?? ""
  };
}
