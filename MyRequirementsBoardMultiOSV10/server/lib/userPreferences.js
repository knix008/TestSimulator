const DEFAULT_PREFERENCES = {
  language: 'ko',
  theme: 'light',
  activeProjectId: null,
};

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

export function parseUserPreferences(raw) {
  if (!raw) return { ...DEFAULT_PREFERENCES };

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      language: parsed.language === 'en' ? 'en' : 'ko',
      theme: normalizeTheme(parsed.theme),
      activeProjectId: parsed.activeProjectId ? Number(parsed.activeProjectId) : null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function serializeUserPreferences(prefs) {
  const parsed = parseUserPreferences(prefs);
  return JSON.stringify(parsed);
}

export function mergeUserPreferences(current, patch = {}) {
  const base = parseUserPreferences(current);
  return {
    language: patch.language !== undefined
      ? (patch.language === 'en' ? 'en' : 'ko')
      : base.language,
    theme: patch.theme !== undefined ? normalizeTheme(patch.theme) : base.theme,
    activeProjectId: patch.activeProjectId !== undefined
      ? (patch.activeProjectId ? Number(patch.activeProjectId) : null)
      : base.activeProjectId,
  };
}
