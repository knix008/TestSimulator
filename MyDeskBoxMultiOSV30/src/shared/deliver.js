'use strict';

// 박스 안에서 파일을 다른 항목 위에 놓았을 때 어디로 보낼지.
// 폴더와 폴더를 가리키는 바로가기는 그 안으로, 휴지통은 버리기, 프로그램 바로가기는 그 프로그램에 넘긴다.
// 그 밖의 항목 위에 놓으면 그 항목을 실행하면서 놓은 파일을 입력으로 넘긴다.

// 칸 안에서 그림이 놓인 자리.
//
// 칸은 86×88 이고(arrange.js 의 CELL_W·CELL_H), 아이콘 칸은 padding 8px 4px 0 에
// 가운데 정렬이며 그림은 44×44 이다(fence.css 의 .icon 과 .icon img).
// 그래서 그림은 칸 안에서 가로 21..65, 세로 8..52 에 놓인다.
//
// 이 값이 그림과 어긋나면 눈에 보이는 그림과 받아 주는 자리가 따로 논다.
// 앞서 가로를 4..48 로 잡아 두어, 그림의 오른쪽 절반은 아무리 겨눠도 받지 않고
// 그림 왼쪽의 빈 여백은 받아 주었다. 아래 값은 셈으로 내어 어긋나지 않게 한다.
const CELL_W = 86;
const SIDE_PAD = 4;
const TOP_PAD = 8;
const ART = 44;
const ART_X = SIDE_PAD + Math.round((CELL_W - SIDE_PAD * 2 - ART) / 2);

// 그림 둘레로 조금 더 받아 준다. 끌고 가면서 44픽셀짜리 과녁을 맞히기는 어렵다.
// 이만큼 넓혀도 칸 좌우에는 '사이에 끼우기' 로 쓸 자리가 15픽셀씩 남는다.
const SLACK = 6;

// 그림 크기와 칸 크기를 주면 받아 주는 자리를 셈해 준다.
//
// 박스마다 아이콘을 크게도, 작게도 볼 수 있다(fence.js 의 --icon). 그림이 커지면
// 받아 주는 자리도 함께 커져야 한다. 한쪽만 바꾸면 눈에 보이는 그림과 받는 자리가
// 따로 놀아, 그림을 정확히 겨눠도 받지 않는 일이 생긴다.
function pictureBox(art, cellW) {
  const size = Number(art) > 0 ? Math.round(Number(art)) : ART;
  const width = Number(cellW) > 0 ? Math.round(Number(cellW)) : CELL_W;
  const left = SIDE_PAD + Math.round((width - SIDE_PAD * 2 - size) / 2);
  return {
    left: left - SLACK,
    right: left + size + SLACK,
    top: TOP_PAD - SLACK,
    bottom: TOP_PAD + size + 2,
  };
}

// 글자 줄(56픽셀 아래)까지 받지는 않는다. 거기까지 받으면 아래 줄에 끼워 넣을 수 없다.
const PICTURE = pictureBox(ART, CELL_W);

// 칸 안에서 그림 위인지. 글자와 옆 여백은 아이템 사이라서 밀어 배열한다.
// 그림을 기본 크기가 아닌 박스는 그 크기를 함께 알려 준다.
function onPicture(dx, dy, art, cellW) {
  const box = art || cellW ? pictureBox(art, cellW) : PICTURE;
  return dx >= box.left && dx <= box.right && dy >= box.top && dy <= box.bottom;
}

function isShortcut(filePath) {
  return /\.(lnk|url|desktop)$/i.test(String(filePath || ''));
}

function splitArgs(text) {
  const args = [];
  let cur = '';
  let quote = '';
  for (const ch of String(text || '')) {
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) args.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) args.push(cur);
  return args;
}

// 프로그램 바로가기에 파일을 올리면, 그 프로그램이 파일을 입력으로 받아 실행된다.
function handPlan(link, filePath) {
  if (!link || !link.target || !filePath) return null;
  const args = splitArgs(link.args);
  args.push(String(filePath));
  const plan = { command: String(link.target), args };
  if (link.cwd) plan.cwd = String(link.cwd);
  return plan;
}

function isRecycle(filePath) {
  return String(filePath || '').toLowerCase() === 'shell:recyclebinfolder';
}

// 그대로 불러 쓸 수 있는 프로그램 파일. 놓은 파일을 인자로 받는다.
// .bat 과 .cmd 는 여기 넣지 않는다. Node 는 그것을 직접 띄우지 못하므로
// 아래의 셸 길로 보내야 한다.
const RUNNABLE = /\.(exe|com)$/i;
// macOS 의 프로그램 꾸러미.
const BUNDLE = /\.app\/?$/i;

function isRunnable(filePath) {
  return RUNNABLE.test(String(filePath || ''));
}

// 이 항목에 파일을 넘겨 볼 수 있는가.
// 프로그램 파일은 어디서나 되고, Windows 는 짝지어 둔 프로그램에 셸이 넘겨 준다.
// 그 밖의 운영체제에서는 프로그램이라고 볼 수 있는 것에만 넘긴다.
function handable(target, platform) {
  if (!target) return false;
  if (isRunnable(target)) return true;
  if (platform === 'win32') return true;
  return platform === 'darwin' && BUNDLE.test(String(target));
}

// 바로가기가 아닌 항목 위에 놓았을 때. 그 항목을 실행하고 놓은 파일을 입력으로 넘긴다.
// 프로그램 파일은 그대로 부르고, 그 밖의 것은 운영체제가 짝지어 둔 프로그램에 맡긴다.
function openPlan(target, filePath, platform) {
  if (!target || !filePath || !handable(target, platform)) return null;
  const at = String(target);
  const file = String(filePath);
  if (isRunnable(at)) return { command: at, args: [file] };
  if (platform === 'darwin') return { command: 'open', args: ['-a', at, file] };
  return { command: 'cmd', args: ['/c', 'start', '', at, file] };
}

// shortcutDir 가 있으면 바로가기가 가리키는 폴더이다.
function receiveKind(target, platform) {
  if (!target || !target.path) return '';
  if (isRecycle(target.path)) return 'trash';
  if (target.directory) return 'folder';
  if (isShortcut(target.path) && target.shortcutDir) return 'folder';
  if (isShortcut(target.path)) return 'hand';
  return handable(target.path, platform) ? 'hand' : '';
}

const api = { onPicture, pictureBox, PICTURE, isShortcut, isRecycle, isRunnable, receiveKind, splitArgs, handPlan, openPlan };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskDeliver = api;
if (typeof module === 'object' && module.exports) module.exports = api;
