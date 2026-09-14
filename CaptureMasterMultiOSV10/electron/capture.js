// Screen capture primitives (main process side).
//
//   • listSources  — screens and windows with small thumbnails for the picker
//   • grabScreen   — a full-resolution still of one display. desktopCapturer
//                    scales its "thumbnail" to the requested size, so asking
//                    for the display's physical size yields a 1:1 screenshot.
//   • displays     — geometry of every display (for the region overlay)
//
// Window stills are not taken here: desktopCapturer would stretch a small
// window up to the requested size. The renderer grabs one frame from a
// getUserMedia stream instead, which arrives at the window's true pixel size
// (see src/lib/capture.js).
const { desktopCapturer, screen, ipcMain } = require('electron');

async function listSources({ types = ['screen', 'window'], thumbWidth = 360 } = {}) {
  const sources = await desktopCapturer.getSources({
    types,
    thumbnailSize: { width: thumbWidth, height: Math.round(thumbWidth * 0.6) },
    fetchWindowIcons: true,
  });
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return sources
    .filter((s) => s.name !== 'CaptureMaster')   // never offer our own window
    .map((s, i) => {
      const isScreen = s.id.startsWith('screen');
      const display = isScreen ? displays.find((d) => String(d.id) === String(s.display_id)) : null;
      return {
        id: s.id,
        name: isScreen && displays.length > 1 ? `${s.name} ${i + 1}` : s.name,
        kind: isScreen ? 'screen' : 'window',
        displayId: s.display_id || (display ? String(display.id) : null),
        isPrimary: !!display && display.id === primary.id,
        bounds: display ? display.bounds : null,
        thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      };
    });
}

function physicalSize(display) {
  return {
    width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.size.height * display.scaleFactor)),
  };
}

/** Full-resolution still of a display. sourceId may be omitted for the primary display. */
async function grabScreen(sourceId) {
  const displays = screen.getAllDisplays();
  // Match the source to a display first, so the thumbnail is requested at the
  // right size — a wrong size means a resampled screenshot.
  const probe = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
  if (!probe.length) throw new Error('No screen is available for capture.');
  const meta = sourceId ? probe.find((s) => s.id === sourceId) : (probe.find((s) => String(s.display_id) === String(screen.getPrimaryDisplay().id)) || probe[0]);
  if (!meta) throw new Error('The selected screen no longer exists: ' + sourceId);
  const display = displays.find((d) => String(d.id) === String(meta.display_id)) || screen.getPrimaryDisplay();

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: physicalSize(display) });
  const src = sources.find((s) => s.id === meta.id);
  if (!src || src.thumbnail.isEmpty()) throw new Error('The screen capture came back empty. On Wayland, make sure the screen-sharing portal request was accepted.');
  const size = src.thumbnail.getSize();
  return {
    dataUrl: src.thumbnail.toDataURL(),
    width: size.width,
    height: size.height,
    name: src.name,
    sourceId: src.id,
    displayId: String(display.id),
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
  };
}

function listDisplays() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primary.id,
  }));
}

function registerCaptureHandlers() {
  ipcMain.handle('capture:listSources', (_e, opts) => listSources(opts || {}));
  ipcMain.handle('capture:grabScreen', (_e, sourceId) => grabScreen(sourceId));
  ipcMain.handle('capture:displays', () => listDisplays());
  ipcMain.handle('capture:cursorDisplay', () => {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return String(d.id);
  });
}

module.exports = { registerCaptureHandlers, listSources, grabScreen, listDisplays };
