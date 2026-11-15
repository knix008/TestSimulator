// Whether WebGL runs on a CPU rasteriser instead of a GPU (pure, Node-testable).
// SwiftShader (Chrome/Edge without a usable GPU or with it blocked), Mesa llvmpipe / softpipe /
// lavapipe (Linux without drivers), and the Microsoft Basic Render Driver / WARP (Windows without
// a display driver). The viewport then takes its light path (engine/viewport.js).

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|basic render|microsoft basic|\bwarp\b|software/i;

/** True when the renderer string names a software rasteriser. */
export const isSoftwareRendererName = (name) => SOFTWARE.test(String(name ?? ''));

/** True when the WebGL context `gl` draws on the CPU. */
export function isSoftwareRenderer(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return isSoftwareRendererName(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch { return false; }
}
