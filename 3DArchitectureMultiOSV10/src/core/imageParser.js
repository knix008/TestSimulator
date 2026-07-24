/**
 * 이미지에서 벽 선분 자동 감지
 * 파이프라인: 그레이스케일 → 가우시안 블러 → Sobel 엣지 → Hough → 선분 추출
 */

const MAX_SIZE = 1024;

function toGrayscale(data, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    g[i] = Math.round(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]);
  return g;
}

function gaussianBlur(g, w, h) {
  // 5×5 Gaussian (sigma≈1.4)
  const K = [2,4,5,4,2, 4,9,12,9,4, 5,12,15,12,5, 4,9,12,9,4, 2,4,5,4,2];
  const S = 159;
  const out = new Uint8Array(w * h);
  for (let y = 2; y < h-2; y++) for (let x = 2; x < w-2; x++) {
    let s = 0;
    for (let ky=-2; ky<=2; ky++) for (let kx=-2; kx<=2; kx++)
      s += g[(y+ky)*w+(x+kx)] * K[(ky+2)*5+(kx+2)];
    out[y*w+x] = Math.round(s/S);
  }
  return out;
}

// 두 번째 블러 (JPEG 아티팩트 제거용)
function blur3(g, w, h) {
  const K = [1,2,1, 2,4,2, 1,2,1], S = 16;
  const out = new Uint8Array(g);
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
    let s = 0;
    for (let ky=-1; ky<=1; ky++) for (let kx=-1; kx<=1; kx++)
      s += g[(y+ky)*w+(x+kx)] * K[(ky+1)*3+(kx+1)];
    out[y*w+x] = Math.round(s/S);
  }
  return out;
}

function sobelEdge(g, w, h) {
  const mag = new Float32Array(w * h);
  const gx  = new Float32Array(w * h);
  const gy  = new Float32Array(w * h);
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
    const dx =
      -g[(y-1)*w+(x-1)] + g[(y-1)*w+(x+1)]
      -2*g[y*w+(x-1)]   + 2*g[y*w+(x+1)]
      -g[(y+1)*w+(x-1)] + g[(y+1)*w+(x+1)];
    const dy =
      -g[(y-1)*w+(x-1)] - 2*g[(y-1)*w+x] - g[(y-1)*w+(x+1)]
      +g[(y+1)*w+(x-1)] + 2*g[(y+1)*w+x] + g[(y+1)*w+(x+1)];
    gx[y*w+x]  = dx;
    gy[y*w+x]  = dy;
    mag[y*w+x] = Math.sqrt(dx*dx + dy*dy);
  }
  return { mag, gx, gy };
}

/**
 * Non-Maximum Suppression (4방향): 그래디언트 방향을 0°/45°/90°/135° 4구간으로 분류해
 * 해당 방향 이웃과 비교하여 로컬 최대값만 남김.
 * tan(67.5°) ≈ 2.414 경계로 분류 → 각 구간 ±22.5° 범위.
 */
function nonMaxSuppression(mag, gx, gy, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const m = mag[y*w+x];
      if (m === 0) continue;
      const cx = gx[y*w+x], cy = gy[y*w+x];
      const ax = Math.abs(cx), ay = Math.abs(cy);
      let n1, n2;
      if (ax >= 2.414 * ay) {
        // ≈ 0°: 수평 그래디언트 → 수직 엣지
        n1 = mag[y*w+(x-1)]; n2 = mag[y*w+(x+1)];
      } else if (ay >= 2.414 * ax) {
        // ≈ 90°: 수직 그래디언트 → 수평 엣지
        n1 = mag[(y-1)*w+x]; n2 = mag[(y+1)*w+x];
      } else if (cx * cy > 0) {
        // ≈ 45°
        n1 = mag[(y-1)*w+(x-1)]; n2 = mag[(y+1)*w+(x+1)];
      } else {
        // ≈ 135°
        n1 = mag[(y-1)*w+(x+1)]; n2 = mag[(y+1)*w+(x-1)];
      }
      if (m >= n1 && m >= n2) out[y*w+x] = m;
    }
  }
  return out;
}

/**
 * 수직/수평 방향별 독립 스케일로 threshold.
 * 수평 피처가 강해도 수직 엣지가 자체 최댓값 기준으로 판단되어 누락되지 않음.
 */
function binaryThreshold(magNms, gx, gy, w, h, ratio) {
  let maxGx = 0, maxGy = 0;
  for (let i = 0; i < w * h; i++) {
    if (magNms[i] === 0) continue;
    const ax = Math.abs(gx[i]), ay = Math.abs(gy[i]);
    if (ax > maxGx) maxGx = ax;
    if (ay > maxGy) maxGy = ay;
  }
  const tV = maxGx * ratio; // 수직 엣지 (수평 그래디언트) 임계값
  const tH = maxGy * ratio; // 수평 엣지 (수직 그래디언트) 임계값
  const edges = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (magNms[i] === 0) continue;
    const ax = Math.abs(gx[i]), ay = Math.abs(gy[i]);
    if (ax >= ay && ax >= tV) edges[i] = 1; // 수직 엣지
    if (ay >  ax && ay >= tH) edges[i] = 1; // 수평 엣지
  }
  return edges;
}

/**
 * 노이즈 제거: 5×5 윈도우에서 이웃 엣지 픽셀이 MIN_NEIGHBORS 미만인 픽셀을 제거.
 * - 고립된 단일 픽셀·짧은 파편(텍스처, JPEG 아티팩트) 제거
 * - 긴 직선 엣지(벽)는 보존: 직선 위 픽셀은 양쪽 4개 이상 이웃이 보장됨
 *
 * 팽창(dilation)은 하지 않음: 건축 평면도에서 이중 선(벽 안팎)이 팽창으로
 * 연결되면 Hough가 잘못된 중간 위치를 검출해 벽이 이상하게 배치됨
 */
function denoiseEdges(edges, w, h, minNeighbors = 4) {
  const out = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (!edges[y * w + x]) continue;
      let cnt = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dy === 0 && dx === 0) continue;
          if (edges[(y + dy) * w + (x + dx)]) cnt++;
        }
      }
      if (cnt >= minNeighbors) out[y * w + x] = 1;
    }
  }
  return out;
}

// minVotesV: 수직선(Z축 방향), minVotesH: 수평선(X축 방향) — 각 방향의 이미지 크기 기준
function houghTransform(edges, w, h, minVotesV, minVotesH) {
  const diag   = Math.ceil(Math.sqrt(w*w + h*h));
  const rhoN   = diag * 2 + 1;
  const thetaN = 180;
  const acc    = new Int32Array(rhoN * thetaN);
  const cosT   = new Float32Array(thetaN);
  const sinT   = new Float32Array(thetaN);
  for (let t = 0; t < thetaN; t++) {
    const a = (t * Math.PI) / thetaN;
    cosT[t] = Math.cos(a);
    sinT[t] = Math.sin(a);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!edges[y*w+x]) continue;
    for (let t = 0; t < thetaN; t++) {
      const rho = Math.round(x * cosT[t] + y * sinT[t]) + diag;
      if (rho >= 0 && rho < rhoN) acc[rho * thetaN + t]++;
    }
  }

  // 건축 평면도: 수평(θ≈90°)·수직(θ≈0°/180°) 방향만 허용 (±15° 이내)
  const ANGLE_TOL = 15 * Math.PI / 180;
  function isVert(a)  { return a <= ANGLE_TOL || a >= Math.PI - ANGLE_TOL; }
  function isHoriz(a) { return Math.abs(a - Math.PI / 2) <= ANGLE_TOL; }

  // NMS: 7×7 윈도우, theta는 순환(0°=180°) wrap-around 적용
  const NMS = 6;
  const lines = [];
  for (let r = NMS; r < rhoN - NMS; r++) {
    for (let t = 0; t < thetaN; t++) {
      const v = acc[r * thetaN + t];
      if (v === 0) continue;
      const theta = (t * Math.PI) / thetaN;
      const a = theta % Math.PI;
      const vert = isVert(a), horiz = isHoriz(a);
      if (!vert && !horiz) continue;
      if (v < (vert ? minVotesV : minVotesH)) continue;
      let isMax = true;
      outer: for (let dr = -NMS; dr <= NMS; dr++) {
        for (let dt = -NMS; dt <= NMS; dt++) {
          if (dr === 0 && dt === 0) continue;
          const tt = ((t + dt) % thetaN + thetaN) % thetaN;
          if (acc[(r + dr) * thetaN + tt] > v) { isMax = false; break outer; }
        }
      }
      if (!isMax) continue;
      lines.push({ rho: r - diag, theta, votes: v, vert });
    }
  }
  return lines.sort((a, b) => b.votes - a.votes).slice(0, 60);
}

function linesToSegments(lines, edges, w, h, minLen) {
  const rawSegs = [];
  const gapH = Math.max(25, Math.min(w,h) * 0.04); // 수평선 gap
  const gapV = Math.max(35, Math.min(w,h) * 0.06); // 수직선 gap (문 개구부 연결)

  for (const { rho, theta } of lines) {
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const horizontal = Math.abs(sinT) > Math.abs(cosT);
    const gap = horizontal ? gapH : gapV;
    const pts = [];

    if (horizontal) {
      for (let x=0; x<w; x++) {
        const y = Math.round((rho - x*cosT) / sinT);
        for (let dy=-2; dy<=2; dy++) {
          const ny = y+dy;
          if (ny>=0 && ny<h && edges[ny*w+x]) { pts.push(x); break; }
        }
      }
    } else {
      for (let y=0; y<h; y++) {
        const x = Math.round((rho - y*sinT) / cosT);
        for (let dx=-3; dx<=3; dx++) {  // 수직선: ±3px 탐색 (±2→±3)
          const nx = x+dx;
          if (nx>=0 && nx<w && edges[y*w+nx]) { pts.push(y); break; }
        }
      }
    }

    if (pts.length < minLen) continue;
    const getXY = (p) => horizontal
      ? { x: p, y: Math.round((rho - p*cosT)/sinT) }
      : { x: Math.round((rho - p*sinT)/cosT), y: p };

    // 엣지 픽셀 밀도 ≥35% 미만인 선분 제거: 가구/텍스트처럼 엣지가 듬성한 선 억제
    const MIN_DENSITY = 0.35;
    let segStart = pts[0], prev = pts[0], segPts = 1;
    for (let i=1; i<pts.length; i++) {
      const p = pts[i];
      if (p - prev > gap) {
        const span = prev - segStart + 1;
        if (span >= minLen && segPts / span >= MIN_DENSITY) {
          rawSegs.push({ start: getXY(segStart), end: getXY(prev), horizontal });
        }
        segStart = p; segPts = 1;
      } else {
        segPts++;
      }
      prev = p;
    }
    const span = prev - segStart + 1;
    if (span >= minLen && segPts / span >= MIN_DENSITY) {
      rawSegs.push({ start: getXY(segStart), end: getXY(prev), horizontal });
    }
  }

  // 근접 평행 선분 병합: 같은 방향에서 위치가 거의 동일한 선분을 하나로 합침
  const MERGE_DIST = Math.min(w, h) * 0.035; // 평면도 벽 두께(양쪽 엣지) 병합 — 3.5%
  const used = new Uint8Array(rawSegs.length);
  const segments = [];

  // 세그먼트 겹침 판정용 gap — 분할 gap(gapH/gapV)보다 작게: 실제 인접·겹침만 연결
  const joinGapH = Math.round(gapH * 0.4);
  const joinGapV = Math.round(gapV * 0.4);

  for (let i = 0; i < rawSegs.length; i++) {
    if (used[i]) continue;
    const a = rawSegs[i];
    let sx1 = a.horizontal ? a.start.x : a.start.y;
    let sx2 = a.horizontal ? a.end.x   : a.end.y;

    // 중심선 계산을 위해 수직 위치(수평선→y, 수직선→x)의 가중 평균 유지
    let perpSum  = (a.horizontal ? a.start.y : a.start.x) * (sx2 - sx1 + 1);
    let perpWt   = sx2 - sx1 + 1;

    for (let j = i+1; j < rawSegs.length; j++) {
      if (used[j]) continue;
      const b = rawSegs[j];
      if (b.horizontal !== a.horizontal) continue;

      // 수직 거리(평행 엣지 간격)가 MERGE_DIST 이내인지 확인
      const da = a.horizontal
        ? Math.abs(a.start.y - b.start.y)
        : Math.abs(a.start.x - b.start.x);
      if (da > MERGE_DIST) continue;

      // 겹치거나 인접한 구간이면 병합 (joinGap으로 판정)
      const bx1 = b.horizontal ? b.start.x : b.start.y;
      const bx2 = b.horizontal ? b.end.x   : b.end.y;
      const jg  = a.horizontal ? joinGapH : joinGapV;
      if (bx1 <= sx2 + jg && bx2 >= sx1 - jg) {
        const bLen = bx2 - bx1 + 1;
        perpSum += (b.horizontal ? b.start.y : b.start.x) * bLen;
        perpWt  += bLen;
        sx1 = Math.min(sx1, bx1);
        sx2 = Math.max(sx2, bx2);
        used[j] = 1;
      }
    }
    used[i] = 1;

    if (sx2 - sx1 < minLen) continue;

    // 중심선: 병합된 모든 평행 엣지의 길이 가중 평균 위치
    const perpPos = Math.round(perpSum / perpWt);
    const getXY2 = (p) => a.horizontal
      ? { x: p, y: perpPos }
      : { x: perpPos, y: p };
    segments.push({ start: getXY2(sx1), end: getXY2(sx2) });
  }

  return segments;
}

export async function parseImageToWalls(src, pixelsPerMeter = 100, edgeThreshold = 0.18, minNeighbors = 4, onProgress = null) {
  const img = await loadImage(src);

  let sw = img.naturalWidth, sh = img.naturalHeight, downscale = 1;
  if (sw > MAX_SIZE || sh > MAX_SIZE) {
    downscale = MAX_SIZE / Math.max(sw, sh);
    sw = Math.round(sw * downscale);
    sh = Math.round(sh * downscale);
  }

  onProgress?.(0.1);

  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);
  const imageData = ctx.getImageData(0, 0, sw, sh);
  onProgress?.(0.2);

  const gray    = toGrayscale(imageData.data, sw, sh);
  const blurred = blur3(gaussianBlur(gray, sw, sh), sw, sh); // 두 번 블러
  onProgress?.(0.4);

  const { mag, gx, gy } = sobelEdge(blurred, sw, sh);
  const magNms   = nonMaxSuppression(mag, gx, gy, sw, sh);
  const edgesRaw = binaryThreshold(magNms, gx, gy, sw, sh, edgeThreshold);
  onProgress?.(0.5);

  // 노이즈 제거: 고립 픽셀·짧은 파편 제거
  const edgesClean = denoiseEdges(edgesRaw, sw, sh, minNeighbors);

  // 이미지 테두리 여백 제거: 가장자리 그래디언트가 Hough에서 벽으로 오인되는 것 방지
  const borderPx = Math.max(3, Math.round(Math.min(sw, sh) * 0.02));
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (y < borderPx || y >= sh - borderPx || x < borderPx || x >= sw - borderPx) {
        edgesRaw[y * sw + x]   = 0;
        edgesClean[y * sw + x] = 0;
      }
    }
  }
  onProgress?.(0.6);

  // ① 엣지 검출 결과 시각화 (NMS + 이진화, 노이즈 제거 전)
  const rawEdgeDataUrl = (() => {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const cx = c.getContext('2d');
    const d = cx.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) {
      const v = edgesRaw[i] ? 255 : 0;
      d.data[i*4]=v; d.data[i*4+1]=v; d.data[i*4+2]=v; d.data[i*4+3]=255;
    }
    cx.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  })();

  // 수직선(Z축): 이미지 높이 기준 / 수평선(X축): 이미지 너비 기준 → 각 방향의 실제 최대 투표수 대비 동등한 감도
  const minVotesV = sh * 0.08; // 수직선 — 높이의 8% (minSegLen과 동일 비율로 Hough 미탐 방지)
  const minVotesH = sw * 0.10; // 수평선 — 너비의 10%
  const lines     = houghTransform(edgesClean, sw, sh, minVotesV, minVotesH);
  onProgress?.(0.8);

  const minSegLen = Math.min(sw, sh) * 0.08;
  const pixSegs   = linesToSegments(lines, edgesClean, sw, sh, minSegLen);
  onProgress?.(0.9);

  // ② 노이즈 제거 결과 시각화 (denoised 엣지만, 오버레이 없음)
  const denoisedEdgeDataUrl = (() => {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const cx = c.getContext('2d');
    const d = cx.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) {
      const v = edgesClean[i] ? 255 : 0;
      d.data[i*4]=v; d.data[i*4+1]=v; d.data[i*4+2]=v; d.data[i*4+3]=255;
    }
    cx.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  })();

  // ③ 최종 검출된 벽 선분 시각화: 노이즈 제거 엣지 위에 컬러 선으로 오버레이
  const wallPreviewDataUrl = (() => {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const cx = c.getContext('2d');
    const d = cx.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) {
      const v = edgesClean[i] ? 80 : 0;
      d.data[i*4]=v; d.data[i*4+1]=v; d.data[i*4+2]=v; d.data[i*4+3]=255;
    }
    cx.putImageData(d, 0, 0);
    const lw = Math.max(1.5, Math.min(sw, sh) / 150);
    cx.strokeStyle = '#00e676';
    cx.lineWidth   = lw;
    cx.lineCap     = 'round';
    for (const seg of pixSegs) {
      cx.beginPath();
      cx.moveTo(seg.start.x, seg.start.y);
      cx.lineTo(seg.end.x,   seg.end.y);
      cx.stroke();
    }
    return c.toDataURL('image/png');
  })();

  // 픽셀 → 미터: 이미지 좌표계 그대로 유지 (Y축 반전은 buildGeometry.js에서 처리)
  const ppm = pixelsPerMeter * downscale;
  const walls = pixSegs.map((seg) => ({
    start: { x: seg.start.x / ppm, y: seg.start.y / ppm },
    end:   { x: seg.end.x   / ppm, y: seg.end.y   / ppm },
    layer: 'IMAGE_DETECTED',
  }));

  onProgress?.(1.0);
  return {
    walls,
    edgeDataUrl:         rawEdgeDataUrl,      // ① 엣지 검출 (NMS + 이진화)
    denoisedEdgeDataUrl: denoisedEdgeDataUrl, // ② 노이즈 제거 후 엣지
    cleanEdgeDataUrl:    wallPreviewDataUrl,  // ③ 검출 벽 선분 오버레이 (참고용)
    imageWidth:  img.naturalWidth  / pixelsPerMeter,
    imageHeight: img.naturalHeight / pixelsPerMeter,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    // SVG 등은 crossOrigin 불필요
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}
