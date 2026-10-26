'use strict';

// Korean public-sector security checklists, mapped through CWE like the other
// category standards in compliance.js. Item titles are short descriptive names;
// numbering follows each guide's chapter order.
//
// - mois2021: 행정안전부 「소프트웨어 보안약점 진단가이드」(2021), implementation
//   phase, 49 weaknesses in 7 chapters. The 전자정부 SW 개발보안 가이드 and the
//   KISA 시큐어코딩 가이드 (Java / C / Android) use the same item set.
// - kisaWeb: 주요정보통신기반시설 기술적 취약점 분석·평가 — web application items
//   (two-letter codes), the list also used for 전자금융기반시설 web checks.

const T = (ko, en) => ({ ko, en });

const MOIS_GROUPS = {
  1: T('입력데이터 검증 및 표현', 'Input validation and representation'),
  2: T('보안기능', 'Security features'),
  3: T('시간 및 상태', 'Time and state'),
  4: T('에러처리', 'Error handling'),
  5: T('코드오류', 'Code errors'),
  6: T('캡슐화', 'Encapsulation'),
  7: T('API 오용', 'API misuse'),
};

const MOIS_ITEMS = [
  // 1. 입력데이터 검증 및 표현 (17)
  ['1.1', T('SQL 삽입', 'SQL injection'), [89, 564, 943]],
  ['1.2', T('코드 삽입', 'Code injection'), [94, 95, 96, 917]],
  ['1.3', T('경로 조작 및 자원 삽입', 'Path manipulation and resource injection'), [22, 23, 36, 73, 99, 641]],
  ['1.4', T('크로스사이트 스크립트', 'Cross-site scripting'), [79, 80, 83, 87]],
  ['1.5', T('운영체제 명령어 삽입', 'OS command injection'), [77, 78, 88]],
  ['1.6', T('위험한 형식 파일 업로드', 'Unrestricted dangerous file upload'), [434]],
  ['1.7', T('신뢰되지 않는 URL 주소로 자동접속 연결', 'Redirect to an untrusted URL'), [601]],
  ['1.8', T('부적절한 XML 외부 개체 참조', 'XML external entity reference'), [611, 776, 827]],
  ['1.9', T('XML 삽입', 'XML / XPath / XQuery injection'), [91, 643, 652]],
  ['1.10', T('LDAP 삽입', 'LDAP injection'), [90]],
  ['1.11', T('크로스사이트 요청 위조', 'Cross-site request forgery'), [352]],
  ['1.12', T('서버사이드 요청 위조', 'Server-side request forgery'), [918]],
  ['1.13', T('HTTP 응답분할', 'HTTP response splitting'), [113, 93, 644]],
  ['1.14', T('정수형 오버플로우', 'Integer overflow'), [190, 191, 680]],
  ['1.15', T('보안기능 결정에 사용되는 부적절한 입력값', 'Untrusted input in a security decision'), [807, 302, 784]],
  ['1.16', T('메모리 버퍼 오버플로우', 'Memory buffer overflow'), [119, 120, 121, 122, 124, 125, 126, 127, 131, 170, 787, 805, 806]],
  ['1.17', T('포맷 스트링 삽입', 'Format string injection'), [134]],
  // 2. 보안기능 (16)
  ['2.1', T('적절한 인증 없는 중요 기능 허용', 'Critical function without authentication'), [306, 287, 288]],
  ['2.2', T('부적절한 인가', 'Improper authorization'), [285, 862, 863, 639]],
  ['2.3', T('중요한 자원에 대한 잘못된 권한 설정', 'Incorrect permissions on critical resources'), [732, 276, 266, 281]],
  ['2.4', T('취약한 암호화 알고리즘 사용', 'Weak cryptographic algorithm'), [327, 328, 780, 916]],
  ['2.5', T('암호화되지 않은 중요정보', 'Sensitive data not encrypted'), [311, 312, 313, 314, 319, 523, 614]],
  ['2.6', T('하드코드된 중요정보', 'Hard-coded sensitive data'), [798, 259, 321, 547]],
  ['2.7', T('충분하지 않은 키 길이 사용', 'Insufficient key length'), [326]],
  ['2.8', T('적절하지 않은 난수 값 사용', 'Inadequate random values'), [330, 331, 335, 338]],
  ['2.9', T('취약한 비밀번호 허용', 'Weak passwords allowed'), [521, 263]],
  ['2.10', T('부적절한 전자서명 확인', 'Improper signature verification'), [347]],
  ['2.11', T('부적절한 인증서 유효성 검증', 'Improper certificate validation'), [295, 296, 297, 298, 299]],
  ['2.12', T('사용자 하드디스크에 저장되는 쿠키를 통한 정보 노출', 'Sensitive data in persistent cookies'), [539, 315, 1004]],
  ['2.13', T('주석문 안에 포함된 시스템 주요정보', 'Sensitive data in comments'), [615]],
  ['2.14', T('솔트 없이 일방향 해쉬 함수 사용', 'One-way hash without salt'), [759, 760]],
  ['2.15', T('무결성 검사 없는 코드 다운로드', 'Code download without integrity check'), [494, 829]],
  ['2.16', T('반복된 인증시도 제한 기능 부재', 'No limit on repeated authentication attempts'), [307]],
  // 3. 시간 및 상태 (2)
  ['3.1', T('경쟁조건: 검사시점과 사용시점(TOCTOU)', 'Race condition: time of check to time of use'), [367, 362, 366]],
  ['3.2', T('종료되지 않는 반복문 또는 재귀 함수', 'Loop or recursion that never ends'), [835, 674]],
  // 4. 에러처리 (3)
  ['4.1', T('오류 메시지 정보노출', 'Information exposure in error messages'), [209, 210, 211, 497, 550]],
  ['4.2', T('오류상황 대응 부재', 'No response to an error condition'), [390, 252, 391]],
  ['4.3', T('부적절한 예외 처리', 'Improper exception handling'), [754, 396, 397, 248, 703, 755]],
  // 5. 코드오류 (5)
  ['5.1', T('Null Pointer 역참조', 'NULL pointer dereference'), [476, 690]],
  ['5.2', T('부적절한 자원 해제', 'Improper resource release'), [404, 401, 772, 775, 459]],
  ['5.3', T('해제된 자원 사용', 'Use of a released resource'), [416, 415, 825]],
  ['5.4', T('초기화되지 않은 변수 사용', 'Use of an uninitialized variable'), [457, 908, 665]],
  ['5.5', T('신뢰할 수 없는 데이터의 역직렬화', 'Deserialization of untrusted data'), [502]],
  // 6. 캡슐화 (4)
  ['6.1', T('잘못된 세션에 의한 데이터 정보 노출', 'Data exposed to the wrong session'), [488, 543, 567]],
  ['6.2', T('제거되지 않고 남은 디버그 코드', 'Leftover debug code'), [489, 215, 11]],
  ['6.3', T('Public 메소드로부터 반환된 Private 배열', 'Private array returned from a public method'), [495]],
  ['6.4', T('Private 배열에 Public 데이터 할당', 'Public data assigned to a private array'), [496]],
  // 7. API 오용 (2)
  ['7.1', T('DNS lookup에 의존한 보안결정', 'Security decision based on DNS lookup'), [350, 247]],
  ['7.2', T('취약한 API 사용', 'Use of a dangerous API'), [242, 676, 227, 477, 558]],
];

const MOIS_2021 = {};
for (const [id, title, cwes] of MOIS_ITEMS) {
  const group = Number(id.split('.')[0]);
  MOIS_2021[id] = { title, cwes, group: MOIS_GROUPS[group] };
}

// 주요정보통신기반시설 web application items (code, title, CWEs).
const KISA_WEB_ITEMS = [
  ['BO', T('버퍼 오버플로우', 'Buffer overflow'), [119, 120, 121, 122, 787]],
  ['FS', T('포맷스트링', 'Format string'), [134]],
  ['LI', T('LDAP 인젝션', 'LDAP injection'), [90]],
  ['OC', T('운영체제 명령 실행', 'OS command execution'), [77, 78]],
  ['SI', T('SQL 인젝션', 'SQL injection'), [89, 564, 943]],
  ['SS', T('SSI 인젝션', 'SSI injection'), [97]],
  ['XI', T('XPath 인젝션', 'XPath injection'), [643, 652]],
  ['DI', T('디렉터리 인덱싱', 'Directory indexing'), [548]],
  ['IL', T('정보 누출', 'Information leakage'), [200, 209, 497, 532, 615]],
  ['CS', T('악성 콘텐츠', 'Malicious content'), [80, 434]],
  ['XS', T('크로스사이트 스크립팅', 'Cross-site scripting'), [79, 83, 87]],
  ['BF', T('약한 문자열 강도', 'Weak password strength'), [521, 307]],
  ['IA', T('불충분한 인증', 'Insufficient authentication'), [287, 306]],
  ['PR', T('취약한 패스워드 복구', 'Weak password recovery'), [640]],
  ['CF', T('크로스사이트 요청 위조', 'Cross-site request forgery'), [352]],
  ['SF', T('세션 예측', 'Predictable session identifier'), [330, 338, 6]],
  ['IN', T('불충분한 인가', 'Insufficient authorization'), [285, 862, 863, 639]],
  ['PV', T('프로세스 검증 누락', 'Missing process validation'), [841, 602]],
  ['FU', T('파일 업로드', 'File upload'), [434]],
  ['FD', T('파일 다운로드', 'File download'), [22, 23, 36]],
  ['SM', T('불충분한 세션 관리', 'Insufficient session management'), [613, 384, 614]],
  ['SN', T('데이터 평문 전송', 'Cleartext transmission'), [319, 311, 523]],
  ['CC', T('쿠키 변조', 'Cookie tampering'), [565, 784, 1004]],
  ['AE', T('관리자 페이지 노출', 'Exposed admin page'), [425, 749]],
  ['AU', T('자동화 공격', 'Automated attacks'), [307, 799]],
  ['WM', T('불필요한 Method 악용', 'Unneeded HTTP methods'), [650, 749]],
];

const KISA_WEB = {};
for (const [id, title, cwes] of KISA_WEB_ITEMS) KISA_WEB[id] = { title, cwes };

const KR_STANDARDS = {
  mois2021: { title: '행정안전부 SW 보안약점 진단가이드 2021 (49)', categories: MOIS_2021, stdKey: 'mois2021' },
  kisaWeb: { title: '주요정보통신기반시설 웹 취약점', categories: KISA_WEB, stdKey: 'kisaWeb' },
};

module.exports = { KR_STANDARDS, MOIS_2021, KISA_WEB, MOIS_GROUPS };
