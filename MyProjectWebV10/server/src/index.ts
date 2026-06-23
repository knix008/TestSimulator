import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { getProviderDisplayName } from './config/database.js';
import { disconnectPrisma } from './lib/prisma.js';
import {
  getDatabaseConnectionInfo,
  initializeDatabaseFromSettings,
} from './services/databaseManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env'), override: true });

const port = Number(process.env.PORT ?? 3001);

async function main() {
  await initializeDatabaseFromSettings();

  const app = createApp();
  app.listen(port, () => {
    const config = getDatabaseConnectionInfo();
    console.log(`MyProject Web API listening on http://localhost:${port}`);
    console.log(
      `Database: ${getProviderDisplayName(config.provider)} / ${config.database} (${config.connected ? 'connected' : 'not connected'})`,
    );
    if (!config.connected && config.connectionError) {
      console.warn(`Configure database as admin: ${config.connectionError}`);
    }
  });
}

main().catch(async (error) => {
  console.error('Failed to start server:', error);
  await disconnectPrisma();
  process.exit(1);
});

process.on('SIGINT', async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});
