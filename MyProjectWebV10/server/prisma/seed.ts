import 'dotenv/config';
import { applyDatabaseEnv } from '../src/config/database.js';
import { prisma } from '../src/lib/prisma.js';
import {
  createTemplateDependencies,
  createTemplateTasks,
} from '../src/services/projectService.js';

applyDatabaseEnv();

async function main() {
  const projectStart = new Date();
  projectStart.setHours(0, 0, 0, 0);

  const existing = await prisma.mpProject.count();
  if (existing > 0) {
    console.log('Seed skipped: projects already exist.');
    return;
  }

  await prisma.mpProject.create({
    data: {
      name: 'Sample Project',
      projectStart,
      workingDaysJson: JSON.stringify([false, true, true, true, true, true, false]),
      tasks: { create: createTemplateTasks(projectStart) },
      dependencies: { create: createTemplateDependencies() },
    },
  });

  console.log('Seeded sample project.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
