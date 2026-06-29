import { isMailConfigured } from './mail.js';

export function isPasswordVerificationRequired() {
  return isMailConfigured();
}
