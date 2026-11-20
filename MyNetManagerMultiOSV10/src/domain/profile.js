// Configuration profiles as project files (File › Save Profile… / Open Profile…): one JSON file
// (*.mynetprofile) with what Wireshark keeps in a profile — preferences (columns, time format, name
// resolution, Decode As, enabled protocols, layout, theme …), colouring rules, saved display / capture
// filters and filter buttons, and display filter macros. Opening one replaces those settings.
//
// Left out on purpose: what belongs to this computer or this session (folders, the chosen capture
// interface, the background picture file, the program language, tutorial / welcome state).

export const PROFILE_FORMAT = 'mynetmanager-profile';
export const PROFILE_VERSION = 1;
export const PROFILE_EXTENSION = 'mynetprofile';

/** Settings that stay on this computer and are neither saved in nor taken from a profile. */
export const LOCAL_SETTINGS = new Set([
  'language', 'lastDirectory', 'captureInterface', 'backgroundImage', 'backgroundName', 'tutorialOffered', 'showWelcome', 'tutorialDone',
  'captureSetupAsk', 'restoreSession', 'recentDisplayFilters', 'recentCaptureFilters', 'profileName', 'tlsKeyLogFile',
]);

const withoutLocal = (settings) => Object.fromEntries(Object.entries(settings ?? {}).filter(([key]) => !LOCAL_SETTINGS.has(key)));

/** The profile file's object. */
export function buildProfile({ name = 'Profile', settings = {}, coloring = null, filters = null, macros = [] } = {}, now = new Date()) {
  return {
    format: PROFILE_FORMAT,
    version: PROFILE_VERSION,
    name: String(name || 'Profile'),
    saved: now.toISOString(),
    settings: withoutLocal(settings),
    coloring: Array.isArray(coloring) ? coloring.map(({ name: n, filter, fg, bg, enabled }) => ({ name: n, filter, fg, bg, enabled: enabled !== false })) : null,
    filters: filters ? { display: [...(filters.display ?? [])], capture: [...(filters.capture ?? [])] } : null,
    macros: (macros ?? []).map(({ name: n, text }) => ({ name: n, text })),
  };
}

export const profileText = (profile) => `${JSON.stringify(profile, null, 2)}\n`;

/**
 * Reads a profile file → { ok: true, profile } | { ok: false, error }. Unknown keys are ignored; missing parts
 * (no colouring rules, no filters …) come back as null so the current ones stay.
 */
export function parseProfile(text) {
  let data;
  try { data = JSON.parse(String(text ?? '')); } catch (error) { return { ok: false, error: `not JSON: ${error.message}` }; }
  if (!data || typeof data !== 'object' || data.format !== PROFILE_FORMAT) return { ok: false, error: 'not a MyNetManager profile' };
  if (Number(data.version) > PROFILE_VERSION) return { ok: false, error: `made by a newer version (${data.version})` };
  const isRule = (r) => r && typeof r.filter === 'string' && typeof r.name === 'string';
  const isFilter = (f) => f && typeof f.filter === 'string';
  return {
    ok: true,
    profile: {
      name: String(data.name ?? 'Profile'),
      saved: data.saved ?? null,
      settings: data.settings && typeof data.settings === 'object' ? withoutLocal(data.settings) : {},
      coloring: Array.isArray(data.coloring) ? data.coloring.filter(isRule) : null,
      filters: data.filters && typeof data.filters === 'object'
        ? { display: (data.filters.display ?? []).filter(isFilter), capture: (data.filters.capture ?? []).filter(isFilter) } : null,
      macros: Array.isArray(data.macros) ? data.macros.filter((m) => m && typeof m.name === 'string' && typeof m.text === 'string') : null,
    },
  };
}
