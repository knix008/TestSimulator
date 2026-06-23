import 'dotenv/config';
import { authenticateUser } from '../src/services/authService.js';
import { getDatabaseStatus } from '../src/lib/prisma.js';
import { initializeDatabaseFromSettings } from '../src/services/databaseManager.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  await initializeDatabaseFromSettings();
  console.log('DB status:', getDatabaseStatus());

  try {
    const users = await prisma.mpUser.findMany({
      select: { id: true, username: true, role: true, isActive: true },
    });
    console.log('mp_users:', users);
  } catch (error) {
    console.log('mp_users query failed:', error instanceof Error ? error.message : error);
  }

  const session = await authenticateUser('admin', 'admin');
  console.log('authenticateUser(admin, admin):', session);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
