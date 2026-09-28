'use strict';

// 폴더 포털.
//
// 보통 박스는 담은 파일을 제 폴더로 **옮긴다**. 포털은 그러지 않는다.
// 디스크에 이미 있는 폴더 하나를 가리키고, 그 폴더의 내용을 그대로 비춰 보여 준다.
// 파일은 처음부터 끝까지 그 폴더에 머문다. 박스를 지워도 폴더는 그대로 남는다.
//
// 그래서 포털은 보관함(hold.js)을 쓰지 않는다. 담기 전 폴더를 적어 둘 까닭도,
// 끝낼 때 바탕화면으로 돌려줄 까닭도 없다. 이미 있어야 할 자리에 있기 때문이다.
//
// 이 파일이 하는 일은 두 가지다. 폴더 안의 목록을 읽는 것, 폴더가 바뀌면 알려 주는 것.

const fs = require('fs');
const path = require('path');

// 폴더에 있어도 보여 주지 않는 것. 탐색기도 이것을 그리지 않는다.
const SKIP = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

function usable(dir) {
  if (!dir || typeof dir !== 'string') return false;
  try {
    return fs.statSync(dir).isDirectory();
  } catch (_err) {
    return false;
  }
}

// 폴더 안의 항목. 읽을 수 없으면 빈 배열을 준다.
// 숨김 파일은 건너뛴다. 탐색기에서도 보통 보이지 않는 것이다.
function entries(dir) {
  if (!usable(dir)) return [];
  let found = [];
  try {
    found = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return [];
  }
  const made = [];
  for (const one of found) {
    const name = one.name;
    if (!name || name.startsWith('.')) continue;
    if (SKIP.has(name.toLowerCase())) continue;
    made.push({ name, path: path.join(dir, name), directory: safeDirectory(one, path.join(dir, name)) });
  }
  // 폴더를 먼저, 그 다음 이름 차례로 둔다. 탐색기와 같은 눈으로 보인다.
  made.sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  return made;
}

// 바로가기(심볼릭 링크)는 isDirectory 가 거짓이다. 가리키는 자리를 한 번 더 본다.
function safeDirectory(entry, at) {
  try {
    if (entry.isDirectory()) return true;
    if (!entry.isSymbolicLink()) return false;
    return fs.statSync(at).isDirectory();
  } catch (_err) {
    return false;
  }
}

// 폴더가 바뀌면 알려 준다. 한 번의 저장에도 여러 번 알려 오므로 조금 모아서 부른다.
// 지켜보기를 그만두는 함수를 준다.
function watch(dir, onChange, wait) {
  if (!usable(dir) || typeof onChange !== 'function') return () => {};
  const delay = Number(wait) || 250;
  let timer = null;
  let watcher = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        onChange(dir);
      } catch (_err) {
        /* 알려 주는 쪽이 넘어져도 지켜보기는 이어 간다. */
      }
    }, delay);
  };
  try {
    watcher = fs.watch(dir, { persistent: false }, fire);
    // 폴더가 없어지면 fs.watch 가 오류를 던진다. 그때는 조용히 손을 뗀다.
    watcher.on('error', () => {});
  } catch (_err) {
    return () => {};
  }
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      if (watcher) watcher.close();
    } catch (_err) {
      /* 이미 닫혔으면 더 할 일이 없다. */
    }
  };
}

// 포털 폴더에 파일 하나를 들인다. 같은 이름이 있으면 부른 쪽이 먼저 물어야 한다.
// 옮긴 자리를 주고, 옮기지 못하면 빈 글자를 준다.
function bring(dir, from, spare) {
  if (!usable(dir) || !from) return '';
  const base = path.basename(from);
  const dest = typeof spare === 'function' ? spare(dir, base) : path.join(dir, base);
  if (path.resolve(dest) === path.resolve(from)) return from;
  try {
    fs.renameSync(from, dest);
    return dest;
  } catch (err) {
    if (!err || err.code !== 'EXDEV') return '';
  }
  try {
    fs.cpSync(from, dest, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
    return dest;
  } catch (_err) {
    return '';
  }
}

// 이 파일이 그 포털 폴더 안에 있는가.
function inside(dir, filePath) {
  if (!dir || !filePath) return false;
  const rel = path.relative(dir, String(filePath));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { SKIP, usable, entries, watch, bring, inside };
