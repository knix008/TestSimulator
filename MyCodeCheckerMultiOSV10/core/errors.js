'use strict';

// Error codes and Korean / English texts for the errors the API throws, so the
// GUI can show them in the user's language. serializeError keeps an error's own
// code and text; otherwise the message is matched against this table.

const TABLE = [
  [/^Project not found/, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.'],
  [/^Folder not found: (.*)/, 'NOT_FOUND', '폴더를 찾을 수 없습니다: $1'],
  [/^Unknown issue: (.*)/, 'NOT_FOUND', '이슈를 찾을 수 없습니다: $1'],
  [/^Unknown analysis job/, 'NOT_FOUND', '분석 작업을 찾을 수 없습니다.'],
  [/^Unknown database job/, 'NOT_FOUND', 'DB 저장 작업을 찾을 수 없습니다.'],
  [/^An analysis of this project is running/, 'CONFLICT', '이 프로젝트를 분석하는 중입니다. 분석이 끝난 뒤 다시 하십시오.'],
  [/^This export was started by another user/, 'FORBIDDEN', '다른 사용자가 시작한 DB 저장입니다.'],
  [/^No analysis/, 'NOT_FOUND', '아직 분석 결과가 없습니다. 먼저 분석하십시오.'],
  [/^Invalid path/, 'BAD_REQUEST', '잘못된 경로입니다.'],
  [/^Invalid (status|resolution|classification): (.*)/, 'BAD_REQUEST', '잘못된 값입니다($1): $2'],
  [/^Unknown review action: (.*)/, 'BAD_REQUEST', '알 수 없는 검토 동작입니다: $1'],
  [/^A reason is required/, 'BAD_REQUEST', '사유를 입력하십시오.'],
  [/^This change needs an approved exception request/, 'APPROVAL_REQUIRED', '이 변경은 승인된 예외 신청이 필요합니다.'],
  [/^Analysis cancelled/, 'CANCELLED', '분석을 취소했습니다.'],
  [/^The analysis ran out of memory \((.*)\)/, 'OUT_OF_MEMORY', '분석 중 메모리가 부족합니다($1). 제외 폴더로 외부 라이브러리·생성 코드를 빼고 다시 분석하십시오.'],
  [/^This analysis was started by another user/, 'FORBIDDEN', '다른 사용자가 시작한 분석입니다.'],
  [/^At least one active administrator must remain/, 'LAST_ADMIN', '활성 관리자가 한 명 이상 남아 있어야 합니다.'],
  [/^Cannot deactivate the last administrator/, 'LAST_ADMIN', '마지막 관리자는 비활성화할 수 없습니다.'],
  [/^Set a password for an administrator before enabling permissions/, 'BAD_REQUEST', '권한을 켜기 전에 관리자 비밀번호를 설정하십시오.'],
  [/^Cron needs 5 fields/, 'BAD_REQUEST', 'Cron 식은 5개 필드(분 시 일 월 요일)가 필요합니다.'],
  [/^Bad cron (\w+) field: (.*)/, 'BAD_REQUEST', 'Cron $1 필드가 잘못되었습니다: $2'],
  [/^Cron (\w+) out of range: (.*)/, 'BAD_REQUEST', 'Cron $1 값이 범위를 벗어났습니다: $2'],
  [/^A schedule needs kind/, 'BAD_REQUEST', '일정 종류는 "scan" 또는 "dast"여야 합니다.'],
  [/^A scan schedule needs a project or a folder/, 'BAD_REQUEST', '분석 일정에는 프로젝트나 폴더가 필요합니다.'],
  [/^A DAST schedule needs a target URL/, 'BAD_REQUEST', 'DAST 일정에는 대상 URL이 필요합니다.'],
  [/^Login must be/, 'BAD_REQUEST', '로그인 ID는 영문·숫자·. _ @ - 로 2~255자여야 합니다.'],
  [/^User already exists: (.*)/, 'CONFLICT', '이미 있는 사용자입니다: $1'],
  [/^No such user: (.*)/, 'NOT_FOUND', '사용자를 찾을 수 없습니다: $1'],
  [/^No such active user: (.*)/, 'NOT_FOUND', '활성 사용자를 찾을 수 없습니다: $1'],
  [/^No such user or group/, 'NOT_FOUND', '사용자나 그룹을 찾을 수 없습니다.'],
  [/^Password must be at least 8 characters/, 'BAD_REQUEST', '비밀번호는 8자 이상이어야 합니다.'],
  [/^Invalid group name/, 'BAD_REQUEST', '잘못된 그룹 이름입니다.'],
  [/^Group already exists: (.*)/, 'CONFLICT', '이미 있는 그룹입니다: $1'],
  [/^Built-in groups cannot be deleted/, 'BAD_REQUEST', '기본 그룹은 삭제할 수 없습니다.'],
  [/^Unknown permission: (.*)/, 'BAD_REQUEST', '알 수 없는 권한입니다: $1'],
  [/^Template name is required/, 'BAD_REQUEST', '템플릿 이름을 입력하십시오.'],
  [/^Project key pattern is not a valid regular expression/, 'BAD_REQUEST', '프로젝트 키 패턴이 올바른 정규식이 아닙니다.'],
  [/^No such template/, 'NOT_FOUND', '템플릿을 찾을 수 없습니다.'],
  [/^Unknown token type: (.*)/, 'BAD_REQUEST', '알 수 없는 토큰 종류입니다: $1'],
  [/^A project analysis token needs a project/, 'BAD_REQUEST', '프로젝트 분석 토큰에는 프로젝트가 필요합니다.'],
  [/^Token name is required/, 'BAD_REQUEST', '토큰 이름을 입력하십시오.'],
  [/^Token name already used: (.*)/, 'CONFLICT', '이미 쓰는 토큰 이름입니다: $1'],
  [/^Invalid login/, 'UNAUTHORIZED', '로그인 ID나 비밀번호가 맞지 않습니다.'],
  [/^Unknown report kind/, 'BAD_REQUEST', '알 수 없는 보고서 종류입니다.'],
  [/^Unknown API: (.*)/, 'NO_METHOD', '알 수 없는 API입니다: $1'],
];

// Fallback texts by code, for errors that carry a code but no table entry.
const BY_CODE = {
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '이 작업을 할 권한이 없습니다.',
  NOT_FOUND: '대상을 찾을 수 없습니다.',
  BAD_REQUEST: '요청이 올바르지 않습니다.',
  CONFLICT: '이미 있는 항목입니다.',
};

function describe(err) {
  const message = (err && err.message) || String(err);
  if (err && err.text && err.text.ko) return { code: err.code || 'ERROR', text: err.text };
  for (const [re, code, ko] of TABLE) {
    const m = message.match(re);
    if (m) return { code: (err && err.code) || code, text: { en: message, ko: ko.replace(/\$(\d)/g, (_, i) => m[Number(i)] || '') } };
  }
  const code = (err && err.code) || 'ERROR';
  return { code, text: { en: message, ko: BY_CODE[code] ? `${BY_CODE[code]} (${message})` : message } };
}

module.exports = { describe, TABLE };
