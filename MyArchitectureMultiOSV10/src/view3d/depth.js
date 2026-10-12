// Depth fixes against flicker (z-fighting) while the camera moves.
//
// Edge lines lie exactly on the faces they outline, so the depth test lets a
// face and its own edge win pixel by pixel in turn: the outline crawls as the
// view orbits or zooms. Lines take no polygonOffset in WebGL, so the shader
// moves them a hair towards the camera instead. The shift is constant in
// normalised depth, which is how the depth buffer's precision runs too: it
// stays a few steps of the buffer near and far, and never lets a line show
// through a solid object in front of it.
export const EDGE_DEPTH_PULL = 4e-6; // about 30 steps of a 24-bit buffer

export function pullForward(material, amount = EDGE_DEPTH_PULL) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n\tgl_Position.z -= ${amount.toExponential()} * gl_Position.w;`);
  };
  material.customProgramCacheKey = () => `pull${amount}`;
  return material;
}

// The ground disc sits just under level 0, where site slabs, yards and
// river beds often sit too: it is pushed back in depth so they always win.
export const GROUND_OFFSET = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 };
