import * as THREE from 'three';

export function create5x5GridWithRulers(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'GridAndRulerGroup';

  const gridSize = 10;
  const divisions = 5; // Exactly 5x5 grid cells
  const step = gridSize / divisions; // 2.0 units per cell

  // 1. 5x5 Grid Floor
  const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x3b82f6, 0x334155);
  gridHelper.position.y = -0.002;
  group.add(gridHelper);

  // 2. Grid Outer Border Frame
  const half = gridSize / 2;
  const borderPoints = [
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3(half, 0, -half),
    new THREE.Vector3(half, 0, half),
    new THREE.Vector3(-half, 0, half),
    new THREE.Vector3(-half, 0, -half),
  ];
  const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPoints);
  const borderMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, linewidth: 2 });
  const borderLine = new THREE.Line(borderGeom, borderMat);
  group.add(borderLine);

  // 3. Colored Main Axis Lines (X = Red, Y = Green, Z = Blue)
  const axisLength = half + 1.5;

  // X Axis Line (Red)
  const xGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-half, 0.005, 0),
    new THREE.Vector3(axisLength, 0.005, 0),
  ]);
  const xLine = new THREE.Line(xGeom, new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 3 }));
  group.add(xLine);

  // Z Axis Line (Blue)
  const zGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.005, -half),
    new THREE.Vector3(0, 0.005, axisLength),
  ]);
  const zLine = new THREE.Line(zGeom, new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 3 }));
  group.add(zLine);

  // Y Axis Line (Green, Vertical height ruler)
  const yGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, axisLength, 0),
  ]);
  const yLine = new THREE.Line(yGeom, new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 3 }));
  group.add(yLine);

  // 4. Tick Marks & Numerical Labels along X, Y, Z
  const tickMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 2 });

  // Ticks along X axis (-5 to +5 with step 2)
  for (let i = 0; i <= divisions; i++) {
    const val = -half + i * step; // -5, -3, -1, 1, 3, 5
    const tickLen = 0.25;

    // Tick line on X axis (along Z)
    const tGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(val, 0.01, -tickLen),
      new THREE.Vector3(val, 0.01, tickLen),
    ]);
    group.add(new THREE.Line(tGeom, tickMat));

    // Number Sprite Label
    try {
      const sprite = createTextSprite(`${val.toFixed(0)}`, '#f87171');
      sprite.position.set(val, 0.15, -0.5);
      group.add(sprite);
    } catch (e) {
      console.warn('TextSprite error:', e);
    }
  }

  // Ticks along Z axis (-5 to +5 with step 2)
  for (let i = 0; i <= divisions; i++) {
    const val = -half + i * step;
    if (Math.abs(val) < 0.01) continue; // Skip origin overlap
    const tickLen = 0.25;

    // Tick line on Z axis (along X)
    const tGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-tickLen, 0.01, val),
      new THREE.Vector3(tickLen, 0.01, val),
    ]);
    group.add(new THREE.Line(tGeom, tickMat));

    // Number Sprite Label
    try {
      const sprite = createTextSprite(`${val.toFixed(0)}`, '#60a5fa');
      sprite.position.set(-0.5, 0.15, val);
      group.add(sprite);
    } catch (e) {
      console.warn('TextSprite error:', e);
    }
  }

  // Ticks along Vertical Y axis (Height: 2, 4, 6)
  for (let y = step; y <= axisLength; y += step) {
    const tickLen = 0.25;
    const tGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-tickLen, y, 0),
      new THREE.Vector3(tickLen, y, 0),
    ]);
    group.add(new THREE.Line(tGeom, new THREE.LineBasicMaterial({ color: 0x4ade80, linewidth: 2 })));

    try {
      const sprite = createTextSprite(`Y:${y.toFixed(0)}`, '#4ade80');
      sprite.position.set(0.6, y, 0);
      group.add(sprite);
    } catch (e) {
      console.warn('TextSprite error:', e);
    }
  }

  // Axis End Indicators (+X, +Y, +Z)
  try {
    const xLabel = createTextSprite('+X', '#ef4444');
    xLabel.position.set(axisLength + 0.4, 0.2, 0);
    xLabel.scale.set(0.9, 0.45, 1);
    group.add(xLabel);

    const zLabel = createTextSprite('+Z', '#3b82f6');
    zLabel.position.set(0, 0.2, axisLength + 0.4);
    zLabel.scale.set(0.9, 0.45, 1);
    group.add(zLabel);

    const yLabel = createTextSprite('+Y', '#22c55e');
    yLabel.position.set(0, axisLength + 0.3, 0);
    yLabel.scale.set(0.9, 0.45, 1);
    group.add(yLabel);
  } catch (e) {
    console.warn('Axis label error:', e);
  }

  return group;
}

function createTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    
    // Fallback safe rectangle drawing
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(10, 10, 108, 44, 8);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      (ctx as any).roundRect(10, 10, 108, 44, 8);
      ctx.stroke();
    } else {
      ctx.fillRect(10, 10, 108, 44);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 108, 44);
    }

    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });

  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.7, 0.35, 1);
  return sprite;
}
