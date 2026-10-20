// Tiny i18n: `t(key, params)` with Korean (the reference UI) and English.
import { useSyncExternalStore } from 'react';

const ko = {
  shape_group_basic: '기본 도형', shape_group_flowchart: '순서도', shape_group_symbol: '기호 · 메모', shape_octagon: '팔각형', shape_pentagon: '오각형', shape_triangle: '삼각형', shape_parallelogram: '평행사변형', shape_trapezoid: '사다리꼴', shape_star: '별', shape_cloud: '구름', shape_cube: '정육면체', shape_document: '문서', shape_cylinder: '데이터베이스 (원통)', shape_predefined: '정의된 처리', shape_delay: '지연', shape_manualInput: '수동 입력', shape_arrow: '화살표', shape_chevron: '갈매기형 (단계)', shape_speech: '말풍선', shape_note: '메모지', shape_snip: '모서리 잘린 사각형', shape_tag: '태그',
  tab_prev: '왼쪽에 가려진 탭 보기 (탭 전환: Ctrl+Shift+Tab)', tab_next: '오른쪽에 가려진 탭 보기 (탭 전환: Ctrl+Tab)', center_map: '정중앙에 보기', tip_center_map: '정중앙에 보기 — 지금 배율로 맵을 화면 가운데에 (Ctrl+Alt+C)',
  tour_title: '튜토리얼 안내', tour_step: '{n} / {total} 단계', tour_end: '안내 끝내기 (Esc)', tour_show: '직접 보기', tour_show_again: '다시 보기', tour_playing: '보여 주는 중…', tour_back: '이전', tour_next: '다음', tour_finish: '시작하기', tour_map_only: '튜토리얼 맵만 열기',
  summary: '요약', summary_remove: '요약 없애기', summary_rename: '요약 이름 바꾸기', summary_label_hint: '하위 토픽 옆 괄호에 붙일 요약 글', tip_summary: '요약 — 하위 토픽을 괄호로 묶고 요약을 붙입니다 (Ctrl+])', msg_summary_needs_kids: '요약은 하위 토픽이 있는 토픽에 붙입니다',
  view_kanban: '칸반 보드', tip_view_kanban: '칸반 보드 — 주 토픽은 열, 하위 토픽은 카드', kanban_hint: '카드를 다른 열이나 카드 사이로 끌어 옮깁니다. 맵에서도 똑같이 바뀝니다.', kanban_add_card: '카드 추가', kanban_card_ph: '카드 이름을 입력하고 Enter', kanban_add_column: '열 추가', kanban_new_column: '새 열',
  comments: '댓글', comment_anon: '익명', comment_author_ph: '내 이름 (댓글 작성자)', comment_ph: '댓글을 입력하세요 (Ctrl+Enter로 추가)', comment_add: '댓글 추가', props: '사용자 속성', prop_key_ph: '속성 이름', prop_value_ph: '값', prop_add: '속성 추가',
  tip_redraw_down: '위→아래로 다시 그리기 (Ctrl+Alt+↓)', tip_redraw_right: '왼쪽→오른쪽으로 다시 그리기 (Ctrl+Alt+→)', tip_redraw_left: '오른쪽→왼쪽으로 다시 그리기 (Ctrl+Alt+←)', tip_redraw_map: '양쪽(방사형)으로 다시 그리기 (Ctrl+Alt+M)', tip_arrange: '자동 정리 — 옮긴 토픽을 제자리로, 균형 맞추기 (Ctrl+Shift+L)', tip_grid: '격자 켜기/끄기 (Ctrl+Alt+G)', tip_rulers: '눈금자 켜기/끄기 (Ctrl+Alt+R)', tip_overview: '전체 보기 창 켜기/끄기 (Ctrl+Alt+O)', redraw_down: '위→아래로 다시 그리기', redraw_right: '왼쪽→오른쪽으로 다시 그리기', redraw_left: '오른쪽→왼쪽으로 다시 그리기', redraw_map: '양쪽(방사형)으로 다시 그리기', arrange: '자동 정리', rulers: '눈금자', set_rulers: '눈금자 보기', detach_floating: '떼어서 자유 토픽으로', reset_position: '자리 되돌리기', msg_arranged: '맵을 자동 정리했습니다', sc_redraw: '위→아래 / 왼→오 / 오→왼 / 양쪽으로 다시 그리기', sc_arrange: '자동 정리', sc_view_toggles: '격자 / 눈금자 / 전체 보기 창', sc_panels: '왼쪽 / 오른쪽 패널 접기·펴기', sc_detach: '떼어서 자유 토픽으로 놓기', key_alt_drop: 'Alt+끌어 놓기', pane_collapse: '패널 접기', pane_expand: '패널 펴기', start_samples_title: '예제 맵', start_samples_all: '예제 {n}가지 — 눌러서 엽니다', tip_sidebar_toggle: '왼쪽 패널 접기/펴기 (Ctrl+Alt+S)', tip_panel_toggle: '오른쪽 패널 접기/펴기 (Ctrl+Alt+P)',
  appName: 'MyBrainMap V1.0',
  untitled: '새 맵 {n}',
  untitled_topic: '(빈 토픽)',
  topic_text: '토픽 내용',
  ready: '준비됨',

  // menu bar
  m_file: '파일', m_edit: '편집', m_insert: '삽입', m_format: '서식', m_view: '보기', m_tools: '도구', m_help: '도움말',
  // file
  new_map: '새 맵', new_from_template: '템플릿에서 새 맵…', open_file: '열기…', import_file: '가져오기…', save: '저장', save_as: '다른 이름으로 저장…', save_all: '모두 저장',
  export: '내보내기…', copy_image: '맵을 그림으로 복사', print: '인쇄…', reveal: '파일 위치 열기', copy_path: '경로 복사', close: '닫기', close_all: '모두 닫기', close_others: '다른 탭 모두 닫기', exit: '종료',
  recent: '최근 파일', recent_remove: '목록에서 제거', recent_empty: '(최근 파일 없음)', recent_clear: '최근 파일 목록 지우기',
  // edit
  undo: '실행 취소', redo: '다시 실행', cut: '잘라내기', copy: '복사', paste: '붙여넣기', delete: '삭제', delete_keep_children: '토픽만 삭제 (하위 토픽 유지)',
  edit_topic: '토픽 편집', select_all: '모두 선택', select_siblings: '같은 수준 선택', select_branch: '가지 전체 선택', move_up: '위로 이동', move_down: '아래로 이동', sort_children: '하위 토픽 가나다순 정렬',
  find: '찾기 / 바꾸기…', find_next: '다음 찾기',
  // insert
  add_child: '하위 토픽', add_sibling: '형제 토픽', add_sibling_before: '형제 토픽 (위)', add_parent: '상위 토픽', add_callout: '설명선', add_floating: '플로팅 토픽', add_floating_here: '여기에 플로팅 토픽',
  quick_entry: '빠른 입력 (여러 토픽)…', relationship: '관계선', boundary: '경계', boundary_cloud: '경계 (구름)', boundary_remove: '경계 없애기', boundary_label: '경계 이름…', boundary_label_hint: '경계 위에 보이는 이름 (비우면 없음)',
  notes: '메모', hyperlink: '하이퍼링크…',
  // format
  grow_font: '글자 크게', shrink_font: '글자 작게', priority_clear: '우선순위 없애기',
  // view
  overview_tip: '누르거나 끌어서 그곳을 봅니다',
  view_map: '맵', view_outline: '개요', view_gantt: '간트 차트', start_title: '시작 화면', sidebar: '사이드바', task_pane: '작업 창', toolbar: '도구 모음', statusbar: '상태 표시줄', overview: '전체 보기 (미니맵)', grid: '격자',
  zoom_in: '확대', zoom_out: '축소', zoom_100: '실제 크기 (100%)', fit_map: '맵 전체 보기', fit_selection: '선택 영역 보기', expand_all: '모두 펼치기', collapse_all: '모두 접기 (주 토픽까지)', show_levels: '{n}단계까지 펼치기',
  expand: '펼치기', collapse: '접기', focus_branch: '이 가지만 보기', focus_off: '가지 보기 끝내기', presentation: '프레젠테이션', fullscreen: '전체 화면',
  // tools
  filter: '필터…', filter_clear: '필터 끄기', settings: '설정', map_style_more: '맵 스타일·서식…',
  // help
  help_menu: '도움말', help_open: '사용법 보기', help_search: '도움말 검색', help_found: '{n}개 장에서 찾음', shortcuts: '단축키', shortcuts_title: '단축키', menu_info: '정보',

  // toolbar tips
  tip_new: '새 맵 (Ctrl+N)', tip_open: '열기 (Ctrl+O)', tip_save: '저장 (Ctrl+S)', tip_export: '내보내기 — PNG · SVG · PDF · Word · … (Ctrl+E)', tip_print: '인쇄 (Ctrl+P)',
  tip_undo: '실행 취소 (Ctrl+Z)', tip_redo: '다시 실행 (Ctrl+Y)',
  tip_add_child: '하위 토픽 추가 (Tab / Insert)', tip_add_sibling: '형제 토픽 추가 (Enter)', tip_add_parent: '상위 토픽 추가 (Ctrl+Shift+Insert)', tip_add_callout: '설명선 추가 (Ctrl+Shift+Enter)', tip_add_floating: '플로팅 토픽 추가 (빈 곳을 두 번 눌러도 됩니다)',
  tip_relationship: '관계선 — 두 토픽을 선택했으면 바로 잇고, 아니면 이을 토픽을 누릅니다 (Ctrl+Shift+R)', tip_boundary: '경계 넣기 / 없애기 (Ctrl+Shift+B)',
  tip_markers: '아이콘 · 태그', tip_notes: '메모 (Ctrl+T)', tip_links: '링크 · 첨부 · 그림', tip_task: '작업 정보 (일정 · 진행률 · 담당)', tip_format: '토픽 서식',
  tip_layout: '맵 레이아웃', tip_map_style: '맵 스타일',
  tip_expand_all: '모두 펼치기', tip_collapse_all: '모두 접기', tip_focus: '선택한 가지만 보기 (F4)',
  tip_zoom_in: '확대 (Ctrl+=)', tip_zoom_out: '축소 (Ctrl+-)', tip_zoom_reset: '실제 크기 (Ctrl+1)', tip_fit: '맵 전체 보기 (Ctrl+0)',
  tip_view_map: '맵 보기', tip_view_outline: '개요 보기', tip_view_gantt: '간트 차트', tip_presentation: '프레젠테이션 (F5)', tip_sidebar: '사이드바 (개요 · 찾기 · 필터)', tip_panel: '작업 창 (서식 · 아이콘 · 메모 …)',
  tip_theme: '테마 목록', tip_next_theme: '다음 테마: {theme}', tip_language: '언어', tip_settings: '설정 (Ctrl+,)', tip_about: '정보', tip_start: '시작 화면 열기/닫기', start_nav: '시작',
  tip_tab_close: '닫기 (가운데 버튼으로도)', tab_new: '새 맵', tab_modified: '(수정됨)', tab_readonly: '(읽기 전용)', tab_scroll_left: '왼쪽 탭', tab_scroll_right: '오른쪽 탭',
  win_minimize: '최소화', win_maximize: '최대화', win_restore: '이전 크기로', win_close: '닫기', win_resize: '창 크기 조절',

  // status bar
  st_selected: '{n}개 선택', st_central: '중심 토픽', st_floating: '플로팅 토픽', st_level: '수준 {n}', st_topics: '토픽 {n}개', st_filter: '필터: {n}개', st_focus: '가지 보기',

  // layouts
  layout_map: '맵 (양쪽)', layout_right: '오른쪽 맵', layout_left: '왼쪽 맵', layout_orgDown: '조직도 (아래)', layout_orgUp: '조직도 (위)', layout_treeRight: '트리 (오른쪽)', layout_treeLeft: '트리 (왼쪽)', layout_timeline: '타임라인', layout_fishbone: '피시본',
  sublayout_right: '오른쪽', sublayout_left: '왼쪽', sublayout_down: '아래로', sublayout_up: '위로', sublayout_treeRight: '목록 (오른쪽)', sublayout_treeLeft: '목록 (왼쪽)',
  // shapes · lines
  shape_rounded: '둥근 사각형', shape_rect: '사각형', shape_capsule: '캡슐', shape_ellipse: '타원', shape_underline: '밑줄', shape_hexagon: '육각형', shape_diamond: '마름모', shape_circle: '원', shape_none: '테두리 없음',
  line_curve: '곡선', line_straight: '직선', line_elbow: '꺾은선', line_rounded: '둥근 꺾은선',

  // task pane
  pane_format: '서식', pane_markers: '아이콘', pane_notes: '메모', pane_task: '작업', pane_links: '링크', pane_map: '맵',
  pane_no_selection: '토픽을 선택하세요.', pane_no_doc: '열린 맵이 없습니다.', close_btn: '닫기',
  fmt_shape: '모양', fmt_colors: '색', fmt_fill: '채우기', fmt_text_color: '글자색', fmt_border: '테두리', fmt_no_border: '없음', fmt_line: '연결선', fmt_text: '글자',
  fmt_font: '글꼴', fmt_size: '크기', fmt_bold: '굵게', fmt_italic: '기울임', fmt_underline: '밑줄', fmt_strike: '취소선',
  fmt_align_left: '왼쪽 맞춤', fmt_align_center: '가운데 맞춤', fmt_align_right: '오른쪽 맞춤', fmt_width: '최대 너비', fmt_sub_layout: '하위 토픽 배치',
  fmt_copy: '서식 복사', fmt_copy_tip: '이 토픽의 서식을 기억합니다', fmt_paste: '서식 붙이기', fmt_paste_tip: '기억한 서식을 선택한 토픽에 적용합니다', fmt_clear: '서식 지우기',
  auto: '자동', none: '없음', on: '켜기', off: '끄기', clear: '지우기', add: '추가', remove: '제거', select: '선택',
  color_auto: '자동 (스타일 색)', color_none: '없음', color_custom: '직접 고르기',
  mk_priority: '우선순위', mk_progress: '진행률', mk_group_flag: '깃발', mk_group_smiley: '표정', mk_group_arrow: '화살표', mk_group_symbol: '기호',
  mk_tags: '태그', mk_no_tags: '태그 없음', mk_tag_ph: '새 태그 (Enter)', mk_clear_all: '아이콘 모두 지우기',
  notes_edit: '편집', notes_preview: '미리보기', notes_md: 'Markdown 사용 가능', notes_ph: '이 토픽의 메모… (**굵게**, 목록, 링크)', notes_empty: '메모 없음',
  task_schedule: '일정', task_start: '시작일', task_due: '마감일', task_duration: '기간', task_milestone: '마일스톤', task_work: '작업', task_effort: '작업량', task_resources: '담당',
  task_resources_ph: '사람 또는 팀 (쉼표로 구분)', task_today: '오늘', task_week: '시작일부터 1주', task_clear: '작업 정보 지우기', days: '일', hours: '시간', seconds: '초',
  link_hyperlink: '하이퍼링크', link_open: '열기', link_file: '파일 연결…', link_topic: '토픽 연결', link_prompt: '웹 주소 또는 파일 경로 (비우면 없앰)',
  link_attachments: '첨부 파일', link_no_attachments: '첨부 파일 없음', link_add_attachment: '첨부 파일 추가…',
  link_image: '그림', link_no_image: '그림 없음', link_image_file: '그림 넣기…', link_image_paste: '클립보드에서', link_image_width: '너비', images: '그림',
  map_title_label: '맵 제목', map_layout: '레이아웃', map_style: '맵 스타일', map_lines: '선과 색', map_line_style: '선 모양', map_by_style: '스타일대로', map_branch_colors: '가지 색',
  map_background: '배경', map_spacing: '간격', map_spacing_h: '가로', map_spacing_v: '세로', map_numbering: '번호 매기기', map_numbering_on: '토픽에 번호 매기기',
  map_numbering_style: '모양', map_numbering_depth: '{n}단계까지', map_balance: '양쪽 균형 맞추기', map_stats: '맵 정보',
  stat_topics: '토픽', stat_notes: '메모 있는 토픽', stat_tasks: '완료 / 작업', stat_rels: '관계선', stat_floating: '플로팅 토픽',

  // sidebar
  sb_outline: '개요', sb_find: '찾기', sb_filter: '필터', sb_hidden: '숨김 파일 보기', outline_filter_ph: '개요에서 거르기',
  find_ph: '찾을 내용', replace_ph: '바꿀 내용', match_case: '대/소문자 구분', whole_word: '단어 단위', regex: '정규식', find_in_notes: '메모에서도 찾기',
  matches: '{n}개 찾음', no_match: '찾는 내용이 없습니다', select_all_matches: '모두 선택', replace_all: '모두 바꾸기',
  filter_text_ph: '글자로 거르기', filter_dim: '나머지 흐리게', filter_hide: '나머지 숨기기', filter_count: '{n}개 토픽', filter_none: '필터 없음',
  filter_status: '상태', filter_open: '진행 중', filter_done: '완료', filter_overdue: '마감 지남', filter_week: '이번 주 마감', index_icons: '아이콘', index_none: '없음',

  // outline / gantt
  ov_topic: '토픽', ov_priority: '우선', ov_progress: '진행',
  ov_hint: 'Enter 새 토픽 · Tab / Shift+Tab 들여쓰기 / 내어쓰기 · Alt+↑↓ 이동 · Ctrl+Space 접기 · 빈 토픽에서 Backspace 삭제',
  gantt_day: '일', gantt_week: '주', gantt_month: '월', gantt_all: '날짜 없는 토픽도 보기', gantt_today: '오늘', gantt_hint: '막대를 끌면 옮겨지고, 양 끝을 끌면 날짜가 바뀝니다.',
  gantt_empty: '시작일이나 마감일이 있는 토픽이 없습니다. 작업 창의 작업 탭에서 날짜를 넣어 보세요.', gantt_add_dates: '작업 정보 열기',

  // presentation
  pres_prev: '이전 (←)', pres_next: '다음 (→ · Space)', pres_exit: '끝내기 (Esc)',

  // hints / messages
  link_hint: '이을 토픽을 누르세요 (Esc: 취소)', focus_hint: '이 가지만 보는 중 — 눌러서 전체 맵으로', empty_hint: '열린 맵이 없습니다.',
  msg_opened: '열었습니다: {name}', msg_imported: '가져왔습니다: {name} — 저장하면 .tmap 파일이 됩니다', msg_saved: '저장했습니다: {name}', msg_reloaded: '바깥에서 바뀌어 다시 읽었습니다: {name}',
  msg_copied: '토픽 {n}개를 복사했습니다', msg_cut: '토픽 {n}개를 잘라냈습니다', msg_pasted: '토픽 {n}개를 붙였습니다', msg_image_set: '그림을 넣었습니다',
  msg_image_copied: '맵을 그림으로 복사했습니다', msg_image_copy_failed: '그림을 클립보드에 넣지 못했습니다', msg_no_image: '클립보드에 그림이 없습니다',
  msg_exporting: '내보내는 중…', msg_exported: '내보냈습니다: {name}', msg_printed: '인쇄를 보냈습니다', msg_rel_added: '관계선을 그었습니다',
  msg_move_refused: '그곳으로는 옮길 수 없습니다', msg_no_map: '먼저 맵을 열거나 만드세요', msg_topic_gone: '연결된 토픽이 없습니다', msg_path_copied: '경로를 복사했습니다',
  msg_replaced: '바꿨습니다', msg_unsupported: '열 수 없는 파일입니다: {name}',
  err_open: '열 수 없습니다', err_save: '저장할 수 없습니다', err_export: '내보낼 수 없습니다',
  close_title: '저장하지 않은 맵', close_dirty: '"{name}" 의 바뀐 내용을 저장할까요?', dont_save: '저장 안 함',
  quit_title: '종료', quit_dirty: '저장하지 않은 맵이 {n}개 있습니다: {names}', changed_title: '바깥에서 바뀐 파일', changed_dirty: '"{name}" 이(가) 다른 프로그램에서 바뀌었습니다. 이 창의 수정 내용을 버리고 다시 읽을까요?',
  reload: '다시 읽기', keep_mine: '내 것 유지',
  rel_label: '관계선 이름…', rel_label_hint: '선 가운데에 보이는 글자 (비우면 없음)', rel_dashed: '점선', rel_both: '양쪽 화살표', rel_reverse: '방향 바꾸기', rel_reset: '곡선 초기화', rel_color: '색', rel_from_here: '여기서 관계선 긋기',

  // dialogs
  ok: '확인', cancel: '취소', yes: '예', all_files: '모든 파일',
  error_title: '오류', error_unexpected: '예상하지 못한 오류가 났습니다.', error_details: '자세히', error_code: '코드', error_path: '경로', copy_details: '자세한 내용 복사', copied_details: '복사했습니다',
  about_title: '정보', about_desc: 'Windows · macOS · Linux · 웹에서 쓰는 마인드맵 프로그램', about_libs: 'Tauri · React · Vite · marked · DOMPurify', version: '버전', author: '만든 사람', author_name: 'SHKWON',
  about_host: '실행 환경', host_tauri: '데스크톱 (Tauri)', host_web: '웹 브라우저', about_build: '빌드', copyright: 'Copyright © 2026 SHKWON. MIT License.',
  quick_title: '빠른 입력', quick_hint: '"{topic}" 아래에 넣을 토픽을 한 줄에 하나씩 쓰세요. Tab 으로 들여쓰면 그 위 토픽의 하위 토픽이 됩니다.', quick_ph: '아이디어 1\n\t세부 내용\n아이디어 2', quick_count: '토픽 {n}개',
  tpl_title: '템플릿에서 새 맵', tpl_create: '만들기',
  samples_title: '예제 맵', samples_open: '열기', samples_menu: '예제 맵…', start_samples_text: '실제 주제로 완성된 예제 16가지',
  export_title: '내보내기', export_go: '내보내기…', export_options: '옵션', export_scale: '배율', export_transparent: '배경 투명', export_padding: '여백', export_padding_none: '여백 없음', export_size_tight: '그림 크기: 모든 도형에 꼭 맞게 (여백 없음)', export_size_margin: '그림 크기: 모든 도형을 포함하고 사방에 {n}px 여백', export_paper_fit: '맵 크기에 맞춤',
  export_note_docx: '첫 쪽에 맵 그림, 이어서 토픽이 제목(1~6단계)과 목록으로, 메모와 작업 정보가 그 아래에 들어갑니다.',
  export_note_html: '맵 그림과 접고 펼 수 있는 개요가 한 파일에 들어갑니다. 메모는 서식이 적용됩니다.',
  export_note_md: '토픽은 제목(1~4단계)과 목록, 메모는 본문이 됩니다. 이 앱이나 Markdown 을 읽는 프로그램에서 다시 가져올 수 있습니다.',
  export_note_opml: '개요 프로그램(OmniOutliner, Workflowy …)이 읽는 형식입니다. 텍스트와 메모, 링크가 들어갑니다.',
  export_note_txt: '한 줄에 토픽 하나, 탭으로 들여쓴 개요입니다.',
  export_note_mm: 'FreeMind · Freeplane 맵입니다. 아이콘, 메모, 접힘, 색, 관계선이 들어갑니다.',
  export_note_xmind: 'XMind 2020 이상이 여는 파일입니다. 마커, 메모, 라벨, 관계선, 플로팅 토픽이 들어갑니다.',
  export_note_csv: '토픽마다 한 줄: 수준, 경로, 우선순위, 진행률, 날짜, 담당, 태그, 메모. Excel 에서 바로 열립니다.',
  print_title: '인쇄 미리보기', print_go: '인쇄', print_busy: '보내는 중…', print_printer: '프린터', print_default_printer: '기본 프린터', print_default: '기본', print_copies: '매수',
  print_paper: '용지', print_orientation: '방향', print_portrait: '세로', print_landscape: '가로', print_margin: '여백 (mm)', print_pages: '쪽 나누기', print_fit_one: '한 쪽에 맞추기', print_tiles: '{n}쪽으로 나누기',
  print_header: '맨 위에 제목', print_footer: '맨 아래에 날짜와 쪽 번호', print_color: '컬러', print_page_count: '{n}쪽', print_no_browser: 'Edge 또는 Chrome 이 없어 인쇄할 수 없습니다. PDF 로 내보내 인쇄하세요.',
  print_popup_blocked: '팝업이 막혀 인쇄 창을 열지 못했습니다.', print_failed: '인쇄하지 못했습니다', print_web_note: '웹 버전은 브라우저의 인쇄 창이 열립니다. 그곳에서 프린터를 고르세요.',
  fd_open: '열기', fd_save: '저장', fd_folder: '폴더 선택', fd_select: '선택', fd_up: '위 폴더', fd_drives: '드라이브', fd_empty: '(비어 있음)', fd_name: '파일 이름', fd_overwrite: '"{name}" 이(가) 이미 있습니다. 바꿀까요?',

  // settings
  settings_title: '설정', set_general: '일반', set_map: '맵', set_theme: '테마', set_start_tab: '시작 화면', set_output: '내보내기 · 인쇄',
  set_reset: '기본값으로 되돌리기', set_reset_tip: '이 대화상자의 설정을 처음 값으로 (언어와 창 배치는 그대로)', set_reset_confirm: '설정을 기본값으로 되돌릴까요?',
  set_grp_ui: '화면', set_language: '언어', set_layout: '보이기', set_sidebar_width: '사이드바 너비', set_panel_width: '작업 창 너비',
  set_grp_editing: '편집', set_spell: '토픽·메모 맞춤법 검사', set_auto_balance: '맵 레이아웃에서 새 주 토픽을 덜 찬 쪽에 넣기',
  set_grp_session: '파일과 세션', set_restore: '시작할 때 이전에 열었던 맵 다시 열기', set_confirm_close: '닫을 때 저장 여부 묻기', set_reload: '바깥에서 바뀐 맵 다시 읽기',
  set_auto_save: '자동 저장', set_auto_save_off: '안 함', set_auto_save_blur: '창을 떠날 때', set_auto_save_delay: '마지막 수정 뒤 잠시 후', set_auto_save_after: '기다리는 시간',
  set_auto_save_hint: '자동 저장은 이미 이름이 있는 .tmap 파일에만 적용됩니다. 저장하지 않은 새 맵은 세션에 그대로 남습니다.',
  set_grp_new_map: '새 맵', set_default_layout: '레이아웃', set_default_style: '맵 스타일', set_map_font: '토픽 글꼴', set_map_font_size: '기본 글자 크기', set_default_hint: '새로 만드는 빈 맵에 적용됩니다. 열린 맵은 작업 창의 맵 탭에서 바꿉니다.',
  set_grp_canvas: '맵 화면', set_animate: '부드러운 화면 이동', set_wheel_zoom: '마우스 휠로 확대/축소 (끄면 Ctrl+휠)', set_grid: '배경에 격자', set_overview: '오른쪽 아래 전체 보기',
  set_theme_dark: '어두운 테마', set_theme_light: '밝은 테마', set_custom_themes: '사용자 정의 테마', theme_custom_new: '"{name}"(으)로 새 사용자 정의 테마 만들기…', theme_custom_edit: '사용자 정의 테마 편집…', set_custom_add: '"{name}" 복사해서 만들기', set_custom_copy: '복사본', set_custom_none: '(없음)', set_custom_pick: '사용자 정의 테마 고르기',
  set_custom_remove: '삭제', set_custom_hint: '목록에서 사용자 정의 테마를 고르면 색을 바꿀 수 있습니다.', set_custom_name: '이름', set_custom_dark: '어두운 테마', set_custom_light: '밝은 테마',
  set_color_bg: '배경', set_color_panel: '패널', set_color_raised: '도구 막대', set_color_hover: '가리킴', set_color_active: '선택 (비활성)', set_color_border: '테두리', set_color_borderStrong: '진한 테두리',
  set_color_text: '글자', set_color_textDim: '흐린 글자', set_color_accent: '강조', set_color_accentStrong: '진한 강조', set_color_accentText: '강조 위 글자', set_color_folder: '노랑 강조', set_color_file: '보조색', set_color_danger: '위험',
  set_grp_start_launch: '시작할 때', set_start_always: '시작할 때 항상 시작 화면 보기', set_start_always_hint: '끄면 이전에 열었던 맵이 있을 때 시작 화면을 건너뜁니다. 열린 맵이 없으면 항상 보입니다.',
  set_grp_export: '내보내기 기본값', set_grp_print: '인쇄 기본값',

  // start page
  start_lead: '생각을 가지로 펼치고, 정리하고, 일정과 발표까지 한 곳에서.',
  start_begin: '시작하기', start_templates: '템플릿으로 시작', start_recent: '최근 파일', start_background: '배경 효과', start_no_recent: '아직 연 맵이 없습니다.',
  start_new_text: '중심 토픽 하나로 시작합니다', start_template_text: '여러 템플릿을 그림으로 보고 고릅니다', start_open_text: '.tmap 파일과 다른 형식의 맵을 엽니다', start_import_text: 'FreeMind · XMind · MindManager · OPML · Markdown',
  start_tutorial: '튜토리얼', start_tutorial_text: '처음이라면 여기서: 따라 하며 모든 기능을 익히는 안내 맵', start_tour: '튜토리얼', start_tour_text: '모든 기능을 차례로 따라 해 보는 안내 맵을 엽니다', start_settings_text: '테마, 글꼴, 저장 방식을 바꿉니다', start_help_text: '모든 기능의 자세한 설명을 화면과 함께 별도 창에서 봅니다',
  start_tip: '팁.', start_tip_more: '자세히', start_tip_less: '접기',
  start_tip_0: 'Enter 는 형제 토픽, Tab 은 하위 토픽을 만듭니다.', start_tip_0_more: '토픽을 고른 채 그냥 글자를 치면 바로 편집됩니다(한글도). 편집 중 Enter 는 확정, Shift+Enter 는 줄 바꿈, Tab 은 확정하고 하위 토픽을 하나 더 만듭니다.',
  start_tip_1: '토픽을 끌어서 옮길 수 있습니다.', start_tip_1_more: '다른 토픽 가운데에 놓으면 하위 토픽, 위·아래 가장자리에 놓으면 형제 토픽, 빈 곳에 놓으면 플로팅 토픽이 됩니다. 실수했다면 Ctrl+Z.',
  start_tip_2: '레이아웃은 9가지입니다.', start_tip_2_more: '맵, 오른쪽, 왼쪽, 조직도(아래·위), 트리(오른쪽·왼쪽), 타임라인, 피시본. 도구 메뉴나 툴바의 레이아웃 버튼으로 바꾸고, 가지마다 하위 토픽 배치를 따로 정할 수도 있습니다.',
  start_tip_3: 'Ctrl+Shift+R 로 관계선을 긋습니다.', start_tip_3_more: '두 토픽을 선택했으면 바로 이어지고, 아니면 이을 토픽을 누릅니다. 관계선을 선택하면 나오는 두 손잡이로 곡선을 바꾸고, 오른쪽 버튼으로 이름·색·화살표를 바꿉니다.',
  start_tip_4: '날짜를 넣으면 간트 차트가 됩니다.', start_tip_4_more: '작업 창의 작업 탭에서 시작일·마감일·진행률·담당을 넣고 보기 › 간트 차트를 여세요. 막대를 끌어 일정을 옮길 수 있습니다.',
  start_tip_5: 'F5 는 프레젠테이션입니다.', start_tip_5_more: '주 토픽마다 한 장씩, 화면이 그 가지로 부드럽게 이동하고 나머지는 흐려집니다. → 다음, ← 이전, Esc 끝.',
  start_tip_6: '필터로 필요한 토픽만 봅니다.', start_tip_6_more: '사이드바의 필터 탭에서 우선순위, 아이콘, 태그, 진행 상태, 마감일을 고르면 나머지 토픽이 흐려지거나 숨겨집니다.',
  start_tip_7: '다른 프로그램의 맵도 열 수 있습니다.', start_tip_7_more: 'FreeMind(.mm), XMind(.xmind), MindManager(.mmap), OPML, Markdown, 텍스트 개요를 열 수 있고, PNG · SVG · PDF · Word · HTML 등으로 내보낼 수 있습니다.',
  start_speed_down: '느리게', start_speed_up: '빠르게', start_speed_reset: '속도 초기화', start_transparency: '배경 투명도 (%)', start_motion: '전체 속도 (%)',
  start_speed_camera: '카메라 이동 (%)', start_speed_objects: '물체 움직임 (%)', start_speed_sky: '하늘·빛 (%)',
  start_scene_radial: '방사형 맵', start_scene_neurons: '뉴런', start_scene_brain: '두뇌', start_scene_orgchart: '조직도', start_scene_logic: '논리도', start_scene_timeline: '타임라인', start_scene_fishbone: '피쉬본',
  start_scene_idea: '아이디어 전구', start_scene_sticky: '포스트잇 보드', start_scene_orbit: '생각의 궤도', start_scene_forest: '생각의 숲', start_scene_bubbles: '생각 거품', start_scene_constellation: '별자리', start_scene_flowchart: '순서도',
  start_scene_clusters: '묶음', start_scene_outline: '개요', start_scene_relations: '관계선', start_scene_matrix: 'SWOT 매트릭스', start_scene_spiral: '나선형 맵', start_scene_islands: '생각의 섬', start_scene_gantt: '간트 차트',

  // shortcuts
  sc_tabs: '다음 / 이전 탭', sc_undo_redo: '실행 취소 / 다시 실행', sc_clipboard: '잘라내기 / 복사 / 붙여넣기', sc_edit: '토픽 편집 (글자를 치면 바로 편집)', sc_newline: '편집 중 줄 바꿈', sc_cancel: '편집 취소 · 관계선 그리기 취소',
  sc_navigate: '토픽 사이 이동 (Shift: 선택 추가)', sc_move: '형제 사이에서 위 / 아래로', sc_fold: '접기 / 펼치기', sc_root: '중심 토픽으로', sc_priority: '우선순위 1~9 / 없애기', sc_font: '굵게 / 기울임 / 밑줄',
  sc_find: '찾기 / 바꾸기', sc_zoom: '확대 / 축소', sc_drag: '토픽 옮기기 · 빈 곳: 화면 이동', sc_marquee: '여러 토픽 선택', sc_dblclick: '토픽 편집 · 빈 곳: 플로팅 토픽',
  key_shift_enter_editing: 'Shift+Enter (편집 중)', key_ctrl_wheel: 'Ctrl+휠', key_drag: '끌기', key_marquee: 'Shift / Ctrl+끌기', key_dblclick: '두 번 누르기',
};

const en = {
  shape_group_basic: 'Basic', shape_group_flowchart: 'Flowchart', shape_group_symbol: 'Symbols and notes', shape_octagon: 'Octagon', shape_pentagon: 'Pentagon', shape_triangle: 'Triangle', shape_parallelogram: 'Parallelogram', shape_trapezoid: 'Trapezoid', shape_star: 'Star', shape_cloud: 'Cloud', shape_cube: 'Cube', shape_document: 'Document', shape_cylinder: 'Database (cylinder)', shape_predefined: 'Predefined process', shape_delay: 'Delay', shape_manualInput: 'Manual input', shape_arrow: 'Arrow', shape_chevron: 'Chevron (step)', shape_speech: 'Speech bubble', shape_note: 'Note', shape_snip: 'Snipped rectangle', shape_tag: 'Tag',
  tab_prev: 'Show the tabs hidden on the left (switch tabs: Ctrl+Shift+Tab)', tab_next: 'Show the tabs hidden on the right (switch tabs: Ctrl+Tab)', center_map: 'Center the map', tip_center_map: 'Center the map — move it to the middle at the current zoom (Ctrl+Alt+C)',
  tour_title: 'Tutorial guide', tour_step: 'Step {n} of {total}', tour_end: 'End the guide (Esc)', tour_show: 'Show me', tour_show_again: 'Play again', tour_playing: 'Playing…', tour_back: 'Back', tour_next: 'Next', tour_finish: 'Get started', tour_map_only: 'Open the tutorial map only',
  summary: 'Summary', summary_remove: 'Remove summary', summary_rename: 'Rename summary', summary_label_hint: 'The text beside the brace around the subtopics', tip_summary: 'Summary — a brace around the subtopics with a summary (Ctrl+])', msg_summary_needs_kids: 'A summary goes on a topic that has subtopics',
  view_kanban: 'Kanban board', tip_view_kanban: 'Kanban board — main topics are columns, subtopics are cards', kanban_hint: 'Drag a card onto another column or between cards. The map changes the same way.', kanban_add_card: 'Add card', kanban_card_ph: 'Type the card name, then Enter', kanban_add_column: 'Add column', kanban_new_column: 'New column',
  comments: 'Comments', comment_anon: 'Anonymous', comment_author_ph: 'Your name (comment author)', comment_ph: 'Write a comment (Ctrl+Enter adds it)', comment_add: 'Add comment', props: 'Custom properties', prop_key_ph: 'Property', prop_value_ph: 'Value', prop_add: 'Add property',
  tip_redraw_down: 'Redraw top to bottom (Ctrl+Alt+↓)', tip_redraw_right: 'Redraw left to right (Ctrl+Alt+→)', tip_redraw_left: 'Redraw right to left (Ctrl+Alt+←)', tip_redraw_map: 'Redraw on both sides (Ctrl+Alt+M)', tip_arrange: 'Auto arrange — moved topics back in place, sides balanced (Ctrl+Shift+L)', tip_grid: 'Grid on/off (Ctrl+Alt+G)', tip_rulers: 'Rulers on/off (Ctrl+Alt+R)', tip_overview: 'Overview window on/off (Ctrl+Alt+O)', redraw_down: 'Redraw top to bottom', redraw_right: 'Redraw left to right', redraw_left: 'Redraw right to left', redraw_map: 'Redraw on both sides', arrange: 'Auto arrange', rulers: 'Rulers', set_rulers: 'Show rulers', detach_floating: 'Detach as a floating topic', reset_position: 'Reset position', msg_arranged: 'The map was arranged', sc_redraw: 'Redraw top→bottom / left→right / right→left / both sides', sc_arrange: 'Auto arrange', sc_view_toggles: 'Grid / rulers / overview window', sc_panels: 'Fold / unfold the left / right pane', sc_detach: 'Drop as a floating topic', key_alt_drop: 'Alt+drag & drop', pane_collapse: 'Fold the pane', pane_expand: 'Unfold the pane', start_samples_title: 'Sample maps', start_samples_all: '{n} samples — click one to open it', tip_sidebar_toggle: 'Fold / unfold the left pane (Ctrl+Alt+S)', tip_panel_toggle: 'Fold / unfold the right pane (Ctrl+Alt+P)',
  appName: 'MyBrainMap V1.0',
  untitled: 'Map {n}',
  untitled_topic: '(empty topic)',
  topic_text: 'Topic text',
  ready: 'Ready',

  m_file: 'File', m_edit: 'Edit', m_insert: 'Insert', m_format: 'Format', m_view: 'View', m_tools: 'Tools', m_help: 'Help',
  new_map: 'New map', new_from_template: 'New from template…', open_file: 'Open…', import_file: 'Import…', save: 'Save', save_as: 'Save as…', save_all: 'Save all',
  export: 'Export…', copy_image: 'Copy map as picture', print: 'Print…', reveal: 'Show in folder', copy_path: 'Copy path', close: 'Close', close_all: 'Close all', close_others: 'Close other tabs', exit: 'Exit',
  recent: 'Recent files', recent_remove: 'Remove from the list', recent_empty: '(no recent files)', recent_clear: 'Clear recent files',
  undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', delete: 'Delete', delete_keep_children: 'Delete topic only (keep subtopics)',
  edit_topic: 'Edit topic', select_all: 'Select all', select_siblings: 'Select siblings', select_branch: 'Select branch', move_up: 'Move up', move_down: 'Move down', sort_children: 'Sort subtopics A–Z',
  find: 'Find / replace…', find_next: 'Find next',
  add_child: 'Subtopic', add_sibling: 'Sibling topic', add_sibling_before: 'Sibling topic (above)', add_parent: 'Parent topic', add_callout: 'Callout', add_floating: 'Floating topic', add_floating_here: 'Floating topic here',
  quick_entry: 'Quick entry (many topics)…', relationship: 'Relationship', boundary: 'Boundary', boundary_cloud: 'Boundary (cloud)', boundary_remove: 'Remove boundary', boundary_label: 'Boundary name…', boundary_label_hint: 'The name shown on the boundary (empty: none)',
  notes: 'Notes', hyperlink: 'Hyperlink…',
  grow_font: 'Larger text', shrink_font: 'Smaller text', priority_clear: 'Remove priority',
  overview_tip: 'Click or drag to look there',
  view_map: 'Map', view_outline: 'Outline', view_gantt: 'Gantt chart', start_title: 'Start page', sidebar: 'Sidebar', task_pane: 'Task pane', toolbar: 'Toolbar', statusbar: 'Status bar', overview: 'Overview (minimap)', grid: 'Grid',
  zoom_in: 'Zoom in', zoom_out: 'Zoom out', zoom_100: 'Actual size (100%)', fit_map: 'Fit map', fit_selection: 'Fit selection', expand_all: 'Expand all', collapse_all: 'Collapse all (to main topics)', show_levels: 'Expand to level {n}',
  expand: 'Expand', collapse: 'Collapse', focus_branch: 'Show this branch only', focus_off: 'Show the whole map', presentation: 'Presentation', fullscreen: 'Full screen',
  filter: 'Filter…', filter_clear: 'Clear filter', settings: 'Settings', map_style_more: 'Map style and format…',
  help_menu: 'Help', help_open: 'How to use', help_search: 'Search help', help_found: 'Found in {n} chapters', shortcuts: 'Keyboard shortcuts', shortcuts_title: 'Keyboard shortcuts', menu_info: 'About',

  tip_new: 'New map (Ctrl+N)', tip_open: 'Open (Ctrl+O)', tip_save: 'Save (Ctrl+S)', tip_export: 'Export — PNG, SVG, PDF, Word, … (Ctrl+E)', tip_print: 'Print (Ctrl+P)',
  tip_undo: 'Undo (Ctrl+Z)', tip_redo: 'Redo (Ctrl+Y)',
  tip_add_child: 'Add subtopic (Tab / Insert)', tip_add_sibling: 'Add sibling topic (Enter)', tip_add_parent: 'Add parent topic (Ctrl+Shift+Insert)', tip_add_callout: 'Add callout (Ctrl+Shift+Enter)', tip_add_floating: 'Add floating topic (or double-click empty space)',
  tip_relationship: 'Relationship — joins two selected topics, or click the topic to join (Ctrl+Shift+R)', tip_boundary: 'Add / remove boundary (Ctrl+Shift+B)',
  tip_markers: 'Icons and tags', tip_notes: 'Notes (Ctrl+T)', tip_links: 'Links, attachments, picture', tip_task: 'Task info (dates, progress, people)', tip_format: 'Topic format',
  tip_layout: 'Map layout', tip_map_style: 'Map style',
  tip_expand_all: 'Expand all', tip_collapse_all: 'Collapse all', tip_focus: 'Show the selected branch only (F4)',
  tip_zoom_in: 'Zoom in (Ctrl+=)', tip_zoom_out: 'Zoom out (Ctrl+-)', tip_zoom_reset: 'Actual size (Ctrl+1)', tip_fit: 'Fit map (Ctrl+0)',
  tip_view_map: 'Map view', tip_view_outline: 'Outline view', tip_view_gantt: 'Gantt chart', tip_presentation: 'Presentation (F5)', tip_sidebar: 'Sidebar (outline, find, filter)', tip_panel: 'Task pane (format, icons, notes …)',
  tip_theme: 'Themes', tip_next_theme: 'Next theme: {theme}', tip_language: 'Language', tip_settings: 'Settings (Ctrl+,)', tip_about: 'About', tip_start: 'Show or hide the start page', start_nav: 'Start',
  tip_tab_close: 'Close (or middle-click)', tab_new: 'New map', tab_modified: '(modified)', tab_readonly: '(read-only)', tab_scroll_left: 'Tabs to the left', tab_scroll_right: 'Tabs to the right',
  win_minimize: 'Minimize', win_maximize: 'Maximize', win_restore: 'Restore', win_close: 'Close', win_resize: 'Resize the window',

  st_selected: '{n} selected', st_central: 'Central topic', st_floating: 'Floating topic', st_level: 'Level {n}', st_topics: '{n} topics', st_filter: 'Filter: {n}', st_focus: 'Branch view',

  layout_map: 'Map (both sides)', layout_right: 'Right map', layout_left: 'Left map', layout_orgDown: 'Org chart (down)', layout_orgUp: 'Org chart (up)', layout_treeRight: 'Tree (right)', layout_treeLeft: 'Tree (left)', layout_timeline: 'Timeline', layout_fishbone: 'Fishbone',
  sublayout_right: 'Right', sublayout_left: 'Left', sublayout_down: 'Down', sublayout_up: 'Up', sublayout_treeRight: 'List (right)', sublayout_treeLeft: 'List (left)',
  shape_rounded: 'Rounded rectangle', shape_rect: 'Rectangle', shape_capsule: 'Capsule', shape_ellipse: 'Ellipse', shape_underline: 'Underline', shape_hexagon: 'Hexagon', shape_diamond: 'Diamond', shape_circle: 'Circle', shape_none: 'No border',
  line_curve: 'Curve', line_straight: 'Straight', line_elbow: 'Elbow', line_rounded: 'Rounded elbow',

  pane_format: 'Format', pane_markers: 'Icons', pane_notes: 'Notes', pane_task: 'Task', pane_links: 'Links', pane_map: 'Map',
  pane_no_selection: 'Select a topic.', pane_no_doc: 'No map is open.', close_btn: 'Close',
  fmt_shape: 'Shape', fmt_colors: 'Colours', fmt_fill: 'Fill', fmt_text_color: 'Text', fmt_border: 'Border', fmt_no_border: 'None', fmt_line: 'Line', fmt_text: 'Text',
  fmt_font: 'Font', fmt_size: 'Size', fmt_bold: 'Bold', fmt_italic: 'Italic', fmt_underline: 'Underline', fmt_strike: 'Strikethrough',
  fmt_align_left: 'Align left', fmt_align_center: 'Centre', fmt_align_right: 'Align right', fmt_width: 'Max width', fmt_sub_layout: 'Subtopic layout',
  fmt_copy: 'Copy format', fmt_copy_tip: 'Remember this topic\'s format', fmt_paste: 'Paste format', fmt_paste_tip: 'Apply the remembered format to the selection', fmt_clear: 'Clear format',
  auto: 'Automatic', none: 'None', on: 'On', off: 'Off', clear: 'Clear', add: 'Add', remove: 'Remove', select: 'Select',
  color_auto: 'Automatic (style colour)', color_none: 'None', color_custom: 'Pick a colour',
  mk_priority: 'Priority', mk_progress: 'Progress', mk_group_flag: 'Flags', mk_group_smiley: 'Faces', mk_group_arrow: 'Arrows', mk_group_symbol: 'Symbols',
  mk_tags: 'Tags', mk_no_tags: 'No tags', mk_tag_ph: 'New tag (Enter)', mk_clear_all: 'Clear all icons',
  notes_edit: 'Edit', notes_preview: 'Preview', notes_md: 'Markdown works', notes_ph: 'Notes for this topic… (**bold**, lists, links)', notes_empty: 'No notes',
  task_schedule: 'Schedule', task_start: 'Start', task_due: 'Due', task_duration: 'Duration', task_milestone: 'Milestone', task_work: 'Work', task_effort: 'Effort', task_resources: 'Resources',
  task_resources_ph: 'People or teams (comma separated)', task_today: 'Today', task_week: 'A week from the start', task_clear: 'Clear task info', days: 'days', hours: 'hours', seconds: 'seconds',
  link_hyperlink: 'Hyperlink', link_open: 'Open', link_file: 'Link a file…', link_topic: 'Link a topic', link_prompt: 'Web address or file path (empty: remove)',
  link_attachments: 'Attachments', link_no_attachments: 'No attachments', link_add_attachment: 'Add attachment…',
  link_image: 'Picture', link_no_image: 'No picture', link_image_file: 'Insert picture…', link_image_paste: 'From clipboard', link_image_width: 'Width', images: 'Pictures',
  map_title_label: 'Map title', map_layout: 'Layout', map_style: 'Map style', map_lines: 'Lines and colours', map_line_style: 'Line shape', map_by_style: 'As the style', map_branch_colors: 'Branch colours',
  map_background: 'Background', map_spacing: 'Spacing', map_spacing_h: 'Across', map_spacing_v: 'Down', map_numbering: 'Numbering', map_numbering_on: 'Number the topics',
  map_numbering_style: 'Style', map_numbering_depth: 'To level {n}', map_balance: 'Balance both sides', map_stats: 'Map info',
  stat_topics: 'Topics', stat_notes: 'Topics with notes', stat_tasks: 'Done / tasks', stat_rels: 'Relationships', stat_floating: 'Floating topics',

  sb_outline: 'Outline', sb_find: 'Find', sb_filter: 'Filter', sb_hidden: 'Show hidden files', outline_filter_ph: 'Filter the outline',
  find_ph: 'Find', replace_ph: 'Replace with', match_case: 'Match case', whole_word: 'Whole word', regex: 'Regular expression', find_in_notes: 'Search notes too',
  matches: '{n} found', no_match: 'Nothing found', select_all_matches: 'Select all', replace_all: 'Replace all',
  filter_text_ph: 'Filter by text', filter_dim: 'Dim the rest', filter_hide: 'Hide the rest', filter_count: '{n} topics', filter_none: 'No filter',
  filter_status: 'Status', filter_open: 'In progress', filter_done: 'Done', filter_overdue: 'Overdue', filter_week: 'Due this week', index_icons: 'Icons', index_none: 'None',

  ov_topic: 'Topic', ov_priority: 'Prio', ov_progress: 'Done',
  ov_hint: 'Enter new topic · Tab / Shift+Tab indent / outdent · Alt+↑↓ move · Ctrl+Space fold · Backspace on an empty topic deletes it',
  gantt_day: 'Day', gantt_week: 'Week', gantt_month: 'Month', gantt_all: 'Show topics without dates', gantt_today: 'Today', gantt_hint: 'Drag a bar to move it, its ends to change the dates.',
  gantt_empty: 'No topic has a start or due date. Add dates on the Task tab of the task pane.', gantt_add_dates: 'Open task info',

  pres_prev: 'Previous (←)', pres_next: 'Next (→ · Space)', pres_exit: 'End (Esc)',

  link_hint: 'Click the topic to join (Esc: cancel)', focus_hint: 'Showing one branch — click for the whole map', empty_hint: 'No map is open.',
  msg_opened: 'Opened {name}', msg_imported: 'Imported {name} — saving makes it a .tmap file', msg_saved: 'Saved {name}', msg_reloaded: 'Changed outside, read again: {name}',
  msg_copied: 'Copied {n} topics', msg_cut: 'Cut {n} topics', msg_pasted: 'Pasted {n} topics', msg_image_set: 'Picture added',
  msg_image_copied: 'Map copied as a picture', msg_image_copy_failed: 'The picture could not be put on the clipboard', msg_no_image: 'No picture on the clipboard',
  msg_exporting: 'Exporting…', msg_exported: 'Exported {name}', msg_printed: 'Sent to the printer', msg_rel_added: 'Relationship added',
  msg_move_refused: 'It cannot go there', msg_no_map: 'Open or create a map first', msg_topic_gone: 'The linked topic is gone', msg_path_copied: 'Path copied',
  msg_replaced: 'Replaced', msg_unsupported: 'Cannot open this file: {name}',
  err_open: 'Cannot open', err_save: 'Cannot save', err_export: 'Cannot export',
  close_title: 'Unsaved map', close_dirty: 'Save the changes to "{name}"?', dont_save: 'Don\'t save',
  quit_title: 'Exit', quit_dirty: '{n} maps are not saved: {names}', changed_title: 'File changed outside', changed_dirty: '"{name}" was changed by another program. Discard your changes here and read it again?',
  reload: 'Read again', keep_mine: 'Keep mine',
  rel_label: 'Relationship name…', rel_label_hint: 'The text in the middle of the line (empty: none)', rel_dashed: 'Dashed', rel_both: 'Arrows at both ends', rel_reverse: 'Reverse direction', rel_reset: 'Reset curve', rel_color: 'Colour', rel_from_here: 'Relationship from here',

  ok: 'OK', cancel: 'Cancel', yes: 'Yes', all_files: 'All files',
  error_title: 'Error', error_unexpected: 'An unexpected error occurred.', error_details: 'Details', error_code: 'Code', error_path: 'Path', copy_details: 'Copy details', copied_details: 'Copied',
  about_title: 'About', about_desc: 'Mind mapping for Windows, macOS, Linux and the web', about_libs: 'Tauri · React · Vite · marked · DOMPurify', version: 'Version', author: 'Author', author_name: 'SHKWON',
  about_host: 'Running as', host_tauri: 'Desktop (Tauri)', host_web: 'Web browser', about_build: 'Build', copyright: 'Copyright © 2026 SHKWON. MIT License.',
  quick_title: 'Quick entry', quick_hint: 'Type the topics to add under "{topic}", one per line. Indent with Tab to make a line a subtopic of the one above.', quick_ph: 'Idea 1\n\tdetail\nIdea 2', quick_count: '{n} topics',
  tpl_title: 'New map from a template', tpl_create: 'Create',
  samples_title: 'Sample maps', samples_open: 'Open', samples_menu: 'Sample maps…', start_samples_text: '16 finished maps on real subjects',
  export_title: 'Export', export_go: 'Export…', export_options: 'Options', export_scale: 'Scale', export_transparent: 'Transparent background', export_padding: 'Margin', export_padding_none: 'no margin', export_size_tight: 'Picture size: flush with the shapes (no margin)', export_size_margin: 'Picture size: every shape, with {n}px of room all round', export_paper_fit: 'Fit to the map',
  export_note_docx: 'The map picture on the first page, then the topics as headings (levels 1–6) and lists, with notes and task info under them.',
  export_note_html: 'The map picture and a foldable outline in one file. Notes keep their formatting.',
  export_note_md: 'Topics become headings (levels 1–4) and lists, notes become paragraphs. It can be imported back.',
  export_note_opml: 'The format outliners read (OmniOutliner, Workflowy …): text, notes and links.',
  export_note_txt: 'One topic per line, indented with tabs.',
  export_note_mm: 'A FreeMind / Freeplane map: icons, notes, folding, colours and relationships.',
  export_note_xmind: 'Opens in XMind 2020 and later: markers, notes, labels, relationships and floating topics.',
  export_note_csv: 'One line per topic: level, path, priority, progress, dates, resources, tags, notes. Opens in Excel.',
  print_title: 'Print preview', print_go: 'Print', print_busy: 'Sending…', print_printer: 'Printer', print_default_printer: 'Default printer', print_default: 'default', print_copies: 'Copies',
  print_paper: 'Paper', print_orientation: 'Orientation', print_portrait: 'Portrait', print_landscape: 'Landscape', print_margin: 'Margin (mm)', print_pages: 'Pages', print_fit_one: 'Fit on one page', print_tiles: 'Split over {n} pages',
  print_header: 'Title at the top', print_footer: 'Date and page number at the bottom', print_color: 'Colour', print_page_count: '{n} pages', print_no_browser: 'Printing needs Edge or Chrome. Export a PDF and print that.',
  print_popup_blocked: 'The print window was blocked.', print_failed: 'Printing failed', print_web_note: 'The web version opens the browser\'s print dialog; choose the printer there.',
  fd_open: 'Open', fd_save: 'Save', fd_folder: 'Choose folder', fd_select: 'Select', fd_up: 'Up', fd_drives: 'Drives', fd_empty: '(empty)', fd_name: 'File name', fd_overwrite: '"{name}" exists. Replace it?',

  settings_title: 'Settings', set_general: 'General', set_map: 'Map', set_theme: 'Theme', set_start_tab: 'Start page', set_output: 'Export & print',
  set_reset: 'Restore defaults', set_reset_tip: 'Back to the first values (language and window layout stay)', set_reset_confirm: 'Restore the default settings?',
  set_grp_ui: 'Screen', set_language: 'Language', set_layout: 'Show', set_sidebar_width: 'Sidebar width', set_panel_width: 'Task pane width',
  set_grp_editing: 'Editing', set_spell: 'Spell check topics and notes', set_auto_balance: 'On a map layout, new main topics go to the emptier side',
  set_grp_session: 'Files and session', set_restore: 'Reopen the maps that were open', set_confirm_close: 'Ask to save when closing', set_reload: 'Read maps changed outside again',
  set_auto_save: 'Auto save', set_auto_save_off: 'Off', set_auto_save_blur: 'When leaving the window', set_auto_save_delay: 'Shortly after the last change', set_auto_save_after: 'Wait',
  set_auto_save_hint: 'Auto save writes .tmap files that already have a name. New maps stay in the session until you save them.',
  set_grp_new_map: 'New maps', set_default_layout: 'Layout', set_default_style: 'Map style', set_map_font: 'Topic font', set_map_font_size: 'Base text size', set_default_hint: 'Used for new blank maps. An open map is changed on the Map tab of the task pane.',
  set_grp_canvas: 'Map view', set_animate: 'Smooth camera moves', set_wheel_zoom: 'Mouse wheel zooms (off: Ctrl+wheel)', set_grid: 'Grid behind the map', set_overview: 'Overview at the bottom right',
  set_theme_dark: 'Dark themes', set_theme_light: 'Light themes', set_custom_themes: 'Custom themes', theme_custom_new: 'New custom theme from "{name}"…', theme_custom_edit: 'Edit custom themes…', set_custom_add: 'Copy "{name}"', set_custom_copy: 'copy', set_custom_none: '(none)', set_custom_pick: 'Pick a custom theme',
  set_custom_remove: 'Delete', set_custom_hint: 'Pick a custom theme in the list to change its colours.', set_custom_name: 'Name', set_custom_dark: 'Dark theme', set_custom_light: 'Light theme',
  set_color_bg: 'Background', set_color_panel: 'Panel', set_color_raised: 'Bars', set_color_hover: 'Hover', set_color_active: 'Selection (inactive)', set_color_border: 'Border', set_color_borderStrong: 'Strong border',
  set_color_text: 'Text', set_color_textDim: 'Dim text', set_color_accent: 'Accent', set_color_accentStrong: 'Strong accent', set_color_accentText: 'Text on accent', set_color_folder: 'Yellow accent', set_color_file: 'Secondary', set_color_danger: 'Danger',
  set_grp_start_launch: 'On launch', set_start_always: 'Always show the start page on launch', set_start_always_hint: 'When off, the start page is skipped if maps from the last session were reopened. With no map open it is always shown.',
  set_grp_export: 'Export defaults', set_grp_print: 'Print defaults',

  start_lead: 'Branch out your ideas, organise them, plan and present them — in one place.',
  start_begin: 'Begin', start_templates: 'Start from a template', start_recent: 'Recent files', start_background: 'Background', start_no_recent: 'No map has been opened yet.',
  start_new_text: 'Start from a central topic', start_template_text: 'Pick from the templates, with pictures', start_open_text: '.tmap files and maps from other programs', start_import_text: 'FreeMind, XMind, MindManager, OPML, Markdown',
  start_tutorial: 'Tutorial', start_tutorial_text: 'New here? A guided map that walks through every feature', start_tour: 'Tutorial', start_tour_text: 'A guided map that walks through every feature', start_settings_text: 'Theme, fonts and how maps are saved', start_help_text: 'Every feature explained in detail, with screenshots, in its own window',
  start_tip: 'Tip.', start_tip_more: 'More', start_tip_less: 'Less',
  start_tip_0: 'Enter adds a sibling, Tab a subtopic.', start_tip_0_more: 'With a topic selected just start typing to edit it (Korean too). While editing, Enter confirms, Shift+Enter breaks the line and Tab confirms and adds a subtopic.',
  start_tip_1: 'Drag topics to move them.', start_tip_1_more: 'Drop on the middle of a topic: subtopic. On its upper or lower edge: sibling. On empty space: floating topic. Ctrl+Z undoes a slip.',
  start_tip_2: 'There are nine layouts.', start_tip_2_more: 'Map, right, left, org chart (down / up), tree (right / left), timeline and fishbone. Change it from the Tools menu or the toolbar; each branch can lay out its subtopics its own way.',
  start_tip_3: 'Ctrl+Shift+R draws a relationship.', start_tip_3_more: 'Two selected topics are joined at once; otherwise click the topic to join. A selected relationship has two handles to bend it; right-click it for name, colour and arrows.',
  start_tip_4: 'Dates make a Gantt chart.', start_tip_4_more: 'Add start, due, progress and resources on the Task tab, then open View › Gantt chart. Drag the bars to reschedule.',
  start_tip_5: 'F5 starts a presentation.', start_tip_5_more: 'One slide per main topic: the view glides to that branch and fades the rest. → next, ← previous, Esc ends.',
  start_tip_6: 'Filters show just what you need.', start_tip_6_more: 'On the sidebar\'s Filter tab pick priorities, icons, tags, status or due dates; the other topics are dimmed or hidden.',
  start_tip_7: 'Maps from other programs open too.', start_tip_7_more: 'FreeMind (.mm), XMind (.xmind), MindManager (.mmap), OPML, Markdown and text outlines open; export goes to PNG, SVG, PDF, Word, HTML and more.',
  start_speed_down: 'Slower', start_speed_up: 'Faster', start_speed_reset: 'Reset speeds', start_transparency: 'Background transparency (%)', start_motion: 'Overall speed (%)',
  start_speed_camera: 'Camera (%)', start_speed_objects: 'Objects (%)', start_speed_sky: 'Sky and light (%)',
  start_scene_radial: 'Radial map', start_scene_neurons: 'Neurons', start_scene_brain: 'Brain', start_scene_orgchart: 'Org chart', start_scene_logic: 'Logic chart', start_scene_timeline: 'Timeline', start_scene_fishbone: 'Fishbone',
  start_scene_idea: 'Light bulb', start_scene_sticky: 'Sticky notes', start_scene_orbit: 'Orbit', start_scene_forest: 'Forest of ideas', start_scene_bubbles: 'Thought bubbles', start_scene_constellation: 'Constellation', start_scene_flowchart: 'Flowchart',
  start_scene_clusters: 'Clusters', start_scene_outline: 'Outline', start_scene_relations: 'Relationships', start_scene_matrix: 'SWOT matrix', start_scene_spiral: 'Spiral map', start_scene_islands: 'Islands', start_scene_gantt: 'Gantt chart',

  sc_tabs: 'Next / previous tab', sc_undo_redo: 'Undo / redo', sc_clipboard: 'Cut / copy / paste', sc_edit: 'Edit topic (or just type)', sc_newline: 'New line while editing', sc_cancel: 'Cancel editing or drawing a relationship',
  sc_navigate: 'Move between topics (Shift: add to selection)', sc_move: 'Move up / down among siblings', sc_fold: 'Fold / unfold', sc_root: 'Go to the central topic', sc_priority: 'Priority 1–9 / remove', sc_font: 'Bold / italic / underline',
  sc_find: 'Find / replace', sc_zoom: 'Zoom in / out', sc_drag: 'Move topics · empty space: pan', sc_marquee: 'Select several topics', sc_dblclick: 'Edit topic · empty space: floating topic',
  key_shift_enter_editing: 'Shift+Enter (editing)', key_ctrl_wheel: 'Ctrl+wheel', key_drag: 'Drag', key_marquee: 'Shift / Ctrl+drag', key_dblclick: 'Double-click',
};

const dicts = { ko, en };
let current = 'ko';
const listeners = new Set();

export const DICTS = dicts;

export function setLanguage(lang) {
  current = dicts[lang] ? lang : 'ko';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
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
