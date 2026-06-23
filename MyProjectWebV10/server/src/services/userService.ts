import { prisma } from '../lib/prisma.js';
import { getDatabaseStatus } from '../lib/prisma.js';
import { hashPassword, readLegacyAdminCredentials, verifyPassword } from './settingsStore.js';
import {
  getBootstrapAdminPassword,
  getSeedAdminCredentials,
  isBootstrapAdminUsername,
} from './bootstrapAdmin.js';
import { normalizePermissions, type UserPermissions } from './permissions.js';

export type UserRole = 'admin' | 'user';

export interface UserDto {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  canRead: boolean;
  canModify: boolean;
  isActive: boolean;
  createdUtc: string;
  updatedUtc: string;
}

export interface CreateUserInput {
  username: string;
  displayName?: string;
  email?: string;
  password: string;
  role: UserRole;
  canRead?: boolean;
  canModify?: boolean;
  isActive?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  displayName?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  canRead?: boolean;
  canModify?: boolean;
  isActive?: boolean;
}

export interface UpdateOwnProfileInput {
  currentPassword: string;
  username?: string;
  password?: string;
  displayName?: string;
  email?: string;
}

function toUserDto(user: {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: string;
  canRead: boolean;
  canModify: boolean;
  isActive: boolean;
  createdUtc: Date;
  updatedUtc: Date;
}): UserDto {
  const role = user.role as UserRole;
  const permissions = normalizePermissions(user.canRead, user.canModify, role);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role,
    canRead: permissions.canRead,
    canModify: permissions.canModify,
    isActive: user.isActive,
    createdUtc: user.createdUtc.toISOString(),
    updatedUtc: user.updatedUtc.toISOString(),
  };
}

function resolvePermissions(
  role: UserRole,
  canRead?: boolean,
  canModify?: boolean,
): UserPermissions {
  return normalizePermissions(canRead ?? true, canModify ?? false, role);
}

export async function listUsers(): Promise<UserDto[]> {
  const users = await prisma.mpUser.findMany({
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  });
  return users.map(toUserDto);
}

export async function createUser(input: CreateUserInput): Promise<UserDto> {
  const existing = await prisma.mpUser.findUnique({ where: { username: input.username } });
  if (existing) {
    throw new Error('Username already exists');
  }

  const permissions = resolvePermissions(input.role, input.canRead, input.canModify);

  const user = await prisma.mpUser.create({
    data: {
      username: input.username,
      displayName: input.displayName?.trim() ?? input.username,
      email: input.email?.trim() ?? '',
      passwordHash: hashPassword(input.password),
      role: input.role,
      canRead: permissions.canRead,
      canModify: permissions.canModify,
      isActive: input.isActive ?? true,
    },
  });

  return toUserDto(user);
}

export async function updateUser(
  id: number,
  input: UpdateUserInput,
  currentUserId?: number,
): Promise<UserDto | null> {
  const existing = await prisma.mpUser.findUnique({ where: { id } });
  if (!existing) return null;

  const nextRole = (input.role ?? existing.role) as UserRole;

  if (currentUserId === id && input.role === 'user' && existing.role === 'admin') {
    throw new Error('Cannot remove your own administrator role');
  }

  if (input.role === 'user' && existing.role === 'admin') {
    const adminCount = await prisma.mpUser.count({
      where: { role: 'admin', isActive: true },
    });
    if (adminCount <= 1) {
      throw new Error('Cannot demote the last active administrator');
    }
  }

  if (input.isActive === false && existing.role === 'admin' && existing.isActive) {
    const adminCount = await prisma.mpUser.count({
      where: { role: 'admin', isActive: true },
    });
    if (adminCount <= 1) {
      throw new Error('Cannot deactivate the last active administrator');
    }
  }

  const permissions = resolvePermissions(
    nextRole,
    input.canRead ?? existing.canRead,
    input.canModify ?? existing.canModify,
  );

  if (input.username && input.username.trim() !== existing.username) {
    const duplicate = await prisma.mpUser.findUnique({ where: { username: input.username.trim() } });
    if (duplicate) {
      throw new Error('Username already exists');
    }
  }

  const user = await prisma.mpUser.update({
    where: { id },
    data: {
      username: input.username?.trim(),
      displayName: input.displayName?.trim(),
      email: input.email?.trim(),
      role: input.role,
      canRead: permissions.canRead,
      canModify: permissions.canModify,
      isActive: input.isActive,
      passwordHash: input.password ? hashPassword(input.password) : undefined,
    },
  });

  return toUserDto(user);
}

export async function deleteUser(id: number, currentUserId: number): Promise<void> {
  if (id === currentUserId) {
    throw new Error('Cannot delete your own account');
  }

  const target = await prisma.mpUser.findUnique({ where: { id } });
  if (!target) {
    throw new Error('User not found');
  }

  if (target.role === 'admin') {
    const adminCount = await prisma.mpUser.count({
      where: { role: 'admin', isActive: true },
    });
    if (adminCount <= 1) {
      throw new Error('Cannot delete the last active administrator');
    }
  }

  await prisma.mpUser.delete({ where: { id } });
}

export async function findUserByUsername(username: string) {
  return prisma.mpUser.findUnique({ where: { username } });
}

export async function getUserById(id: number): Promise<UserDto | null> {
  const user = await prisma.mpUser.findUnique({ where: { id } });
  return user ? toUserDto(user) : null;
}

export async function updateOwnProfile(
  userId: number,
  input: UpdateOwnProfileInput,
): Promise<UserDto> {
  const existing = await prisma.mpUser.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new Error('User not found');
  }

  if (!verifyPassword(input.currentPassword, existing.passwordHash)) {
    throw new Error('Current password is incorrect');
  }

  const nextUsername = input.username?.trim();
  if (nextUsername && nextUsername !== existing.username) {
    const duplicate = await prisma.mpUser.findUnique({ where: { username: nextUsername } });
    if (duplicate) {
      throw new Error('Username already exists');
    }
  }

  const user = await prisma.mpUser.update({
    where: { id: userId },
    data: {
      username: nextUsername,
      displayName: input.displayName?.trim(),
      email: input.email?.trim(),
      passwordHash: input.password ? hashPassword(input.password) : undefined,
    },
  });

  return toUserDto(user);
}

function resolveSeedAdminCredentials(): { username: string; passwordHash: string } {
  const legacy = readLegacyAdminCredentials();
  if (legacy) return legacy;
  return getSeedAdminCredentials();
}

/** Creates the first administrator in mp_users when the table is empty. */
export async function ensureDefaultAdminUser(): Promise<void> {
  if (!getDatabaseStatus().connected) return;

  const count = await prisma.mpUser.count();
  if (count > 0) return;

  const seed = resolveSeedAdminCredentials();
  await prisma.mpUser.create({
    data: {
      username: seed.username,
      displayName: 'Administrator',
      passwordHash: seed.passwordHash,
      role: 'admin',
      canRead: true,
      canModify: true,
      isActive: true,
    },
  });
}

/** Bootstrap login before DB is available (env or legacy credentials). */
export function authenticateBootstrapAdmin(username: string, password: string): boolean {
  const trimmed = username.trim();
  const legacy = readLegacyAdminCredentials();
  if (legacy && legacy.username === trimmed) {
    return verifyPassword(password, legacy.passwordHash);
  }
  if (!isBootstrapAdminUsername(trimmed)) return false;
  return password === getBootstrapAdminPassword();
}
