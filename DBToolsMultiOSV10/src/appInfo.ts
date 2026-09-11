// The application's identity, in one place.
//
// The version is written here rather than imported from package.json: the
// renderer, the Electron main process and the tests all need it, and only one
// of the three can rely on a bundler. `test/unit/ui.test.mjs` checks that it
// still matches package.json, so the two cannot drift apart unnoticed.
export const APP_NAME = 'DBTools';

/** Full version, matching package.json. */
export const APP_VERSION = '1.0.0';

/** Short form for window titles: `v1.0`. */
export const APP_VERSION_LABEL = `v${APP_VERSION.split('.').slice(0, 2).join('.')}`;

/** What the title bar shows when no document is involved. */
export const APP_TITLE = `${APP_NAME} ${APP_VERSION_LABEL}`;

/**
 * Title bar text for a document: its name, then the application.
 * `dirty` marks unsaved changes the way every editor does.
 */
export function windowTitle(documentName: string | null, dirty: boolean): string {
  const name = documentName && documentName.trim() ? documentName : APP_NAME;
  return `${dirty ? '● ' : ''}${name} — ${APP_TITLE}`;
}
