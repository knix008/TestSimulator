/** Fixed status bar height (must match `.app-status-bar` in globals.css). */
export const UI_STATUS_BAR_HEIGHT = 26;

/** Minimum window height (header + at least one content row + status bar). */
export const UI_MIN_HEIGHT = 480 + UI_STATUS_BAR_HEIGHT;

/** Bootstrap window width before header is measured (login screen). */
export const UI_DEFAULT_WINDOW_WIDTH = 1440;
export const UI_DEFAULT_WINDOW_HEIGHT = 920;

/** Absolute floor until the renderer measures the live header. */
export const UI_HEADER_MIN_WIDTH_FALLBACK = 360;

/** Minimum width for the scrollable nav strip (allows horizontal scroll when narrower). */
export const UI_NAV_MIN_SCROLL_VIEWPORT = 48;

/** Fixed gap between the logout button and the window's right inner edge. */
export const UI_NAV_TRAILING_MARGIN_END = 24;

/** Gap between the last nav item (Settings) and the program info button. */
export const UI_NAV_SCROLL_TRAILING_GAP = 8;
