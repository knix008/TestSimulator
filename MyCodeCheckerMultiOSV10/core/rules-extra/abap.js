'use strict';

// SAP ABAP. Open SQL hygiene, dynamic code, kernel calls, authority checks
// and debugging leftovers, following the SonarQube ABAP pack.

const { maker } = require('./util');

const R = maker('abap', ['abap']);

// ── Bugs ─────────────────────────────────────────────────────
R('break-point', 'B', 'CR', 5, ['debug'],
  /^\s*(?:BREAK-POINT|BREAK\s+[\w-]+)\s*\./i,
  ['BREAK-POINT left in the code', 'A hard break-point stops dialog users in the debugger and dumps background jobs.', 'Remove it, or use a checkpoint group with LOG-POINT.'],
  ['BREAK-POINT가 남아 있습니다', '고정 중단점은 대화 사용자를 디버거에 세우고 백그라운드 작업을 덤프시킵니다.', '지우거나 체크포인트 그룹과 LOG-POINT를 쓰세요.'],
  'BREAK-POINT.', 'LOG-POINT ID zcheck.', { sonar: 'S4507' });
R('call-function-no-exceptions', 'B', 'MA', 10, ['error-handling'],
  /^\s*CALL\s+FUNCTION\s+'[\w\/]+'\s*\.\s*$/i,
  ['CALL FUNCTION without EXCEPTIONS', 'Without an EXCEPTIONS clause any classic exception of the module causes a short dump, and SY-SUBRC is never set.', 'Add EXCEPTIONS with OTHERS and check SY-SUBRC afterwards.'],
  ['EXCEPTIONS 없는 CALL FUNCTION입니다', 'EXCEPTIONS 절이 없으면 모듈의 고전 예외가 모두 단기 덤프를 일으키고 SY-SUBRC는 설정되지 않습니다.', 'OTHERS를 포함한 EXCEPTIONS를 넣고 뒤에서 SY-SUBRC를 확인하세요.'],
  "CALL FUNCTION 'Z_UPDATE_STOCK'.", "CALL FUNCTION 'Z_UPDATE_STOCK' EXPORTING iv_matnr = lv_matnr EXCEPTIONS OTHERS = 1.");
R('catch-cx-root', 'S', 'MA', 10, ['error-handling', 'cwe-396'],
  /\bCATCH\s+cx_root\b/i,
  ['Catching CX_ROOT', 'CX_ROOT catches every exception, including programming errors.', 'Catch the specific exception classes you expect.'],
  ['CX_ROOT를 잡습니다', 'CX_ROOT는 프로그래밍 오류를 포함해 모든 예외를 잡습니다.', '예상하는 구체적인 예외 클래스를 잡으세요.'],
  'CATCH cx_root INTO DATA(lx).', 'CATCH cx_sy_open_sql_db INTO DATA(lx).');
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /\bCATCH\s+[\w\s]+?(?:INTO\s+(?:DATA\s*\(\s*\w+\s*\)|\w+))?\s*\.\s*ENDTRY\s*\./i,
  ['Empty CATCH block', 'The exception is silently ignored.', 'Log or handle the exception.'],
  ['빈 CATCH 블록입니다', '예외를 아무 말 없이 무시합니다.', '예외를 기록하거나 처리하세요.'],
  'CATCH cx_sy_zerodivide. ENDTRY.', 'CATCH cx_sy_zerodivide. lv_result = 0. ENDTRY.', { sonar: 'S108' });
R('select-in-loop', 'B', 'MA', 15, ['performance', 'sql'],
  /^\s*LOOP\s+AT\b(?:(?!\bENDLOOP\b).)*\.\s*SELECT\b/i,
  ['SELECT inside a LOOP', 'One database round trip per row is very slow.', 'Read all rows once with FOR ALL ENTRIES or a JOIN.'],
  ['LOOP 안에서 SELECT를 합니다', '행마다 데이터베이스를 오가면 매우 느립니다.', 'FOR ALL ENTRIES나 JOIN으로 한 번에 읽으세요.'],
  'LOOP AT lt_orders INTO DATA(ls_order). SELECT SINGLE * FROM kna1 INTO @DATA(ls_kna1) WHERE kunnr = @ls_order-kunnr.', "SELECT kunnr, name1 FROM kna1 FOR ALL ENTRIES IN @lt_orders WHERE kunnr = @lt_orders-kunnr INTO TABLE @DATA(lt_kna1).");
R('for-all-entries-unchecked', 'B', 'CR', 10, ['sql'],
  /\bFOR\s+ALL\s+ENTRIES\s+IN\b/i,
  ['FOR ALL ENTRIES on a table that may be empty', 'With an empty driver table the WHERE condition is dropped and every row is read.', 'Check IF lt_driver IS NOT INITIAL before the SELECT.'],
  ['비어 있을 수 있는 테이블로 FOR ALL ENTRIES를 씁니다', '구동 테이블이 비면 WHERE 조건이 빠져 모든 행을 읽습니다.', 'SELECT 전에 IF lt_driver IS NOT INITIAL을 확인하세요.'],
  'SELECT matnr FROM mara FOR ALL ENTRIES IN @lt_items WHERE matnr = @lt_items-matnr INTO TABLE @lt_mara.', 'IF lt_items IS NOT INITIAL. SELECT matnr FROM mara FOR ALL ENTRIES IN @lt_items WHERE matnr = @lt_items-matnr INTO TABLE @lt_mara. ENDIF.',
  { skip: (raw) => /IS\s+NOT\s+INITIAL/i.test(raw) });
R('modify-db-without-where', 'B', 'CR', 15, ['sql'],
  /^\s*(?:DELETE\s+FROM|UPDATE)\s+[\w\/]+\s*(?:SET\b(?!.*\bWHERE\b)[^.]*)?\.\s*$/i,
  ['DELETE / UPDATE on a database table without WHERE', 'Every row of the table is changed.', 'Add a WHERE clause.'],
  ['WHERE 없이 DB 테이블을 DELETE / UPDATE합니다', '테이블의 모든 행이 바뀝니다.', 'WHERE 절을 넣으세요.'],
  'DELETE FROM zorders.', "DELETE FROM zorders WHERE status = 'X'.");
R('commit-work-in-loop', 'B', 'MA', 10, ['transactions'],
  /\bLOOP\s+AT\b(?:(?!\bENDLOOP\b).)*\bCOMMIT\s+WORK\b/i,
  ['COMMIT WORK inside a LOOP', 'Committing per row breaks the logical unit of work and is slow.', 'Commit once after the loop.'],
  ['LOOP 안에서 COMMIT WORK를 합니다', '행마다 커밋하면 논리 작업 단위가 깨지고 느립니다.', '루프 뒤에 한 번 커밋하세요.'],
  'LOOP AT lt_docs INTO DATA(ls_doc). PERFORM post USING ls_doc. COMMIT WORK. ENDLOOP.', 'LOOP AT lt_docs INTO DATA(ls_doc). PERFORM post USING ls_doc. ENDLOOP. COMMIT WORK.');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('call-system', 'V', 'BL', 30, ['cwe-78', 'owasp-a03'],
  /\bCALL\s+'SYSTEM'/i,
  ["CALL 'SYSTEM'", 'The kernel call runs operating system commands as the SAP system user.', 'Use SXPG_COMMAND_EXECUTE with a defined external command.'],
  ["CALL 'SYSTEM'을 씁니다", '커널 호출은 SAP 시스템 사용자로 운영체제 명령을 실행합니다.', '정의된 외부 명령과 함께 SXPG_COMMAND_EXECUTE를 쓰세요.'],
  "CALL 'SYSTEM' ID 'COMMAND' FIELD lv_cmd.", "CALL FUNCTION 'SXPG_COMMAND_EXECUTE' EXPORTING commandname = 'ZLIST_FILES' EXCEPTIONS OTHERS = 1.");
R('kernel-call', 'H', 'MA', 15, ['cwe-250'],
  /\bCALL\s+'(?!SYSTEM')[A-Z_]+'\s+ID\b/i,
  ['Direct kernel call', 'Kernel calls bypass the documented interfaces and their checks.', 'Use the released function modules or classes.'],
  ['커널을 직접 호출합니다', '커널 호출은 문서화된 인터페이스와 그 검사를 우회합니다.', '릴리스된 함수 모듈이나 클래스를 쓰세요.'],
  "CALL 'C_SAPGPARAM' ID 'NAME' FIELD lv_name.", "CALL FUNCTION 'RSPARAM_GET' EXCEPTIONS OTHERS = 1.");
R('dynamic-where', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bWHERE\s+\(\s*\w+\s*\)/i,
  ['Dynamic WHERE clause', 'A WHERE condition built from input can change the query.', 'Use static conditions with host variables, or escape with CL_ABAP_DYN_PRG.'],
  ['동적 WHERE 절입니다', '입력으로 만든 WHERE 조건은 질의를 바꿀 수 있습니다.', '호스트 변수를 쓰는 정적 조건을 쓰거나 CL_ABAP_DYN_PRG로 이스케이프하세요.'],
  'SELECT * FROM zusers WHERE (lv_where) INTO TABLE @lt_users.', 'SELECT * FROM zusers WHERE uname = @lv_user INTO TABLE @lt_users.', { sonar: 'S2077' });
R('dynamic-table', 'H', 'MA', 15, ['sql', 'cwe-89'],
  /\b(?:FROM|UPDATE|INTO|MODIFY|DELETE\s+FROM)\s+\(\s*\w+\s*\)/i,
  ['Dynamic table name', 'A table name from input lets the caller read or change any table.', 'Check the name against an allow list or with CL_ABAP_DYN_PRG=>CHECK_TABLE_NAME_STR.'],
  ['동적 테이블 이름입니다', '입력에서 온 테이블 이름으로 아무 테이블이나 읽거나 바꿀 수 있습니다.', '허용 목록이나 CL_ABAP_DYN_PRG=>CHECK_TABLE_NAME_STR로 이름을 검사하세요.'],
  'SELECT * FROM (lv_table) INTO TABLE @<lt_data>.', 'SELECT * FROM zorders INTO TABLE @lt_orders.');
R('generate-subroutine', 'V', 'CR', 30, ['cwe-94', 'owasp-a03'],
  /\b(?:GENERATE\s+SUBROUTINE\s+POOL|INSERT\s+REPORT|GENERATE\s+REPORT)\b/i,
  ['Code generated at run time', 'Generating and running ABAP from data allows code injection.', 'Use fixed code and configuration instead.'],
  ['실행 중에 코드를 만듭니다', '데이터로 ABAP를 만들어 실행하면 코드 인젝션을 허용합니다.', '고정된 코드와 설정을 쓰세요.'],
  'GENERATE SUBROUTINE POOL lt_code NAME lv_prog.', 'PERFORM process IN PROGRAM zfixed_logic.');
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret)\w*\s*(?:TYPE\s+\w+\s+VALUE\s+|=\s*)['`][^'`\s]{4,}['`]/i,
  ['Hard-coded password', 'Anyone with access to the source can read the password.', 'Use the Secure Store (SSF / SECSTORE) or an RFC destination.'],
  ['비밀번호를 코드에 적었습니다', '소스에 접근할 수 있는 누구나 비밀번호를 읽을 수 있습니다.', 'Secure Store(SSF / SECSTORE)나 RFC 목적지를 쓰세요.'],
  "DATA lv_password TYPE string VALUE 'Init1234'.", "DATA lv_password TYPE string.", { sonar: 'S2068' });
R('hardcoded-user', 'V', 'MA', 15, ['cwe-798', 'privileges'],
  /\bsy-uname\s*(?:=|EQ|<>|NE)\s*'[A-Z0-9_]+'/i,
  ['Logic tied to a hard-coded user name', 'Special handling for one user is a backdoor and breaks when people change.', 'Use authorisation objects with AUTHORITY-CHECK.'],
  ['코드에 적은 사용자 이름에 로직을 묶습니다', '특정 사용자만 다르게 처리하면 백도어가 되고 사람이 바뀌면 깨집니다.', 'AUTHORITY-CHECK와 권한 객체를 쓰세요.'],
  "IF sy-uname = 'JSMITH'.", "AUTHORITY-CHECK OBJECT 'Z_ADMIN' ID 'ACTVT' FIELD '02'.");
R('client-specified', 'H', 'MA', 10, ['cwe-639', 'sql'],
  /\b(?:CLIENT\s+SPECIFIED|USING\s+(?:ALL\s+)?CLIENTS?\b)/i,
  ['Cross-client database access', 'CLIENT SPECIFIED reads or changes data of other clients.', 'Stay in the logon client, or restrict and check the client explicitly.'],
  ['클라이언트를 넘나드는 DB 접근입니다', 'CLIENT SPECIFIED는 다른 클라이언트의 데이터를 읽거나 바꿉니다.', '로그온 클라이언트에 머물거나 클라이언트를 명시적으로 제한하고 확인하세요.'],
  'SELECT * FROM usr02 CLIENT SPECIFIED INTO TABLE @lt_users.', 'SELECT bname FROM usr02 INTO TABLE @lt_users.');
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /['`|]http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/i,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  "cl_http_client=>create_by_url( EXPORTING url = 'http://api.example.com' IMPORTING client = lo_client ).", "cl_http_client=>create_by_url( EXPORTING url = 'https://api.example.com' IMPORTING client = lo_client ).", { sonar: 'S5332' });

// ── Code smells ──────────────────────────────────────────────
R('select-star', 'S', 'MA', 5, ['sql', 'performance'],
  /\bSELECT\s+(?:SINGLE\s+)?\*\s+FROM\b/i,
  ['SELECT *', 'SELECT * reads every column and breaks when the table changes.', 'List the fields you need.'],
  ['SELECT *를 씁니다', 'SELECT *는 모든 열을 읽고 테이블이 바뀌면 깨집니다.', '필요한 필드를 나열하세요.'],
  'SELECT SINGLE * FROM mara INTO @DATA(ls_mara) WHERE matnr = @lv_matnr.', 'SELECT SINGLE matnr, mtart FROM mara INTO @DATA(ls_mara) WHERE matnr = @lv_matnr.');
R('select-endselect', 'S', 'MA', 10, ['performance', 'sql'],
  /^\s*SELECT\b(?!.*\bINTO\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\b)(?!.*\bSINGLE\b).*\bINTO\b(?!.*\bUP\s+TO\s+1\s+ROWS\b)[^.]*\.\s*$/i,
  ['SELECT ... ENDSELECT loop', 'A SELECT loop fetches row by row and keeps a cursor open.', 'Read into an internal table with INTO TABLE.'],
  ['SELECT ... ENDSELECT 루프입니다', 'SELECT 루프는 행을 하나씩 가져오며 커서를 열어 둡니다.', 'INTO TABLE로 내부 테이블에 읽으세요.'],
  'SELECT matnr FROM mara INTO lv_matnr WHERE mtart = @lv_type.', 'SELECT matnr FROM mara INTO TABLE @lt_matnr WHERE mtart = @lv_type.');
R('obsolete-statement', 'S', 'MI', 5, ['obsolete'],
  /^\s*(?:MOVE\s+\S+\s+TO\b|COMPUTE\b|ADD\s+\S+\s+TO\b|SUBTRACT\b|MULTIPLY\b|DIVIDE\b|REFRESH\b|OCCURS\b|TABLES\s+\w+\s*\.|RANGES\b|ON\s+CHANGE\s+OF\b)/i,
  ['Obsolete statement', 'MOVE, COMPUTE, ADD ... TO, REFRESH, TABLES and similar are obsolete language elements.', 'Use = assignments, CLEAR and modern declarations.'],
  ['없어진 문장입니다', 'MOVE, COMPUTE, ADD ... TO, REFRESH, TABLES 등은 더 이상 쓰지 않는 언어 요소입니다.', '= 대입, CLEAR와 최신 선언을 쓰세요.'],
  'MOVE lv_a TO lv_b.', 'lv_b = lv_a.');
R('header-line', 'S', 'MA', 10, ['obsolete'],
  /\bWITH\s+HEADER\s+LINE\b/i,
  ['Internal table with a header line', 'A header line makes the same name mean two objects.', 'Declare a separate work area or use field symbols.'],
  ['헤더 줄이 있는 내부 테이블입니다', '헤더 줄은 같은 이름이 두 객체를 뜻하게 만듭니다.', '별도 작업 영역을 선언하거나 필드 심볼을 쓰세요.'],
  'DATA lt_items TYPE TABLE OF zitem WITH HEADER LINE.', 'DATA lt_items TYPE STANDARD TABLE OF zitem WITH EMPTY KEY.');
R('form-routine', 'S', 'MI', 10, ['obsolete', 'design'],
  /^\s*(?:FORM\s+\w+|PERFORM\s+\w+)\b/i,
  ['FORM / PERFORM subroutine', 'Subroutines are obsolete and lack a typed interface.', 'Use methods of a local or global class.'],
  ['FORM / PERFORM 서브루틴입니다', '서브루틴은 쓰지 않게 된 방식이며 타입 있는 인터페이스가 없습니다.', '지역 또는 전역 클래스의 메서드를 쓰세요.'],
  'PERFORM calculate_totals USING lt_items.', 'lo_calc->calculate_totals( lt_items ).');
R('wait-up-to', 'S', 'MA', 10, ['performance'],
  /\bWAIT\s+UP\s+TO\s+\d+\s+SECONDS\b/i,
  ['WAIT UP TO in application code', 'Waiting holds a work process and triggers an implicit database commit.', 'Use events, background jobs or asynchronous RFC callbacks.'],
  ['애플리케이션 코드에서 WAIT UP TO를 씁니다', '대기는 작업 프로세스를 붙잡고 암시적 DB 커밋을 일으킵니다.', '이벤트, 백그라운드 작업 또는 비동기 RFC 콜백을 쓰세요.'],
  'WAIT UP TO 5 SECONDS.', "CALL FUNCTION 'Z_ASYNC' STARTING NEW TASK 'T1' CALLING on_done ON END OF TASK.");
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '* TODO: add authority check', '* Authority is checked in the BAdI.', { scope: 'any', sonar: 'S1135' });

module.exports = { RULES: R.rules };
