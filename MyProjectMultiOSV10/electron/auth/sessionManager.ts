import type { UserSession } from './userTypes';

let currentSession: UserSession | null = null;

export function getSession(): UserSession | null {
  return currentSession;
}

export function setSession(session: UserSession | null): void {
  currentSession = session;
}

export function requireSession(): UserSession {
  if (!currentSession) {
    throw new Error('Login required');
  }
  return currentSession;
}

export function requireAdminSession(): UserSession {
  const session = requireSession();
  if (session.role !== 'admin') {
    throw new Error('Administrator privileges required');
  }
  return session;
}
