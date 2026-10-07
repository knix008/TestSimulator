// Tiny i18n: `t(key, params)` with Korean (the reference UI) and English.
import { useSyncExternalStore } from 'react';

const ko = {
  appName: 'My Editor V1.0',
  untitled: '새 문서 {n}',
  ready: '준비됨',

  // menu bar
  m_file: '파일', m_edit: '편집', m_search: '찾기', m_editor: '편집기', m_view: '보기', m_lang: '언어', m_enc: '인코딩', m_help: '도움말',
  // file
  new_file: '새 문서', open_file: '열기…', open_folder: '폴더 열기…', close_folder: '폴더 닫기', save: '저장', save_as: '다른 이름으로 저장…', save_all: '모두 저장',
  reload: '다시 불러오기', close: '닫기', close_all: '모두 닫기', close_others: '다른 탭 모두 닫기', close_right: '오른쪽 탭 모두 닫기',
  recent: '최근 파일', recent_remove: '목록에서 제거', recent_empty: '(최근 파일 없음)', recent_clear: '최근 파일 목록 지우기', reveal: '탐색기에서 보기', open_with: '기본 앱으로 열기', copy_path: '경로 복사', copy_name: '파일 이름 복사',
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
  word_wrap: '자동 줄 바꿈', line_numbers: '줄 번호', minimap: '미니맵', show_ws: '공백 문자 표시', indent_guides: '탭 안내선', active_line: '현재 줄 강조', fold_gutter: '코드 접기', sidebar: '폴더 트리', toolbar: '도구 모음', statusbar: '상태 표시줄',
  zoom_in: '확대', zoom_out: '축소', zoom_reset: '기본 크기', fullscreen: '전체 화면', fold_all: '모두 접기', unfold_all: '모두 펼치기',
  // language / encoding / eol
  lang_auto: '자동 (확장자로 판별)', lang_plain: '일반 텍스트', eol: '줄 끝', eol_crlf: 'Windows (CR LF)', eol_lf: 'Unix (LF)', eol_cr: 'Macintosh (CR)',
  reopen_as: '다음 인코딩으로 다시 열기', save_as_enc: '다음 인코딩으로 저장', enc_current: '현재 인코딩',
  // help
  about: '정보', users_guide: '사용 설명서', shortcuts: '단축키',
  // toolbar tips
  tip_new: '새 문서 (Ctrl+N)', tip_open: '파일 열기 (Ctrl+O)', tip_open_folder: '폴더 열기 (Ctrl+Shift+O)', tip_save: '저장 (Ctrl+S)', tip_save_all: '모두 저장 (Ctrl+Shift+S)', tip_close: '탭 닫기 (Ctrl+W)',
  tip_undo: '실행 취소 (Ctrl+Z)', tip_redo: '다시 실행 (Ctrl+Y)', tip_cut: '잘라내기 (Ctrl+X)', tip_copy: '복사 (Ctrl+C)', tip_paste: '붙여넣기 (Ctrl+V)',
  tip_find: '찾기 (Ctrl+F)', tip_replace: '바꾸기 (Ctrl+H)', tip_wrap: '자동 줄 바꿈', tip_ws: '공백 문자 표시', tip_indent_guides: '탭 간격마다 세로 안내선', tip_zoom_in: '확대 (Ctrl++)', tip_zoom_out: '축소 (Ctrl+-)', tip_sidebar: '폴더 트리 (Ctrl+B)', tip_structure: '문서 구조 — 코드는 미니맵, Markdown 은 제목 트리 패널',
  tip_zoom_level: '현재 배율 {n}% — 누르면 기본 크기로 (Ctrl+0)', tip_formatter: '이 문서에 적용되는 정렬 도구: {tool}', tip_formatter_auto: '이 문서에 적용되는 정렬 도구: {tool} (자동 — 설치된 첫 도구; 설정 › 정렬)', tip_formatter_missing: '이 문서에 적용되는 정렬 도구: {tool} — 설치 안 됨 (정렬할 때 설치를 제안합니다)', tip_formatter_off: '이 문서의 정렬이 꺼져 있습니다 (설정 › 정렬)', tip_format_empty: '정렬할 내용이 없습니다', tip_format_done: '이미 정렬되어 있습니다 ({tool})', tip_formatter_pick: '누르면 이 언어의 정렬 방식을 고릅니다', set_format_for: '{lang} 정렬 방식',
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
  too_big_title: '파일이 너무 큽니다', too_big_msg: '"{name}" 은(는) 64 MB 를 넘습니다. 이 편집기는 그보다 큰 파일을 텍스트로 열지 않습니다.',
  binary_title: '이진 파일', binary_msg: '"{name}" 은(는) 텍스트 파일이 아닌 것 같습니다. 그래도 열까요? (표시가 깨질 수 있습니다)',
  hex_info: '이진 파일 · {size} ({bytes} 바이트)', hex_offset: '오프셋', hex_text: 'ASCII', hex_empty: '빈 파일', hex_at: '오프셋 0x{hex} ({dec})', hex_value: '값 0x{hex} ({dec}) \'{chr}\'', hex_selected: '{n} 바이트 선택', hex_hint: '바이트를 누르면 선택, Shift+클릭으로 범위, Ctrl+C 로 16진수 복사', hex_copied: '{n} 바이트를 16진수로 복사했습니다', hex_copied_max: '처음 {n} 바이트만 16진수로 복사했습니다 (한 번에 1 MB 까지)', hex_readonly: '이진 파일은 여기서 편집·저장할 수 없습니다 (16진수 보기 전용)',   hex_opened: '이진 파일을 16진수로 엽니다: {name}',
  prog_title: '작업 중', prog_working: '처리하는 중…', prog_pct: '{n}%',
  prog_print: '인쇄 미리보기', prog_print_build: '미리보기를 준비하는 중…', prog_print_highlight: '구문 강조를 적용하는 중…', prog_print_pages: '페이지를 만드는 중…',
  prog_open: '파일 열기', prog_open_file: '파일을 여는 중…', prog_sniff: '파일 종류를 확인하는 중…', prog_read: '파일을 읽는 중…', prog_prepare: '편집기에 넣는 중…',
  prog_hex: 'Hexa', prog_hex_read: '바이트를 읽는 중…', prog_hex_format: '16진수로 만드는 중…', prog_hex_copy: '16진수를 복사하는 중…',
  prog_image: '이미지', prog_image_load: '그림을 불러오는 중…',
  prog_format: '문서 정렬', prog_format_run: '정렬하는 중…',
  prog_save: '저장', prog_save_file: '저장하는 중…', prog_save_all: '모든 문서를 저장하는 중…',
  prog_restore: '세션 복원', prog_restore_file: '이전 문서를 여는 중…',
  img_opened: '이미지를 엽니다: {name}',
  img_hex: 'Hexa', img_hex_tip: '옆에 파일의 바이트를 Hexa(16진수)로 보여 줍니다', img_hex_menu: 'Hexa',
  img_show: '그림으로 보기', img_show_tip: '그림을 보여 줍니다',
  error_title: '오류', error_unexpected: '예상하지 못한 오류가 발생했습니다.', error_details: '자세히', copy_details: '자세히 복사', copied_details: '오류 내용을 클립보드에 복사했습니다.', error_code: '코드', error_path: '경로',
  open_failed: '"{name}" 을(를) 열 수 없습니다.', save_failed: '"{name}" 을(를) 저장할 수 없습니다.',
  new_name: '이름', new_file_title: '새 파일', new_folder_title: '새 폴더', rename_title: '이름 바꾸기', create: '만들기',
  // settings
  settings_title: '설정', set_general: '일반', set_editor: '편집기', set_files: '파일',
  set_language: 'UI 언어', set_theme: '테마', set_font: '글꼴', set_font_ph: '(기본 고정폭 글꼴) — 클릭하면 시스템 글꼴 목록', set_font_size: '글꼴 크기', set_tab_size: '탭 크기', set_insert_spaces: 'Tab 키로 공백 입력',
  set_auto_indent: '자동 들여쓰기 (Enter 로 새 줄을 만들 때 이전 줄의 들여쓰기 유지, 닫는 괄호 자동 정렬)', set_indent_with: '들여쓰기 문자', set_indent_spaces: '공백 삽입', set_indent_tabs: '탭 문자 삽입', set_tab_size_hint: '탭 1개 = 공백 n자리 (공백 삽입 시 Tab 키가 넣는 공백 수)', tip_auto_indent: '자동 들여쓰기 켜기/끄기', auto_indent: '자동 들여쓰기',
  set_word_wrap: '자동 줄 바꿈', set_minimap: '미니맵 (편집기 오른쪽에 문서 전체를 작게 — 끌거나 누르면 그 위치로 이동)', set_line_numbers: '줄 번호', set_show_ws: '공백 문자 표시', set_active_line: '현재 줄 강조', set_auto_close: '괄호·따옴표 자동 닫기', set_bracket_match: '짝 괄호 강조', set_fold: '코드 접기',
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
  terminal: '터미널', tip_terminal: '터미널 패널 (Ctrl+`)', term_new: '새 터미널', term_new_shell: '셸을 골라 새 터미널', term_hide: '패널 닫기', term_empty: '터미널이 없습니다. + 를 눌러 여세요.', term_placeholder: '명령을 입력하고 Enter (Tab 자동완성, ↑ ↓ 기록, Ctrl+L 지우기, Ctrl+C 중단)',
  log_tab: '로그', tip_log: '로그 보기', log_empty: '로그가 없습니다.', log_clear: '로그 지우기',
  lint_tab: '문제점', lint_tab_file: '{name}', lint_tab_summary: '{tool} · 오류 {e} · 경고 {w} · 정보 {i}', lint_tab_off: '코드 검사가 꺼져 있습니다. 편집기 메뉴에서 켤 수 있습니다.', lint_tab_nodoc: '열린 파일이 없습니다.', lint_tab_binary: '이 파일은 코드 검사를 하지 않습니다.', lint_tab_running: '검사 중…', lint_tab_clean: '문제가 없습니다.', lint_tab_refresh: '다시 검사', lint_settings: '문제점 설정 (언어별 검사 도구)…',
  set_terminal: '터미널', set_term_cwd: '시작 디렉터리', set_term_cwd_default: '(폴더 트리에 열린 폴더)', set_term_cwd_hint: '새 터미널이 시작하는 디렉터리. 비우면 폴더 트리에 열린 폴더, 그것도 없으면 현재 문서의 폴더에서 시작합니다.', set_browse: '찾아보기…', set_term_shell: '기본 셸', set_term_shell_default: '기본 ({name})', set_term_shell_hint: '이 컴퓨터에 설치된 셸만 표시합니다. 셸을 새로 설치한 뒤에는 목록을 다시 열면 반영됩니다.',
  term_no_git: 'Git 저장소가 아닙니다', term_git_ahead: '원격보다 앞선 커밋', term_git_behind: '원격보다 뒤진 커밋', term_git_changes: '스테이지 {staged} · 수정 {changed} · 추적 안 함 {untracked}', term_git_clean: '변경 없음', term_git_conflicts: '충돌 {n}',
  split_none: '편집 창 하나', split_cols: '좌우로 나누기', split_rows: '상하로 나누기', split_grid: '4개로 나누기', next_pane: '다음 편집 창', tip_lint: '코드 검사 결과 (문제점) 보기', pane_empty: '(비어 있음 — 문서를 고르세요)', pane_in: '창 {n}', pane_pick: '문서 고르기…', pane_close: '이 창 닫기', pane_close_doc: '문서를 닫고 이 창 없애기', pane_open_docs: '열린 문서', pane_folder_files: '폴더 {name} 의 파일', pane_folder_empty: '(파일 없음)', tip_split: '편집 창 나누기 — 누를 때마다 창이 하나씩 늘어남 (최대 9개, Ctrl+\\); 보기 메뉴에서 좌우·상하·4개·하나',
  search_title: '검색', find_in_files: '폴더에서 찾기…', find_in_open: '열린 문서에서 찾기…', search_scope_open: '열린 문서', search_scope_folder: '폴더', search_placeholder: '찾을 내용 (Enter)', search_include: '포함: *.js, src/**', search_exclude: '제외: *.min.js, test/**', search_run: '찾기', search_running: '찾는 중…', search_summary: '{n}개 일치 · 파일 {files}개', search_none: '일치하는 것이 없습니다.', search_truncated: '(결과가 많아 일부만 표시)', search_no_folder: '폴더 트리에 열린 폴더가 없습니다.', search_hint: '열린 문서 또는 폴더 트리의 폴더 전체에서 찾습니다. 결과를 누르면 그 자리로 이동합니다.',
  imgx_title: '이미지 저장', imgx_info: '이미지', imgx_unknown: '형식 알 수 없음', imgx_has_alpha: '투명 배경 있음', imgx_format: '파일 형식', imgx_original: '원본 그대로 ({ext})', imgx_quality: '품질', imgx_alpha: '투명 배경', imgx_keep_alpha: '투명 배경 유지', imgx_no_alpha_format: '이 형식은 투명을 지원하지 않아 배경색으로 채웁니다', imgx_background: '배경색', imgx_file: '파일 이름',
  print: '인쇄…', print_title: '인쇄', print_preview: '인쇄 미리보기', print_zoom: '{n}%', print_zoom_in: '확대', print_zoom_out: '축소', print_fit: '맞춤', print_page_of: '{n} / {total}', print_destination: '프린터', print_copies: '매수', print_color_mode: '색', print_color_color: '컬러', print_color_mono: '흑백', print_layout: '방향', print_portrait: '세로', print_landscape: '가로', print_no_printers: '설치된 프린터가 없습니다. 기본 프린터로 인쇄합니다.', print_printing: '인쇄하는 중…', print_failed: '인쇄하지 못했습니다', tip_print: '인쇄 (Ctrl+P) — 미리보기를 확인한 뒤 인쇄. 코드 목록의 테두리·줄 번호·페이지 번호는 설정 › 인쇄에서. Markdown · HTML 은 렌더 결과, 그림은 그림 그대로', pv_copy_image: '이미지 복사', pv_save_image: '이미지 다른 이름으로 저장…', pv_image_copied: '이미지를 클립보드에 복사했습니다', pv_image_copy_failed: '이미지 복사 실패', pv_image_saved: '이미지를 저장했습니다: {path}',
  format_doc: '문서 정렬', tip_format: '문서 정렬 — 언어별 정렬 도구로 전체 코드를 보기 좋게 (Shift+Alt+F)', set_format: '정렬', set_lint_tab: '검사', set_format_on_save: '저장할 때 자동 정렬', set_reset: '기본값으로 되돌리기', set_reset_tip: '모든 설정을 처음 상태로 되돌립니다', set_reset_title: '설정 초기화', set_reset_msg: '모든 설정을 기본값으로 되돌릴까요? 글꼴·테마·편집·파일·터미널·정렬·인쇄 설정이 처음 상태로 돌아갑니다. (UI 언어와 창 배치는 그대로 둡니다)', set_reset_yes: '되돌리기', set_format_hint: '언어마다 어떤 정렬 도구를 쓸지 고릅니다. "자동"은 설치된 첫 도구(내장 Prettier 포함), 없으면 편집기 들여쓰기만 정리합니다. "설치 안 됨"은 그 실행 파일을 프로젝트의 node_modules/.bin 이나 PATH 에서 찾지 못했다는 뜻입니다 — 설치한 뒤 PATH 에 추가하고(예: pip 의 Scripts 폴더, npm -g 의 %APPDATA%\npm) 앱을 다시 시작하거나 아래 버튼으로 다시 찾으세요.', fmt_auto: '자동 ({tool})', fmt_indent: '편집기 들여쓰기만', fmt_none_opt: '사용 안 함', fmt_not_installed: '설치 안 됨', fmt_not_installed_auto: '설치 안 됨 · 정렬할 때 자동 설치', fmt_not_installed_manual: '설치 안 됨 · 직접 설치 필요', fmt_rescan: '다시 찾기', inst_ask_title: '{tool} 설치', inst_ask_msg: '{lang} 정렬 도구 {tool} 이(가) 설치되어 있지 않습니다. 지금 내려받아 설치할까요? (패키지 관리자로 설치하며 진행 상황을 보여 줍니다)', inst_ask_lint_msg: '{lang} 검사 도구 {tool} 이(가) 설치되어 있지 않습니다. 지금 설치할까요?\n\n1. 패키지 관리자 확인\n2. 패키지 내려받기\n3. 설치\n4. 이 언어의 검사 도구로 사용', inst_ask_yes: '설치', inst_ask_runtime_title: '{pm} 설치', inst_ask_runtime_msg: '{tool} 을(를) 쓰려면 {pm} 이(가) 필요합니다. 지금 {pm} 을(를) 설치할까요?\n설치가 끝나면 {tool} 설치를 이어서 진행합니다.', inst_kind_runtime: '공식 설치 프로그램', inst_title: '{tool} 설치 중…', inst_running: '{tool} 을(를) 내려받아 설치하는 중입니다…', inst_via: '{pm} 으로 설치합니다', inst_step_ready: '패키지 관리자 확인', inst_step_fetch: '패키지 내려받기', inst_step_apply: '설치', inst_step_finish: '사용 준비', inst_kind_npm: 'npm (Node.js)', inst_kind_pip: 'pip (Python)', inst_kind_cargo: 'cargo (Rust)', inst_kind_go: 'go', inst_kind_gem: 'gem (Ruby)', inst_kind_rustup: 'rustup', inst_kind_ps: 'PowerShell', inst_log_show: '설치 로그 보기', inst_log_hide: '설치 로그 숨기기', inst_done: '{tool} 설치 완료', inst_failed: '{tool} 설치 실패', inst_retry: '다시 시도', inst_cancelled: '{tool} 설치 취소됨', inst_use: '정렬 실행', inst_manual_title: '{tool} 을(를) 직접 설치해야 합니다', inst_missing_pm: '{tool} 을(를) 설치하려면 {pm} 이(가) 필요한데 찾을 수 없습니다. 먼저 설치한 뒤 앱을 다시 시작하세요.', inst_no_recipe: '{tool} 은(는) 자동 설치를 지원하지 않습니다.', inst_install: '{tool} 설치', inst_reinstall: '{tool} 다시 설치 (설치된 것을 지우고 새로 설치)', inst_pick_first: '먼저 설치할 도구를 고르세요.', inst_already_title: '{tool} 은(는) 이미 설치되어 있습니다', inst_already_msg: '설치된 것을 지우고 새로 설치할까요, 아니면 설치된 것 위에 최신 버전으로 다시 설치할까요?', inst_already_reinstall: '지우고 새로 설치', inst_already_keep: '위에 덮어 설치', fmt_prettier_builtin: 'Prettier (내장)', fmt_prettier_ext: 'Prettier (프로젝트 / PATH)', fmt_builtin_json: '내장 JSON 정렬', fmt_builtin_xml: '내장 XML 정렬', fmt_done: '정렬 완료: {tool}', fmt_unchanged: '이미 정렬되어 있습니다 ({tool})', fmt_failed: '정렬 실패 ({tool})', fmt_none: '{lang} 정렬 도구가 없어 들여쓰기만 정리했습니다', fmt_off: '{lang} 정렬이 꺼져 있습니다 (설정 › 정렬)',
  lint: '코드 검사 (Lint)', lint_next: '다음 문제', lint_panel: '문제 목록', set_lint: '코드 검사 — 언어별 검사 도구(eslint · ruff/pyflakes · gcc · shellcheck …)를 백그라운드로 돌려 문제를 줄 번호 옆에 표시', st_lint_tool: '코드 검사: {tool} — 클릭하면 문제 목록', st_lint_none: '이 언어의 검사 도구가 없거나 설치되지 않았습니다 (클릭: 다시 검사)',
  spell_check: '스펠링 체크 (영어)', tip_spell: '스펠링 체크 켜기/끄기 (F7)', set_spell: '영어 스펠링 체크 (내장 en_US 사전; 코드에서는 주석·문자열만)', spell_add: '"{word}" 사전에 추가', spell_ignore: '"{word}" 이번만 무시', spell_none: '(제안 없음)', spell_loading: '사전 불러오는 중…',
  md_preview_menu: 'Markdown 미리보기', md_outline_menu: 'Markdown 구조', md_outline: '구조', md_outline_tip: '구조 — 제목을 트리로 보여 주고 누르면 그 위치로 이동', md_outline_empty: '제목이 없습니다 (# 제목 …)', md_outline_untitled: '(제목 없음)', md_wysiwyg: 'WYSIWYG 편집 (기호를 렌더링해서 표시)', md_wysiwyg_menu: 'Markdown WYSIWYG 편집', md_source: '소스',
  // themes (settings › theme)
  set_theme_dark: '어두운 테마', set_theme_light: '밝은 테마', set_custom_themes: '사용자 정의 테마', set_custom_add: "'{name}'을(를) 바탕으로 새 테마 만들기", set_custom_remove: '이 테마 삭제', set_custom_hint: '+ 를 누르면 현재 테마를 바탕으로 새 테마가 만들어지고 아래에서 색을 정합니다 (현재 테마의 색이 미리 보임). 만든 테마는 툴바의 테마 목록에도 나타납니다.',
  set_custom_none: '(사용자 정의 테마 없음)', set_custom_name: '이름', set_custom_dark: '어두운 테마', set_custom_light: '밝은 테마', set_custom_copy: '(사용자)',
  set_color_bg: '편집기 배경', set_color_panel: '패널 배경', set_color_raised: '메뉴·툴바 배경', set_color_hover: '마우스 오버', set_color_active: '비활성 선택', set_color_border: '테두리', set_color_borderStrong: '진한 테두리', set_color_text: '글자', set_color_textDim: '흐린 글자', set_color_accent: '강조색', set_color_accentStrong: '진한 강조색', set_color_accentText: '강조색 위 글자', set_color_folder: '폴더 아이콘', set_color_file: '파일 아이콘', set_color_danger: '경고·오류',
  // autocomplete
  autocomplete: '자동 완성', tip_autocomplete: '자동 완성 켜기/끄기 — 언어별 키워드·태그·속성·이름 제안, Ctrl+Space 로 열기', set_autocomplete: '입력 중 자동 완성 (언어별 키워드·태그·속성·이름 + 문서의 단어; Ctrl+Space 로 열기)',
  // HTML preview
  set_devops_hint: 'Dockerfile(Dockerfile · Containerfile · *.dockerfile)과 Kubernetes 매니페스트(YAML)는 명령어·이미지·키·값 자동 완성과 내장 검사를 제공합니다.',
  svg_rect: '사각형', svg_circle: '원', svg_ellipse: '타원', svg_line: '선', svg_polyline: '꺾은선', svg_polygon: '다각형', svg_path: '경로(곡선)', svg_text: '텍스트', svg_image: '이미지', svg_group: '그룹 (선택 영역을 감쌈)', svg_gradient: '그러데이션 정의', svg_use: '재사용 (use)', svg_transform: '변형 속성 (회전·이동)',
  img_pv_menu: '이미지 미리보기', img_pv_hint: '이미지 파일 — 창에 그림을 보여 줍니다 (왼쪽 클릭: 확대, 오른쪽 클릭: 축소, 드래그: 이동, Ctrl+휠: 확대·축소, Hexa: 옆에 바이트). HEIC/HEIF·DICOM 지원, DICOM 은 슬라이더·윈도우/레벨', img_pv_hint_svg: 'SVG 문서 — 편집하는 대로 오른쪽 미리보기에 그려집니다 (왼쪽 클릭: 확대, 오른쪽 클릭: 축소, 드래그: 이동)', img_pv_fit: '창에 맞춤', img_pv_natural: '원본 크기 (1:1)', img_pv_fit_on: '창에 맞춤', img_pv_zoom: '{n}%', img_pv_zoom_tip: '왼쪽 클릭 확대 · 오른쪽 클릭 축소 · 드래그로 이동 · Ctrl+휠 · 여러 장은 슬라이더 또는 ← →', img_pv_broken: '이미지를 그릴 수 없습니다',
  img_pv_slice: '이미지', img_pv_of: '{n} / {total}', img_pv_prev: '이전 이미지', img_pv_next: '다음 이미지', img_pv_cine: '연속 재생',
  img_pv_ww: '창 너비', img_pv_wl: '창 중심', img_pv_invert: '반전', img_pv_meta: 'DICOM 정보', img_pv_hu: 'HU {n}',
  img_pv_wl_default: '기본', img_pv_wl_abdomen: '복부', img_pv_wl_bone: '뼈', img_pv_wl_brain: '뇌', img_pv_wl_lung: '폐', img_pv_wl_soft: '연부', img_pv_wl_liver: '간',
  img_pv_patient: '환자', img_pv_study: '검사', img_pv_series: '시리즈', img_pv_modality: '모달리티', img_pv_bits: '비트',
  html_preview_menu: 'HTML 미리보기', html_preview: 'HTML 미리보기 — 옆 창에 렌더링 (스크립트는 격리 실행)', html_preview_hint: 'HTML 문서 — 미리보기를 켜면 옆 창에 렌더링됩니다 (이미지·CSS·스크립트 파일 포함)',
  // terminal line endings + prompt (settings › terminal)
  set_term_color: '출력을 색으로 표시 — 프로그램의 ANSI 색 그대로 + 오류(빨강)·경고(노랑)·완료(초록) 줄과 링크·파일:줄 강조 (끄면 흑백)', set_prompt: '프롬프트', term_settings: '터미널 설정 (셸 · 프롬프트)…',
  term_gs_uptodate: '변경 없음 · 푸시됨 (초록)', term_gs_staged: 'add 됨 — 커밋 필요 (노랑)', term_gs_modified: '수정됨 — add 필요 (빨강)', term_gs_conflict: '충돌 — 해결 필요 (진홍)', term_gs_ahead: '커밋됨 — 푸시 필요 (주황)', term_gs_behind: '원격에 새 커밋 — pull 필요 (파랑)',
  // prompt themes (settings › terminal › prompt)
  pe_presets: '프리셋 — 클릭하면 바로 적용', pe_current: '현재: {name}', pe_current_modified: '현재: {name} (수정됨)', pe_custom: '현재: 사용자 지정',
  pe_customize: '간단 설정', pe_show: '표시:', pe_shape: '모양:', pe_two_lines: '두 줄', pe_git_colors: 'git 상태색:', pe_git_colors_tip: '브랜치(git) 블록만 저장소 상태 색으로: 초록 정상(푸시됨) → 빨강 수정 → 노랑 add → 주황 커밋 → 초록 푸시; 진홍 충돌 · 파랑 pull 필요. 나머지 세그먼트는 프롬프트 테마 색 그대로. 오른쪽에서 상태마다 색을 정합니다. 끄면 브랜치 블록도 테마 색.', pe_gs_conflict: '충돌', pe_gs_staged: 'add 됨', pe_gs_modified: '수정됨', pe_gs_ahead: '커밋됨', pe_gs_behind: 'pull 필요', pe_gs_uptodate: '정상', pe_gs_reset: '기본색', pe_advanced: '고급 편집', pe_enabled: '표시', pe_type: '종류', pe_colors: '글자색 / 배경색',
  pe_path_full: '전체 경로', pe_path_folder: '폴더 이름만', pe_path_short: '축약 (…\\상위\\폴더)', pe_path_agnoster: '첫 글자 (~\\P\\A\\src)',
  pe_select_hint: '왼쪽 목록에서 세그먼트를 고르세요.',
  pe_preview: '미리보기 — 깨끗한 저장소 / 변경된 저장소 / 저장소 아님', pe_sample_clean: '  git status 깨끗함', pe_sample_dirty: '  변경 있음 · 종료 코드 1 · 3.2초', pe_sample_plain: '  저장소 아님',
  pe_preset: '프리셋', pe_apply: '적용', pe_preset_applied: "프리셋 '{name}'을(를) 적용했습니다.",
  pe_final_space: '프롬프트 뒤에 공백', pe_block: '블록 {n}', pe_newline: '새 줄에서 시작', pe_add_segment: '+ 세그먼트 추가…', pe_add_block: '블록(줄) 추가', pe_remove_block: '블록 삭제',
  pe_template: '템플릿', pe_symbol: '파워라인 기호', pe_diamonds: '앞/뒤 기호', pe_fg_templates: '글자색 템플릿 (줄마다 하나, 처음 맞는 것)', pe_bg_templates: '배경색 템플릿 (줄마다 하나, 처음 맞는 것)',
  pe_path_style: '경로 스타일', pe_max_depth: '최대 깊이', pe_folder_sep: '폴더 구분자', pe_folder_sep_hint: '(비우면 OS 구분자)', pe_home_icon: '홈 표시', pe_branch_icon: '브랜치 아이콘', pe_always_enabled: '성공(0)일 때도 표시', pe_threshold: '표시 최소 시간 (ms)', pe_os_icons: 'OS 아이콘 (windows / macos / linux)',
  pe_pick_color: '색 고르기 (이름도 가능: accent · foreground · background · auto · transparent · p:이름)', pe_expand: '펼치기', pe_collapse: '접기', pe_up: '위로', pe_down: '아래로', pe_remove: '세그먼트 삭제',
  pe_style_powerline: '파워라인', pe_style_plain: '일반', pe_style_diamond: '다이아몬드(둥근)',
  pe_type_path: '경로', pe_type_git: 'git', pe_type_session: '사용자@호스트', pe_type_shell: '셸', pe_type_os: 'OS', pe_type_time: '시각', pe_type_status: '종료 코드', pe_type_executiontime: '실행 시간', pe_type_root: '관리자', pe_type_text: '텍스트',
  pe_vars_path: '변수: .Path .Location .Folder .Parent — [[icon:folder]] 로 폴더 아이콘', pe_vars_git: '변수: .HEAD .Branch .Upstream .Ahead .Behind .BranchStatus .StashCount .Symbols .Working.Changed/.String .Staging.Changed/.String — 배경 auto = 상태색, [[icon:gitBranch]] 아이콘',
  pe_vars_session: '변수: .UserName .HostName .Root', pe_vars_shell: '변수: .Name', pe_vars_os: '변수: .Icon .OS', pe_vars_time: '변수: .CurrentDate | date "15:04:05" (Go 레이아웃: 2006 01 02 15 04 05 Jan Mon PM)', pe_vars_status: '변수: .Code .Error .String', pe_vars_executiontime: '변수: .Ms .FormattedMs', pe_vars_root: '관리자 권한일 때만 표시 (현재는 표시되지 않음)', pe_vars_text: '템플릿 그대로 표시 — {{ if }}…{{ end }}, .UserName .HostName .Path 사용 가능',
  set_linters: '코드 검사 (Lint) 도구', set_linters_hint: '언어마다 어떤 검사 도구를 쓸지 고릅니다. "자동"은 설치된 첫 도구, "사용 안 함"은 그 언어의 검사를 끕니다. 설치되지 않은 도구를 고르면 설치 순서를 보여 준 뒤, 동의하면 단계별로 설치합니다.', lint_none_installed: '설치된 도구 없음', lint_not_installed_auto: '설치 안 됨 · 선택하면 설치 여부 확인',
  set_print: '인쇄', set_print_code: '구성', set_print_look: '모양', set_print_type: '글꼴', set_print_page_setup: '용지', set_print_hint: '코드와 일반 텍스트는 선택한 용지로 페이지를 나눠 인쇄합니다. 구문 강조는 용지에 맞는 밝은 색을 씁니다. Markdown · HTML · 그림에는 적용되지 않습니다.', set_print_paper: '용지 크기', set_print_paper_a4: 'A4', set_print_paper_letter: 'Letter', set_print_paper_legal: 'Legal', set_print_paper_a5: 'A5', set_print_orient: '방향', set_print_margin: '여백', set_print_header: '파일 이름 / 경로', set_print_linenos: '줄 번호', set_print_border: '페이지 테두리', set_print_pages: '페이지 번호', set_print_date: '인쇄 날짜', set_print_syntax: '구문 강조 (키워드·문자열·주석 색)', set_print_color: '컬러로 인쇄 (끄면 흑백, 굵기만 유지)', set_print_zebra: '줄무늬 배경 (한 줄씩 연한 회색)', set_print_gutter: '줄 번호 여백 배경', set_print_wrap: '긴 줄 자동 줄 바꿈', set_print_syntax_s: '구문 강조', set_print_color_s: '컬러', set_print_zebra_s: '줄무늬', set_print_gutter_s: '여백 배경', set_print_wrap_s: '줄 바꿈', set_print_font_size: '글꼴 크기', set_print_line_height: '줄 간격', set_print_sample: '미리보기',
  set_grp_ui: '화면', set_grp_session: '세션', set_grp_indent: '들여쓰기', set_grp_display: '표시', set_grp_assist: '편집 보조', set_grp_tree: '폴더 트리',
  set_line_height: '줄 높이', set_layout: '표시', set_auto_save: '자동 저장', set_auto_save_off: '안 함', set_auto_save_blur: '창이 포커스를 잃을 때', set_auto_save_delay: '마지막 편집 후 n초 뒤', set_seconds: '초', set_auto_save_hint: '디스크에 있는 파일만 저장합니다 — 새 문서는 이름을 정해 직접 저장', set_default_lang: '새 문서 언어', set_tree_hidden: '숨김 파일(.으로 시작) 표시',
  set_eol_on_save: '저장할 때 줄 끝', set_eol_keep: '파일의 원래 줄 끝 유지', set_eol_always: '항상 {eol}', set_eol_on_save_hint: 'CR LF / LF 파일을 열어 저장할 때 어떤 줄 끝으로 쓸지 — "유지"는 열 때의 줄 끝 그대로 (상태 표시줄의 줄 끝 메뉴로 문서마다 바꿀 수도 있음)',
  pe_custom_prompts: '사용자 정의 프롬프트:', pe_save_custom: '현재 프롬프트를 저장', pe_custom_name: '이름', pe_update_custom: '변경 내용 저장', pe_update_custom_tip: '이 사용자 정의 프롬프트를 지금 모양으로 다시 저장', pe_delete_custom: '삭제', pe_custom_copy: '(사용자)', pe_custom_saved: "'{name}' 저장됨", pe_custom_hint: '저장한 프롬프트는 ★ 카드로 프리셋 옆에 나타나고 툴바·세션에 남습니다.',
};

const en = {
  appName: 'My Editor V1.0',
  untitled: 'new {n}',
  ready: 'Ready',

  m_file: 'File', m_edit: 'Edit', m_search: 'Search', m_editor: 'Editor', m_view: 'View', m_lang: 'Language', m_enc: 'Encoding', m_help: 'Help',
  new_file: 'New', open_file: 'Open…', open_folder: 'Open folder…', close_folder: 'Close folder', save: 'Save', save_as: 'Save as…', save_all: 'Save all',
  reload: 'Reload from disk', close: 'Close', close_all: 'Close all', close_others: 'Close other tabs', close_right: 'Close tabs to the right',
  recent: 'Recent files', recent_remove: 'Remove from the list', recent_empty: '(no recent files)', recent_clear: 'Clear recent files', reveal: 'Show in file manager', open_with: 'Open with default app', copy_path: 'Copy path', copy_name: 'Copy file name',
  exit: 'Exit',
  undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', delete: 'Delete', select_all: 'Select all',
  dup_line: 'Duplicate line', del_line: 'Delete line', move_up: 'Move line up', move_down: 'Move line down', toggle_comment: 'Toggle comment', indent: 'Indent', outdent: 'Outdent',
  upper: 'UPPERCASE', lower: 'lowercase', sort_asc: 'Sort lines ascending', sort_desc: 'Sort lines descending', trim_ws: 'Trim trailing whitespace', remove_empty: 'Remove empty lines', remove_dup: 'Remove duplicate lines',
  insert_date: 'Insert date / time', insert_path: 'Insert file path',
  find: 'Find…', find_next: 'Find next', find_prev: 'Find previous', replace: 'Replace…', goto_line: 'Go to line…', select_all_matches: 'Select all matches',
  find_ph: 'Find', replace_ph: 'Replace with', match_case: 'Match case', regex: 'Regex', whole_word: 'Whole word', replace_one: 'Replace', replace_all: 'Replace all',
  matches: '{n} matches', match_of: '{i} of {n}', no_match: 'No matches', close_find: 'Close find', in_selection: 'In selection',
  goto_line_title: 'Go to line', goto_line_hint: 'Line number (1 – {n}), or line:column', go: 'Go',
  word_wrap: 'Word wrap', line_numbers: 'Line numbers', minimap: 'Minimap', show_ws: 'Show whitespace', indent_guides: 'Indent guides', active_line: 'Highlight current line', fold_gutter: 'Code folding', sidebar: 'Folder tree', toolbar: 'Toolbar', statusbar: 'Status bar',
  zoom_in: 'Zoom in', zoom_out: 'Zoom out', zoom_reset: 'Reset zoom', fullscreen: 'Full screen', fold_all: 'Fold all', unfold_all: 'Unfold all',
  lang_auto: 'Auto (by extension)', lang_plain: 'Plain text', eol: 'Line ending', eol_crlf: 'Windows (CR LF)', eol_lf: 'Unix (LF)', eol_cr: 'Macintosh (CR)',
  reopen_as: 'Reopen with encoding', save_as_enc: 'Save with encoding', enc_current: 'Current encoding',
  about: 'About', users_guide: "User's guide", shortcuts: 'Keyboard shortcuts',
  tip_new: 'New document (Ctrl+N)', tip_open: 'Open file (Ctrl+O)', tip_open_folder: 'Open folder (Ctrl+Shift+O)', tip_save: 'Save (Ctrl+S)', tip_save_all: 'Save all (Ctrl+Shift+S)', tip_close: 'Close tab (Ctrl+W)',
  tip_undo: 'Undo (Ctrl+Z)', tip_redo: 'Redo (Ctrl+Y)', tip_cut: 'Cut (Ctrl+X)', tip_copy: 'Copy (Ctrl+C)', tip_paste: 'Paste (Ctrl+V)',
  tip_find: 'Find (Ctrl+F)', tip_replace: 'Replace (Ctrl+H)', tip_wrap: 'Word wrap', tip_ws: 'Show whitespace', tip_indent_guides: 'Vertical lines at every tab stop', tip_zoom_in: 'Zoom in (Ctrl++)', tip_zoom_out: 'Zoom out (Ctrl+-)', tip_sidebar: 'Folder tree (Ctrl+B)', tip_structure: 'Document structure — the minimap for code, the headings tree for Markdown',
  tip_zoom_level: 'Zoom {n}% — click to reset (Ctrl+0)', tip_formatter: 'Formatter for this document: {tool}', tip_formatter_auto: 'Formatter for this document: {tool} (auto — the first one installed; Settings › Formatting)', tip_formatter_missing: 'Formatter for this document: {tool} — not installed (offered when formatting)', tip_formatter_off: 'Formatting is off for this document (Settings › Formatting)', tip_format_empty: 'Nothing to format', tip_format_done: 'Already formatted ({tool})', tip_formatter_pick: 'Click to choose the formatter for this language', set_format_for: '{lang} formatter',
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
  too_big_title: 'File too large', too_big_msg: '"{name}" is larger than 64 MB — this editor does not open files that big as text.',
  binary_title: 'Binary file', binary_msg: '"{name}" does not look like a text file. Open it anyway? (it may display garbled)',
  hex_info: 'binary · {size} ({bytes} bytes)', hex_offset: 'Offset', hex_text: 'ASCII', hex_empty: 'empty file', hex_at: 'offset 0x{hex} ({dec})', hex_value: 'value 0x{hex} ({dec}) \'{chr}\'', hex_selected: '{n} bytes selected', hex_hint: 'Click a byte to select it, Shift+click for a range, Ctrl+C copies as hex', hex_copied: 'Copied {n} bytes as hex', hex_copied_max: 'Copied the first {n} bytes as hex (1 MB at a time)', hex_readonly: 'A binary file cannot be edited or saved here (hex view only)',   hex_opened: 'Binary file opened in the hex view: {name}',
  prog_title: 'Working', prog_working: 'Working…', prog_pct: '{n}%',
  prog_print: 'Print preview', prog_print_build: 'Preparing the preview…', prog_print_highlight: 'Applying syntax colours…', prog_print_pages: 'Building pages…',
  prog_open: 'Open file', prog_open_file: 'Opening the file…', prog_sniff: 'Checking the file type…', prog_read: 'Reading the file…', prog_prepare: 'Opening in the editor…',
  prog_hex: 'Hexa', prog_hex_read: 'Reading bytes…', prog_hex_format: 'Formatting as hexadecimal…', prog_hex_copy: 'Copying as hexadecimal…',
  prog_image: 'Image', prog_image_load: 'Loading the picture…',
  prog_format: 'Format document', prog_format_run: 'Formatting…',
  prog_save: 'Save', prog_save_file: 'Saving…', prog_save_all: 'Saving all documents…',
  prog_restore: 'Restore session', prog_restore_file: 'Reopening previous documents…',
  img_opened: 'Opened image: {name}',
  img_hex: 'Hexa', img_hex_tip: 'Show the file\'s bytes as hexadecimal beside the picture', img_hex_menu: 'Hexa',
  img_show: 'Show picture', img_show_tip: 'Show the picture',
  error_title: 'Error', error_unexpected: 'An unexpected error occurred.', error_details: 'Details', copy_details: 'Copy details', copied_details: 'Error details copied to the clipboard.', error_code: 'Code', error_path: 'Path',
  open_failed: 'Cannot open "{name}".', save_failed: 'Cannot save "{name}".',
  new_name: 'Name', new_file_title: 'New file', new_folder_title: 'New folder', rename_title: 'Rename', create: 'Create',
  settings_title: 'Settings', set_general: 'General', set_editor: 'Editor', set_files: 'Files',
  set_language: 'UI language', set_theme: 'Theme', set_font: 'Font', set_font_ph: '(default monospace font) — click for system fonts', set_font_size: 'Font size', set_tab_size: 'Tab size', set_insert_spaces: 'Insert spaces on Tab',
  set_auto_indent: 'Auto indentation (Enter keeps the previous line\'s indent, closing brackets re-align)', set_indent_with: 'Indent with', set_indent_spaces: 'Spaces', set_indent_tabs: 'Tab characters', set_tab_size_hint: 'one tab = n spaces (what Tab inserts when using spaces)', tip_auto_indent: 'Auto indentation on / off', auto_indent: 'Auto indentation',
  set_word_wrap: 'Word wrap', set_minimap: 'Minimap (the whole document drawn small at the editor\'s right edge — drag or click to go there)', set_line_numbers: 'Line numbers', set_show_ws: 'Show whitespace', set_active_line: 'Highlight current line', set_auto_close: 'Auto-close brackets and quotes', set_bracket_match: 'Highlight matching brackets', set_fold: 'Code folding',
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
  terminal: 'Terminal', tip_terminal: 'Terminal panel (Ctrl+`)', term_new: 'New terminal', term_new_shell: 'New terminal with a shell…', term_hide: 'Close the panel', term_empty: 'No terminal. Press + to open one.', term_placeholder: 'Type a command and press Enter (Tab completes, ↑ ↓ history, Ctrl+L clear, Ctrl+C interrupt)',
  log_tab: 'Log', tip_log: 'Show Log', log_empty: 'The log is empty.', log_clear: 'Clear log',
  lint_tab: 'Problems', lint_tab_file: '{name}', lint_tab_summary: '{tool} · {e} errors · {w} warnings · {i} info', lint_tab_off: 'Code checking is off. Turn it on in the Editor menu.', lint_tab_nodoc: 'No file is open.', lint_tab_binary: 'This file is not code-checked.', lint_tab_running: 'Checking…', lint_tab_clean: 'No problems.', lint_tab_refresh: 'Check again', lint_settings: 'Problem settings (checkers per language)…',
  set_terminal: 'Terminal', set_term_cwd: 'Start directory', set_term_cwd_default: '(the folder open in the sidebar)', set_term_cwd_hint: 'Where a new terminal starts. Leave empty for the folder open in the sidebar, or the folder of the current document.', set_browse: 'Browse…', set_term_shell: 'Default shell', set_term_shell_default: 'Default ({name})', set_term_shell_hint: 'Only shells found on this computer are listed. Install a shell, then open the list again to see it.',
  term_no_git: 'Not a git repository', term_git_ahead: 'commits ahead of the remote', term_git_behind: 'commits behind the remote', term_git_changes: 'staged {staged} · modified {changed} · untracked {untracked}', term_git_clean: 'clean', term_git_conflicts: 'conflicts {n}',
  split_none: 'Single editor', split_cols: 'Split left / right', split_rows: 'Split top / bottom', split_grid: 'Split into four', next_pane: 'Next editor pane', tip_lint: 'Show Problems (code check)', pane_empty: '(empty — pick a document)', pane_in: 'pane {n}', pane_pick: 'Pick a document…', pane_close: 'Close this pane', pane_close_doc: 'Close the document and this pane', pane_open_docs: 'Open documents', pane_folder_files: 'Files in {name}', pane_folder_empty: '(no files)', tip_split: 'Split the editor — one more pane per press (up to 9, Ctrl+\\); left / right, top / bottom, four and one in the View menu',
  search_title: 'Search', find_in_files: 'Find in folder…', find_in_open: 'Find in open documents…', search_scope_open: 'Open documents', search_scope_folder: 'Folder', search_placeholder: 'Search text (Enter)', search_include: 'include: *.js, src/**', search_exclude: 'exclude: *.min.js, test/**', search_run: 'Find', search_running: 'Searching…', search_summary: '{n} matches in {files} files', search_none: 'No matches.', search_truncated: '(too many — only the first ones shown)', search_no_folder: 'No folder is open in the sidebar.', search_hint: 'Searches the open documents or every file of the folder open in the sidebar. Click a result to go there.',
  imgx_title: 'Save image', imgx_info: 'Image', imgx_unknown: 'unknown type', imgx_has_alpha: 'has transparency', imgx_format: 'File format', imgx_original: 'Original file ({ext})', imgx_quality: 'Quality', imgx_alpha: 'Transparency', imgx_keep_alpha: 'Keep the transparent background', imgx_no_alpha_format: 'this format has no transparency; the background colour is used', imgx_background: 'Background', imgx_file: 'File name',
  print: 'Print…', print_title: 'Print', print_preview: 'Print preview', print_zoom: '{n}%', print_zoom_in: 'Zoom in', print_zoom_out: 'Zoom out', print_fit: 'Fit', print_page_of: '{n} / {total}', print_destination: 'Printer', print_copies: 'Copies', print_color_mode: 'Colour', print_color_color: 'Colour', print_color_mono: 'Black and white', print_layout: 'Layout', print_portrait: 'Portrait', print_landscape: 'Landscape', print_no_printers: 'No printer was found. The default printer will be used.', print_printing: 'Printing…', print_failed: 'Printing failed', tip_print: 'Print (Ctrl+P) — preview first, then print. Border, line numbers and page numbers for a code listing are under Settings › Print. Markdown and HTML as rendered, pictures as the picture', pv_copy_image: 'Copy image', pv_save_image: 'Save image as…', pv_image_copied: 'Image copied to the clipboard', pv_image_copy_failed: 'Copying the image failed', pv_image_saved: 'Image saved: {path}',
  format_doc: 'Format document', tip_format: 'Format document — tidy the whole code with the language\'s formatter (Shift+Alt+F)', set_format: 'Formatting', set_lint_tab: 'Checks', set_format_on_save: 'Format on save', set_reset: 'Reset to defaults', set_reset_tip: 'Put every setting back to its initial value', set_reset_title: 'Reset settings', set_reset_msg: 'Reset all settings to their defaults? Font, theme, editor, file, terminal, formatting and print settings go back to their initial values. (The UI language and the window layout are kept.)', set_reset_yes: 'Reset', set_format_hint: 'Which formatter to use for each language. "Auto" takes the first one installed (the bundled Prettier included); with none, only the editor\'s indentation is fixed. Tools are looked up in the project\'s node_modules/.bin and on PATH.', fmt_auto: 'Auto ({tool})', fmt_indent: 'Editor indentation only', fmt_none_opt: 'Off', fmt_not_installed: 'not installed', fmt_not_installed_auto: 'not installed · installed automatically when formatting', fmt_not_installed_manual: 'not installed · manual install', fmt_rescan: 'Look again', inst_ask_title: 'Install {tool}', inst_ask_msg: 'The {lang} formatter {tool} is not installed. Download and install it now? (through its package manager, with progress shown)', inst_ask_lint_msg: 'The {lang} checker {tool} is not installed. Install it now?\n\n1. Check the package manager\n2. Download the package\n3. Install\n4. Use it as the checker for this language', inst_ask_yes: 'Install', inst_ask_runtime_title: 'Install {pm}', inst_ask_runtime_msg: '{pm} is required to use {tool}. Install {pm} now?\n{tool} will be installed next, once {pm} is ready.', inst_kind_runtime: 'official installer', inst_title: 'Installing {tool}…', inst_running: 'Downloading and installing {tool}…', inst_via: 'Installing with {pm}', inst_step_ready: 'Check the package manager', inst_step_fetch: 'Download the package', inst_step_apply: 'Install', inst_step_finish: 'Ready to use', inst_kind_npm: 'npm (Node.js)', inst_kind_pip: 'pip (Python)', inst_kind_cargo: 'cargo (Rust)', inst_kind_go: 'go', inst_kind_gem: 'gem (Ruby)', inst_kind_rustup: 'rustup', inst_kind_ps: 'PowerShell', inst_log_show: 'Show install log', inst_log_hide: 'Hide install log', inst_done: '{tool} installed', inst_failed: 'Installing {tool} failed', inst_retry: 'Try again', inst_cancelled: 'Installing {tool} cancelled', inst_use: 'Format now', inst_manual_title: '{tool} has to be installed by hand', inst_missing_pm: 'Installing {tool} needs {pm}, which was not found. Install it first and restart the app.', inst_no_recipe: '{tool} cannot be installed automatically.', inst_install: 'Install {tool}', inst_reinstall: 'Reinstall {tool} (remove the installed copy and install afresh)', inst_pick_first: 'Pick a tool first.', inst_already_title: '{tool} is already installed', inst_already_msg: 'Remove the installed copy and install afresh, or install the latest version over it?', inst_already_reinstall: 'Remove and reinstall', inst_already_keep: 'Install over it', fmt_prettier_builtin: 'Prettier (bundled)', fmt_prettier_ext: 'Prettier (project / PATH)', fmt_builtin_json: 'Built-in JSON formatter', fmt_builtin_xml: 'Built-in XML formatter', fmt_done: 'Formatted with {tool}', fmt_unchanged: 'Already formatted ({tool})', fmt_failed: 'Formatting failed ({tool})', fmt_none: 'No formatter for {lang} — indentation fixed only', fmt_off: 'Formatting is off for {lang} (Settings › Formatting)',
  lint: 'Code check (lint)', lint_next: 'Next problem', lint_panel: 'Problems', set_lint: 'Code check — run the language\'s linter (eslint · ruff/pyflakes · gcc · shellcheck …) in the background and mark its findings next to the line numbers', st_lint_tool: 'Code check: {tool} — click for the list', st_lint_none: 'No checker for this language, or it is not installed (click: check again)',
  spell_check: 'Spell check (English)', tip_spell: 'Spell check on / off (F7)', set_spell: 'English spell check (bundled en_US dictionary; comments and strings only in code)', spell_add: 'Add "{word}" to dictionary', spell_ignore: 'Ignore "{word}" for now', spell_none: '(no suggestions)', spell_loading: 'Loading dictionary…',
  md_preview_menu: 'Markdown preview', md_outline_menu: 'Markdown structure', md_outline: 'Structure', md_outline_tip: 'Structure — the headings as a tree; click one to go there', md_outline_empty: 'No headings (# Heading …)', md_outline_untitled: '(untitled)', md_wysiwyg: 'WYSIWYG editing (marks rendered in place)', md_wysiwyg_menu: 'Markdown WYSIWYG editing', md_source: 'Source',
  // themes (settings › theme)
  set_theme_dark: 'Dark themes', set_theme_light: 'Light themes', set_custom_themes: 'Custom themes', set_custom_add: "New theme based on '{name}'", set_custom_remove: 'Delete this theme', set_custom_hint: '+ makes a new theme from the current one; set its colours below (the current theme\'s colours are shown until then). Custom themes appear in the toolbar list as well.',
  set_custom_none: '(no custom theme yet)', set_custom_name: 'Name', set_custom_dark: 'Dark theme', set_custom_light: 'Light theme', set_custom_copy: '(custom)',
  set_color_bg: 'Editor background', set_color_panel: 'Panel background', set_color_raised: 'Menu / toolbar background', set_color_hover: 'Hover', set_color_active: 'Inactive selection', set_color_border: 'Border', set_color_borderStrong: 'Strong border', set_color_text: 'Text', set_color_textDim: 'Muted text', set_color_accent: 'Accent', set_color_accentStrong: 'Strong accent', set_color_accentText: 'Text on accent', set_color_folder: 'Folder icon', set_color_file: 'File icon', set_color_danger: 'Danger / error',
  // autocomplete
  autocomplete: 'Autocomplete', tip_autocomplete: 'Autocomplete on / off — the language\'s keywords, tags, properties and names; Ctrl+Space opens it', set_autocomplete: 'Complete while typing (the language\'s keywords, tags, properties, names + the words of the document; Ctrl+Space opens it)',
  // HTML preview
  set_devops_hint: 'Dockerfiles (Dockerfile · Containerfile · *.dockerfile) and Kubernetes manifests (YAML) get completions for instructions, images, keys and values, plus built-in checks.',
  svg_rect: 'Rectangle', svg_circle: 'Circle', svg_ellipse: 'Ellipse', svg_line: 'Line', svg_polyline: 'Polyline', svg_polygon: 'Polygon', svg_path: 'Path (curve)', svg_text: 'Text', svg_image: 'Image', svg_group: 'Group (wraps the selection)', svg_gradient: 'Gradient definition', svg_use: 'Reuse (use)', svg_transform: 'Transform attribute (rotate / move)',
  img_pv_menu: 'Image preview', img_pv_hint: 'Image file — the picture fills the pane (left click: zoom in, right click: zoom out, drag: pan, Ctrl+wheel: zoom, Hexa: bytes beside). HEIC/HEIF and DICOM; a DICOM series uses the slider and window/level', img_pv_hint_svg: 'SVG document — drawn in the preview on the right as you edit (left click: zoom in, right click: zoom out, drag: pan)', img_pv_fit: 'Fit to pane', img_pv_natural: 'Natural size (1:1)', img_pv_fit_on: 'fit', img_pv_zoom: '{n}%', img_pv_zoom_tip: 'Left click zoom in · right click zoom out · drag to pan · Ctrl+wheel · several images: slider or ← →', img_pv_broken: 'The image cannot be drawn',
  img_pv_slice: 'Image', img_pv_of: '{n} / {total}', img_pv_prev: 'Previous image', img_pv_next: 'Next image', img_pv_cine: 'Play',
  img_pv_ww: 'WW', img_pv_wl: 'WL', img_pv_invert: 'Invert', img_pv_meta: 'DICOM info', img_pv_hu: 'HU {n}',
  img_pv_wl_default: 'Default', img_pv_wl_abdomen: 'Abdomen', img_pv_wl_bone: 'Bone', img_pv_wl_brain: 'Brain', img_pv_wl_lung: 'Lung', img_pv_wl_soft: 'Soft', img_pv_wl_liver: 'Liver',
  img_pv_patient: 'Patient', img_pv_study: 'Study', img_pv_series: 'Series', img_pv_modality: 'Modality', img_pv_bits: 'Bits',
  html_preview_menu: 'HTML preview', html_preview: 'HTML preview — rendered next to the editor (scripts run isolated)', html_preview_hint: 'HTML document — turn the preview on to see it rendered next to the editor (with its image, CSS and script files)',
  // terminal line endings + prompt (settings › terminal)s: CR LF for Windows shells, LF for bash)',
  set_term_color: 'Colour the output — the programs\' ANSI colours, plus error (red) / warning (yellow) / success (green) lines and links, file:line references highlighted (off: plain text)', set_prompt: 'Prompt', term_settings: 'Terminal settings (shell · prompt)…',
  term_gs_uptodate: 'clean · pushed', term_gs_staged: 'staged — commit needed', term_gs_modified: 'modified — add needed', term_gs_conflict: 'conflicts — resolve needed', term_gs_ahead: 'committed — push needed', term_gs_behind: 'new commits on the remote — pull needed',
  // prompt themes (settings › terminal › prompt)
  pe_presets: 'Presets — click to apply', pe_current: 'Current: {name}', pe_current_modified: 'Current: {name} (modified)', pe_custom: 'Current: custom',
  pe_customize: 'Quick options', pe_show: 'Show:', pe_shape: 'Shape:', pe_two_lines: 'Two lines', pe_git_colors: 'git state colours:', pe_git_colors_tip: 'Only the branch (git) block takes the repository state colour: green clean → red modified → yellow staged → orange committed → green pushed; crimson conflicts, blue behind. Every other segment keeps the theme colours. Pick each state colour on the right; off: theme colours for the branch too.', pe_gs_conflict: 'conflicts', pe_gs_staged: 'staged', pe_gs_modified: 'modified', pe_gs_ahead: 'committed', pe_gs_behind: 'behind', pe_gs_uptodate: 'clean', pe_gs_reset: 'Defaults', pe_advanced: 'Advanced', pe_enabled: 'Shown', pe_type: 'Type', pe_colors: 'Text / background',
  pe_path_full: 'Full path', pe_path_folder: 'Folder name only', pe_path_short: 'Short (…\\parent\\folder)', pe_path_agnoster: 'Initials (~\\P\\A\\src)',
  pe_select_hint: 'Pick a segment in the list on the left.',
  pe_preview: 'Preview — clean repository / changed repository / no repository', pe_sample_clean: '  git status clean', pe_sample_dirty: '  changes · exit code 1 · 3.2 s', pe_sample_plain: '  not a repository',
  pe_preset: 'Preset', pe_apply: 'Apply', pe_preset_applied: "Preset '{name}' applied.",
  pe_final_space: 'Space after the prompt', pe_block: 'Block {n}', pe_newline: 'Start on a new line', pe_add_segment: '+ Add segment…', pe_add_block: 'Add block (line)', pe_remove_block: 'Remove block',
  pe_template: 'Template', pe_symbol: 'Powerline symbol', pe_diamonds: 'Leading / trailing', pe_fg_templates: 'Foreground templates (one per line, first match wins)', pe_bg_templates: 'Background templates (one per line, first match wins)',
  pe_path_style: 'Path style', pe_max_depth: 'Max depth', pe_folder_sep: 'Folder separator', pe_folder_sep_hint: '(empty = OS separator)', pe_home_icon: 'Home icon', pe_branch_icon: 'Branch icon', pe_always_enabled: 'Show on success (0) too', pe_threshold: 'Show from (ms)', pe_os_icons: 'OS icons (windows / macos / linux)',
  pe_pick_color: 'Pick a colour (names work too: accent · foreground · background · auto · transparent · p:name)', pe_expand: 'Expand', pe_collapse: 'Collapse', pe_up: 'Up', pe_down: 'Down', pe_remove: 'Remove segment',
  pe_style_powerline: 'Powerline', pe_style_plain: 'Plain', pe_style_diamond: 'Diamond (rounded)',
  pe_type_path: 'Path', pe_type_git: 'git', pe_type_session: 'user@host', pe_type_shell: 'Shell', pe_type_os: 'OS', pe_type_time: 'Time', pe_type_status: 'Exit code', pe_type_executiontime: 'Execution time', pe_type_root: 'Root', pe_type_text: 'Text',
  pe_vars_path: 'Variables: .Path .Location .Folder .Parent — [[icon:folder]] draws the folder icon', pe_vars_git: 'Variables: .HEAD .Branch .Upstream .Ahead .Behind .BranchStatus .StashCount .Symbols .Working.Changed/.String .Staging.Changed/.String — background auto = state colour, [[icon:gitBranch]] icon',
  pe_vars_session: 'Variables: .UserName .HostName .Root', pe_vars_shell: 'Variables: .Name', pe_vars_os: 'Variables: .Icon .OS', pe_vars_time: 'Variables: .CurrentDate | date "15:04:05" (Go layout: 2006 01 02 15 04 05 Jan Mon PM)', pe_vars_status: 'Variables: .Code .Error .String', pe_vars_executiontime: 'Variables: .Ms .FormattedMs', pe_vars_root: 'Shown only when elevated (never at the moment)', pe_vars_text: 'The template as is — {{ if }}…{{ end }}, .UserName .HostName .Path available',
  set_linters: 'Code check (lint) tools', set_linters_hint: 'Which checker to run for each language. "Auto" takes the first one installed, "Off" disables checking for that language. Choosing a tool that is not installed shows the install steps, then installs it step by step if you agree.', lint_none_installed: 'none installed', lint_not_installed_auto: 'not installed · asked when selected',
  set_print: 'Print', set_print_code: 'Contents', set_print_look: 'Look', set_print_type: 'Type', set_print_page_setup: 'Paper', set_print_hint: 'Code and plain text are printed as a listing, one sheet per page at the paper size you choose. Syntax colours are chosen for paper. Markdown, HTML and pictures are not affected.', set_print_paper: 'Paper size', set_print_paper_a4: 'A4', set_print_paper_letter: 'Letter', set_print_paper_legal: 'Legal', set_print_paper_a5: 'A5', set_print_orient: 'Orientation', set_print_margin: 'Margins', set_print_header: 'File name / path', set_print_linenos: 'Line numbers', set_print_border: 'Page border', set_print_pages: 'Page numbers', set_print_date: 'Print date', set_print_syntax: 'Syntax highlighting (keywords, strings, comments)', set_print_color: 'Print in colour (off: grayscale, bold kept)', set_print_zebra: 'Striped rows (a light tint on every other line)', set_print_gutter: 'Shaded line-number gutter', set_print_wrap: 'Wrap long lines', set_print_syntax_s: 'Highlight', set_print_color_s: 'Colour', set_print_zebra_s: 'Stripes', set_print_gutter_s: 'Gutter', set_print_wrap_s: 'Wrap', set_print_font_size: 'Type size', set_print_line_height: 'Line height', set_print_sample: 'Preview',
  set_grp_ui: 'Appearance', set_grp_session: 'Session', set_grp_indent: 'Indentation', set_grp_display: 'Display', set_grp_assist: 'Editing aids', set_grp_tree: 'Folder tree',
  set_line_height: 'Line height', set_layout: 'Show', set_auto_save: 'Auto save', set_auto_save_off: 'Off', set_auto_save_blur: 'When the window loses focus', set_auto_save_delay: 'n seconds after the last edit', set_seconds: 's', set_auto_save_hint: 'Only files on disk are saved — a new document still needs a name from you', set_default_lang: 'New document language', set_tree_hidden: 'Show hidden (dot) files',
  set_eol_on_save: 'Line ending on save', set_eol_keep: "Keep the file's own", set_eol_always: 'Always {eol}', set_eol_on_save_hint: 'Which line ending a CR LF / LF file is written with when saved — "keep" writes what it had when opened (the status bar menu changes it per document)',
  pe_custom_prompts: 'Custom prompts:', pe_save_custom: 'Save the current prompt', pe_custom_name: 'Name', pe_update_custom: 'Save changes', pe_update_custom_tip: 'Save this custom prompt as it looks now', pe_delete_custom: 'Delete', pe_custom_copy: '(custom)', pe_custom_saved: "'{name}' saved", pe_custom_hint: 'A saved prompt appears as a ★ card next to the presets and is kept in the session.',
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

// The text in every language, the current one first (for labels that must
// stay as wide as their widest translation — see components/Widest.jsx).
export function tAll(key, params) {
  const fill = (s) => { if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v)); return s; };
  const out = [fill((dicts[current] && dicts[current][key]) || ko[key] || key)];
  for (const d of Object.values(dicts)) { const s = fill(d[key] || ko[key] || key); if (!out.includes(s)) out.push(s); }
  return out;
}

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
