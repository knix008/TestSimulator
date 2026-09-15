// Tiny i18n: `t(key, params)` with Korean (the reference UI) and English.
import { useSyncExternalStore } from 'react';

const ko = {
  appName: 'My Editor V1.0',
  untitled: '새 문서 {n}',
  ready: '준비됨',

  // menu bar
  m_file: '파일', m_edit: '편집', m_search: '찾기', m_view: '보기', m_lang: '언어', m_enc: '인코딩', m_help: '도움말',
  // file
  new_file: '새 문서', open_file: '열기…', open_folder: '폴더 열기…', close_folder: '폴더 닫기', save: '저장', save_as: '다른 이름으로 저장…', save_all: '모두 저장',
  reload: '다시 불러오기', close: '닫기', close_all: '모두 닫기', close_others: '다른 탭 모두 닫기', close_right: '오른쪽 탭 모두 닫기',
  recent: '최근 파일', recent_empty: '(최근 파일 없음)', recent_clear: '최근 파일 목록 지우기', reveal: '탐색기에서 보기', open_with: '기본 앱으로 열기', copy_path: '경로 복사', copy_name: '파일 이름 복사',
  exit: '종료',
  // edit
  undo: '실행 취소', redo: '다시 실행', cut: '잘라내기', copy: '복사', paste: '붙여넣기', delete: '삭제', select_all: '모두 선택',
  dup_line: '줄 복제', del_line: '줄 삭제', move_up: '줄 위로 이동', move_down: '줄 아래로 이동', toggle_comment: '주석 토글', indent: '들여쓰기', outdent: '내어쓰기',
  upper: '대문자로', lower: '소문자로', sort_asc: '줄 정렬 (오름차순)', sort_desc: '줄 정렬 (내림차순)', trim_ws: '줄 끝 공백 제거', remove_empty: '빈 줄 제거', remove_dup: '중복 줄 제거',
  insert_date: '날짜/시간 삽입', insert_path: '파일 경로 삽입',
  // search
  find: '찾기…', find_next: '다음 찾기', find_prev: '이전 찾기', replace: '바꾸기…', goto_line: '줄로 이동…', select_all_matches: '일치하는 항목 모두 선택',
  find_ph: '찾을 내용', replace_ph: '바꿀 내용', match_case: '대/소문자 구분', regex: '정규식', whole_word: '단어 단위', replace_one: '바꾸기', replace_all: '모두 바꾸기',
  matches: '{n}개 일치', match_of: '{i} / {n}', no_match: '일치 없음', close_find: '찾기 닫기', in_selection: '선택 영역 내',
  goto_line_title: '줄로 이동', goto_line_hint: '줄 번호 (1 ~ {n}), 또는 줄:열', go: '이동',
  // view
  word_wrap: '자동 줄 바꿈', line_numbers: '줄 번호', show_ws: '공백 문자 표시', active_line: '현재 줄 강조', fold_gutter: '코드 접기', sidebar: '폴더 트리', toolbar: '도구 모음', statusbar: '상태 표시줄',
  zoom_in: '확대', zoom_out: '축소', zoom_reset: '기본 크기', fullscreen: '전체 화면', fold_all: '모두 접기', unfold_all: '모두 펼치기',
  // language / encoding / eol
  lang_auto: '자동 (확장자로 판별)', lang_plain: '일반 텍스트', eol: '줄 끝', eol_crlf: 'Windows (CR LF)', eol_lf: 'Unix (LF)', eol_cr: 'Macintosh (CR)',
  reopen_as: '다음 인코딩으로 다시 열기', save_as_enc: '다음 인코딩으로 저장', enc_current: '현재 인코딩',
  // help
  about: '정보', users_guide: '사용 설명서', shortcuts: '단축키',
  // toolbar tips
  tip_new: '새 문서 (Ctrl+N)', tip_open: '파일 열기 (Ctrl+O)', tip_open_folder: '폴더 열기 (Ctrl+Shift+O)', tip_save: '저장 (Ctrl+S)', tip_save_all: '모두 저장 (Ctrl+Shift+S)', tip_close: '탭 닫기 (Ctrl+W)',
  tip_undo: '실행 취소 (Ctrl+Z)', tip_redo: '다시 실행 (Ctrl+Y)', tip_cut: '잘라내기 (Ctrl+X)', tip_copy: '복사 (Ctrl+C)', tip_paste: '붙여넣기 (Ctrl+V)',
  tip_find: '찾기 (Ctrl+F)', tip_replace: '바꾸기 (Ctrl+H)', tip_wrap: '자동 줄 바꿈', tip_ws: '공백 문자 표시', tip_zoom_in: '확대 (Ctrl++)', tip_zoom_out: '축소 (Ctrl+-)', tip_sidebar: '폴더 트리 (Ctrl+B)',
  tip_theme: '테마 선택 (16종)', tip_next_theme: '다음 테마로 전환: {theme}', tip_language: '한국어 / English', tip_settings: '설정', tip_about: 'My Editor 정보',
  settings: '설정', menu_info: '정보',
  win_minimize: '최소화', win_maximize: '최대화', win_restore: '이전 크기로', win_close: '닫기', win_resize: '드래그하여 창 크기 조절',
  // tabs
  tab_modified: '(수정됨)', tab_readonly: '(읽기 전용)', tab_new: '새 탭', tip_tab_close: '닫기 (가운데 클릭)', tab_scroll_left: '탭 왼쪽으로 스크롤', tab_scroll_right: '탭 오른쪽으로 스크롤',
  // sidebar
  sb_title: '폴더', sb_empty: '폴더를 열면 여기에 파일 트리가 표시됩니다.', sb_open: '폴더 열기…', sb_refresh: '새로 고침', sb_collapse: '모두 접기', sb_expand: '모두 펼치기', sb_hidden: '숨김 파일 표시',
  sb_new_file: '새 파일…', sb_new_folder: '새 폴더…', sb_rename: '이름 바꾸기…', sb_delete: '삭제', sb_open_terminal: '탐색기에서 열기', sb_filter: '필터…',
  // status bar
  st_pos: '줄 {line}, 열 {col}', st_sel: '{n}자 선택', st_sel_lines: '{n}자 ({l}줄) 선택', st_size: '{chars}자 · {lines}줄', st_spaces: '공백: {n}', st_tabs: '탭: {n}', st_zoom: '{n}%',
  st_lang: '언어 선택', st_enc: '인코딩 선택', st_eol: '줄 끝 선택', st_indent: '들여쓰기 선택', st_ins: 'INS', st_ovr: 'OVR',
  // dialogs
  ok: '확인', cancel: '취소', yes: '예', no: '아니요', dont_save: '저장 안 함', close_btn: '닫기',
  unsaved_title: '저장하지 않은 변경 사항', unsaved_msg: '"{name}" 의 변경 사항을 저장할까요?', unsaved_many: '저장하지 않은 문서가 {n}개 있습니다. 저장할까요?',
  save_all_and_close: '모두 저장', discard_all: '저장 안 함',
  reload_title: '다시 불러오기', reload_msg: '"{name}" 을(를) 디스크에서 다시 읽으면 현재 변경 사항이 사라집니다. 계속할까요?',
  changed_title: '파일이 바뀌었습니다', changed_msg: '"{name}" 이(가) 다른 프로그램에서 변경되었습니다. 다시 불러올까요? (아니요: 현재 내용 유지)',
  deleted_title: '파일이 삭제되었습니다', deleted_msg: '"{name}" 이(가) 디스크에서 사라졌습니다. 탭을 그대로 유지합니다 — 저장하면 다시 만들어집니다.',
  enc_lossy_title: '인코딩 경고', enc_lossy_msg: '일부 문자는 {enc} 로 표현할 수 없어 "?" 로 바뀝니다. 그래도 저장할까요?',
  reopen_title: '다시 열기', reopen_msg: '"{name}" 을(를) {enc} 로 다시 읽으면 현재 변경 사항이 사라집니다. 계속할까요?',
  delete_title: '삭제', delete_msg: '"{name}" 을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
  too_big_title: '파일이 너무 큽니다', too_big_msg: '"{name}" 은(는) 64 MB 를 넘습니다. 이 편집기는 그보다 큰 파일을 열지 않습니다.',
  binary_title: '이진 파일', binary_msg: '"{name}" 은(는) 텍스트 파일이 아닌 것 같습니다. 그래도 열까요? (표시가 깨질 수 있습니다)',
  error_title: '오류', error_unexpected: '예상하지 못한 오류가 발생했습니다.', error_details: '자세히', copy_details: '자세히 복사', copied_details: '오류 내용을 클립보드에 복사했습니다.', error_code: '코드', error_path: '경로',
  open_failed: '"{name}" 을(를) 열 수 없습니다.', save_failed: '"{name}" 을(를) 저장할 수 없습니다.',
  new_name: '이름', new_file_title: '새 파일', new_folder_title: '새 폴더', rename_title: '이름 바꾸기', create: '만들기',
  // settings
  settings_title: '설정', set_general: '일반', set_editor: '편집기', set_files: '파일',
  set_language: 'UI 언어', set_theme: '테마', set_font: '글꼴', set_font_ph: '(기본 고정폭 글꼴) — 클릭하면 시스템 글꼴 목록', set_font_size: '글꼴 크기', set_tab_size: '탭 크기', set_insert_spaces: 'Tab 키로 공백 입력',
  set_auto_indent: '자동 들여쓰기 (Enter 로 새 줄을 만들 때 이전 줄의 들여쓰기 유지, 닫는 괄호 자동 정렬)', set_indent_with: '들여쓰기 문자', set_indent_spaces: '공백 삽입', set_indent_tabs: '탭 문자 삽입', set_tab_size_hint: '탭 1개 = 공백 n자리 (공백 삽입 시 Tab 키가 넣는 공백 수)', tip_auto_indent: '자동 들여쓰기 켜기/끄기', auto_indent: '자동 들여쓰기',
  set_word_wrap: '자동 줄 바꿈', set_line_numbers: '줄 번호', set_show_ws: '공백 문자 표시', set_active_line: '현재 줄 강조', set_auto_close: '괄호·따옴표 자동 닫기', set_bracket_match: '짝 괄호 강조', set_fold: '코드 접기',
  set_default_enc: '새 문서 인코딩', set_default_eol: '새 문서 줄 끝', set_trim: '저장할 때 줄 끝 공백 제거', set_final_nl: '저장할 때 마지막 줄 바꿈 추가',
  set_restore: '시작할 때 이전 세션 복원', set_reload: '외부에서 바뀐 파일 자동 다시 읽기 (수정하지 않은 경우)', set_confirm_close: '닫을 때 저장 여부 확인',
  // about
  about_title: '정보', about_desc: 'Windows / macOS / Linux / 웹용 텍스트 · 코드 편집기',
  version: '버전', author: '작성자', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: '빌드', about_host: '실행 환경', host_electron: '데스크톱 (Electron)', host_web: '웹 브라우저', about_libs: '편집 엔진: CodeMirror 6 · 인코딩: iconv-lite',
  // file dialog (web)
  fd_open: '열기', fd_save: '다른 이름으로 저장', fd_folder: '폴더 선택', fd_name: '파일 이름', fd_up: '상위 폴더', fd_drives: '드라이브', fd_empty: '(빈 폴더)', fd_overwrite: '"{name}" 이(가) 이미 있습니다. 덮어쓸까요?', fd_select: '선택',
  // misc
  copied: '클립보드에 복사했습니다.', saved: '저장됨: {name}', opened: '열림: {name}', all_saved: '모든 문서를 저장했습니다.', nothing_to_save: '저장할 변경 사항이 없습니다.',
  drop_hint: '파일을 여기에 놓으면 열립니다', web_native_unsupported: '웹 버전에서는 사용할 수 없습니다.',
  shortcuts_title: '단축키',
  // markdown
  md_heading: '제목 {n} (H{n})', md_bold: '굵게', md_italic: '기울임', md_strike: '취소선', md_code: '인라인 코드', md_code_block: '코드 블록', md_quote: '인용',
  md_ul: '글머리 기호 목록', md_ol: '번호 매기기 목록', md_task: '체크리스트', md_link: '링크', md_image: '이미지', img_title: '이미지 넣기', img_file: '파일 / URL', img_file_hint: '이미지 파일 경로 또는 http(s) 주소', img_alt: '대체 텍스트', img_mode: '포함 방식', img_link: '링크', img_link_hint: '문서 폴더 기준 경로로 참조', img_embed: '내장', img_embed_hint: 'Base64 로 문서 안에 포함', img_width: '너비', img_width_hint: 'px — 비우면 원본 크기', img_insert: '넣기', img_not_found: '이미지를 읽을 수 없습니다.', img_preview_empty: '파일을 고르거나 주소를 입력하면 미리 보입니다.', md_table: '표', md_hr: '구분선', md_preview: '미리보기',
  spell_code_all: '코드 파일에서도 모든 단어 검사', set_spell_code_all: '코드 파일에서도 모든 단어 검사 (끄면 주석·문자열만)', tb_font: '편집기 글꼴', tb_font_size: '글꼴 크기 (px)', tb_font_smaller: '글꼴 작게', tb_font_larger: '글꼴 크게',
  terminal: '터미널', tip_terminal: '터미널 패널 (Ctrl+`)', term_new: '새 터미널', term_new_shell: '셸을 골라 새 터미널', term_hide: '터미널 패널 닫기', term_empty: '터미널이 없습니다. + 를 눌러 여세요.', term_placeholder: '명령을 입력하고 Enter (Tab 자동완성, ↑ ↓ 기록, Ctrl+L 지우기, Ctrl+C 중단)',
  set_terminal: '터미널', set_term_cwd: '시작 디렉터리', set_term_cwd_default: '(폴더 트리에 열린 폴더)', set_term_cwd_hint: '새 터미널이 시작하는 디렉터리. 비우면 폴더 트리에 열린 폴더, 그것도 없으면 현재 문서의 폴더에서 시작합니다.', set_browse: '찾아보기…', set_term_shell: '기본 셸', set_term_shell_default: '기본 ({name})',
  term_no_git: 'Git 저장소가 아닙니다', term_git_ahead: '원격보다 앞선 커밋', term_git_behind: '원격보다 뒤진 커밋', term_git_changes: '스테이지 {staged} · 수정 {changed} · 추적 안 함 {untracked}', term_git_clean: '변경 없음', term_git_conflicts: '충돌 {n}',
  split_none: '편집 창 하나', split_cols: '좌우로 나누기', split_rows: '상하로 나누기', split_grid: '4개로 나누기', next_pane: '다음 편집 창', tip_lint: '코드 검사 (Lint) 켜기/끄기', pane_empty: '(비어 있음 — 문서를 고르세요)', pane_in: '창 {n}', pane_pick: '문서 고르기…', pane_open_docs: '열린 문서', pane_folder_files: '폴더 {name} 의 파일', pane_folder_empty: '(파일 없음)', tip_split: '편집 창 좌우 나누기 (Ctrl+\\)',
  search_title: '검색', find_in_files: '폴더에서 찾기…', find_in_open: '열린 문서에서 찾기…', search_scope_open: '열린 문서', search_scope_folder: '폴더', search_placeholder: '찾을 내용 (Enter)', search_include: '포함: *.js, src/**', search_exclude: '제외: *.min.js, test/**', search_run: '찾기', search_running: '찾는 중…', search_summary: '{n}개 일치 · 파일 {files}개', search_none: '일치하는 것이 없습니다.', search_truncated: '(결과가 많아 일부만 표시)', search_no_folder: '폴더 트리에 열린 폴더가 없습니다.', search_hint: '열린 문서 또는 폴더 트리의 폴더 전체에서 찾습니다. 결과를 누르면 그 자리로 이동합니다.',
  lint: '코드 검사 (Lint)', lint_next: '다음 문제', lint_panel: '문제 목록', set_lint: '코드 검사 — 언어별 검사 도구(eslint · ruff/pyflakes · gcc · shellcheck …)를 백그라운드로 돌려 문제를 줄 번호 옆에 표시', st_lint_tool: '코드 검사: {tool} — 클릭하면 문제 목록', st_lint_none: '이 언어의 검사 도구가 없거나 설치되지 않았습니다 (클릭: 다시 검사)',
  spell_check: '스펠링 체크 (영어)', tip_spell: '스펠링 체크 켜기/끄기 (F7)', set_spell: '영어 스펠링 체크 (내장 en_US 사전; 코드에서는 주석·문자열만)', spell_add: '"{word}" 사전에 추가', spell_ignore: '"{word}" 이번만 무시', spell_none: '(제안 없음)', spell_loading: '사전 불러오는 중…',
  md_preview_menu: 'Markdown 미리보기', md_wysiwyg: 'WYSIWYG 편집 (기호를 렌더링해서 표시)', md_wysiwyg_menu: 'Markdown WYSIWYG 편집', md_source: '소스',
};

const en = {
  appName: 'My Editor V1.0',
  untitled: 'new {n}',
  ready: 'Ready',

  m_file: 'File', m_edit: 'Edit', m_search: 'Search', m_view: 'View', m_lang: 'Language', m_enc: 'Encoding', m_help: 'Help',
  new_file: 'New', open_file: 'Open…', open_folder: 'Open folder…', close_folder: 'Close folder', save: 'Save', save_as: 'Save as…', save_all: 'Save all',
  reload: 'Reload from disk', close: 'Close', close_all: 'Close all', close_others: 'Close other tabs', close_right: 'Close tabs to the right',
  recent: 'Recent files', recent_empty: '(no recent files)', recent_clear: 'Clear recent files', reveal: 'Show in file manager', open_with: 'Open with default app', copy_path: 'Copy path', copy_name: 'Copy file name',
  exit: 'Exit',
  undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', delete: 'Delete', select_all: 'Select all',
  dup_line: 'Duplicate line', del_line: 'Delete line', move_up: 'Move line up', move_down: 'Move line down', toggle_comment: 'Toggle comment', indent: 'Indent', outdent: 'Outdent',
  upper: 'UPPERCASE', lower: 'lowercase', sort_asc: 'Sort lines ascending', sort_desc: 'Sort lines descending', trim_ws: 'Trim trailing whitespace', remove_empty: 'Remove empty lines', remove_dup: 'Remove duplicate lines',
  insert_date: 'Insert date / time', insert_path: 'Insert file path',
  find: 'Find…', find_next: 'Find next', find_prev: 'Find previous', replace: 'Replace…', goto_line: 'Go to line…', select_all_matches: 'Select all matches',
  find_ph: 'Find', replace_ph: 'Replace with', match_case: 'Match case', regex: 'Regex', whole_word: 'Whole word', replace_one: 'Replace', replace_all: 'Replace all',
  matches: '{n} matches', match_of: '{i} of {n}', no_match: 'No matches', close_find: 'Close find', in_selection: 'In selection',
  goto_line_title: 'Go to line', goto_line_hint: 'Line number (1 – {n}), or line:column', go: 'Go',
  word_wrap: 'Word wrap', line_numbers: 'Line numbers', show_ws: 'Show whitespace', active_line: 'Highlight current line', fold_gutter: 'Code folding', sidebar: 'Folder tree', toolbar: 'Toolbar', statusbar: 'Status bar',
  zoom_in: 'Zoom in', zoom_out: 'Zoom out', zoom_reset: 'Reset zoom', fullscreen: 'Full screen', fold_all: 'Fold all', unfold_all: 'Unfold all',
  lang_auto: 'Auto (by extension)', lang_plain: 'Plain text', eol: 'Line ending', eol_crlf: 'Windows (CR LF)', eol_lf: 'Unix (LF)', eol_cr: 'Macintosh (CR)',
  reopen_as: 'Reopen with encoding', save_as_enc: 'Save with encoding', enc_current: 'Current encoding',
  about: 'About', users_guide: "User's guide", shortcuts: 'Keyboard shortcuts',
  tip_new: 'New document (Ctrl+N)', tip_open: 'Open file (Ctrl+O)', tip_open_folder: 'Open folder (Ctrl+Shift+O)', tip_save: 'Save (Ctrl+S)', tip_save_all: 'Save all (Ctrl+Shift+S)', tip_close: 'Close tab (Ctrl+W)',
  tip_undo: 'Undo (Ctrl+Z)', tip_redo: 'Redo (Ctrl+Y)', tip_cut: 'Cut (Ctrl+X)', tip_copy: 'Copy (Ctrl+C)', tip_paste: 'Paste (Ctrl+V)',
  tip_find: 'Find (Ctrl+F)', tip_replace: 'Replace (Ctrl+H)', tip_wrap: 'Word wrap', tip_ws: 'Show whitespace', tip_zoom_in: 'Zoom in (Ctrl++)', tip_zoom_out: 'Zoom out (Ctrl+-)', tip_sidebar: 'Folder tree (Ctrl+B)',
  tip_theme: 'Choose a theme (16 built in)', tip_next_theme: 'Switch to the next theme: {theme}', tip_language: '한국어 / English', tip_settings: 'Settings', tip_about: 'About My Editor',
  settings: 'Settings', menu_info: 'Info',
  win_minimize: 'Minimize', win_maximize: 'Maximize', win_restore: 'Restore', win_close: 'Close', win_resize: 'Drag to resize the window',
  tab_modified: '(modified)', tab_readonly: '(read-only)', tab_new: 'New tab', tip_tab_close: 'Close (middle click)', tab_scroll_left: 'Scroll tabs left', tab_scroll_right: 'Scroll tabs right',
  sb_title: 'Folder', sb_empty: 'Open a folder to show its file tree here.', sb_open: 'Open folder…', sb_refresh: 'Refresh', sb_collapse: 'Collapse all', sb_expand: 'Expand all', sb_hidden: 'Show hidden files',
  sb_new_file: 'New file…', sb_new_folder: 'New folder…', sb_rename: 'Rename…', sb_delete: 'Delete', sb_open_terminal: 'Show in file manager', sb_filter: 'Filter…',
  st_pos: 'Ln {line}, Col {col}', st_sel: '{n} selected', st_sel_lines: '{n} chars ({l} lines) selected', st_size: '{chars} chars · {lines} lines', st_spaces: 'Spaces: {n}', st_tabs: 'Tab: {n}', st_zoom: '{n}%',
  st_lang: 'Select language', st_enc: 'Select encoding', st_eol: 'Select line ending', st_indent: 'Select indentation', st_ins: 'INS', st_ovr: 'OVR',
  ok: 'OK', cancel: 'Cancel', yes: 'Yes', no: 'No', dont_save: "Don't save", close_btn: 'Close',
  unsaved_title: 'Unsaved changes', unsaved_msg: 'Save the changes to "{name}"?', unsaved_many: '{n} documents have unsaved changes. Save them?',
  save_all_and_close: 'Save all', discard_all: "Don't save",
  reload_title: 'Reload', reload_msg: 'Reloading "{name}" from disk discards your current changes. Continue?',
  changed_title: 'File changed', changed_msg: '"{name}" was changed by another program. Reload it? (No keeps your version)',
  deleted_title: 'File deleted', deleted_msg: '"{name}" no longer exists on disk. The tab is kept — saving recreates the file.',
  enc_lossy_title: 'Encoding warning', enc_lossy_msg: 'Some characters cannot be represented in {enc} and will become "?". Save anyway?',
  reopen_title: 'Reopen', reopen_msg: 'Reopening "{name}" as {enc} discards your current changes. Continue?',
  delete_title: 'Delete', delete_msg: 'Delete "{name}"? This cannot be undone.',
  too_big_title: 'File too large', too_big_msg: '"{name}" is larger than 64 MB — this editor does not open files that big.',
  binary_title: 'Binary file', binary_msg: '"{name}" does not look like a text file. Open it anyway? (it may display garbled)',
  error_title: 'Error', error_unexpected: 'An unexpected error occurred.', error_details: 'Details', copy_details: 'Copy details', copied_details: 'Error details copied to the clipboard.', error_code: 'Code', error_path: 'Path',
  open_failed: 'Cannot open "{name}".', save_failed: 'Cannot save "{name}".',
  new_name: 'Name', new_file_title: 'New file', new_folder_title: 'New folder', rename_title: 'Rename', create: 'Create',
  settings_title: 'Settings', set_general: 'General', set_editor: 'Editor', set_files: 'Files',
  set_language: 'UI language', set_theme: 'Theme', set_font: 'Font', set_font_ph: '(default monospace font) — click for system fonts', set_font_size: 'Font size', set_tab_size: 'Tab size', set_insert_spaces: 'Insert spaces on Tab',
  set_auto_indent: 'Auto indentation (Enter keeps the previous line\'s indent, closing brackets re-align)', set_indent_with: 'Indent with', set_indent_spaces: 'Spaces', set_indent_tabs: 'Tab characters', set_tab_size_hint: 'one tab = n spaces (what Tab inserts when using spaces)', tip_auto_indent: 'Auto indentation on / off', auto_indent: 'Auto indentation',
  set_word_wrap: 'Word wrap', set_line_numbers: 'Line numbers', set_show_ws: 'Show whitespace', set_active_line: 'Highlight current line', set_auto_close: 'Auto-close brackets and quotes', set_bracket_match: 'Highlight matching brackets', set_fold: 'Code folding',
  set_default_enc: 'Encoding for new documents', set_default_eol: 'Line ending for new documents', set_trim: 'Trim trailing whitespace on save', set_final_nl: 'Add a final newline on save',
  set_restore: 'Restore the previous session on start', set_reload: 'Reload files changed outside (when unmodified)', set_confirm_close: 'Ask before closing unsaved documents',
  about_title: 'About', about_desc: 'Text / code editor for Windows / macOS / Linux / the web',
  version: 'Version', author: 'Author', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: 'Build', about_host: 'Running on', host_electron: 'Desktop (Electron)', host_web: 'Web browser', about_libs: 'Editing engine: CodeMirror 6 · Encodings: iconv-lite',
  fd_open: 'Open', fd_save: 'Save as', fd_folder: 'Select folder', fd_name: 'File name', fd_up: 'Parent folder', fd_drives: 'Drives', fd_empty: '(empty folder)', fd_overwrite: '"{name}" already exists. Overwrite?', fd_select: 'Select',
  copied: 'Copied to the clipboard.', saved: 'Saved: {name}', opened: 'Opened: {name}', all_saved: 'All documents saved.', nothing_to_save: 'Nothing to save.',
  drop_hint: 'Drop files here to open them', web_native_unsupported: 'Not available in the web version.',
  shortcuts_title: 'Keyboard shortcuts',
  md_heading: 'Heading {n} (H{n})', md_bold: 'Bold', md_italic: 'Italic', md_strike: 'Strikethrough', md_code: 'Inline code', md_code_block: 'Code block', md_quote: 'Quote',
  md_ul: 'Bullet list', md_ol: 'Numbered list', md_task: 'Task list', md_link: 'Link', md_image: 'Image', img_title: 'Insert image', img_file: 'File / URL', img_file_hint: 'Path of an image file or an http(s) address', img_alt: 'Alt text', img_mode: 'Insert as', img_link: 'Link', img_link_hint: 'a path relative to the document\'s folder', img_embed: 'Embedded', img_embed_hint: 'Base64 inside the document', img_width: 'Width', img_width_hint: 'px — empty for the original size', img_insert: 'Insert', img_not_found: 'The image cannot be read.', img_preview_empty: 'Pick a file or type an address to see a preview.', md_table: 'Table', md_hr: 'Horizontal rule', md_preview: 'Preview',
  spell_code_all: 'Check every word in code files too', set_spell_code_all: 'Check every word in code files too (off: comments and strings only)', tb_font: 'Editor font', tb_font_size: 'Font size (px)', tb_font_smaller: 'Smaller font', tb_font_larger: 'Larger font',
  terminal: 'Terminal', tip_terminal: 'Terminal panel (Ctrl+`)', term_new: 'New terminal', term_new_shell: 'New terminal with a shell…', term_hide: 'Close the terminal panel', term_empty: 'No terminal. Press + to open one.', term_placeholder: 'Type a command and press Enter (Tab completes, ↑ ↓ history, Ctrl+L clear, Ctrl+C interrupt)',
  set_terminal: 'Terminal', set_term_cwd: 'Start directory', set_term_cwd_default: '(the folder open in the sidebar)', set_term_cwd_hint: 'Where a new terminal starts. Leave empty for the folder open in the sidebar, or the folder of the current document.', set_browse: 'Browse…', set_term_shell: 'Default shell', set_term_shell_default: 'Default ({name})',
  term_no_git: 'Not a git repository', term_git_ahead: 'commits ahead of the remote', term_git_behind: 'commits behind the remote', term_git_changes: 'staged {staged} · modified {changed} · untracked {untracked}', term_git_clean: 'clean', term_git_conflicts: 'conflicts {n}',
  split_none: 'Single editor', split_cols: 'Split left / right', split_rows: 'Split top / bottom', split_grid: 'Split into four', next_pane: 'Next editor pane', tip_lint: 'Code check (lint) on / off', pane_empty: '(empty — pick a document)', pane_in: 'pane {n}', pane_pick: 'Pick a document…', pane_open_docs: 'Open documents', pane_folder_files: 'Files in {name}', pane_folder_empty: '(no files)', tip_split: 'Split the editor left / right (Ctrl+\\)',
  search_title: 'Search', find_in_files: 'Find in folder…', find_in_open: 'Find in open documents…', search_scope_open: 'Open documents', search_scope_folder: 'Folder', search_placeholder: 'Search text (Enter)', search_include: 'include: *.js, src/**', search_exclude: 'exclude: *.min.js, test/**', search_run: 'Find', search_running: 'Searching…', search_summary: '{n} matches in {files} files', search_none: 'No matches.', search_truncated: '(too many — only the first ones shown)', search_no_folder: 'No folder is open in the sidebar.', search_hint: 'Searches the open documents or every file of the folder open in the sidebar. Click a result to go there.',
  lint: 'Code check (lint)', lint_next: 'Next problem', lint_panel: 'Problems', set_lint: 'Code check — run the language\'s linter (eslint · ruff/pyflakes · gcc · shellcheck …) in the background and mark its findings next to the line numbers', st_lint_tool: 'Code check: {tool} — click for the list', st_lint_none: 'No checker for this language, or it is not installed (click: check again)',
  spell_check: 'Spell check (English)', tip_spell: 'Spell check on / off (F7)', set_spell: 'English spell check (bundled en_US dictionary; comments and strings only in code)', spell_add: 'Add "{word}" to dictionary', spell_ignore: 'Ignore "{word}" for now', spell_none: '(no suggestions)', spell_loading: 'Loading dictionary…',
  md_preview_menu: 'Markdown preview', md_wysiwyg: 'WYSIWYG editing (marks rendered in place)', md_wysiwyg_menu: 'Markdown WYSIWYG editing', md_source: 'Source',
};

const dicts = { ko, en };
let current = 'ko';
const listeners = new Set();

export function setLanguage(lang) {
  current = dicts[lang] ? lang : 'ko';
  document.documentElement.lang = current;
  for (const fn of listeners) fn();
}

export function getLanguage() { return current; }

export function t(key, params) {
  let s = (dicts[current] && dicts[current][key]) || ko[key] || key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useLanguage() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
