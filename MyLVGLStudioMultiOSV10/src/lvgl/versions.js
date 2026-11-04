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
  image: "lv_img_create",
  imageSrc: "lv_img_set_src",
  imageRotation: "lv_img_set_angle",
  imageScale: "lv_img_set_zoom",
  imageDeclare: "LV_IMG_DECLARE",
  point: "lv_point_t",
  list: "lv_list_add_btn",
  tabview: (parent) => `lv_tabview_create(${parent}, LV_DIR_TOP, 40)`,
  rowCount: "lv_table_set_row_cnt",
  columnCount: "lv_table_set_col_cnt",
  columnWidth: "lv_table_set_col_width",
  columnCountGet: "lv_table_get_col_cnt",
  matrix: "lv_btnmatrix_create",
  matrixMap: "lv_btnmatrix_set_map",
  chartRange: "lv_chart_set_range",
  calendarMonth: "lv_calendar_set_showed_date",
  major: 8,
  imageButton: "lv_imgbtn_create",
  imageButtonSet: "lv_imgbtn_set_src",
  imageButtonState: "LV_IMGBTN_STATE_RELEASED",
  imageSet: "lv_img_set_src",
  canvasFormat: "LV_IMG_CF_TRUE_COLOR_ALPHA",
  track: "lv_coord_t",
  spanNew: "lv_spangroup_new_span",
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
  image: "lv_image_create",
  imageSrc: "lv_image_set_src",
  imageRotation: "lv_image_set_rotation",
  imageScale: "lv_image_set_scale",
  imageDeclare: "LV_IMAGE_DECLARE",
  point: "lv_point_precise_t",
  list: "lv_list_add_button",
  tabview: (parent) => `lv_tabview_create(${parent})`,
  rowCount: "lv_table_set_row_count",
  columnCount: "lv_table_set_column_count",
  columnWidth: "lv_table_set_column_width",
  columnCountGet: "lv_table_get_column_count",
  matrix: "lv_buttonmatrix_create",
  matrixMap: "lv_buttonmatrix_set_map",
  chartRange: "lv_chart_set_range",
  calendarMonth: "lv_calendar_set_showed_date",
  major: 9,
  imageButton: "lv_imagebutton_create",
  imageButtonSet: "lv_imagebutton_set_src",
  imageButtonState: "LV_IMAGEBUTTON_STATE_RELEASED",
  imageSet: "lv_image_set_src",
  canvasFormat: "LV_COLOR_FORMAT_ARGB8888",
  track: "int32_t",
  spanNew: "lv_spangroup_new_span",
};

/** 9.3 renamed these. */
const V93 = { ...V9, chartRange: "lv_chart_set_axis_range", calendarMonth: "lv_calendar_set_month_shown", spanNew: "lv_spangroup_add_span" };

export function apiFor(version) {
  const v = parseVersion(version);
  if (v?.major === 8) return V8;
  return v && v.minor >= 3 ? V93 : V9;
}
