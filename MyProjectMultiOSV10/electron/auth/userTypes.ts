export type UserRole = 'admin' | 'user';

export interface UserSession {
  userId: number;
  username: string;
  role: UserRole;
  canRead: boolean;
  canModify: boolean;
}

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

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';
