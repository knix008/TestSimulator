'use strict';

// 바탕화면을 켜기 전 모습으로 돌려놓는다. 창을 띄우지 않는 길이다.
//
// 설치 프로그램과 제거 프로그램이 부른다(MyDeskBox.exe --restore-desktop).
//  - 프로그램을 지울 때  : 묻지 않고 되돌린다. 지운 뒤에 바탕화면이 비어 있으면 안 된다.
//  - 다시 깔 때          : 되돌릴지 사람에게 묻고, 그렇다고 하면 부른다.
// 앱이 갑자기 끝나(작업 관리자, 전원 내림) 남은 것도 이 길로 돌아온다.
//
// 세 가지를 되돌린다.
//  1. 박스에 담아 둔 파일 : restore.json 에 적힌 자리로 옮긴다(hold.recover).
//     적혀 있지 않거나 그 자리에 옮기지 못한 것은 바탕화면으로 보낸다.
//  2. 감춘 셸 아이콘(휴지통 등) : 레지스트리 값을 앞서 있던 값으로 되돌린다.
//  3. 비켜 둔 아이콘 자리 : icon-homes.json 에 적어 둔 자리로 돌려놓는다.
// 2와 3은 desktop.shutdown 이 맡는다. 앱이 끝날 때 지나는 길과 같은 코드다.
//
// 이 파일은 electron 을 부르지 않는다. 폴더 자리와 운영체제 모듈은 인자로 받는다.
// 그래서 검사에서 가짜만 끼워 주면 그대로 돌아간다.

const fs = require('fs');
const path = require('path');

// 보관함에 남은 파일. 박스마다 폴더가 하나씩 있고, 그 안에 담긴 파일이 있다.
// restore.json 처럼 보관함이 직접 쓰는 파일은 세지 않는다.
function strayFiles(root) {
  const found = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch (_err) {
    return found;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const box = path.join(root, dir.name);
    let names = [];
    try {
      names = fs.readdirSync(box);
    } catch (_err) {
      continue;
    }
    for (const name of names) found.push(path.join(box, name));
  }
  return found;
}

// 비어 있는 박스 폴더를 치운다. 비우지 못한 것은 그대로 둔다.
function dropEmpty(root) {
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch (_err) {
    return;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const box = path.join(root, dir.name);
    try {
      if (!fs.readdirSync(box).length) fs.rmdirSync(box);
    } catch (_err) {
      /* 남은 파일이 있으면 지우지 않는다. */
    }
  }
}

// 바탕화면을 되돌린다. 무엇을 했는지 돌려준다.
function restoreDesktop(options) {
  const opts = options || {};
  const hold = opts.hold;
  const desktop = opts.desktop || {};
  const userDir = String(opts.userDir || '');
  const desktopDir = String(opts.desktopDir || '');
  const report = { back: [], strays: [], left: [], shell: false };
  if (!hold || !desktopDir) return report;

  const root = hold.configure({
    root: String(opts.root || ''),
    desktopDir,
    userDir,
  });
  if (!root) return report;

  // 아이콘 자리와 감춘 기록을 읽어 들인다. desktop.shutdown 이 그것으로 되돌린다.
  if (typeof desktop.init === 'function') {
    try {
      desktop.init(userDir);
    } catch (_err) {
      /* 아이콘 자리를 못 읽어도 파일은 돌려보낸다. */
    }
  }

  // 1) 적혀 있는 것부터 제자리로.
  try {
    report.back = hold.recover([]) || [];
  } catch (_err) {
    report.back = [];
  }

  // 2) 적혀 있지 않은 것과 옮기지 못한 것은 바탕화면으로.
  //    보관함에 남겨 두면 어디에서도 보이지 않는다. 눈에 보이는 자리에 두는 것이 낫다.
  for (const at of strayFiles(root)) {
    const dest = hold.spareName(desktopDir, path.basename(at));
    try {
      fs.renameSync(at, dest);
      report.strays.push(dest);
      continue;
    } catch (_err) {
      /* 드라이브가 다르면 아래에서 복사한 뒤 지운다. */
    }
    try {
      fs.cpSync(at, dest, { recursive: true });
      fs.rmSync(at, { recursive: true, force: true });
      report.strays.push(dest);
    } catch (_err) {
      report.left.push(at);
    }
  }

  dropEmpty(root);

  // 3) 탐색기에 알린다. 파일이 돌아온 폴더를 다시 그려야 아이콘이 보인다.
  if (typeof desktop.refreshFolder === 'function') {
    const dirs = new Set([desktopDir]);
    for (const at of [...report.back, ...report.strays]) dirs.add(path.dirname(at));
    for (const dir of dirs) {
      try {
        desktop.refreshFolder(dir);
      } catch (_err) {
        /* 알리지 못해도 탐색기가 곧 알아챈다. */
      }
    }
  }

  // 4) 감춘 셸 아이콘과 비켜 둔 아이콘 자리를 되돌린다.
  if (typeof desktop.shutdown === 'function') {
    try {
      desktop.shutdown();
      report.shell = true;
    } catch (_err) {
      report.shell = false;
    }
  }
  return report;
}

module.exports = { restoreDesktop, strayFiles, dropEmpty };
