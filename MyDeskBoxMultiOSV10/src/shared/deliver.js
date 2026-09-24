'use strict';

// 박스 안에서 파일을 다른 항목 위에 놓았을 때 어디로 보낼지.
// 폴더와 폴더를 가리키는 바로가기는 그 안으로, 휴지통은 버리기, 프로그램 바로가기는 그 프로그램에 넘긴다.

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

// shortcutDir 가 있으면 바로가기가 가리키는 폴더이다.
function receiveKind(target) {
  if (!target || !target.path) return '';
  if (isRecycle(target.path)) return 'trash';
  if (target.directory) return 'folder';
  if (isShortcut(target.path) && target.shortcutDir) return 'folder';
  if (isShortcut(target.path)) return 'hand';
  return '';
}

const api = { onPicture, isShortcut, isRecycle, receiveKind, splitArgs, handPlan };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskDeliver = api;
if (typeof module === 'object' && module.exports) module.exports = api;
