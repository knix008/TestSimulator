'use strict';

// PNG 여러 장을 윈도우 .ico 한 파일로 묶는다.

function encodeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 아이콘
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((entry, i) => {
    const at = i * 16;
    dir[at] = entry.size >= 256 ? 0 : entry.size;
    dir[at + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[at + 2] = 0; // 색상 수
    dir[at + 3] = 0;
    dir.writeUInt16LE(1, at + 4); // 평면
    dir.writeUInt16LE(32, at + 6); // 비트 수
    dir.writeUInt32LE(entry.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((entry) => entry.png)]);
}

// macOS .icns. PNG 를 크기별 타입으로 담는다.
const ICNS_TYPES = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
]);

function encodeIcns(entries) {
  const parts = [];
  for (const entry of entries) {
    const type = ICNS_TYPES.get(entry.size);
    if (!type) continue;
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32BE(entry.png.length + 8, 4);
    parts.push(head, entry.png);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'latin1');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

module.exports = { encodeIco, encodeIcns };
