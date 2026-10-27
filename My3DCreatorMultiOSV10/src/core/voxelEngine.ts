import * as THREE from 'three';
import { VoxelBoxData } from '../types';

export function createVoxelBoxMesh(data: VoxelBoxData): THREE.Mesh {
  const [fx, fy, fz] = data.from;
  const [tx, ty, tz] = data.to;

  const width = Math.max(0.1, tx - fx);
  const height = Math.max(0.1, ty - fy);
  const depth = Math.max(0.1, tz - fz);

  const geometry = new THREE.BoxGeometry(width, height, depth);
  
  // Create pixel-grid canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = data.color;
    ctx.fillRect(0, 0, 64, 64);
    // Draw pixel grid border
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 64, 64);
    for (let i = 8; i < 64; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 64);
      ctx.moveTo(0, i); ctx.lineTo(64, i);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((fx + tx) / 2, (fy + ty) / 2, (fz + tz) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
