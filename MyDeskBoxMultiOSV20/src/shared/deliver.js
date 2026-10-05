'use strict';

// 박스 안에서 파일을 다른 항목 위에 놓았을 때 어디로 보낼지.
//
// 끌어다 놓기는 옮기는 일이다. 그래서 받아 주는 것은 '옮겨 넣을 수 있는 곳' 뿐이다.
// 폴더와 폴더를 가리키는 바로가기는 그 안으로, 휴지통은 버리기.
// 그 밖의 항목은 받지 않는다. 그 자리에 놓으면 그냥 그 박스로 옮겨 담긴다.
//
// 앞서는 그 밖의 항목 위에 놓으면 그 항목을 실행하면서 놓은 파일을 입력으로 넘겼다.
// 그런데 박스 안의 아이콘은 그림이 칸의 절반을 넘게 차지한다. 그래서 박스에 담으려고
// 놓다가 아이콘을 스치는 일이 잦았고, 옮기려던 파일은 바탕화면에 그대로 남은 채
// 엉뚱한 프로그램이 떴다. 같은 손짓이 파일 종류에 따라 옮기기도 하고 실행하기도 하니
// 무슨 일이 일어날지 알 수 없었다. 끌어다 놓기는 언제나 옮긴다.

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

// 글자 줄(56픽셀 아래)까지 받지는 않는다. 거기까지 받으면 아래 줄에 끼워 넣을 수 없다.
const PICTURE = {
  left: ART_X - SLACK,
  right: ART_X + ART + SLACK,
  top: TOP_PAD - SLACK,
  bottom: TOP_PAD + ART + 2,
};

// 칸 안에서 그림 위인지. 글자와 옆 여백은 아이템 사이라서 밀어 배열한다.
function onPicture(dx, dy) {
  return dx >= PICTURE.left && dx <= PICTURE.right && dy >= PICTURE.top && dy <= PICTURE.bottom;
}

function isShortcut(filePath) {
  return /\.(lnk|url|desktop)$/i.test(String(filePath || ''));
}

function isRecycle(filePath) {
  return String(filePath || '').toLowerCase() === 'shell:recyclebinfolder';
}

// 이 항목이 무엇을 받는가. 받지 않으면 빈 값이다.
// shortcutDir 가 있으면 바로가기가 가리키는 폴더이다.
function receiveKind(target) {
  if (!target || !target.path) return '';
  if (isRecycle(target.path)) return 'trash';
  if (target.directory) return 'folder';
  if (isShortcut(target.path) && target.shortcutDir) return 'folder';
  return '';
}

const api = { onPicture, PICTURE, isShortcut, isRecycle, receiveKind };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskDeliver = api;
if (typeof module === 'object' && module.exports) module.exports = api;
