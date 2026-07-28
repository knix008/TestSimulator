import * as THREE from 'three';

/**
 * Load a floor-plan file with EXIF orientation applied.
 * Must be used for both detection and the Three.js floor texture so pixel
 * coordinates (Width/Height, boxes) match the displayed image.
 *
 * @param {File | Blob} file
 * @returns {Promise<ImageBitmap>}
 */
export async function loadOrientedPlanBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older runtimes may not accept imageOrientation
    return createImageBitmap(file);
  }
}

/**
 * @param {File | Blob} file
 * @returns {Promise<THREE.CanvasTexture>}
 */
export async function loadOrientedPlanTexture(file) {
  const bitmap = await loadOrientedPlanBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, bitmap.width);
  canvas.height = Math.max(1, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Match TextureLoader default: image top ↔ UV v=1 ↔ world −Z after floor rotate
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
