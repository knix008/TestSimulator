import type {
  AppUser,
  AuthSession,
  CreateUserInput,
  DatabaseConfigInfo,
  UpdateOwnProfileInput,
  UpdateUserInput,
  UserProfile,
} from '@web/types/project';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!window.electronAPI?.invoke) {
    throw new Error('Electron API is not available.');
  }
  try {
    return (await window.electronAPI.invoke(channel, ...args)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /Error: (.+)$/.exec(message);
    throw new Error(match?.[1] ?? message);
  }
}

export function getAuthSession() {
  return invoke<AuthSession>('auth:session');
}

export function loginAdmin(username: string, password: string) {
  return invoke<{ username: string; role: string }>('auth:login', username, password);
}

export function logoutAdmin() {
  return invoke<{ ok: boolean }>('auth:logout');
}

export function getMyProfile() {
  return invoke<UserProfile>('auth:profile');
}

export function updateMyProfile(input: UpdateOwnProfileInput) {
  return invoke<UserProfile>('auth:update-profile', input);
}

export function getDatabaseConfig() {
  return invoke<DatabaseConfigInfo>('auth:database-config');
}

export function listUsers() {
  return invoke<AppUser[]>('auth:list-users');
}

export function createUser(input: CreateUserInput) {
  return invoke<AppUser>('auth:create-user', input);
}

export function updateUser(id: number, input: UpdateUserInput) {
  return invoke<AppUser>('auth:update-user', id, input);
}

export function deleteUser(id: number) {
  return invoke<{ ok: boolean }>('auth:delete-user', id);
}

export function getStartupProjectPath() {
  return invoke<{ filePath: string | null }>('auth:startup-project');
}

function notAvailable(name: string): never {
  throw new Error(`${name} is not available in the desktop app.`);
}

export function getAdminDatabaseSettings() {
  return notAvailable('Database settings');
}

export function testAdminDatabaseSettings() {
  return notAvailable('Database test');
}

export function saveAdminDatabaseSettings() {
  return notAvailable('Database save');
}

export function listProjects() {
  return notAvailable('Project list');
}

export function getProject() {
  return notAvailable('Project load');
}

export function createProject() {
  return notAvailable('Project create');
}

export function deleteProject() {
  return notAvailable('Project delete');
}

export function updateProject() {
  return notAvailable('Project update');
}

export function getProjectViewSettings() {
  return notAvailable('View settings');
}

export function saveProjectViewSettings() {
  return notAvailable('View settings save');
}

export async function downloadProjectExport() {
  return notAvailable('Project export download');
}

export async function importProjectExcel() {
  return notAvailable('Excel import');
}
