import { createRequire } from 'node:module';
import mysql from 'mysql2/promise';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new (args?: { datasources?: { db?: { url?: string } } }) => {
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
  };
};

const password = process.env.MYSQL_PWD ?? '';
const host = process.env.DB_HOST ?? 'localhost';
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? 'root';
const database = process.env.DB_NAME ?? 'myproject';

const cfg = { host, port, user, password, database };
const url = `mysql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@${cfg.host}:${cfg.port}/${cfg.database}`;

console.log(`Testing ${cfg.host}:${cfg.port} user=${cfg.user} db=${cfg.database}`);

const conn = await mysql.createConnection({
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.database,
});
await conn.ping();
console.log('mysql2: OK');
await conn.end();

const prisma = new PrismaClient({ datasources: { db: { url } } });
await prisma.$connect();
console.log('Prisma: OK');
await prisma.$disconnect();
