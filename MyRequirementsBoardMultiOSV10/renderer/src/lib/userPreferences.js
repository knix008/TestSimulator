import { api } from '../api/client.js';

let authenticated = false;

export function setUserPreferencesAuthenticated(value) {
  authenticated = Boolean(value);
}

export async function loadUserPreferencesFromDb() {
  if (!authenticated) return null;
  try {
    return await api.getUserPreferences();
  } catch {
    return null;
  }
}

export async function patchUserPreferencesIfAuthed(partial) {
  if (!authenticated) return null;
  try {
    return await api.patchUserPreferences(partial);
  } catch {
    return null;
  }
}
