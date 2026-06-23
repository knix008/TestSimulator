import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PRISMA_CLIENT_DIR = join(__dirname, '../../../node_modules/.prisma/client');
const ENGINE_FILE = join(PRISMA_CLIENT_DIR, 'query_engine-windows.dll.node');
const CLIENT_INDEX = join(PRISMA_CLIENT_DIR, 'index.js');

export function isPrismaClientReady(): boolean {
  return existsSync(CLIENT_INDEX) && existsSync(ENGINE_FILE);
}

export function cleanupStalePrismaEngineTempFiles(): void {
  if (!existsSync(PRISMA_CLIENT_DIR)) return;

  for (const entry of readdirSync(PRISMA_CLIENT_DIR)) {
    if (!entry.includes('query_engine') || !entry.includes('.tmp')) continue;
    try {
      unlinkSync(join(PRISMA_CLIENT_DIR, entry));
    } catch {
      // Another process may still hold the temp file.
    }
  }
}

export function isPrismaGenerateLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (message.includes('EPERM') && message.includes('query_engine')) ||
    message.includes('Command failed: npx prisma generate')
  );
}
