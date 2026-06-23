import 'dotenv/config';
import { hashPassword } from '../src/services/settingsStore.js';
import { getDatabaseStatus } from '../src/lib/prisma.js';
import { initializeDatabaseFromSettings } from '../src/services/databaseManager.js';
import { getBootstrapAdminUsername } from '../src/services/bootstrapAdmin.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  await initializeDatabaseFromSettings();
  if (!getDatabaseStatus().connected) {
    throw new Error('Database is not connected.');
  }

  const username = getBootstrapAdminUsername();
  const password = process.env.ADMIN_PASSWORD ?? 'admin';
  const passwordHash = hashPassword(password);

  const user = await prisma.mpUser.upsert({
    where: { username },
    create: {
      username,
      displayName: 'Administrator',
      passwordHash,
      role: 'admin',
      canRead: true,
      canModify: true,
      isActive: true,
    },
    update: {
      passwordHash,
      role: 'admin',
      canRead: true,
      canModify: true,
      isActive: true,
    },
  });

  console.log(`Reset login for '${user.username}' (admin/admin from .env).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
