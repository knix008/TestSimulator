// Tiny i18n: `t(key, params)` with Korean (the reference UI) and English.
import { useSyncExternalStore } from 'react';

const ko = {
  appName: 'My FTP Server V1.0.1',
  ready: '준비됨', loading: '로딩 중…',

  // toolbar
  profile: '프로파일', profile_select: '프로파일 선택', profile_none: '(프로파일 없음)', profile_save: '저장', profile_delete: '삭제',
  tip_profile_select: '저장된 설정 프로파일을 불러옵니다', tip_profile_save: '현재 설정을 프로파일로 저장 (F5: 기본 설정 저장)', tip_profile_delete: '선택한 프로파일 삭제',
  theme: '테마', tip_theme: '테마 목록 (40가지 + 사용자 정의)', tip_next_theme: '다음 테마로 전환: {theme}', tip_language: '한국어 / English',
  settings: '설정', tip_settings: '앱 설정', menu_info: '정보', tip_about: '프로그램 정보',
  win_minimize: '최소화', win_maximize: '최대화', win_restore: '이전 크기로', win_close: '닫기', win_resize: '드래그하여 창 크기 조절',

  // control bar
  start: '시작', stop: '중지', starting: '시작 중…', tip_start: '선택한 프로토콜로 서버 시작', tip_stop: '모든 프로토콜 중지',
  protocols: '프로토콜', tip_protocols: '동시에 여러 프로토콜을 실행할 수 있습니다. 체크하면 표준 포트가 자동 입력됩니다.',
  port: '포트', explicit_tls: 'FTP에 AUTH TLS 허용', tip_explicit_tls: 'FTP 포트에서 Explicit FTPS(AUTH TLS + PROT P)를 허용합니다. SSL 인증서가 필요합니다.',
  stat_clients: '현재 접속', stat_total: '총 접속', stat_up: '업로드', stat_down: '다운로드', stat_files: '{n} 파일',
  locked_hint: '서버가 실행 중일 때는 설정을 변경할 수 없습니다. 먼저 ■ 중지하세요.', locked_short: '설정 잠김 (실행 중)',

  // shares
  shares: '공유 폴더', shares_hint: '루트(/)에는 가상 이름이 폴더로 표시됩니다. 예: data → /data/', col_virtual: '가상 이름 (경로)', col_physical: '실제 경로',
  add: '추가', edit: '편집', remove: '제거', browse: '찾기', no_shares: '공유 폴더가 없습니다. 「추가」로 가상 이름과 실제 경로를 등록하세요.',
  share_missing: '폴더 없음',
  dlg_share_add: '공유 폴더 추가', dlg_share_edit: '공유 폴더 편집', lbl_virtual: '가상 이름', lbl_physical: '실제 경로', ph_virtual: '예: data',
  err_virtual_required: '가상 이름을 입력하세요.', err_virtual_chars: "가상 이름에는 '/' 를 쓸 수 없습니다.", err_virtual_dup: '같은 가상 이름이 이미 있습니다.', err_physical_missing: '실제 경로가 존재하지 않습니다.',

  // security
  security: '보안', ftps_section: 'FTPS — SSL/TLS 인증서 (SFTP 호스트 키와 별개)', sftp_section: 'SFTP — SSH 호스트 키 (SSL 인증서와 별개)',
  lbl_cert: '인증서 파일', lbl_cert_key: '개인키 파일', lbl_cert_pw: '인증서 암호', cert_generate: '인증서 생성', ph_cert: '.pem 또는 .pfx',
  ph_cert_key: '(비우면 인증서 파일 또는 같은 이름의 _key.pem 사용)',
  tip_cert: 'FTPS용 SSL/TLS 인증서: PEM(인증서 + 키, 또는 별도 키 파일) 또는 PFX/PKCS#12. SFTP에는 사용하지 않습니다.',
  tip_cert_generate: 'FTPS용 자체 서명 SSL 인증서(PEM)를 새로 만듭니다.',
  cert_info: '{subject} · 만료 {expires}', cert_invalid: '인증서를 읽을 수 없음: {msg}', cert_pfx: 'PFX/PKCS#12 인증서 (암호 필요 시 입력)', cert_none: '(인증서 없음 — FTPS를 쓰려면 지정하거나 생성하세요)',
  lbl_hostkey: '키 (.pem)', hostkey_generate: '키 생성', hostkey_folder: '키 폴더', hostkey_fp: 'SHA256 지문', hostkey_none: '(키 없음 — 서버 시작 시 자동 생성)',
  tip_hostkey: 'SFTP용 RSA 호스트 개인키(PEM). 없으면 서버 시작 시 자동 생성됩니다. 클라이언트는 첫 접속 시 지문으로 서버를 확인합니다.',
  tip_hostkey_generate: '새 RSA 호스트 키를 만듭니다. 기존 키를 덮어쓰면 이미 접속한 클라이언트에 호스트 키 변경 경고가 표시됩니다.',
  tip_hostkey_folder: '호스트 키가 있는 폴더를 탐색기로 엽니다.', hostkey_bits: '{type} {bits}비트', copy_fp: '지문 복사',
  dlg_hostkey_overwrite: '호스트 키 재생성', hostkey_overwrite_msg: '기존 SFTP 호스트 키를 덮어씁니다.\n이미 접속했던 클라이언트는 호스트 키 변경 경고를 표시합니다.\n\n계속하시겠습니까?',
  hostkey_done: 'SFTP SSH 호스트 키가 생성되었습니다.\n(FTPS용 SSL 인증서와는 별개입니다.)\n\n경로: {path}\n{fp}',
  dlg_cert_gen: 'FTPS 자체 서명 SSL 인증서 생성', lbl_cn: '서버 이름 (CN)', lbl_years: '유효 기간 (년)', lbl_bits: '키 길이', lbl_save_path: '저장 경로',
  tip_cn: '호스트 이름 또는 IP (예: 192.168.1.10). 클라이언트가 접속하는 주소와 같아야 경고가 없습니다.', generate: '생성',
  err_cn_required: '서버 이름(CN)을 입력하세요.', err_path_required: '저장 경로를 입력하세요.',
  cert_done: 'FTPS용 SSL 인증서가 생성되었습니다.\n(SFTP 호스트 키와는 별개입니다.)\n\n인증서: {cert}\n개인키: {key}\n유효 기간: {years}년\nSHA256: {fp}',

  // users
  auth: '인증', allow_anonymous: '익명 접속 허용 (anonymous, 읽기 전용)', tip_anonymous: '체크하면 사용자 목록 없이 anonymous 로 접속할 수 있습니다 (읽기만). 해제하면 등록된 사용자만 접속합니다.',
  users: '사용자 목록', col_user: '사용자 이름', col_pass: '암호', col_perm: '권한', no_users: '등록된 사용자가 없습니다.',
  perm_rw: '읽기+쓰기', perm_r: '읽기', perm_w: '쓰기', perm_none: '없음',
  dlg_user_add: '사용자 추가', dlg_user_edit: '사용자 편집', lbl_username: '아이디', lbl_password: '암호', chk_read: '읽기 (목록·다운로드)', chk_write: '쓰기 (업로드·삭제·이름 변경·폴더 생성)',
  user_note: '익명(anonymous)은 「익명 접속 허용」 시 읽기만 가능합니다.', err_user_required: '아이디를 입력하세요.', err_user_anon: "'anonymous' 는 사용자 이름으로 쓸 수 없습니다. 「익명 접속 허용」을 사용하세요.", err_user_dup: '같은 아이디가 이미 있습니다.', err_perm_required: '읽기 또는 쓰기 권한을 하나 이상 선택하세요.',

  // performance / network
  network: '네트워크 · 성능', lbl_buffer: '버퍼 (KB)', lbl_max_conn: '최대 접속 (프로토콜별, 0 = 무제한)', lbl_pasv_range: 'PASV 포트 범위', lbl_pasv_addr: 'PASV 외부 주소', lbl_bind: '바인드 주소',
  tip_buffer: 'FTP/FTPS 전송 버퍼 크기', tip_max_conn: '프로토콜별 동시 접속 상한', tip_pasv_range: '수동(PASV) 데이터 연결 포트 범위. 비우면 임의 포트. 방화벽에서 이 범위를 허용하세요.',
  tip_pasv_addr: 'NAT 뒤에서 PASV 응답에 알릴 공인 IPv4 (비우면 로컬 주소)', tip_bind: '수신할 로컬 주소 (비우면 모든 인터페이스)', ph_any: '(모든 인터페이스)', ph_pasv_addr: '(자동)',
  addresses: '접속 주소', addresses_hint: '클라이언트에서 다음 주소로 접속합니다. 방화벽에서 TCP 포트를 허용하세요.', copy: '복사', copied: '복사됨',
  addr_col_proto: '프로토콜', addr_col_url: '접속 주소 (URL)', addr_col_iface: '네트워크 인터페이스', addr_copy_all: '전체 복사', addr_none: '활성화된 프로토콜이 없습니다. 위의 프로토콜을 체크하세요.', addr_local: '로컬 (루프백)', addr_bound: '바인드 주소',
  tree_title: '폴더 트리', tree_collapse: '패널 접기', tree_expand: '폴더 트리 펼치기', tree_refresh: '새로 고침 (F5)', tree_collapse_all: '모두 접기', tree_empty: '공유 폴더가 없습니다.', tree_root_tip: '가상 루트 — 클라이언트에게 보이는 최상위. 공유 폴더가 가상 이름으로 나열됩니다.',
  addr_delete: '이 주소 삭제', addr_delete_all: '전체 삭제', tip_addr_delete_all: '목록의 주소를 모두 지웁니다 (「복원」으로 되돌림)', addr_restore: '복원', tip_addr_restore: '지운 주소를 모두 다시 표시합니다', addr_all_hidden: '모든 주소를 지웠습니다. 「복원」으로 되돌릴 수 있습니다.',

  // log
  log: '로그', log_copy: '전체 복사', log_save: '로그 저장', log_clear: '로그 지우기', log_trace: '프로토콜 상세', tip_log_trace: 'FTP 명령/응답 등 상세 메시지 표시',
  log_file: '로그 파일: {file}', log_copied: '로그를 클립보드에 복사했습니다.', log_empty: '저장할 로그가 없습니다.', log_saved: '로그 저장됨: {path}',
  log_settings_saved: '설정 저장 완료 (F5)', log_settings_loaded: '설정 불러오기 완료 (F6)',

  // status
  state_running: '실행 중', state_stopped: '중지됨', state_starting: '시작 중…',
  status_ready: '준비됨', status_running: '실행 중 — {list}', status_stopped: '서버 중지됨', status_starting: '서버 시작 중…', status_start_failed: '서버 시작 실패',
  uptime: '가동 {time}',

  // dialogs
  ok: '확인', cancel: '취소', close: '닫기', yes: '예', no: '아니요',
  dlg_error: '오류', dlg_settings_error: '설정 오류', dlg_start_error: '서버 시작 오류', dlg_stop_confirm: '서버 중지', stop_confirm_msg: '현재 {n}개의 클라이언트가 접속 중입니다.\n서버를 중지하면 연결이 끊어집니다.\n\n중지하시겠습니까?',
  dlg_profile_save: '프로파일 저장', lbl_profile_name: '프로파일 이름', dlg_profile_delete: '프로파일 삭제', profile_delete_msg: "'{name}' 프로파일을 삭제할까요?",
  dlg_share_remove: '공유 폴더 제거', share_remove_msg: "'/{name}' 공유를 제거할까요? (디스크의 폴더는 그대로 남습니다)", dlg_user_remove: '사용자 삭제', user_remove_msg: "사용자 '{name}'을(를) 삭제할까요?",
  copy_details: '자세한 내용 복사', copied_details: '오류 내용을 클립보드에 복사했습니다.', error_details: '자세한 내용', error_hint: '내용을 선택하여 복사할 수 있습니다.',
  error_unexpected: '예상하지 못한 오류가 발생했습니다.', error_code: '코드', error_path: '경로',
  start_details: '── 프로토콜 ──\n{protocols}\n익명 접속: {anon}\n사용자 수: {users}\n\n── 공유 폴더 ──\n{shares}\n\n포트가 다른 프로그램에서 사용 중이면 시작에 실패할 수 있습니다.\nLinux/macOS에서 1024 미만 포트는 관리자 권한이 필요합니다.',
  notice: '알림', web_unsupported: '웹 버전에서는 사용할 수 없습니다.', reveal_web: '웹 버전에서는 폴더를 열 수 없습니다. 경로:\n{path}',

  // path picker (web)
  dlg_pick_folder: '폴더 선택', dlg_pick_file: '파일 선택', pick_drives: '드라이브', pick_up: '상위 폴더', pick_new_folder: '새 폴더', pick_select: '선택', pick_path: '경로', pick_empty: '(비어 있음)', pick_denied: '[접근 거부]',
  dlg_new_folder: '새 폴더 만들기', lbl_folder_name: '폴더 이름', default_folder: '새 폴더',

  // settings dialog
  settings_title: '설정', set_language: '언어', set_theme: '테마', set_font_size: '글꼴 크기',
  set_confirm_stop: '접속자가 있을 때 중지 전 확인', set_auto_start: '앱 시작 시 서버 자동 시작', set_tray: '창을 닫아도 서버 유지 (트레이로 최소화)', set_sounds: '시작/오류 알림음',
  set_tab_general: '일반', set_tab_behavior: '동작', set_reset: '기본값', set_reset_hint: '현재 탭의 항목을 기본값으로 되돌립니다',
  set_language_hint: '메뉴·메시지·로그의 언어', set_theme_hint: '40가지 테마 — 고르면 바로 미리 보입니다', set_theme_dark: '어두운 테마', set_theme_light: '밝은 테마',
  set_tab_theme: '테마', set_custom_themes: '사용자 정의 테마', set_custom_add: "'{name}' 바탕으로 새 테마", set_custom_remove: '이 테마 삭제', set_custom_copy: '(사용자)', set_custom_name: '이름',
  set_custom_hint: '아직 없습니다 — 「새 테마」를 누르면 현재 테마를 바탕으로 만들어지고 아래에서 색을 바꿉니다.',
  set_color_bg: '창 배경', set_color_panel: '패널 배경', set_color_raised: '툴바·메뉴 배경', set_color_hover: '마우스 오버', set_color_active: '비활성 선택', set_color_border: '테두리', set_color_borderStrong: '진한 테두리', set_color_text: '글자', set_color_textDim: '흐린 글자', set_color_accent: '강조색', set_color_accentStrong: '진한 강조색', set_color_accentText: '강조색 위 글자', set_color_folder: '폴더 아이콘', set_color_file: '파일 아이콘', set_color_danger: '경고·오류',
  theme_custom_none: '없음', theme_new_custom: '사용자 정의 테마', tip_theme_new_custom: '현재 테마를 바탕으로 새 사용자 정의 테마를 만들고 색을 편집합니다', tip_theme_settings: '설정 › 테마 (사용자 정의 테마 편집)',
  set_font_size_hint: '전체 화면의 글꼴 크기', set_font_sample: '가나다 ABC 123',
  set_confirm_stop_hint: '중지하면 접속 중인 클라이언트가 끊깁니다. 중지 전에 한 번 더 묻습니다.',
  set_auto_start_hint: '앱을 열면 마지막 설정으로 서버를 바로 시작합니다.',
  set_tray_hint: '서버 실행 중에 창을 닫으면 종료하지 않고 트레이 아이콘으로 숨깁니다.', set_desktop_only: '데스크톱 앱에서만 사용할 수 있습니다.',
  set_sounds_hint: '서버 시작 성공과 오류를 소리로 알립니다.',

  // about
  about_title: '프로그램 정보', about_desc: 'Windows / macOS / Linux / 웹용 FTP · FTPS · SFTP 서버',
  version: '버전', author: '제작자', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: '빌드', about_host: '실행 환경', host_tauri: '데스크톱 (Tauri)', host_web: '웹 브라우저', about_config: '설정 폴더',
  about_libs: 'FTP/FTPS: node:net · node:tls · SFTP: ssh2 · 인증서: node:crypto',
  // start page
  start_page: '시작 페이지', tip_start_page: '시작 페이지 / 서버 화면 전환',
  sp_tagline: '여러 폴더를 가상 경로로 공유하는 FTP · FTPS · SFTP 서버 — 사용자별 권한, SSL 인증서, SSH 호스트 키, 프로파일, 실시간 로그와 통계.',
  sp_start_server: '서버 시작', sp_open_server: '서버 화면', sp_open_server_tip: '공유 폴더 · 사용자 · 보안 · 네트워크 · 로그 화면으로 이동',
  sp_status: '서버 상태', sp_listening: '접속 대기 중', sp_ready: '켜짐 (중지됨)', sp_off: '꺼짐',
  sp_quick: '빠른 작업', sp_g_share: '공유 · 사용자', sp_g_security: '보안', sp_g_data: '로그 · 설정',
  sp_t_share: '공유 폴더 추가', sp_t_share_d: '폴더를 가상 경로로 공유', sp_t_user: '사용자 추가', sp_t_user_d: '계정과 읽기/쓰기 권한',
  sp_t_open: '서버 화면 열기', sp_t_open_d: '모든 설정과 로그 보기',
  sp_t_cert: 'SSL 인증서 생성', sp_t_cert_d: 'FTPS용 자체 서명 인증서', sp_t_hostkey: 'SSH 호스트 키 생성', sp_t_hostkey_d: 'SFTP 서버 키 (RSA)',
  sp_t_keyfolder: '키 폴더 열기', sp_t_keyfolder_d: '인증서와 호스트 키 위치',
  sp_t_savelog: '로그 저장', sp_t_savelog_d: '로그를 파일로 저장', sp_t_copylog: '로그 복사', sp_t_copylog_d: '로그를 클립보드로', sp_t_config: '설정 폴더 열기', sp_t_config_d: '설정 · 프로파일 · 로그 파일',
  sp_shares: '공유 폴더', sp_shares_empty: '공유 폴더가 없습니다. 「추가」로 폴더를 공유하세요.', sp_share_missing: '폴더를 찾을 수 없습니다', sp_add: '추가',
  sp_addresses: '접속 주소', sp_profiles: '프로파일', sp_profiles_empty: '저장된 프로파일이 없습니다. 현재 설정을 저장해 두면 한 번에 불러올 수 있습니다.',
  sp_profile_load: '「{name}」 프로파일 불러오기', sp_profile_current: '현재',
  sp_manual: '사용법', sp_manual_tip: '사용 설명서 창 열기 (그림과 함께 보는 사용 방법)',
  sp_help: '도움말', sp_step1: '공유할 폴더를 추가합니다.', sp_step2: '사용자를 추가하거나 익명 접속을 허용합니다.', sp_step3: '프로토콜(FTP · FTPS · SFTP)과 포트를 고릅니다.', sp_step4: '▶ 서버 시작을 누르고 접속 주소를 알려 줍니다.',
  sp_keys: 'F5 설정 저장 · F6 설정 다시 읽기', sp_h_theme: '다음 테마', sp_h_language: 'English 로 전환',
  sp_background: '배경', sp_speed: '속도', sp_transparency: '투명도', sp_shuffle: '섞기', sp_shuffle_tip: '{n}초마다 다른 배경', sp_shuffle_every: '섞기 간격', sp_seconds: '초', sp_random: '시작할 때 무작위 배경',
  anim_network: '네트워크', anim_network_d: '연결된 노드 사이를 오가는 패킷', anim_packets: '서버와 클라이언트', anim_packets_d: '서버를 오가는 업로드 · 다운로드',
  anim_radar: '레이더', anim_radar_d: '접속자를 찾는 스캔', anim_binaryRain: '데이터 비', anim_binaryRain_d: '흘러내리는 비트와 16진수',
  anim_globe: '지구', anim_globe_d: '세계를 잇는 연결', anim_transfer: '파일 전송', anim_transfer_d: '진행 막대와 함께 오가는 파일',
  anim_circuit: '회로', anim_circuit_d: '기판 위를 달리는 신호', anim_waves: '신호 파형', anim_waves_d: '겹쳐 흐르는 파형',
  anim_particles: '별자리', anim_particles_d: '부드럽게 떠다니는 입자', anim_aurora: '오로라', anim_aurora_d: '천천히 흐르는 빛의 띠',
  anim_hexGrid: '육각 격자', anim_hexGrid_d: '물결처럼 빛나는 육각 셀', anim_satellite: '위성 링크', anim_satellite_d: '궤도를 도는 위성과 지상국 사이의 신호',
  anim_tunnel: '데이터 터널', anim_tunnel_d: '터널을 빠져나오는 패킷', anim_traffic: '트래픽 그래프', anim_traffic_d: '흐르는 업로드 · 다운로드 처리량',
  anim_folders: '폴더 트리', anim_folders_d: '공유 폴더 트리로 퍼지는 파일', anim_sync: '동기화', anim_sync_d: '두 서버가 주고받는 데이터',
  anim_encryption: '암호화', anim_encryption_d: '자물쇠를 지나 암호문이 되는 데이터', anim_warp: '워프', anim_warp_d: '빛의 속도로 지나가는 별',
  anim_terrain: '와이어 지형', anim_terrain_d: '앞으로 흐르는 선 지형', anim_fiber: '광섬유', anim_fiber_d: '광섬유를 달리는 빛 펄스',
  anim_broadcast: '신호 송출', anim_broadcast_d: '송신탑에서 퍼지는 전파',
  sp_move_card: '끌어서 카드 이동', sp_resize_card: '크기 조절', sp_auto_arrange: '자동 정렬', sp_auto_arrange_tip: '카드를 빈틈없이 다시 배치합니다',
  sp_close: '서버 화면으로', sp_close_tip: '시작 페이지를 닫고 서버 화면으로 이동', sp_show: '시작할 때 이 페이지 표시',
  set_show_start: '시작할 때 시작 페이지 표시', set_show_start_hint: '앱을 열면 서버 화면 대신 시작 페이지가 먼저 나옵니다.',
  tray_show: 'My FTP Server 열기', tray_quit: '종료 (서버 중지)',
  boot_host_error: '서버 엔진을 시작할 수 없습니다.',
};

const en = {
  appName: 'My FTP Server V1.0.1',
  ready: 'Ready', loading: 'Loading…',

  profile: 'Profile', profile_select: 'Choose a profile', profile_none: '(no profiles)', profile_save: 'Save', profile_delete: 'Delete',
  tip_profile_select: 'Load a saved settings profile', tip_profile_save: 'Save the current settings as a profile (F5: save defaults)', tip_profile_delete: 'Delete the selected profile',
  theme: 'Theme', tip_theme: 'Theme list (40 built in + custom)', tip_next_theme: 'Switch to the next theme: {theme}', tip_language: '한국어 / English',
  settings: 'Settings', tip_settings: 'App settings', menu_info: 'Info', tip_about: 'About My FTP Server',
  win_minimize: 'Minimize', win_maximize: 'Maximize', win_restore: 'Restore', win_close: 'Close', win_resize: 'Drag to resize the window',

  start: 'Start', stop: 'Stop', starting: 'Starting…', tip_start: 'Start the server with the selected protocols', tip_stop: 'Stop every protocol',
  protocols: 'Protocols', tip_protocols: 'Several protocols can run at once. Ticking one fills in its standard port.',
  port: 'Port', explicit_tls: 'Allow AUTH TLS on FTP', tip_explicit_tls: 'Explicit FTPS (AUTH TLS + PROT P) on the FTP port. Needs the SSL certificate.',
  stat_clients: 'Connected', stat_total: 'Total', stat_up: 'Uploads', stat_down: 'Downloads', stat_files: '{n} files',
  locked_hint: 'Settings cannot be changed while the server runs. Stop it first.', locked_short: 'Settings locked (running)',

  shares: 'Shared folders', shares_hint: 'The root (/) lists the virtual names as folders, e.g. data → /data/', col_virtual: 'Virtual name (path)', col_physical: 'Folder on disk',
  add: 'Add', edit: 'Edit', remove: 'Remove', browse: 'Browse', no_shares: 'No shared folders yet. Use "Add" to map a virtual name to a folder.',
  share_missing: 'folder missing',
  dlg_share_add: 'Add shared folder', dlg_share_edit: 'Edit shared folder', lbl_virtual: 'Virtual name', lbl_physical: 'Folder on disk', ph_virtual: 'e.g. data',
  err_virtual_required: 'Enter a virtual name.', err_virtual_chars: "A virtual name cannot contain '/'.", err_virtual_dup: 'That virtual name already exists.', err_physical_missing: 'The folder does not exist.',

  security: 'Security', ftps_section: 'FTPS — SSL/TLS certificate (separate from the SFTP host key)', sftp_section: 'SFTP — SSH host key (separate from the SSL certificate)',
  lbl_cert: 'Certificate', lbl_cert_key: 'Private key', lbl_cert_pw: 'Password', cert_generate: 'Generate', ph_cert: '.pem or .pfx',
  ph_cert_key: '(empty: key inside the certificate file, or <name>_key.pem)',
  tip_cert: 'SSL/TLS certificate for FTPS: PEM (certificate + key, or a separate key file) or PFX/PKCS#12. Not used by SFTP.',
  tip_cert_generate: 'Create a new self-signed SSL certificate (PEM) for FTPS.',
  cert_info: '{subject} · expires {expires}', cert_invalid: 'Cannot read the certificate: {msg}', cert_pfx: 'PFX/PKCS#12 certificate (enter the password if it has one)', cert_none: '(no certificate — choose or generate one to use FTPS)',
  lbl_hostkey: 'Key (.pem)', hostkey_generate: 'Generate', hostkey_folder: 'Key folder', hostkey_fp: 'SHA256 fingerprint', hostkey_none: '(no key — created when the server starts)',
  tip_hostkey: 'RSA host private key (PEM) for SFTP. Created automatically on the first start. Clients verify the server with its fingerprint on first connection.',
  tip_hostkey_generate: 'Create a new RSA host key. Overwriting the key makes clients that already connected warn about a changed host key.',
  tip_hostkey_folder: 'Open the folder holding the host key.', hostkey_bits: '{type} {bits} bit', copy_fp: 'Copy fingerprint',
  dlg_hostkey_overwrite: 'Regenerate host key', hostkey_overwrite_msg: 'The existing SFTP host key will be overwritten.\nClients that connected before will warn about a changed host key.\n\nContinue?',
  hostkey_done: 'The SFTP SSH host key was created.\n(It is separate from the FTPS SSL certificate.)\n\nPath: {path}\n{fp}',
  dlg_cert_gen: 'Generate a self-signed SSL certificate for FTPS', lbl_cn: 'Server name (CN)', lbl_years: 'Valid for (years)', lbl_bits: 'Key size', lbl_save_path: 'Save as',
  tip_cn: 'Host name or IP (e.g. 192.168.1.10). Matching the address clients use avoids warnings.', generate: 'Generate',
  err_cn_required: 'Enter the server name (CN).', err_path_required: 'Enter the save path.',
  cert_done: 'The SSL certificate for FTPS was created.\n(It is separate from the SFTP host key.)\n\nCertificate: {cert}\nPrivate key: {key}\nValid for: {years} years\nSHA256: {fp}',

  auth: 'Authentication', allow_anonymous: 'Allow anonymous access (anonymous, read-only)', tip_anonymous: 'When ticked, "anonymous" can log in without an account (read only). Otherwise only listed users can connect.',
  users: 'Users', col_user: 'User name', col_pass: 'Password', col_perm: 'Rights', no_users: 'No users defined.',
  perm_rw: 'read+write', perm_r: 'read', perm_w: 'write', perm_none: 'none',
  dlg_user_add: 'Add user', dlg_user_edit: 'Edit user', lbl_username: 'User name', lbl_password: 'Password', chk_read: 'Read (list, download)', chk_write: 'Write (upload, delete, rename, create folders)',
  user_note: 'Anonymous is read-only and enabled with "Allow anonymous access".', err_user_required: 'Enter a user name.', err_user_anon: "'anonymous' cannot be a user name — use \"Allow anonymous access\".", err_user_dup: 'That user name already exists.', err_perm_required: 'Select read and/or write.',

  network: 'Network · performance', lbl_buffer: 'Buffer (KB)', lbl_max_conn: 'Max connections (per protocol, 0 = unlimited)', lbl_pasv_range: 'PASV port range', lbl_pasv_addr: 'PASV external address', lbl_bind: 'Bind address',
  tip_buffer: 'FTP/FTPS transfer buffer', tip_max_conn: 'Concurrent connection limit per protocol', tip_pasv_range: 'Port range for passive (PASV) data connections. Empty = any free port. Open this range in the firewall.',
  tip_pasv_addr: 'Public IPv4 to announce in PASV replies behind NAT (empty = local address)', tip_bind: 'Local address to listen on (empty = every interface)', ph_any: '(all interfaces)', ph_pasv_addr: '(automatic)',
  addresses: 'Connection addresses', addresses_hint: 'Clients connect to these addresses. Allow the TCP ports in the firewall.', copy: 'Copy', copied: 'Copied',
  addr_col_proto: 'Protocol', addr_col_url: 'Address (URL)', addr_col_iface: 'Network interface', addr_copy_all: 'Copy all', addr_none: 'No protocol is enabled. Tick one above.', addr_local: 'Local (loopback)', addr_bound: 'Bind address',
  tree_title: 'Folder tree', tree_collapse: 'Collapse panel', tree_expand: 'Show the folder tree', tree_refresh: 'Refresh (F5)', tree_collapse_all: 'Collapse all', tree_empty: 'No shared folders.', tree_root_tip: 'Virtual root — what clients see at the top: the shares under their virtual names.',
  addr_delete: 'Delete this address', addr_delete_all: 'Delete all', tip_addr_delete_all: 'Remove every address from the list ("Restore" brings them back)', addr_restore: 'Restore', tip_addr_restore: 'Show every deleted address again', addr_all_hidden: 'All addresses were deleted. "Restore" brings them back.',

  log: 'Log', log_copy: 'Copy all', log_save: 'Save log', log_clear: 'Clear log', log_trace: 'Protocol detail', tip_log_trace: 'Show FTP commands / replies and other detail lines',
  log_file: 'Log file: {file}', log_copied: 'Log copied to the clipboard.', log_empty: 'There is no log to save.', log_saved: 'Log saved: {path}',
  log_settings_saved: 'Settings saved (F5)', log_settings_loaded: 'Settings reloaded (F6)',

  state_running: 'Running', state_stopped: 'Stopped', state_starting: 'Starting…',
  status_ready: 'Ready', status_running: 'Running — {list}', status_stopped: 'Server stopped', status_starting: 'Starting the server…', status_start_failed: 'Server start failed',
  uptime: 'up {time}',

  ok: 'OK', cancel: 'Cancel', close: 'Close', yes: 'Yes', no: 'No',
  dlg_error: 'Error', dlg_settings_error: 'Settings error', dlg_start_error: 'Server start error', dlg_stop_confirm: 'Stop server', stop_confirm_msg: '{n} client(s) are connected.\nStopping the server disconnects them.\n\nStop anyway?',
  dlg_profile_save: 'Save profile', lbl_profile_name: 'Profile name', dlg_profile_delete: 'Delete profile', profile_delete_msg: "Delete the profile '{name}'?",
  dlg_share_remove: 'Remove shared folder', share_remove_msg: "Remove the share '/{name}'? (The folder on disk stays.)", dlg_user_remove: 'Delete user', user_remove_msg: "Delete the user '{name}'?",
  copy_details: 'Copy details', copied_details: 'Error details copied to the clipboard.', error_details: 'Details', error_hint: 'The text can be selected and copied.',
  error_unexpected: 'An unexpected error occurred.', error_code: 'Code', error_path: 'Path',
  start_details: '── Protocols ──\n{protocols}\nAnonymous: {anon}\nUsers: {users}\n\n── Shared folders ──\n{shares}\n\nA port held by another program makes the start fail.\nPorts below 1024 need administrator rights on Linux/macOS.',
  notice: 'Notice', web_unsupported: 'Not available in the web version.', reveal_web: 'The folder cannot be opened from the web version. Path:\n{path}',

  dlg_pick_folder: 'Choose a folder', dlg_pick_file: 'Choose a file', pick_drives: 'Drives', pick_up: 'Parent folder', pick_new_folder: 'New folder', pick_select: 'Select', pick_path: 'Path', pick_empty: '(empty)', pick_denied: '[access denied]',
  dlg_new_folder: 'New folder', lbl_folder_name: 'Folder name', default_folder: 'New Folder',

  settings_title: 'Settings', set_language: 'Language', set_theme: 'Theme', set_font_size: 'Font size',
  set_confirm_stop: 'Confirm before stopping with clients connected', set_auto_start: 'Start the server when the app opens', set_tray: 'Keep serving when the window is closed (minimize to tray)', set_sounds: 'Start / error sounds',
  set_tab_general: 'General', set_tab_behavior: 'Behaviour', set_reset: 'Defaults', set_reset_hint: 'Reset the fields of this tab to their defaults',
  set_language_hint: 'Language of the menus, messages and log', set_theme_hint: '40 themes — previewed as you pick', set_theme_dark: 'Dark themes', set_theme_light: 'Light themes',
  set_tab_theme: 'Theme', set_custom_themes: 'Custom themes', set_custom_add: "New theme from '{name}'", set_custom_remove: 'Delete this theme', set_custom_copy: '(custom)', set_custom_name: 'Name',
  set_custom_hint: 'None yet — "New theme" copies the current theme; then change its colours below.',
  set_color_bg: 'Window background', set_color_panel: 'Panel background', set_color_raised: 'Toolbar / menu background', set_color_hover: 'Hover', set_color_active: 'Inactive selection', set_color_border: 'Border', set_color_borderStrong: 'Strong border', set_color_text: 'Text', set_color_textDim: 'Muted text', set_color_accent: 'Accent', set_color_accentStrong: 'Strong accent', set_color_accentText: 'Text on accent', set_color_folder: 'Folder icon', set_color_file: 'File icon', set_color_danger: 'Danger / error',
  theme_custom_none: 'None', theme_new_custom: 'Custom theme', tip_theme_new_custom: 'Make a new custom theme from the current one and edit its colours', tip_theme_settings: 'Settings › Theme (edit custom themes)',
  set_font_size_hint: 'Font size of the whole window', set_font_sample: 'Sample ABC 123',
  set_confirm_stop_hint: 'Stopping disconnects the clients; ask once more before doing so.',
  set_auto_start_hint: 'Start the server with the last settings as soon as the app opens.',
  set_tray_hint: 'Closing the window while the server runs hides the app in the tray instead of quitting.', set_desktop_only: 'Available in the desktop app only.',
  set_sounds_hint: 'Play a sound when the server starts and when an error occurs.',

  about_title: 'About', about_desc: 'FTP · FTPS · SFTP server for Windows / macOS / Linux / the web',
  version: 'Version', author: 'Author', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: 'Build', about_host: 'Running on', host_tauri: 'Desktop (Tauri)', host_web: 'Web browser', about_config: 'Config folder',
  about_libs: 'FTP/FTPS: node:net · node:tls · SFTP: ssh2 · certificates: node:crypto',
  // start page
  start_page: 'Start page', tip_start_page: 'Switch between the start page and the server view',
  sp_tagline: 'An FTP · FTPS · SFTP server that shares folders as virtual paths — per-user rights, SSL certificates, SSH host keys, profiles, a live log and statistics.',
  sp_start_server: 'Start server', sp_open_server: 'Server view', sp_open_server_tip: 'Go to shares · users · security · network · log',
  sp_status: 'Server status', sp_listening: 'Listening', sp_ready: 'On (stopped)', sp_off: 'Off',
  sp_quick: 'Quick actions', sp_g_share: 'Shares · users', sp_g_security: 'Security', sp_g_data: 'Log · settings',
  sp_t_share: 'Add shared folder', sp_t_share_d: 'Share a folder as a virtual path', sp_t_user: 'Add user', sp_t_user_d: 'Account with read / write rights',
  sp_t_open: 'Open server view', sp_t_open_d: 'Every setting and the log',
  sp_t_cert: 'Generate SSL certificate', sp_t_cert_d: 'Self-signed certificate for FTPS', sp_t_hostkey: 'Generate SSH host key', sp_t_hostkey_d: 'SFTP server key (RSA)',
  sp_t_keyfolder: 'Open key folder', sp_t_keyfolder_d: 'Where the certificate and host key live',
  sp_t_savelog: 'Save log', sp_t_savelog_d: 'Write the log to a file', sp_t_copylog: 'Copy log', sp_t_copylog_d: 'Log to the clipboard', sp_t_config: 'Open config folder', sp_t_config_d: 'Settings · profiles · log file',
  sp_shares: 'Shared folders', sp_shares_empty: 'No shared folder yet. "Add" shares one.', sp_share_missing: 'Folder not found', sp_add: 'Add',
  sp_addresses: 'Addresses', sp_profiles: 'Profiles', sp_profiles_empty: 'No saved profile. Save the current settings to load them in one go later.',
  sp_profile_load: 'Load profile "{name}"', sp_profile_current: 'current',
  sp_manual: 'User guide', sp_manual_tip: 'Open the illustrated user guide window',
  sp_help: 'Help', sp_step1: 'Add the folders to share.', sp_step2: 'Add users, or allow anonymous access.', sp_step3: 'Pick the protocols (FTP · FTPS · SFTP) and ports.', sp_step4: 'Press ▶ Start server and hand out the addresses.',
  sp_keys: 'F5 save settings · F6 reload settings', sp_h_theme: 'Next theme', sp_h_language: '한국어로 전환',
  sp_background: 'Background', sp_speed: 'Speed', sp_transparency: 'Transparency', sp_shuffle: 'Shuffle', sp_shuffle_tip: 'Another background every {n} s', sp_shuffle_every: 'Shuffle every', sp_seconds: 's', sp_random: 'Random background at start',
  anim_network: 'Network', anim_network_d: 'Packets between linked nodes', anim_packets: 'Server and clients', anim_packets_d: 'Uploads and downloads around a server',
  anim_radar: 'Radar', anim_radar_d: 'A sweep finding clients', anim_binaryRain: 'Data rain', anim_binaryRain_d: 'Falling bits and hex digits',
  anim_globe: 'Globe', anim_globe_d: 'Links around the world', anim_transfer: 'File transfer', anim_transfer_d: 'Files travelling with progress bars',
  anim_circuit: 'Circuit', anim_circuit_d: 'Signals racing over a board', anim_waves: 'Signal waves', anim_waves_d: 'Layered flowing waves',
  anim_particles: 'Constellation', anim_particles_d: 'Softly drifting particles', anim_aurora: 'Aurora', anim_aurora_d: 'Slow bands of light',
  anim_hexGrid: 'Hex grid', anim_hexGrid_d: 'Hexagon cells lit by a passing wave', anim_satellite: 'Satellite link', anim_satellite_d: 'Orbiting satellites beaming to ground stations',
  anim_tunnel: 'Data tunnel', anim_tunnel_d: 'Packets rushing out of a tunnel', anim_traffic: 'Traffic graph', anim_traffic_d: 'Upload and download throughput scrolling by',
  anim_folders: 'Folder tree', anim_folders_d: 'Files spreading through a shared folder tree', anim_sync: 'Sync', anim_sync_d: 'Two servers exchanging data',
  anim_encryption: 'Encryption', anim_encryption_d: 'Plain text turning into cipher text at the lock', anim_warp: 'Warp', anim_warp_d: 'Stars streaking past at light speed',
  anim_terrain: 'Wire terrain', anim_terrain_d: 'A wireframe landscape flowing toward you', anim_fiber: 'Fibre optics', anim_fiber_d: 'Light pulses racing along fibres',
  anim_broadcast: 'Broadcast', anim_broadcast_d: 'Radio waves spreading from towers',
  sp_move_card: 'Drag to move the card', sp_resize_card: 'Resize', sp_auto_arrange: 'Auto arrange', sp_auto_arrange_tip: 'Pack the cards again without gaps',
  sp_close: 'Server view', sp_close_tip: 'Close the start page and go to the server view', sp_show: 'Show this page at start',
  set_show_start: 'Show the start page at start', set_show_start_hint: 'The app opens on the start page instead of the server view.',
  tray_show: 'Open My FTP Server', tray_quit: 'Quit (stops the server)',
  boot_host_error: 'The server engine could not start.',
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
export const LANGUAGES = ['ko', 'en'];

// The string in a specific language (the window's minimum width is computed
// for every language, so switching never resizes the window).
export function tIn(lang, key, params) {
  let s = (dicts[lang] && dicts[lang][key]) || ko[key] || key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
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
