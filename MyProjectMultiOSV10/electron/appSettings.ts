import fs from 'node:fs/promises';
import path from 'node:path';

export interface AppSettingsData {
  lastProjectPath?: string | null;
  database?: {
    provider?: 'sqlite' | 'mariadb';
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    file?: string;
  };
}

export async function readAppSettings(userDataPath: string): Promise<AppSettingsData> {
  const settingsPath = path.join(userDataPath, 'settings.json');
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw) as AppSettingsData;
  } catch {
    return {};
  }
}

export async function writeAppSettings(
  userDataPath: string,
  settings: AppSettingsData,
): Promise<void> {
  const settingsPath = path.join(userDataPath, 'settings.json');
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

export async function setLastProjectPath(
  userDataPath: string,
  filePath: string | null,
): Promise<void> {
  const settings = await readAppSettings(userDataPath);
  settings.lastProjectPath = filePath;
  await writeAppSettings(userDataPath, settings);
}

export async function getLastProjectPath(userDataPath: string): Promise<string | null> {
  const settings = await readAppSettings(userDataPath);
  return settings.lastProjectPath ?? null;
}
