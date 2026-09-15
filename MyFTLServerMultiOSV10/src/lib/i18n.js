// Tiny i18n: `t(key, params)` with Korean (the reference UI) and English.
import { useSyncExternalStore } from 'react';

const ko = {
  appName: 'My FTP Server V1.0',
  ready: '준비됨', loading: '로딩 중…',

  // toolbar
  profile: '프로파일', profile_select: '프로파일 선택', profile_none: '(프로파일 없음)', profile_save: '저장', profile_delete: '삭제',
  tip_profile_select: '저장된 설정 프로파일을 불러옵니다', tip_profile_save: '현재 설정을 프로파일로 저장 (F5: 기본 설정 저장)', tip_profile_delete: '선택한 프로파일 삭제',
  theme: '테마', tip_theme: '테마 선택 (16가지)', tip_next_theme: '다음 테마로 전환: {theme}', tip_language: '한국어 / English',
  settings: '설정', tip_settings: '앱 설정', menu_info: '정보', tip_about: '프로그램 정보',
  win_minimize: '최소화', win_maximize: '최대화', win_restore: '이전 크기로', win_close: '닫기', win_resize: '드래그하여 창 크기 조절',

  // control bar
  start: '시작', stop: '중지', starting: '시작 중…', tip_start: '선택한 프로토콜로 서버 시작', tip_stop: '모든 프로토콜 중지',
  protocols: '프로토콜', tip_protocols: '동시에 여러 프로토콜을 실행할 수 있습니다. 체크하면 표준 포트가 자동 입력됩니다.',
  port: '포트', explicit_tls: 'FTP에 AUTH TLS 허용', tip_explicit_tls: 'FTP 포트에서 Explicit FTPS(AUTH TLS + PROT P)를 허용합니다. SSL 인증서가 필요합니다.',
  stat_clients: '현재 접속', stat_total: '총 접속', stat_up: '업로드', stat_down: '다운로드', stat_files: '{n} 파일',
  locked_hint: '서버가 실행 중일 때는 설정을 변경할 수 없습니다. 먼저 ■ 중지하세요.',

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

  // about
  about_title: '프로그램 정보', about_desc: 'Windows / macOS / Linux / 웹용 FTP · FTPS · SFTP 서버',
  version: '버전', author: '제작자', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: '빌드', about_host: '실행 환경', host_electron: '데스크톱 (Electron)', host_web: '웹 브라우저', about_config: '설정 폴더',
  about_libs: 'FTP/FTPS: node:net · node:tls · SFTP: ssh2 · 인증서: node:crypto',
};

const en = {
  appName: 'My FTP Server V1.0',
  ready: 'Ready', loading: 'Loading…',

  profile: 'Profile', profile_select: 'Choose a profile', profile_none: '(no profiles)', profile_save: 'Save', profile_delete: 'Delete',
  tip_profile_select: 'Load a saved settings profile', tip_profile_save: 'Save the current settings as a profile (F5: save defaults)', tip_profile_delete: 'Delete the selected profile',
  theme: 'Theme', tip_theme: 'Choose a theme (16 built in)', tip_next_theme: 'Switch to the next theme: {theme}', tip_language: '한국어 / English',
  settings: 'Settings', tip_settings: 'App settings', menu_info: 'Info', tip_about: 'About My FTP Server',
  win_minimize: 'Minimize', win_maximize: 'Maximize', win_restore: 'Restore', win_close: 'Close', win_resize: 'Drag to resize the window',

  start: 'Start', stop: 'Stop', starting: 'Starting…', tip_start: 'Start the server with the selected protocols', tip_stop: 'Stop every protocol',
  protocols: 'Protocols', tip_protocols: 'Several protocols can run at once. Ticking one fills in its standard port.',
  port: 'Port', explicit_tls: 'Allow AUTH TLS on FTP', tip_explicit_tls: 'Explicit FTPS (AUTH TLS + PROT P) on the FTP port. Needs the SSL certificate.',
  stat_clients: 'Connected', stat_total: 'Total', stat_up: 'Uploads', stat_down: 'Downloads', stat_files: '{n} files',
  locked_hint: 'Settings cannot be changed while the server runs. Stop it first.',

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

  about_title: 'About', about_desc: 'FTP · FTPS · SFTP server for Windows / macOS / Linux / the web',
  version: 'Version', author: 'Author', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: 'Build', about_host: 'Running on', host_electron: 'Desktop (Electron)', host_web: 'Web browser', about_config: 'Config folder',
  about_libs: 'FTP/FTPS: node:net · node:tls · SFTP: ssh2 · certificates: node:crypto',
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
