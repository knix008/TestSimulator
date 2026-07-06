import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_RECENT = 10;
const RECENT_FILE = 'recent-files.json';

export async function readRecentFiles(userDataPath: string): Promise<string[]> {
  const filePath = path.join(userDataPath, RECENT_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export async function addRecentFile(userDataPath: string, filePath: string): Promise<string[]> {
  const normalized = path.resolve(filePath);
  const existing = await readRecentFiles(userDataPath);
  const next = [normalized, ...existing.filter((entry) => path.resolve(entry) !== normalized)].slice(
    0,
    MAX_RECENT,
  );
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(path.join(userDataPath, RECENT_FILE), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function clearRecentFiles(userDataPath: string): Promise<void> {
  try {
    await fs.unlink(path.join(userDataPath, RECENT_FILE));
  } catch {
    // ignore
  }
}
