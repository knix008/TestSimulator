'use strict';

// 이 파일은 창에서 <script> 로도 읽고 메인에서 require 로도 읽는다.
// 여러 <script> 는 전역을 함께 쓰므로, 안에 든 이름이 서로 부딪히지 않게 감싸 둔다.
(function attach(root) {

  // 화면에 보이는 모든 글. 한국어와 영어를 지원한다.
  // 메인과 창 양쪽에서 같은 파일을 쓴다.

  const LANGS = [
    { id: 'ko', label: '한국어' },
    { id: 'en', label: 'English' },
  ];

  const DEFAULT_LANG = 'ko';

  const TEXT = {
    ko: {
      'tray.tip': 'MyDeskBox · 바탕화면 정리',
      'tray.draw': '박스 그리기',
      'tray.hide': '박스 숨기기',
      'tray.show': '박스 보이기',
      'tray.settings': '설정',
      'tray.startup': '시작할 때 실행',
      'tray.newTheme': '새 박스 테마',
      'tray.newCorner': '새 박스 모서리',
      'tray.newOpacity': '새 박스 투명도',
      'tray.folder': '설정 폴더 열기',
      'tray.language': '언어',
      'tray.about': '프로그램 정보',
      'tray.quit': '종료',

      'menu.open': '열기',
      'menu.eject': '바탕화면으로 꺼내기',
      'menu.rename': '이름 바꾸기',
      'menu.collapse': '접기',
      'menu.expand': '펼치기',
      'menu.theme': '테마',
      'menu.settings': '이 박스 설정',
      'menu.corner': '모서리',
      'menu.opacity': '투명도',
      'menu.special': '바탕화면 항목 담기',
      'menu.newBox': '새 박스 그리기',
      'menu.remove': '박스 삭제',

      'dialog.remove': "'{title}' 박스를 지울까요?",
      'dialog.removeDetail': '안의 아이콘은 바탕화면으로 돌아갑니다.',
      'dialog.delete': '삭제',
      'dialog.cancel': '취소',
      'dialog.create': '여기에 박스를 만들까요?',
      'dialog.createDetail': '이 자리의 바탕화면 아이콘은 옆으로 밀려납니다.',
      'dialog.make': '만들기',

      'box.folder': '폴더',
      'box.shortcut': '바로가기',
      'box.document': '문서',
      'box.media': '사진·영상',
      'box.other': '그 밖의 것',
      'box.system': '시스템',
      'box.first': '새 박스',
      'box.nth': '새 박스 {n}',
      'box.untitled': '박스',
      'settings.title': '박스 설정',
      'settings.custom': '직접 고르기',
      'settings.bg': '바탕',
      'settings.bar': '제목 줄',
      'settings.collapse': '접어 두기',
      'settings.reset': '기본값',
      'settings.ok': '확인',
      'settings.less': '줄이기',
      'settings.more': '늘리기',

      'draw.hint': '빈 곳을 끌어 박스를 그리세요 · Esc 로 취소',

      'about.made': '만든 이',
      'about.version': '판',
      'alone.title': 'MyDeskBox 가 이미 실행 중입니다',
      'alone.running': '트레이 아이콘에서 박스를 그리거나 끝낼 수 있습니다.',
      'alone.detail': '바탕화면 아이콘은 하나뿐이라 두 벌이 함께 다루면 아이콘이 깜빡입니다.\n먼저 켠 쪽을 트레이 아이콘에서 끝낸 뒤 다시 실행해 주세요.',
    },
    en: {
      'tray.tip': 'MyDeskBox · Tidy desktop',
      'tray.draw': 'New Box',
      'tray.hide': 'Hide Boxes',
      'tray.show': 'Show Boxes',
      'tray.settings': 'Settings',
      'tray.startup': 'Start at Login',
      'tray.newTheme': 'Theme for New Boxes',
      'tray.newCorner': 'Corners for New Boxes',
      'tray.newOpacity': 'Opacity for New Boxes',
      'tray.folder': 'Open Settings Folder',
      'tray.language': 'Language',
      'tray.about': 'About MyDeskBox',
      'tray.quit': 'Quit',

      'menu.open': 'Open',
      'menu.eject': 'Move to Desktop',
      'menu.rename': 'Rename',
      'menu.collapse': 'Collapse',
      'menu.expand': 'Expand',
      'menu.theme': 'Theme',
      'menu.settings': 'Box Settings',
      'menu.corner': 'Corners',
      'menu.opacity': 'Opacity',
      'menu.special': 'Add Desktop Item',
      'menu.newBox': 'New Box',
      'menu.remove': 'Delete Box',

      'dialog.remove': "Delete the box '{title}'?",
      'dialog.removeDetail': 'Everything inside goes back to the desktop.',
      'dialog.delete': 'Delete',
      'dialog.cancel': 'Cancel',
      'dialog.create': 'Create a box here?',
      'dialog.createDetail': 'Desktop icons in this area move aside.',
      'dialog.make': 'Create',

      'box.folder': 'Folders',
      'box.shortcut': 'Shortcuts',
      'box.document': 'Documents',
      'box.media': 'Pictures & Video',
      'box.other': 'Everything Else',
      'box.system': 'System',
      'box.first': 'New Box',
      'box.nth': 'New Box {n}',
      'box.untitled': 'Box',
      'settings.title': 'Box Settings',
      'settings.custom': 'Custom colors',
      'settings.bg': 'Body',
      'settings.bar': 'Title bar',
      'settings.collapse': 'Keep collapsed',
      'settings.reset': 'Defaults',
      'settings.ok': 'OK',
      'settings.less': 'Less',
      'settings.more': 'More',

      'draw.hint': 'Drag an empty spot to draw a box · Esc to cancel',

      'about.made': 'Made by',
      'about.version': 'Version',
      'alone.title': 'MyDeskBox is already running',
      'alone.running': 'Use the tray icon to draw a box or quit.',
      'alone.detail': 'There is only one set of desktop icons, so two copies would fight over them.\nQuit the running one from its tray icon, then start again.',
    },
  };

  function langOf(id) {
    return TEXT[id] ? id : DEFAULT_LANG;
  }

  // 시스템 언어가 한국어면 한국어로, 아니면 영어로 시작한다.
  function guessLang(locale) {
    return /^ko\b/i.test(String(locale || '')) ? 'ko' : 'en';
  }

  function t(lang, key, vars) {
    const table = TEXT[langOf(lang)];
    let text = table[key];
    if (text === undefined) text = TEXT[DEFAULT_LANG][key];
    if (text === undefined) return key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
  }
  const api = { LANGS, DEFAULT_LANG, TEXT, langOf, guessLang, t };

  root.DeskI18n = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
