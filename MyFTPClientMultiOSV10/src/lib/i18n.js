// Tiny i18n: `t(key, params)` with Korean (the reference UI) and English.
import { useSyncExternalStore } from 'react';

const ko = {
  appName: 'My FTP Client V1.0',
  ready: '준비됨', ready_log: '준비됨.',

  // connection bar
  lbl_protocol: 'Protocol', lbl_host: 'Host', lbl_port: 'Port', lbl_user: 'User', lbl_password: 'Password', lbl_profile: 'Profile',
  connect: 'Connect', disconnect: 'Disconnect', connecting: '연결 중…',
  profile_save: '저장', profile_delete: '삭제', profile_none: '(프로파일 없음)', profile_select: '프로파일 선택',
  tip_connect: '서버에 연결 (Enter)', tip_disconnect: '연결 해제', tip_profile_save: '현재 접속 정보를 프로파일로 저장', tip_profile_delete: '저장된 프로파일 삭제',
  history: '접속 히스토리', tip_history: '최근에 접속한 서버 (프로파일 저장 여부와 무관)', history_empty: '(접속 기록 없음)', history_clear: '히스토리 지우기', history_times: '{n}회', log_history_loaded: '히스토리에서 불러옴: {url}',

  // panels
  server: '서버 (Server)', local: '로컬 (Local)', log: '로그 (Log)', drives: '드라이브 선택',
  parent_dir: '[..]', loading: '로딩 중…', access_denied: '[접근 거부]', not_connected_hint: '서버에 연결하면 여기에 파일 목록이 표시됩니다.',
  col_name: '이름', col_size: '크기', col_date: '수정일',
  dir_marker: '<DIR>', folder: '폴더', file: '파일',
  items_count: '{n}개 항목', selected_count: '{n}개 선택',
  upload_btn: '업로드  ←  로컬 → 서버', download_btn: '다운로드  →  서버 → 로컬', drag_resize: '드래그하여 패널 너비 조절',
  log_clear: '로그 지우기', log_copy: '로그 복사', log_copied: '로그를 클립보드에 복사했습니다.',

  // context menus
  ctx_download: '다운로드', ctx_upload: '업로드', ctx_refresh: '새로 고침', ctx_reveal: '탐색기에서 열기', ctx_open: '열기',
  ctx_new_folder: '새 폴더', ctx_rename: '이름 바꾸기', ctx_delete: '삭제', ctx_go_parent: '상위 폴더로', ctx_go_home: '홈 폴더로',
  ctx_copy_path: '경로 복사',

  // status / log messages
  status_connecting: '연결 중... {url}', log_connecting: '{protocol} 연결 시도 중...  host={host}  port={port}  user={user}',
  status_connected: '연결됨 — {url}', log_connected: '연결 성공: {url}',
  status_connect_failed: '연결 실패', log_connect_failed: '연결 실패: {msg}',
  status_timeout: '연결 시간 초과', log_timeout: '연결 시간 초과 (30초)',
  status_disconnected: '연결 해제됨', log_disconnected: '연결 해제됨.', status_connect_cancelled: '연결 취소됨', log_connect_cancelled: '연결이 취소되었습니다.',
  status_server_loading: '서버 로드 중: {path}', log_server_dir: '서버 디렉토리: {path}', status_server: '서버: {path}  ({n}개 항목)',
  status_server_failed: '서버 목록 조회 실패', log_server_failed: '서버 목록 오류: {msg}',
  status_local: '로컬: {path}', log_local_failed: '로컬 목록 오류: {msg}',
  log_download_start: '다운로드 시작: {src}  →  {dest}', log_download_done: '다운로드 완료: {name}', status_download_done: '다운로드 완료: {name}',
  log_download_failed: '다운로드 실패: {msg}', status_download_failed: '다운로드 실패', log_download_cancelled: '다운로드 취소됨: {name}', status_download_cancelled: '다운로드 취소됨',
  log_upload_start: '업로드 시작: {src}  →  {dest}', log_upload_done: '업로드 완료: {name}', status_upload_done: '업로드 완료: {name}',
  log_upload_failed: '업로드 실패: {msg}', status_upload_failed: '업로드 실패', log_upload_cancelled: '업로드 취소됨: {name}', status_upload_cancelled: '업로드 취소됨',
  status_transfer: '{verb}: {name}  {pct}%  {speed}  ({done}/{total})', verb_download: '다운로드', verb_upload: '업로드',
  transfer_summary: '{n}개 파일', transfer_skipped: ', {n}개 건너뜀',
  log_file_done: '  {arrow} {src}  →  {dest}   {size}  {time}', log_file_skipped: '  {arrow} {src}  건너뜀 (이미 있음)',
  log_profile_loaded: '프로파일 로드: {name}', log_profile_added: '프로파일 추가: {name}', log_profile_updated: '프로파일 수정: {name}', log_profile_deleted: '프로파일 삭제: {names}',
  log_mkdir: '폴더 생성: {path}', log_renamed: '이름 변경: {from} → {to}', log_deleted: '삭제: {n}개 항목', log_delete_failed: '삭제 실패: {msg}',
  status_deleting: '삭제 중: {name}',
  status_cancel: '취소',

  // dialogs
  ok: '확인', cancel: '취소', close: '닫기', yes: '예', no: '아니요',
  dlg_connect_error: '연결 오류', host_required: '호스트를 입력하세요.', dlg_timeout: '연결 시간 초과',
  timeout_msg: '30초 이내에 서버에 연결하지 못했습니다.\n호스트 주소와 포트를 확인하세요.',
  dlg_connected: '연결 성공', connected_msg: '연결이 완료되었습니다.\n\n프로토콜: {protocol}\n호스트: {host}\n포트: {port}\n사용자: {user}',
  dlg_list_error: '디렉토리 조회 오류', dlg_download_error: '다운로드 오류', dlg_upload_error: '업로드 오류', dlg_delete_error: '삭제 오류',
  dlg_error: '오류', not_connected: '서버에 연결되어 있지 않습니다.', nothing_selected: '항목을 선택하세요.',
  dlg_profile_save: '프로파일 저장', lbl_profile_name: '프로파일 이름:',
  dlg_profile_delete: '프로파일 삭제', profile_delete_hint: '삭제할 프로파일을 선택하세요:', no_profiles: '저장된 프로파일이 없습니다.', notice: '알림',
  dlg_profile_delete_confirm: '삭제 확인', profile_delete_confirm: '선택한 {n}개 프로파일을 삭제하시겠습니까?\n\n{list}',
  dlg_new_folder: '새 폴더 만들기', lbl_folder_name: '폴더 이름:', default_folder: '새 폴더',
  dlg_rename: '이름 바꾸기', lbl_new_name: '새 이름:',
  dlg_delete: '삭제', delete_confirm_one: "'{name}'을(를) 삭제하시겠습니까?", delete_confirm_many: '선택한 {n}개 항목을 삭제하시겠습니까?',
  delete_confirm_remote: '\n(서버에서 영구 삭제되며 복구할 수 없습니다.)', delete_confirm_local: '\n(휴지통을 거치지 않고 바로 삭제됩니다.)',
  conflict_title_download: '다운로드 — 파일 충돌', conflict_title_upload: '업로드 — 파일 충돌',
  conflict_msg: '대상에 같은 이름의 {kind}이(가) 이미 있습니다.\n\n  {name}\n\n경로:\n  {path}\n\n덮어쓰시겠습니까?',
  overwrite: '덮어쓰기', skip: '건너뛰기', apply_all: '이후 항목에도 동일하게 적용',
  copy_details: '자세한 내용 복사', copied_details: '오류 내용을 클립보드에 복사했습니다.', error_details: '자세한 내용', error_hint: '내용을 선택하여 복사할 수 있습니다.',
  error_unexpected: '예상하지 못한 오류가 발생했습니다.', error_code: '코드', error_path: '경로',
  reveal_unsupported: '웹 버전에서는 탐색기를 열 수 없습니다.',

  // toolbar / settings / about
  theme: '테마', next_theme: '다음 테마', tip_theme: '테마 선택 (16가지)', tip_next_theme: '다음 테마로 전환: {theme}', tip_language: '한국어 / English',
  settings: '설정', tip_settings: '설정', settings_title: '설정', menu_info: '정보', tip_about: '프로그램 정보',
  win_minimize: '최소화', win_maximize: '최대화', win_restore: '이전 크기로', win_close: '닫기', win_resize: '드래그하여 창 크기 조절',
  set_language: '언어', set_theme: '테마', set_font_size: '글꼴 크기',
  set_confirm_delete: '삭제 전에 확인', set_restore_local: '시작할 때 마지막 로컬 폴더 복원', set_sounds: '성공/오류 알림음', set_connected_dialog: '연결 성공 시 안내 창 표시',
  about_title: '프로그램 정보', about_desc: 'Windows / macOS / Linux / 웹용 FTP · FTPS · SFTP 클라이언트',
  version: '버전', author: '제작자', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: '빌드', about_host: '실행 환경', host_electron: '데스크톱 (Electron)', host_web: '웹 브라우저',
  about_libs: 'FTP/FTPS: basic-ftp · SFTP: ssh2',
};

const en = {
  appName: 'My FTP Client V1.0',
  ready: 'Ready', ready_log: 'Ready.',

  lbl_protocol: 'Protocol', lbl_host: 'Host', lbl_port: 'Port', lbl_user: 'User', lbl_password: 'Password', lbl_profile: 'Profile',
  connect: 'Connect', disconnect: 'Disconnect', connecting: 'Connecting…',
  profile_save: 'Save', profile_delete: 'Delete', profile_none: '(no profiles)', profile_select: 'Choose a profile',
  tip_connect: 'Connect to the server (Enter)', tip_disconnect: 'Disconnect', tip_profile_save: 'Save the connection details as a profile', tip_profile_delete: 'Delete saved profiles',
  history: 'History', tip_history: 'Recently connected servers (with or without a profile)', history_empty: '(no connections yet)', history_clear: 'Clear history', history_times: '{n}×', log_history_loaded: 'Loaded from history: {url}',

  server: 'Server', local: 'Local', log: 'Log', drives: 'Choose a drive',
  parent_dir: '[..]', loading: 'Loading…', access_denied: '[access denied]', not_connected_hint: 'Connect to a server to list its files here.',
  col_name: 'Name', col_size: 'Size', col_date: 'Modified',
  dir_marker: '<DIR>', folder: 'folder', file: 'file',
  items_count: '{n} items', selected_count: '{n} selected',
  upload_btn: 'Upload  ←  local → server', download_btn: 'Download  →  server → local', drag_resize: 'Drag to resize the panels',
  log_clear: 'Clear log', log_copy: 'Copy log', log_copied: 'Log copied to the clipboard.',

  ctx_download: 'Download', ctx_upload: 'Upload', ctx_refresh: 'Refresh', ctx_reveal: 'Show in file manager', ctx_open: 'Open',
  ctx_new_folder: 'New folder', ctx_rename: 'Rename', ctx_delete: 'Delete', ctx_go_parent: 'Go to parent folder', ctx_go_home: 'Go to home folder',
  ctx_copy_path: 'Copy path',

  status_connecting: 'Connecting… {url}', log_connecting: 'Connecting with {protocol}…  host={host}  port={port}  user={user}',
  status_connected: 'Connected — {url}', log_connected: 'Connected: {url}',
  status_connect_failed: 'Connection failed', log_connect_failed: 'Connection failed: {msg}',
  status_timeout: 'Connection timed out', log_timeout: 'Connection timed out (30 s)',
  status_disconnected: 'Disconnected', log_disconnected: 'Disconnected.', status_connect_cancelled: 'Connection cancelled', log_connect_cancelled: 'Connection cancelled.',
  status_server_loading: 'Loading server folder: {path}', log_server_dir: 'Server folder: {path}', status_server: 'Server: {path}  ({n} items)',
  status_server_failed: 'Server listing failed', log_server_failed: 'Server listing error: {msg}',
  status_local: 'Local: {path}', log_local_failed: 'Local listing error: {msg}',
  log_download_start: 'Download started: {src}  →  {dest}', log_download_done: 'Download finished: {name}', status_download_done: 'Download finished: {name}',
  log_download_failed: 'Download failed: {msg}', status_download_failed: 'Download failed', log_download_cancelled: 'Download cancelled: {name}', status_download_cancelled: 'Download cancelled',
  log_upload_start: 'Upload started: {src}  →  {dest}', log_upload_done: 'Upload finished: {name}', status_upload_done: 'Upload finished: {name}',
  log_upload_failed: 'Upload failed: {msg}', status_upload_failed: 'Upload failed', log_upload_cancelled: 'Upload cancelled: {name}', status_upload_cancelled: 'Upload cancelled',
  status_transfer: '{verb}: {name}  {pct}%  {speed}  ({done}/{total})', verb_download: 'Downloading', verb_upload: 'Uploading',
  transfer_summary: '{n} file(s)', transfer_skipped: ', {n} skipped',
  log_file_done: '  {arrow} {src}  →  {dest}   {size}  {time}', log_file_skipped: '  {arrow} {src}  skipped (already exists)',
  log_profile_loaded: 'Profile loaded: {name}', log_profile_added: 'Profile added: {name}', log_profile_updated: 'Profile updated: {name}', log_profile_deleted: 'Profile deleted: {names}',
  log_mkdir: 'Folder created: {path}', log_renamed: 'Renamed: {from} → {to}', log_deleted: 'Deleted {n} item(s)', log_delete_failed: 'Delete failed: {msg}',
  status_deleting: 'Deleting: {name}',
  status_cancel: 'Cancel',

  ok: 'OK', cancel: 'Cancel', close: 'Close', yes: 'Yes', no: 'No',
  dlg_connect_error: 'Connection error', host_required: 'Enter a host name.', dlg_timeout: 'Connection timed out',
  timeout_msg: 'The server did not answer within 30 seconds.\nCheck the host address and the port.',
  dlg_connected: 'Connected', connected_msg: 'The connection is established.\n\nProtocol: {protocol}\nHost: {host}\nPort: {port}\nUser: {user}',
  dlg_list_error: 'Listing error', dlg_download_error: 'Download error', dlg_upload_error: 'Upload error', dlg_delete_error: 'Delete error',
  dlg_error: 'Error', not_connected: 'Not connected to a server.', nothing_selected: 'Select an item first.',
  dlg_profile_save: 'Save profile', lbl_profile_name: 'Profile name:',
  dlg_profile_delete: 'Delete profiles', profile_delete_hint: 'Choose the profiles to delete:', no_profiles: 'There are no saved profiles.', notice: 'Notice',
  dlg_profile_delete_confirm: 'Confirm delete', profile_delete_confirm: 'Delete the {n} selected profile(s)?\n\n{list}',
  dlg_new_folder: 'New folder', lbl_folder_name: 'Folder name:', default_folder: 'New Folder',
  dlg_rename: 'Rename', lbl_new_name: 'New name:',
  dlg_delete: 'Delete', delete_confirm_one: "Delete '{name}'?", delete_confirm_many: 'Delete the {n} selected items?',
  delete_confirm_remote: '\n(Removed permanently from the server — this cannot be undone.)', delete_confirm_local: '\n(Deleted immediately, bypassing the Trash.)',
  conflict_title_download: 'Download — file conflict', conflict_title_upload: 'Upload — file conflict',
  conflict_msg: 'A {kind} with the same name already exists at the destination.\n\n  {name}\n\nPath:\n  {path}\n\nOverwrite it?',
  overwrite: 'Overwrite', skip: 'Skip', apply_all: 'Apply to all remaining items',
  copy_details: 'Copy details', copied_details: 'Error details copied to the clipboard.', error_details: 'Details', error_hint: 'The text can be selected and copied.',
  error_unexpected: 'An unexpected error occurred.', error_code: 'Code', error_path: 'Path',
  reveal_unsupported: 'The file manager cannot be opened from the web version.',

  theme: 'Theme', next_theme: 'Next theme', tip_theme: 'Choose a theme (16 built in)', tip_next_theme: 'Switch to the next theme: {theme}', tip_language: '한국어 / English',
  settings: 'Settings', tip_settings: 'Settings', settings_title: 'Settings', menu_info: 'Info', tip_about: 'About My FTP Client',
  win_minimize: 'Minimize', win_maximize: 'Maximize', win_restore: 'Restore', win_close: 'Close', win_resize: 'Drag to resize the window',
  set_language: 'Language', set_theme: 'Theme', set_font_size: 'Font size',
  set_confirm_delete: 'Confirm before deleting', set_restore_local: 'Restore the last local folder on start', set_sounds: 'Success / error sounds', set_connected_dialog: 'Show a dialog after connecting',
  about_title: 'About', about_desc: 'FTP · FTPS · SFTP client for Windows / macOS / Linux / the web',
  version: 'Version', author: 'Author', author_name: 'SHKWON (knix008@naver.com)', copyright: 'Copyright © 2026 SHKWON',
  about_build: 'Build', about_host: 'Running on', host_electron: 'Desktop (Electron)', host_web: 'Web browser',
  about_libs: 'FTP/FTPS: basic-ftp · SFTP: ssh2',
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
