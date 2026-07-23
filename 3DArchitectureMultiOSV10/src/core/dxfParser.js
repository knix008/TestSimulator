import DxfParser from 'dxf-parser';

// DXF $INSUNITS 코드 → 미터 변환 계수
const UNIT_SCALE = {
  0: 0.001,   // 단위 미지정 → mm 가정
  1: 0.0254,  // inches
  2: 0.3048,  // feet
  4: 0.001,   // mm
  5: 0.01,    // cm
  6: 1.0,     // m
  7: 1000.0,  // km
};

function getUnitScale(dxf) {
  const insunits = dxf.header?.$INSUNITS ?? 4;
  return UNIT_SCALE[insunits] ?? 0.001;
}

// 레이어 목록 추출
function extractLayers(dxf) {
  const layerSet = new Set();
  for (const entity of dxf.entities ?? []) {
    if (entity.layer) layerSet.add(entity.layer);
  }
  // tables에서도 레이어 추출
  const tableLayers = Object.keys(dxf.tables?.layer?.layers ?? {});
  for (const l of tableLayers) layerSet.add(l);
  return Array.from(layerSet).sort();
}

// LWPOLYLINE 엔티티에서 벽 세그먼트 추출
function extractFromLWPolyline(entity, scale) {
  const segs = [];
  const verts = entity.vertices ?? [];
  const closed = entity.shape === true;

  for (let i = 0; i < verts.length - 1; i++) {
    segs.push({
      start: { x: verts[i].x * scale, y: verts[i].y * scale },
      end:   { x: verts[i + 1].x * scale, y: verts[i + 1].y * scale },
      layer: entity.layer ?? '0',
    });
  }
  if (closed && verts.length > 2) {
    segs.push({
      start: { x: verts[verts.length - 1].x * scale, y: verts[verts.length - 1].y * scale },
      end:   { x: verts[0].x * scale, y: verts[0].y * scale },
      layer: entity.layer ?? '0',
    });
  }
  return segs;
}

// LINE 엔티티에서 벽 세그먼트 추출
function extractFromLine(entity, scale) {
  const v = entity.vertices ?? [];
  if (v.length < 2) return [];
  return [{
    start: { x: v[0].x * scale, y: v[0].y * scale },
    end:   { x: v[1].x * scale, y: v[1].y * scale },
    layer: entity.layer ?? '0',
  }];
}

// POLYLINE (구형 형식) 엔티티 처리
function extractFromPolyline(entity, scale) {
  const segs = [];
  const verts = entity.vertices ?? [];
  const closed = (entity.shape === true) || ((entity.flags ?? 0) & 1);

  for (let i = 0; i < verts.length - 1; i++) {
    segs.push({
      start: { x: verts[i].x * scale, y: verts[i].y * scale },
      end:   { x: verts[i + 1].x * scale, y: verts[i + 1].y * scale },
      layer: entity.layer ?? '0',
    });
  }
  if (closed && verts.length > 2) {
    segs.push({
      start: { x: verts[verts.length - 1].x * scale, y: verts[verts.length - 1].y * scale },
      end:   { x: verts[0].x * scale, y: verts[0].y * scale },
      layer: entity.layer ?? '0',
    });
  }
  return segs;
}

/**
 * DXF 텍스트 내용을 파싱하여 벽 세그먼트와 레이어 목록을 반환
 * @param {string} content - DXF 파일 텍스트 내용
 * @returns {{ walls: Array, layers: Array, unitScale: number }}
 */
export function parseDxf(content) {
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(content);
  } catch (err) {
    throw new Error(`DXF 파싱 실패: ${err.message}`);
  }

  const scale = getUnitScale(dxf);
  const layers = extractLayers(dxf);
  const walls = [];

  for (const entity of dxf.entities ?? []) {
    let segs = [];
    switch (entity.type) {
      case 'LWPOLYLINE': segs = extractFromLWPolyline(entity, scale); break;
      case 'LINE':       segs = extractFromLine(entity, scale);        break;
      case 'POLYLINE':   segs = extractFromPolyline(entity, scale);    break;
      default: break;
    }
    // 최소 길이(1mm = 0.001m)보다 짧은 세그먼트 제거
    for (const seg of segs) {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      if (Math.sqrt(dx * dx + dy * dy) > 0.001) {
        walls.push(seg);
      }
    }
  }

  return { walls, layers, unitScale: scale };
}
