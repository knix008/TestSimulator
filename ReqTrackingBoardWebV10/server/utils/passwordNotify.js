import { sendPasswordChangedNotification } from './mail.js';

export function notifyPasswordChanged(user, options = {}) {
  const {
    changedBy = 'self',
    actorUsername,
    ip,
    email,
  } = options;

  const to = email || user.email;
  const payload = {
    to,
    username: user.username,
    displayName: user.display_name || user.displayName,
    changedBy,
    actorUsername,
    ip,
    at: new Date(),
  };

  return sendPasswordChangedNotification(payload).catch((err) => {
    console.error(`Password change notification failed for ${user.username}:`, err.message);
    return { sent: false, reason: err.message };
  });
}

export async function notifyPasswordChangedAndWait(user, options = {}) {
  try {
    return await notifyPasswordChanged(user, options);
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
