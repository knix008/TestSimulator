import { hashPassword } from './settingsStore.js';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from '../config/defaults.js';

/** Bootstrap admin from environment (used only before DB is connected). */
export function getBootstrapAdminUsername(): string {
  return process.env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
}

export function getBootstrapAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
}

/** Credentials used to seed the first administrator row in mp_users. */
export function getSeedAdminCredentials(): { username: string; passwordHash: string } {
  return {
    username: getBootstrapAdminUsername(),
    passwordHash: hashPassword(getBootstrapAdminPassword()),
  };
}

export function isBootstrapAdminUsername(username: string): boolean {
  return username.trim() === getBootstrapAdminUsername();
}
