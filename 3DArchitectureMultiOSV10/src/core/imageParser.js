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
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
    const gx =
      -g[(y-1)*w+(x-1)] + g[(y-1)*w+(x+1)]
      -2*g[y*w+(x-1)]   + 2*g[y*w+(x+1)]
      -g[(y+1)*w+(x-1)] + g[(y+1)*w+(x+1)];
    const gy =
      -g[(y-1)*w+(x-1)] - 2*g[(y-1)*w+x] - g[(y-1)*w+(x+1)]
      +g[(y+1)*w+(x-1)] + 2*g[(y+1)*w+x] + g[(y+1)*w+(x+1)];
    mag[y*w+x] = Math.sqrt(gx*gx + gy*gy);
  }
  return mag;
}

function binaryThreshold(mag, w, h, ratio) {
  let maxV = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > maxV) maxV = mag[i];
  const thresh = maxV * ratio;
  const edges = new Uint8Array(w * h);
  for (let i = 0; i < mag.length; i++) edges[i] = mag[i] >= thresh ? 1 : 0;
  return edges;
}

/**
 * 노이즈 제거: 5×5 윈도우에서 이웃 엣지 픽셀이 MIN_NEIGHBORS 미만인 픽셀을 제거.
 * 고립된 단일 픽셀·짧은 파편을 없애고 긴 직선 엣지(벽)는 보존.
 * 이후 3×3 팽창(dilation)으로 연속성을 복원.
 */
function denoiseEdges(edges, w, h) {
  const MIN_NEIGHBORS = 4; // 5×5 윈도우(24이웃) 중 최소 이 수 이상이어야 유지

  // 1단계: 희소 픽셀 제거
  const sparse = new Uint8Array(w * h);
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
      if (cnt >= MIN_NEIGHBORS) sparse[y * w + x] = 1;
    }
  }

  // 2단계: 3×3 팽창으로 벽 엣지 연속성 복원
  const dilated = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (sparse[(y + dy) * w + (x + dx)]) { dilated[y * w + x] = 1; break; }
        }
        if (dilated[y * w + x]) break;
      }
    }
  }
  return dilated;
}

function houghTransform(edges, w, h, minVotes) {
  const diag  = Math.ceil(Math.sqrt(w*w + h*h));
  const rhoN  = diag * 2 + 1;
  const thetaN = 180;
  const acc   = new Int32Array(rhoN * thetaN);
  const cosT  = new Float32Array(thetaN);
  const sinT  = new Float32Array(thetaN);
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

  // 건축 평면도 특성: 수평(θ≈0°/180°)·수직(θ≈90°) 방향만 허용 (±12° 이내)
  // 대각선 벽은 일반 건물에 드물므로 노이즈로 간주
  const ANGLE_TOL = 12 * Math.PI / 180; // 12° 허용 범위
  function isStructural(theta) {
    const a = theta % Math.PI;
    return a <= ANGLE_TOL || a >= Math.PI - ANGLE_TOL      // 수직선(θ≈0°)
        || Math.abs(a - Math.PI / 2) <= ANGLE_TOL;         // 수평선(θ≈90°)
  }

  // NMS: 7×7 윈도우 (중복 억제)
  const lines = [];
  for (let r = 6; r < rhoN-6; r++) for (let t = 6; t < thetaN-6; t++) {
    const v = acc[r*thetaN+t];
    if (v < minVotes) continue;
    let isMax = true;
    outer: for (let dr=-6; dr<=6; dr++) for (let dt=-6; dt<=6; dt++) {
      if (dr===0 && dt===0) continue;
      if (acc[(r+dr)*thetaN+(t+dt)] > v) { isMax=false; break outer; }
    }
    if (!isMax) continue;
    const theta = (t * Math.PI) / thetaN;
    if (!isStructural(theta)) continue; // 비수직·비수평 제거
    lines.push({ rho: r-diag, theta, votes: v });
  }
  return lines.sort((a,b) => b.votes - a.votes).slice(0, 40);
}

function linesToSegments(lines, edges, w, h, minLen) {
  const rawSegs = [];
  const gap = Math.max(25, Math.min(w,h) * 0.04);

  for (const { rho, theta } of lines) {
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const horizontal = Math.abs(sinT) > Math.abs(cosT);
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
        for (let dx=-2; dx<=2; dx++) {
          const nx = x+dx;
          if (nx>=0 && nx<w && edges[y*w+nx]) { pts.push(y); break; }
        }
      }
    }

    if (pts.length < minLen) continue;
    const getXY = (p) => horizontal
      ? { x: p, y: Math.round((rho - p*cosT)/sinT) }
      : { x: Math.round((rho - p*sinT)/cosT), y: p };

    let segStart = pts[0], prev = pts[0];
    for (let i=1; i<pts.length; i++) {
      const p = pts[i];
      if (p - prev > gap) {
        if (prev - segStart >= minLen) rawSegs.push({ start: getXY(segStart), end: getXY(prev), horizontal });
        segStart = p;
      }
      prev = p;
    }
    if (prev - segStart >= minLen) rawSegs.push({ start: getXY(segStart), end: getXY(prev), horizontal });
  }

  // 근접 평행 선분 병합: 같은 방향에서 위치가 거의 동일한 선분을 하나로 합침
  const MERGE_DIST = Math.min(w, h) * 0.015; // 이미지 크기의 1.5% 이내
  const used = new Uint8Array(rawSegs.length);
  const segments = [];

  for (let i = 0; i < rawSegs.length; i++) {
    if (used[i]) continue;
    const a = rawSegs[i];
    let sx1 = a.horizontal ? a.start.x : a.start.y;
    let sx2 = a.horizontal ? a.end.x   : a.end.y;

    for (let j = i+1; j < rawSegs.length; j++) {
      if (used[j]) continue;
      const b = rawSegs[j];
      if (b.horizontal !== a.horizontal) continue;

      // 같은 축 위치인지 확인 (수직 거리)
      const da = a.horizontal
        ? Math.abs(a.start.y - b.start.y)
        : Math.abs(a.start.x - b.start.x);
      if (da > MERGE_DIST) continue;

      // 겹치거나 인접한 구간이면 병합
      const bx1 = b.horizontal ? b.start.x : b.start.y;
      const bx2 = b.horizontal ? b.end.x   : b.end.y;
      if (bx1 <= sx2 + gap && bx2 >= sx1 - gap) {
        sx1 = Math.min(sx1, bx1);
        sx2 = Math.max(sx2, bx2);
        used[j] = 1;
      }
    }
    used[i] = 1;

    // 병합 후에도 최소 길이 만족 시 추가
    if (sx2 - sx1 < minLen) continue;

    const getXY2 = (p) => a.horizontal
      ? { x: p, y: a.start.y }
      : { x: a.start.x, y: p };
    segments.push({ start: getXY2(sx1), end: getXY2(sx2) });
  }

  return segments;
}

export async function parseImageToWalls(src, pixelsPerMeter = 100, edgeThreshold = 0.12, onProgress = null) {
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

  const mag        = sobelEdge(blurred, sw, sh);
  const edgesRaw   = binaryThreshold(mag, sw, sh, edgeThreshold);
  onProgress?.(0.5);

  // 노이즈 제거: 고립 픽셀·짧은 파편 제거 후 팽창 복원
  const edgesClean = denoiseEdges(edgesRaw, sw, sh);
  onProgress?.(0.6);

  // 엣지 시각화 ① 원본 (Sobel 이진화 결과)
  const makeEdgeDataUrl = (edgeMap) => {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const cx = c.getContext('2d');
    const d = cx.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) {
      const v = edgeMap[i] ? 255 : 0;
      d.data[i*4]=v; d.data[i*4+1]=v; d.data[i*4+2]=v; d.data[i*4+3]=255;
    }
    cx.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  };
  const rawEdgeDataUrl   = makeEdgeDataUrl(edgesRaw);
  const cleanEdgeDataUrl = makeEdgeDataUrl(edgesClean);

  // Hough 변환에는 노이즈 제거된 엣지 사용
  const minVotes = Math.min(sw, sh) * 0.10;
  const lines    = houghTransform(edgesClean, sw, sh, minVotes);
  onProgress?.(0.8);

  const minSegLen = Math.min(sw, sh) * 0.05; // 5% 미만 짧은 선분 제거
  const pixSegs   = linesToSegments(lines, edgesClean, sw, sh, minSegLen);
  onProgress?.(0.9);

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
    edgeDataUrl:      rawEdgeDataUrl,   // 원본 엣지 (Sobel 이진화)
    cleanEdgeDataUrl: cleanEdgeDataUrl, // 노이즈 제거 후 엣지
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
