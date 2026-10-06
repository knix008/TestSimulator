/** Identity of the product, shared by the window title, the About dialog and the installer. */

export const APP_ID = "com.shkwon.mydiffmerge";
export const APP_NAME = "My Diff & Merge";
export const APP_SHORT = "MyDiffMerge";
export const APP_VERSION = "1.0.0";
/** Shown in the title bar and the About dialog: `My Diff & Merge V1.0`. */
export const APP_TITLE = `${APP_NAME} V${APP_VERSION.split(".").slice(0, 2).join(".")}`;
export const AUTHOR = "SHKWON(knix008@naver.com)";
export const COPYRIGHT = `Copyright (c) ${AUTHOR}`;

/** The app's own document format: a saved comparison or merge session. */
export const DOC_EXTENSION = "dmrg";
export const DOC_MIME = "application/x-mydiffmerge-session";
export const DOC_DESCRIPTION = "My Diff & Merge Session";

/** Folder name under the per-user config directory. */
export const SETTINGS_FOLDER = "MyDiffMerge";
