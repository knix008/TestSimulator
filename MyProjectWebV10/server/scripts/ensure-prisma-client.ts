import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanupStalePrismaEngineTempFiles,
  isPrismaClientReady,
  isPrismaGenerateLockError,
} from '../src/lib/prismaClientFiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, '..');

function runGenerate(): void {
  execSync('npx prisma generate', {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

if (isPrismaClientReady()) {
  cleanupStalePrismaEngineTempFiles();
  console.log('Prisma client already generated.');
  process.exit(0);
}

cleanupStalePrismaEngineTempFiles();
console.log('Generating Prisma client...');

try {
  runGenerate();
} catch (error) {
  if (isPrismaClientReady()) {
    console.warn(
      'Prisma generate reported an error, but the client files are present. Continuing.',
    );
    process.exit(0);
  }

  if (isPrismaGenerateLockError(error)) {
    console.error(
      'Prisma generate failed because query_engine-windows.dll.node is locked.',
    );
    console.error('Stop npm run dev and other Node processes, then run:');
    console.error('  npm run db:generate');
    process.exit(1);
  }

  throw error;
}
