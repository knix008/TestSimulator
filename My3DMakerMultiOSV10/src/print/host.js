// The main window's side of printing. The print window (a popup: its own OS window on the desktop, a
// frame on the web) has no model, kernel or 3D scene, so it asks the main window for what goes on the
// page ('print-render'): the active drawing's sheet SVG, or a picture of the 3D view at the pixel size of
// the page's picture box. The answer comes back as a 'print-content' message (print/popup.js).
//
// The 3D picture: the user's camera, on white paper (no gradient sky, no grid), widened rather than
// cropped when the page is narrower than the screen; everything is put back right after.

/**
 * deps: { popups, viewport(), info() → { mode, name, kindLabel, material, sheet },
 *         drawing() → { svg, sheetW, sheetH }, saveExport(name, type, bytes, mime), showError(key, error, context), safeName() }
 */
export function createPrintHost(deps) {
  let running = false;
  let queue = [];

  function open() {
    const info = deps.info();
    if (!info) return undefined;
    return deps.popups.open('print', { info });
  }

  /**
   * A picture of the 3D view, w × h pixels, on white. framing 'screen': what the screen shows (widened, not
   * cropped, on a page narrower than the screen); 'model': the same view direction, zoomed so the model fills it.
   */
  function captureModel(w, h, framing = 'screen') {
    const vp = deps.viewport();
    if (!vp) throw new Error('no 3D view');
    const background = vp.scene.background;
    const distance = vp.distance;
    const target = vp.target.clone();
    const size = [vp.width, vp.height];
    const grid = vp.grid ? vp.grid.visible : null;
    try {
      vp.scene.background = vp.gradientTexture('#ffffff', '#ffffff');
      if (vp.grid) vp.grid.visible = false;
      const screen = vp.width / Math.max(1, vp.height);
      const page = w / Math.max(1, h);
      if (framing === 'model') {
        const box = vp.contentBox();
        [vp.width, vp.height] = [w, h];
        vp.distance = vp.fitDistance(box, vp.dir, vp.up) / 1.1;
        box.getCenter(vp.target);
        [vp.width, vp.height] = size;
      } else if (page < screen) {
        // The screen's width stays in the picture: a page narrower than the screen steps the camera back.
        vp.distance = distance * (screen / page);
      }
      return vp.capture(w, h).toDataURL('image/png');
    } finally {
      vp.scene.background?.dispose?.();
      vp.scene.background = background;
      vp.distance = distance;
      vp.target.copy(target);
      [vp.width, vp.height] = size;
      if (vp.grid) vp.grid.visible = grid;
      vp.updateCamera();
      vp.requestRender();
    }
  }

  async function renderOne(req) {
    if (req.type === 'drawing') return { ...(await deps.drawing()) };
    const w = Math.max(16, Math.min(8192, Math.round(Number(req.w) || 0)));
    const h = Math.max(16, Math.min(8192, Math.round(Number(req.h) || 0)));
    return { url: captureModel(w, h, req.framing === 'model' ? 'model' : 'screen') };
  }

  /** The print window asks: { gen, request: { type: 'drawing' } | { type: 'model', w, h, key } }. The newest wins. */
  async function render(data) {
    if (data?.request) queue = [data.request];
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const req = queue.shift();
        await new Promise((resolve) => setTimeout(resolve, 0));
        let content = null;
        let error = null;
        try { content = await renderOne(req); } catch (e) { error = String(e?.message ?? e); }
        await deps.popups.post('print', { type: 'print-content', key: req.key ?? req.type, content, error });
      }
    } finally {
      running = false;
    }
  }

  /** The web build's Save as PDF: the print window made the PDF, the main window saves it. */
  async function savePdf(data) {
    try {
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await deps.saveExport(data.name || `${deps.safeName()}.pdf`, 'pdf', bytes, 'application/pdf');
    } catch (error) {
      deps.showError('error.print', error, 'print');
    }
  }

  return { open, render, savePdf, captureModel };
}
