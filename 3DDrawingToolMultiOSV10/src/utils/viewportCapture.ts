import type { Camera, Scene, WebGLRenderer } from 'three';
import * as THREE from 'three';

export type ViewportCaptureApi = {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
};

let api: ViewportCaptureApi | null = null;

export function registerViewportCapture(next: ViewportCaptureApi) {
  api = next;
}

export function unregisterViewportCapture(current?: ViewportCaptureApi) {
  if (!current || api === current) api = null;
}

export function getViewportCapture(): ViewportCaptureApi | null {
  return api;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = /data:([^;]+);/.exec(header)?.[1] || 'image/png';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Capture the 3D viewport as a PNG blob.
 * When includeBackground is false, clear alpha is 0 (transparent).
 */
export async function captureViewportPng(options: {
  includeBackground: boolean;
  backgroundColor: string;
}): Promise<Blob> {
  const capture = api;
  if (!capture) throw new Error('Viewport is not ready');

  const { gl, scene, camera } = capture;
  const prevBackground = scene.background;
  const prevAutoClear = gl.autoClear;
  const prevClearColor = new THREE.Color();
  const prevClearAlpha = gl.getClearAlpha();
  gl.getClearColor(prevClearColor);

  try {
    if (options.includeBackground) {
      const color = new THREE.Color(options.backgroundColor);
      scene.background = color;
      gl.setClearColor(color, 1);
    } else {
      scene.background = null;
      gl.setClearColor(0x000000, 0);
    }

    gl.autoClear = true;
    gl.render(scene, camera);

    const dataUrl = gl.domElement.toDataURL('image/png');
    return dataUrlToBlob(dataUrl);
  } finally {
    scene.background = prevBackground;
    gl.setClearColor(prevClearColor, prevClearAlpha);
    gl.autoClear = prevAutoClear;
    gl.render(scene, camera);
  }
}
