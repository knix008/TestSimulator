import bcrypt from 'bcryptjs';
import { loadDbConfig, saveDbConfig } from '../database/config.js';

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';

export function isDefaultCredentialPair(username, password) {
  return username === DEFAULT_ADMIN_USERNAME && password === DEFAULT_ADMIN_PASSWORD;
}

export function userHasDefaultCredentials(user) {
  return user.username === DEFAULT_ADMIN_USERNAME
    && bcrypt.compareSync(DEFAULT_ADMIN_PASSWORD, user.password);
}

export function isDefaultCredentialsDisabled() {
  return loadDbConfig().defaultCredentialsDisabled === true;
}

export function markDefaultCredentialsDisabled() {
  const config = loadDbConfig();
  saveDbConfig({ ...config, defaultCredentialsDisabled: true });
}

export function validateNewCredentials(username, password) {
  if (isDefaultCredentialPair(username, password)) {
    return 'Default admin credentials (admin/admin) are not allowed';
  }
  return null;
}
