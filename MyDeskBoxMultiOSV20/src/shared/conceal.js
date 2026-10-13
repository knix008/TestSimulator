'use strict';

// 박스 안에서 감춰 둘 파일인가.
//
// 탐색기는 숨김 속성이 붙은 파일을 그리지 않는다. 박스도 그래야 바탕화면과 같아 보인다.
// 임시 파일도 함께 감춘다. 문서를 열면 Word 가 '~$문서.docx' 를 옆에 만들고,
// 내려받는 중인 파일은 '.crdownload' 로 생긴다. 이런 것은 곧 사라지거나 쓸모가 없는데
// 박스에 보이면 진짜 파일처럼 섞인다.
//
// 박스 설정의 '숨김·임시 파일 보이기' 를 켜면 감추지 않는다.

// 이름만 보고 아는 임시 파일.
const TEMP_EXT = new Set(['.tmp', '.temp', '.crdownload', '.partial', '.part', '.download']);
// 운영체제가 폴더마다 만드는 파일. 숨김 속성이 빠져 있어도 감춘다.
const SYSTEM_NAMES = new Set(['desktop.ini', 'thumbs.db', 'ehthumbs.db', '.ds_store', '.localized']);

function isTempName(name) {
  const base = String(name || '');
  if (!base) return false;
  const lower = base.toLowerCase();
  if (SYSTEM_NAMES.has(lower)) return true;
  // Office 가 문서를 여는 동안 만드는 잠금 파일.
  if (base.startsWith('~$')) return true;
  // 편집기가 남기는 백업(이름 끝의 ~).
  if (base.endsWith('~')) return true;
  const dot = lower.lastIndexOf('.');
  return dot > 0 && TEMP_EXT.has(lower.slice(dot));
}

// macOS 와 Linux 는 점으로 시작하는 이름을 숨김으로 본다. Windows 에서도 대개 그런 파일이다.
function isDotName(name) {
  return String(name || '').startsWith('.');
}

// flags 는 운영체제가 알려 준 속성이다({ hidden, system, temporary }). 모르면 비워 둔다.
function isConcealed(name, flags) {
  const attrs = flags || {};
  if (attrs.hidden || attrs.system || attrs.temporary) return true;
  return isDotName(name) || isTempName(name);
}

const api = { isConcealed, isTempName, isDotName };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskConceal = api;
if (typeof module === 'object' && module.exports) module.exports = api;
