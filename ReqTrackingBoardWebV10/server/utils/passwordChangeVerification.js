import { normalizeEmail } from './user.js';

const pendingCodes = new Map();
const verifiedUsers = new Map();

const CODE_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export function canSendVerificationCode(userId) {
  const pending = pendingCodes.get(userId);
  if (!pending) return true;
  return Date.now() - pending.sentAt >= RESEND_COOLDOWN_MS;
}

export function getResendCooldownSeconds(userId) {
  const pending = pendingCodes.get(userId);
  if (!pending) return 0;
  const remaining = RESEND_COOLDOWN_MS - (Date.now() - pending.sentAt);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function createVerificationCode(userId, email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const normalizedEmail = normalizeEmail(email);
  pendingCodes.set(userId, {
    code,
    email: normalizedEmail,
    expiresAt: Date.now() + CODE_TTL_MS,
    sentAt: Date.now(),
  });
  verifiedUsers.delete(userId);
  return code;
}

export function verifyCode(userId, code, email) {
  const pending = pendingCodes.get(userId);
  const normalizedEmail = normalizeEmail(email);

  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, error: 'Verification code expired. Request a new code.' };
  }
  if (pending.email !== normalizedEmail) {
    return { ok: false, error: 'Email does not match the verification request.' };
  }
  if (pending.code !== String(code).trim()) {
    return { ok: false, error: 'Invalid verification code.' };
  }

  pendingCodes.delete(userId);
  verifiedUsers.set(userId, {
    email: normalizedEmail,
    expiresAt: Date.now() + VERIFIED_TTL_MS,
  });
  return { ok: true };
}

export function isPasswordChangeVerified(userId, email) {
  const verified = verifiedUsers.get(userId);
  if (!verified || verified.expiresAt < Date.now()) return false;
  if (email && normalizeEmail(email) !== verified.email) return false;
  return true;
}

export function consumePasswordChangeVerification(userId, email) {
  if (!isPasswordChangeVerified(userId, email)) return false;
  verifiedUsers.delete(userId);
  return true;
}

export function getVerificationStatus(userId) {
  const verified = verifiedUsers.get(userId);
  if (!verified || verified.expiresAt < Date.now()) {
    return { verified: false };
  }
  return {
    verified: true,
    email: verified.email,
    expiresAt: new Date(verified.expiresAt).toISOString(),
  };
}

export function clearVerification(userId) {
  pendingCodes.delete(userId);
  verifiedUsers.delete(userId);
}
