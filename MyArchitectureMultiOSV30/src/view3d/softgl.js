// Is WebGL drawn by the CPU (no GPU, a remote desktop, a driver on the block
// list: SwiftShader, llvmpipe, Microsoft Basic Render)? Then every pixel and
// every light costs: the 3D view draws fewer pixels and lamps (viewer.js) and
// the start page keeps its sample previews 2D. Asked once, on a throw-away canvas.
let soft = null;

export function softwareWebGL() {
  if (soft !== null) return soft;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    soft = !!gl && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
    const lose = gl && gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  } catch { soft = false; }
  return soft;
}
