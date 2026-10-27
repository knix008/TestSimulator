import * as THREE from 'three';
import { SceneObject } from '../types';

export interface ParsedScadCmd {
  type: string;
  args: Record<string, any>;
  children?: ParsedScadCmd[];
}

export function parseAndExecuteScad(code: string): SceneObject[] {
  const objects: SceneObject[] = [];
  const lines = code.split('\n');

  let currentTranslate: [number, number, number] = [0, 0, 0];
  let currentRotate: [number, number, number] = [0, 0, 0];
  let objectCount = 0;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    // Check translate([x, y, z])
    const transMatch = line.match(/translate\s*\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*\)/);
    if (transMatch) {
      currentTranslate = [
        parseFloat(transMatch[1]),
        parseFloat(transMatch[2]),
        parseFloat(transMatch[3]),
      ];
    }

    // Check cube([x, y, z])
    const cubeMatch = line.match(/cube\s*\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/);
    if (cubeMatch) {
      objectCount++;
      const sx = parseFloat(cubeMatch[1]);
      const sy = parseFloat(cubeMatch[2]);
      const sz = parseFloat(cubeMatch[3]);
      objects.push({
        id: `scad-cube-${objectCount}`,
        name: `OpenSCAD Cube ${objectCount}`,
        type: 'cube',
        position: [...currentTranslate],
        rotation: [...currentRotate],
        scale: [sx, sy, sz],
        color: '#f59e0b',
        roughness: 0.3,
        metalness: 0.1,
        visible: true,
        locked: false,
      });
      // reset local transform
      currentTranslate = [0, 0, 0];
      continue;
    }

    // Check sphere(r=...) or sphere(...)
    const sphereMatch = line.match(/sphere\s*\(\s*(?:r\s*=\s*)?(-?[\d.]+)\s*\)/);
    if (sphereMatch) {
      objectCount++;
      const r = parseFloat(sphereMatch[1]);
      objects.push({
        id: `scad-sphere-${objectCount}`,
        name: `OpenSCAD Sphere ${objectCount}`,
        type: 'sphere',
        position: [...currentTranslate],
        rotation: [...currentRotate],
        scale: [r * 2, r * 2, r * 2],
        color: '#3b82f6',
        roughness: 0.2,
        metalness: 0.2,
        visible: true,
        locked: false,
      });
      currentTranslate = [0, 0, 0];
      continue;
    }

    // Check cylinder(h=..., r=...)
    const cylMatch = line.match(/cylinder\s*\(\s*(?:h\s*=\s*)?(-?[\d.]+)\s*,\s*(?:r\s*=\s*)?(-?[\d.]+)/);
    if (cylMatch) {
      objectCount++;
      const h = parseFloat(cylMatch[1]);
      const r = parseFloat(cylMatch[2]);
      objects.push({
        id: `scad-cylinder-${objectCount}`,
        name: `OpenSCAD Cylinder ${objectCount}`,
        type: 'cylinder',
        position: [...currentTranslate],
        rotation: [...currentRotate],
        scale: [r * 2, h, r * 2],
        color: '#10b981',
        roughness: 0.4,
        metalness: 0.1,
        visible: true,
        locked: false,
      });
      currentTranslate = [0, 0, 0];
      continue;
    }
  }

  return objects;
}
