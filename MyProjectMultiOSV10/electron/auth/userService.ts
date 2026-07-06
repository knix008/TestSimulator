import { getLocalDatabase, getLocalDatabasePath } from '../db/localDatabase';
import { normalizePermissions } from './permissions';
import { hashPassword, verifyPassword } from './passwordUtils';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  type CreateUserInput,
  type UpdateOwnProfileInput,
  type UpdateUserInput,
  type UserDto,
  type UserRole,
  type UserSession,
} from './userTypes';

interface UserRow {
  Id: number;
  username: string;
  DisplayName: string;
  email: string;
  PasswordHash: string;
  role: string;
  CanRead: number;
  CanModify: number;
  IsActive: number;
  CreatedUtc: string;
  UpdatedUtc: string;
}

function rowToDto(row: UserRow): UserDto {
  const role = row.role as UserRole;
  const permissions = normalizePermissions(Boolean(row.CanRead), Boolean(row.CanModify), role);
  return {
    id: row.Id,
    username: row.username,
    displayName: row.DisplayName,
    email: row.email,
    role,
    canRead: permissions.canRead,
    canModify: permissions.canModify,
    isActive: Boolean(row.IsActive),
    createdUtc: row.CreatedUtc,
    updatedUtc: row.UpdatedUtc,
  };
}

function sessionFromRow(row: UserRow): UserSession {
  const role = row.role as UserRole;
  const permissions = normalizePermissions(Boolean(row.CanRead), Boolean(row.CanModify), role);
  return {
    userId: row.Id,
    username: row.username,
    role,
    canRead: permissions.canRead,
    canModify: permissions.canModify,
  };
}

function findRowByUsername(username: string): UserRow | undefined {
  const db = getLocalDatabase();
  return db
    .prepare('SELECT * FROM mp_users WHERE username = ? COLLATE NOCASE')
    .get(username.trim()) as UserRow | undefined;
}

function findRowById(id: number): UserRow | undefined {
  const db = getLocalDatabase();
  return db.prepare('SELECT * FROM mp_users WHERE Id = ?').get(id) as UserRow | undefined;
}

export function authenticateUser(username: string, password: string): UserSession | null {
  const normalized = username.trim();
  if (!normalized || !password) return null;

  const row = findRowByUsername(normalized);
  if (!row || !row.IsActive) return null;

  if (verifyPassword(password, row.PasswordHash)) {
    return sessionFromRow(row);
  }

  if (
    row.role === 'admin' &&
    normalized.toLowerCase() === DEFAULT_ADMIN_USERNAME &&
    password === DEFAULT_ADMIN_PASSWORD
  ) {
    const db = getLocalDatabase();
    db.prepare('UPDATE mp_users SET PasswordHash = ?, UpdatedUtc = datetime(\'now\') WHERE Id = ?').run(
      hashPassword(password),
      row.Id,
    );
    const updated = findRowById(row.Id);
    return updated ? sessionFromRow(updated) : null;
  }

  return null;
}

export function listUsers(): UserDto[] {
  const db = getLocalDatabase();
  const rows = db
    .prepare('SELECT * FROM mp_users ORDER BY role ASC, username ASC')
    .all() as UserRow[];
  return rows.map(rowToDto);
}

export function getUserById(id: number): UserDto | null {
  const row = findRowById(id);
  return row ? rowToDto(row) : null;
}

function resolvePermissions(role: UserRole, canRead?: boolean, canModify?: boolean) {
  return normalizePermissions(canRead ?? true, canModify ?? false, role);
}

export function createUser(input: CreateUserInput): UserDto {
  const db = getLocalDatabase();
  const existing = findRowByUsername(input.username);
  if (existing) {
    throw new Error('Username already exists');
  }

  const permissions = resolvePermissions(input.role, input.canRead, input.canModify);
  db.prepare(
    `INSERT INTO mp_users
      (username, DisplayName, email, PasswordHash, role, CanRead, CanModify, IsActive)
     VALUES (@username, @displayName, @email, @passwordHash, @role, @canRead, @canModify, @isActive)`,
  ).run({
    username: input.username.trim(),
    displayName: input.displayName?.trim() || input.username.trim(),
    email: input.email?.trim() ?? '',
    passwordHash: hashPassword(input.password),
    role: input.role,
    canRead: permissions.canRead ? 1 : 0,
    canModify: permissions.canModify ? 1 : 0,
    isActive: (input.isActive ?? true) ? 1 : 0,
  });

  const created = findRowByUsername(input.username);
  if (!created) {
    throw new Error('Failed to create user');
  }
  return rowToDto(created);
}

export function updateUser(
  id: number,
  input: UpdateUserInput,
  currentUserId?: number,
): UserDto | null {
  const existing = findRowById(id);
  if (!existing) return null;

  const nextRole = (input.role ?? existing.role) as UserRole;

  if (currentUserId === id && input.role === 'user' && existing.role === 'admin') {
    throw new Error('Cannot remove your own administrator role');
  }

  if (input.role === 'user' && existing.role === 'admin') {
    const adminCount = countActiveAdmins();
    if (adminCount <= 1) {
      throw new Error('Cannot demote the last active administrator');
    }
  }

  if (input.isActive === false && existing.role === 'admin' && existing.IsActive) {
    const adminCount = countActiveAdmins();
    if (adminCount <= 1) {
      throw new Error('Cannot deactivate the last active administrator');
    }
  }

  const permissions = resolvePermissions(
    nextRole,
    input.canRead ?? Boolean(existing.CanRead),
    input.canModify ?? Boolean(existing.CanModify),
  );

  if (input.username && input.username.trim().toLowerCase() !== existing.username.toLowerCase()) {
    const duplicate = findRowByUsername(input.username);
    if (duplicate) {
      throw new Error('Username already exists');
    }
  }

  const db = getLocalDatabase();
  db.prepare(
    `UPDATE mp_users SET
      username = COALESCE(@username, username),
      DisplayName = COALESCE(@displayName, DisplayName),
      email = COALESCE(@email, email),
      role = COALESCE(@role, role),
      CanRead = @canRead,
      CanModify = @canModify,
      IsActive = COALESCE(@isActive, IsActive),
      PasswordHash = COALESCE(@passwordHash, PasswordHash),
      UpdatedUtc = datetime('now')
     WHERE Id = @id`,
  ).run({
    id,
    username: input.username?.trim(),
    displayName: input.displayName?.trim(),
    email: input.email?.trim(),
    role: input.role,
    canRead: permissions.canRead ? 1 : 0,
    canModify: permissions.canModify ? 1 : 0,
    isActive: input.isActive == null ? null : input.isActive ? 1 : 0,
    passwordHash: input.password ? hashPassword(input.password) : null,
  });

  const updated = findRowById(id);
  return updated ? rowToDto(updated) : null;
}

function countActiveAdmins(): number {
  const db = getLocalDatabase();
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM mp_users WHERE role = 'admin' AND IsActive = 1")
    .get() as { count: number };
  return row.count;
}

export function deleteUser(id: number, currentUserId: number): void {
  if (id === currentUserId) {
    throw new Error('Cannot delete your own account');
  }

  const target = findRowById(id);
  if (!target) {
    throw new Error('User not found');
  }

  if (target.role === 'admin') {
    const adminCount = countActiveAdmins();
    if (adminCount <= 1) {
      throw new Error('Cannot delete the last active administrator');
    }
  }

  const db = getLocalDatabase();
  db.prepare('DELETE FROM mp_users WHERE Id = ?').run(id);
}

export function updateOwnProfile(userId: number, input: UpdateOwnProfileInput): UserDto {
  const existing = findRowById(userId);
  if (!existing) {
    throw new Error('User not found');
  }

  if (!verifyPassword(input.currentPassword, existing.PasswordHash)) {
    throw new Error('Current password is incorrect');
  }

  const nextUsername = input.username?.trim();
  if (nextUsername && nextUsername.toLowerCase() !== existing.username.toLowerCase()) {
    const duplicate = findRowByUsername(nextUsername);
    if (duplicate) {
      throw new Error('Username already exists');
    }
  }

  const db = getLocalDatabase();
  db.prepare(
    `UPDATE mp_users SET
      username = COALESCE(@username, username),
      DisplayName = COALESCE(@displayName, DisplayName),
      email = COALESCE(@email, email),
      PasswordHash = COALESCE(@passwordHash, PasswordHash),
      UpdatedUtc = datetime('now')
     WHERE Id = @id`,
  ).run({
    id: userId,
    username: nextUsername,
    displayName: input.displayName?.trim(),
    email: input.email?.trim(),
    passwordHash: input.password ? hashPassword(input.password) : null,
  });

  const updated = findRowById(userId);
  if (!updated) {
    throw new Error('User not found');
  }
  return rowToDto(updated);
}

export function getDatabaseConfigInfo(userDataPath: string) {
  const dbPath = getLocalDatabasePath(userDataPath);
  return {
    provider: 'sqlite',
    providerDisplayName: 'SQLite 3',
    database: dbPath,
    connected: true,
    connectionError: null,
    requiresAdminSetup: false,
    supportedProviders: [
      { id: 'sqlite', name: 'SQLite 3' },
      { id: 'mariadb', name: 'MariaDB / MySQL' },
    ],
  };
}
