import * as THREE from 'three';

const DEFAULT_WALL_HEIGHT    = 2.8;
const DEFAULT_WALL_THICKNESS = 0.15;

/**
 * 벽 세그먼트 배열로부터 Three.js 씬 그룹을 생성합니다.
 * @param {Array}  walls       - { start:{x,y}, end:{x,y}, layer? } 배열 (미터 단위)
 * @param {Object} settings    - { wallHeight, wallThickness, showFloor, showCeiling, wireframe }
 * @param {THREE.Texture|null} floorTexture
 * @param {{width:number, height:number}|null} imageSize
 * @returns {{ group: THREE.Group, boundingBox: THREE.Box3 }}
 */
export function buildArchitectureScene(walls, settings = {}, floorTexture = null, imageSize = null) {
  const {
    wallHeight    = DEFAULT_WALL_HEIGHT,
    wallThickness = DEFAULT_WALL_THICKNESS,
    showFloor     = true,
    showCeiling   = false,
    wireframe     = false,
  } = settings;

  const h = Math.max(0, wallHeight);
  const t = Math.max(0, wallThickness);

  const group = new THREE.Group();

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xddd8cc, wireframe });

  const floorMat = floorTexture
    ? new THREE.MeshLambertMaterial({ map: floorTexture, wireframe })
    : new THREE.MeshLambertMaterial({ color: 0xb0a898, wireframe });

  const ceilMat = new THREE.MeshLambertMaterial({
    color: 0xf0ece4, transparent: true, opacity: 0.35, wireframe,
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let idx = 0; idx < (walls?.length ?? 0); idx++) {
    const wall = walls[idx];
    const dx  = wall.end.x - wall.start.x;
    const dy  = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;

    const cx = (wall.start.x + wall.end.x) / 2;
    const cy = (wall.start.y + wall.end.y) / 2;

    if (h > 0) {
      const geom = new THREE.BoxGeometry(len + (t > 0 ? t : 0.001), h, t > 0 ? t : 0.001);
      const mesh = new THREE.Mesh(geom, wallMat);
      mesh.position.set(cx, h / 2, -cy);
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        type:   'wall',
        index:  idx,
        layer:  wall.layer ?? '0',
        name:   wall.name  ?? `Wall ${idx + 1}`,
        startX: wall.start.x.toFixed(3),
        startY: wall.start.y.toFixed(3),
        endX:   wall.end.x.toFixed(3),
        endY:   wall.end.y.toFixed(3),
        length: len.toFixed(3),
      };
      group.add(mesh);
    }

    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minY = Math.min(minY, wall.start.y, wall.end.y);
    maxY = Math.max(maxY, wall.start.y, wall.end.y);
  }

  // 바닥/천장 크기:
  //   imageSize 있으면 → 이미지 전체 크기 (텍스처 UV와 벽 좌표가 정확히 일치)
  //   없으면 → 벽 bbox × 1.05 (DXF/IFC 등 이미지 없는 경우)
  let fw, fd, fcx, fcy;
  if (imageSize) {
    fw  = imageSize.width;
    fd  = imageSize.height;
    fcx = imageSize.width  / 2;
    fcy = imageSize.height / 2;
  } else if (isFinite(minX)) {
    fw  = (maxX - minX) * 1.05;
    fd  = (maxY - minY) * 1.05;
    fcx = (minX + maxX) / 2;
    fcy = (minY + maxY) / 2;
  }

  if (fw != null) {
    if (showFloor) {
      if (floorTexture) {
        // 이미지 좌표계(Y↓) → Three.js Z축 방향 일치: flipY=false
        floorTexture.flipY = false;
        floorTexture.wrapS = THREE.ClampToEdgeWrapping;
        floorTexture.wrapT = THREE.ClampToEdgeWrapping;
        floorTexture.needsUpdate = true;
      }
      const floorGeom = new THREE.PlaneGeometry(fw, fd);
      const floor = new THREE.Mesh(floorGeom, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(fcx, 0, -fcy);
      floor.receiveShadow = true;
      floor.userData = { type: 'floor' };
      group.add(floor);
    }

    if (showCeiling && h > 0) {
      const ceilGeom = new THREE.PlaneGeometry(fw, fd);
      const ceil = new THREE.Mesh(ceilGeom, ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(fcx, h, -fcy);
      group.add(ceil);
    }
  }

  const boundingBox = new THREE.Box3().setFromObject(group);
  return { group, boundingBox };
}

export function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
      } else {
        obj.material?.map?.dispose();
        obj.material?.dispose();
      }
    }
  });
  group.clear();
}
