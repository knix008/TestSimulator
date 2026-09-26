'use strict';

// 박스 안에서 파일을 다른 항목 위에 놓았을 때 어디로 보낼지.
// 폴더와 폴더를 가리키는 바로가기는 그 안으로, 휴지통은 버리기, 프로그램 바로가기는 그 프로그램에 넘긴다.
// 그 밖의 항목 위에 놓으면 그 항목을 실행하면서 놓은 파일을 입력으로 넘긴다.

// 칸 안에서 그림 위인지. 글자와 옆 여백은 아이템 사이라서 밀어 배열한다.
function onPicture(dx, dy) {
  return dx >= 4 && dx <= 48 && dy >= 8 && dy <= 52;
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

const api = { onPicture, isShortcut, isRecycle, isRunnable, receiveKind, splitArgs, handPlan, openPlan };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskDeliver = api;
if (typeof module === 'object' && module.exports) module.exports = api;
