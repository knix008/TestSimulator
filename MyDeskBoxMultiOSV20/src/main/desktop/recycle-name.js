'use strict';

// 휴지통에 들어 있는 파일의 원래 이름.
//
// 윈도우는 버린 파일을 $Recycle.Bin 아래 $I 파일에 적어 둔다.
// 그 이름을 보아야, 박스에 담을 때 휴지통 안을 바꾸겠냐고 묻지 않을 수 있다.
// 휴지통으로 보낼 때는 같은 이름이 있어도 묻지 않고 다른 항목으로 넣는다.

// 지우되 휴지통에 남긴다. 같은 이름이 있으면 바꾸지 않고 이름을 따로 붙인다.
const FOF_SILENT = 0x0004;
const FOF_RENAMEONCOLLISION = 0x0008;
const FOF_NOCONFIRMATION = 0x0010;
const FOF_ALLOWUNDO = 0x0040;
const FOF_NOERRORUI = 0x0400;

function recycleDeleteFlags() {
  return FOF_SILENT | FOF_RENAMEONCOLLISION | FOF_NOCONFIRMATION | FOF_ALLOWUNDO | FOF_NOERRORUI;
}

const fs = require('fs');
const path = require('path');

// $I 파일에서 원래 경로를 읽는다. 못 읽으면 빈 글이다.
function nameFromInfo(buffer) {
  if (!buffer || buffer.length < 28) return '';
  let version = 0;
  try {
    version = Number(buffer.readBigUInt64LE(0));
  } catch (_err) {
    return '';
  }
  let text = '';
  if (version === 2) {
    const chars = buffer.readUInt32LE(24);
    const start = 28;
    const bytes = Math.min(Math.max(0, buffer.length - start), Math.max(0, chars) * 2);
    text = buffer.slice(start, start + bytes).toString('utf16le');
  } else {
    text = buffer.slice(24).toString('utf16le');
  }
  text = text.replace(/\0[\s\S]*$/, '').trim();
  return text;
}

function driveBins() {
  const found = [];
  const sys = String(process.env.SystemDrive || 'C:').replace(/[\\/]+$/, '');
  const letters = new Set([sys]);
  for (let code = 67; code <= 90; code += 1) letters.add(`${String.fromCharCode(code)}:`);
  for (const letter of letters) {
    found.push(`${letter}\\$Recycle.Bin`);
  }
  return found;
}

// 이 휴지통 폴더 안에 같은 이름의 항목이 있는가.
function hasNameIn(root, name) {
  const wanted = path.basename(String(name || '')).toLowerCase();
  if (!wanted || !root) return false;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch (_err) {
      continue;
    }
    for (const entry of names) {
      const full = path.join(dir, entry);
      if (entry.startsWith('$I')) {
        let info;
        try {
          info = fs.readFileSync(full);
        } catch (_err) {
          continue;
        }
        const original = nameFromInfo(info);
        if (original && path.basename(original).toLowerCase() === wanted) return true;
        continue;
      }
      try {
        if (fs.statSync(full).isDirectory()) stack.push(full);
      } catch (_err) {
        /* 못 여는 폴더는 건너뛴다. */
      }
    }
  }
  return false;
}

function hasName(name) {
  for (const root of driveBins()) {
    if (hasNameIn(root, name)) return true;
  }
  return false;
}

module.exports = { nameFromInfo, hasNameIn, hasName, driveBins, recycleDeleteFlags };
