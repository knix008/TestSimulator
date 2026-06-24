import { applyDatabaseSettings } from '../src/services/databaseManager.js';

const password = process.env.MYSQL_PWD ?? '';
const config = {
  provider: 'mariadb' as const,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password,
  database: process.env.DB_NAME ?? 'myproject',
};

const result = await applyDatabaseSettings(config, { persist: false });
console.log('applyDatabaseSettings: OK');
console.log(result.message);
