/**
 * 앱 아이콘 PNG 생성 (512×512, RGBA)
 * 스타일: 밝은 스카이블루 배경, 좌상단 빛 반사, 좌측 중간 "3D" 텍스트, 3D 건물
 * 실행: node assets/create_icon.js
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');
const SIZE = 512;

// ── CRC32 / PNG encoder ──────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t   = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

// ── RGBA 픽셀 버퍼 ──────────────────────────────────────
const px = new Uint8Array(SIZE * SIZE * 4);
const sp = (x, y, r, g, b, a = 255) => {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const srcA = a / 255, dstA = px[i+3] / 255;
  const outA  = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    px[i]   = Math.round((r * srcA + px[i]   * dstA * (1-srcA)) / outA);
    px[i+1] = Math.round((g * srcA + px[i+1] * dstA * (1-srcA)) / outA);
    px[i+2] = Math.round((b * srcA + px[i+2] * dstA * (1-srcA)) / outA);
  }
  px[i+3] = Math.round(outA * 255);
};

const drawLine = (x1,y1,x2,y2,w,r,g,b,a=255) => {
  const steps = Math.max(Math.abs(x2-x1), Math.abs(y2-y1), 1);
  for (let s=0;s<=steps;s++) {
    const x=Math.round(x1+(x2-x1)*s/steps), y=Math.round(y1+(y2-y1)*s/steps);
    for (let dx=-w;dx<=w;dx++) for (let dy=-w;dy<=w;dy++) if(dx*dx+dy*dy<=w*w) sp(x+dx,y+dy,r,g,b,a);
  }
};

// 볼록 폴리곤 채우기 (scanline)
const fillQuad = (pts, r, g, b, a=255) => {
  const ys = pts.map(p=>p.y);
  const minY=Math.max(0,Math.floor(Math.min(...ys))), maxY=Math.min(SIZE-1,Math.ceil(Math.max(...ys)));
  for (let y=minY; y<=maxY; y++) {
    const xis = [];
    for (let i=0;i<pts.length;i++) {
      const a2=pts[i], b2=pts[(i+1)%pts.length];
      if ((a2.y<=y&&b2.y>y)||(b2.y<=y&&a2.y>y)) {
        const t2=(y-a2.y)/(b2.y-a2.y);
        xis.push(a2.x+t2*(b2.x-a2.x));
      }
    }
    xis.sort((a2,b2)=>a2-b2);
    for (let i=0;i<xis.length-1;i+=2) {
      const x1=Math.max(0,Math.round(xis[i])), x2=Math.min(SIZE-1,Math.round(xis[i+1]));
      for (let x=x1;x<=x2;x++) sp(x,y,r,g,b,a);
    }
  }
};

// ── 아이콘 ──────────────────────────────────────────────
const S   = SIZE;
const PAD = Math.round(S * 0.06); // 31
const R   = 80;

// ── 1단계: 밝은 스카이블루 배경 (좌상단=흰색, 우하단=스카이블루) ──
for (let y = PAD; y < S-PAD; y++) {
  for (let x = PAD; x < S-PAD; x++) {
    const dx = Math.max(PAD+R-x, 0, x-(S-PAD-R));
    const dy = Math.max(PAD+R-y, 0, y-(S-PAD-R));
    if (dx*dx+dy*dy <= R*R) {
      const t = ((x - PAD) + (y - PAD)) / ((S - PAD*2) * 2);
      const tr = Math.min(1, Math.max(0, t));
      const br = Math.round(255 * (1-tr) + 155 * tr);
      const bg = Math.round(252 * (1-tr) + 215 * tr);
      const bb = Math.round(255 * (1-tr) + 238 * tr);
      sp(x, y, br, bg, bb, 255);
    }
  }
}

// ── 2단계: 좌측 귀퉁이 빛 반사 (타원형 흰색 글로우) ──────
const refCX = PAD + 52;
const refCY = PAD + 52;
const refRX = 115;
const refRY = 95;
for (let y = PAD; y < PAD + refRY*2; y++) {
  for (let x = PAD; x < PAD + refRX*2; x++) {
    const ddx = (x - refCX) / refRX;
    const ddy = (y - refCY) / refRY;
    const dist = Math.sqrt(ddx*ddx + ddy*ddy);
    if (dist <= 1.0) {
      const fdx = Math.max(PAD+R-x, 0, x-(S-PAD-R));
      const fdy = Math.max(PAD+R-y, 0, y-(S-PAD-R));
      if (fdx*fdx+fdy*fdy <= R*R) {
        const a = Math.round((1 - dist) * (1 - dist) * 210);
        sp(x, y, 255, 255, 255, a);
      }
    }
  }
}

// ── 3단계: 좌측 중간 "3D" 텍스트 ───────────────────────
// 텍스트 색상: 진한 스카이블루 (배경 밝으므로 대비)
const TC  = [28, 85, 155]; // text color (dark blue)
const TA  = 235;           // text alpha
const LW  = 7;             // stroke width
const TH  = 106;           // letter height
const TX  = PAD + 46;      // left x of "3"
const TY  = Math.round(S/2) - TH/2 - 4; // vertically centered

// --- "3" ---
const x3 = TX, y3 = TY, w3 = 52;
// top bar
drawLine(x3,       y3,       x3+w3, y3,       LW, ...TC, TA);
// middle bar
drawLine(x3,       y3+TH/2,  x3+w3, y3+TH/2,  LW, ...TC, TA);
// bottom bar
drawLine(x3,       y3+TH,    x3+w3, y3+TH,    LW, ...TC, TA);
// right-top vertical
drawLine(x3+w3,    y3,       x3+w3, y3+TH/2,  LW, ...TC, TA);
// right-bottom vertical
drawLine(x3+w3,    y3+TH/2,  x3+w3, y3+TH,    LW, ...TC, TA);

// --- "D" ---
const GAP  = 16;
const xD   = TX + w3 + GAP;
const yD   = TY;
const wFlat = 28;  // width of flat (horizontal) part
const arcR  = TH / 2;
// left vertical
drawLine(xD,        yD,    xD,         yD+TH, LW, ...TC, TA);
// top horizontal
drawLine(xD,        yD,    xD+wFlat,   yD,    LW, ...TC, TA);
// bottom horizontal
drawLine(xD,        yD+TH, xD+wFlat,   yD+TH, LW, ...TC, TA);
// right arc (semicircle from top to bottom)
const arcCX = xD + wFlat;
const arcCY = yD + TH / 2;
const arcSteps = 28;
for (let i = 0; i < arcSteps; i++) {
  const a1 = -Math.PI/2 + (Math.PI * i       / arcSteps);
  const a2 = -Math.PI/2 + (Math.PI * (i + 1) / arcSteps);
  drawLine(
    Math.round(arcCX + Math.cos(a1) * arcR),
    Math.round(arcCY + Math.sin(a1) * arcR),
    Math.round(arcCX + Math.cos(a2) * arcR),
    Math.round(arcCY + Math.sin(a2) * arcR),
    LW, ...TC, TA
  );
}

// ── 4단계: 3D 건물 (약간 어두운 스카이블루 foreground) ──
const CX = S/2 + 10, CY = S/2 + 35;

const iso = (gx, gy, gz) => ({
  x: CX + (gx - gy) * 0.98,
  y: CY + (gx + gy) * 0.49 - gz * 1.08,
});

const BW = 165, BD = 135, BH = 210;

const colorFront = [55, 140, 195];
const colorRight = [32, 95, 160];
const colorTop   = [105, 182, 228];
const colorGlass     = [195, 232, 255];
const colorGlassDark = [55,  148, 218];

// 앞면
const pA = iso(0,  0, 0),  pB = iso(BW, 0, 0);
const pC = iso(BW, 0, BH), pD = iso(0,  0, BH);
fillQuad([pA,pB,pC,pD], ...colorFront);

// 오른쪽 면
const pE = iso(BW, 0,  0),  pF = iso(BW, BD, 0);
const pG = iso(BW, BD, BH), pH = iso(BW, 0,  BH);
fillQuad([pE,pF,pG,pH], ...colorRight);

// 위면
const pI = iso(0,  0,  BH), pJ = iso(BW, 0,  BH);
const pK = iso(BW, BD, BH), pL = iso(0,  BD, BH);
fillQuad([pI,pJ,pK,pL], ...colorTop);

// 유리창 (앞면)
const winCols = 4, winRows = 5;
const wPad = 18;
for (let row=0; row<winRows; row++) {
  for (let col=0; col<winCols; col++) {
    const wx1 = (col+0.5) / (winCols+0.5) * BW + wPad/3;
    const wx2 = wx1 + BW/winCols - wPad/1.5;
    const wz1 = (row+0.5) / (winRows+0.5) * BH * 0.85 + 10;
    const wz2 = wz1 + BH/winRows*0.6;
    const wp1=iso(wx1,0,wz1), wp2=iso(wx2,0,wz1);
    const wp3=iso(wx2,0,wz2), wp4=iso(wx1,0,wz2);
    const bright = col===0&&row===0;
    const [wr,wg,wb] = bright ? colorGlass : colorGlassDark;
    fillQuad([wp1,wp2,wp3,wp4], wr, wg, wb, 215);
  }
}

// 건물 좌상단 빛 반사
const bldGlow = [
  iso(0,0,BH), iso(BW*0.4,0,BH), iso(BW*0.32,0,BH*0.80), iso(0,0,BH*0.80)
];
fillQuad(bldGlow, 210, 240, 255, 85);

// 위면 빛 반사
const topGlow = [
  iso(0,0,BH), iso(BW*0.38,0,BH), iso(BW*0.32,BD*0.32,BH), iso(0,BD*0.28,BH)
];
fillQuad(topGlow, 230, 248, 255, 95);

// 외곽선
const [lr, lg, lb] = [25, 75, 150];
drawLine(pA.x,pA.y, pB.x,pB.y, 2, lr,lg,lb);
drawLine(pB.x,pB.y, pC.x,pC.y, 2, lr,lg,lb);
drawLine(pC.x,pC.y, pD.x,pD.y, 2, lr,lg,lb);
drawLine(pD.x,pD.y, pA.x,pA.y, 2, lr,lg,lb);
drawLine(pF.x,pF.y, pG.x,pG.y, 2, lr,lg,lb);
drawLine(pG.x,pG.y, pH.x,pH.y, 2, lr,lg,lb);
drawLine(pF.x,pF.y, pE.x,pE.y, 1, lr,lg,lb);
drawLine(pK.x,pK.y, pL.x,pL.y, 2, lr,lg,lb);
drawLine(pL.x,pL.y, pI.x,pI.y, 2, lr,lg,lb);

// ── PNG 인코딩 (RGBA) ─────────────────────────────────
const rawRows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rawRows[y * (SIZE*4+1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const src = (y*SIZE+x)*4, dst = y*(SIZE*4+1)+1+x*4;
    rawRows[dst]=px[src]; rawRows[dst+1]=px[src+1]; rawRows[dst+2]=px[src+2]; rawRows[dst+3]=px[src+3];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE,0); ihdr.writeUInt32BE(SIZE,4);
ihdr[8]=8; ihdr[9]=6;
const png = Buffer.concat([
  Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(rawRows, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, png);
console.log(`아이콘 생성 완료: ${out}  (${SIZE}×${SIZE}px RGBA)`);
