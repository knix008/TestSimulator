// The LVGL versions the studio knows about, and the API names that differ between them.

/** Versions whose WebAssembly engine ships with the app (public/engine). */
export const BUNDLED_ENGINES = ["8.4.0", "9.2.2", "9.6.0"];
export const DEFAULT_VERSION = "9.6.0";
/** Offered when the release list cannot be read from GitHub. */
export const KNOWN_VERSIONS = ["9.6.0", "9.5.0", "9.4.0", "9.3.0", "9.2.2", "8.4.0", "8.3.11"];

export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim());
  return match ? { major: +match[1], minor: +match[2], patch: +match[3] } : null;
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

/** The studio generates code for v8.3 and later (the v8 and v9 API families). */
export function isSupported(text) {
  const v = parseVersion(text);
  return !!v && ((v.major === 8 && v.minor >= 3) || v.major === 9);
}

/** Newest first, supported releases only, no duplicates. */
export function sortReleases(tags) {
  const unique = [...new Set(tags.map((tag) => String(tag).replace(/^v/, "")))];
  return unique.filter(isSupported).sort((a, b) => compareVersions(b, a));
}

/**
 * The engine that draws a project of `version`: the same version when it is bundled,
 * otherwise the closest one with the same major version (exact=false, shown as a
 * warning). The native run always builds the exact version.
 */
export function engineFor(version) {
  if (BUNDLED_ENGINES.includes(version)) return { engine: version, exact: true };
  const target = parseVersion(version);
  const sameMajor = BUNDLED_ENGINES.filter((item) => parseVersion(item).major === target?.major);
  const pool = sameMajor.length ? sameMajor : [DEFAULT_VERSION];
  const distance = (item) => {
    const v = parseVersion(item);
    return Math.abs((v.minor - (target?.minor ?? 0)) * 100 + (v.patch - (target?.patch ?? 0)));
  };
  const engine = [...pool].sort((a, b) => distance(a) - distance(b))[0];
  return { engine, exact: false };
}

const V8 = {
  button: "lv_btn_create",
  screenLoad: "lv_scr_load",
  removeFlag: "lv_obj_clear_flag",
  removeState: "lv_obj_clear_state",
  spinner: (parent) => `lv_spinner_create(${parent}, 1000, 60)`,
  display: "lv_disp_t",
  defaultDisplay: "lv_disp_get_default",
  setTheme: "lv_disp_set_theme",
};

const V9 = {
  button: "lv_button_create",
  screenLoad: "lv_screen_load",
  removeFlag: "lv_obj_remove_flag",
  removeState: "lv_obj_remove_state",
  spinner: (parent) => `lv_spinner_create(${parent})`,
  display: "lv_display_t",
  defaultDisplay: "lv_display_get_default",
  setTheme: "lv_display_set_theme",
};

export const apiFor = (version) => (parseVersion(version)?.major === 8 ? V8 : V9);
