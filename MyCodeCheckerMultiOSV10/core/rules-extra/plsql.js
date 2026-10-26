'use strict';

// Oracle PL/SQL (packages, procedures, functions, triggers). Exception
// handling, dynamic SQL injection, transaction control and smells from the
// reference PL/SQL rule pack.

const { maker } = require('./util');

const R = maker('plsql', ['plsql']);

// ── Bugs ─────────────────────────────────────────────────────
R('when-others-null', 'B', 'CR', 15, ['error-handling'],
  /\bWHEN\s+OTHERS\s+THEN\s+NULL\s*;/i,
  ['WHEN OTHERS THEN NULL', 'Every error is swallowed and the caller thinks the work succeeded.', 'Log the error and re-raise it with RAISE.'],
  ['WHEN OTHERS THEN NULL을 씁니다', '모든 오류를 삼켜 호출자는 작업이 성공했다고 여깁니다.', '오류를 기록하고 RAISE로 다시 던지세요.'],
  'EXCEPTION WHEN OTHERS THEN NULL;', 'EXCEPTION WHEN OTHERS THEN log_error(SQLERRM); RAISE;');
R('when-others-no-raise', 'B', 'MA', 10, ['error-handling'],
  /\bWHEN\s+OTHERS\s+THEN\b(?=\s+\S)(?!.*\bRAISE)(?!.*\bRAISE_APPLICATION_ERROR\b)(?!\s+NULL\s*;)/i,
  ['WHEN OTHERS without RAISE', 'Unless the handler re-raises, unexpected errors are hidden from the caller.', 'End the handler with RAISE or RAISE_APPLICATION_ERROR.'],
  ['RAISE 없는 WHEN OTHERS입니다', '처리기가 다시 던지지 않으면 예상 못한 오류가 호출자에게 숨겨집니다.', '처리기를 RAISE나 RAISE_APPLICATION_ERROR로 끝내세요.'],
  "EXCEPTION WHEN OTHERS THEN v_status := 'FAILED';", 'EXCEPTION WHEN OTHERS THEN log_error(SQLERRM); RAISE;');
R('commit-in-stored-code', 'B', 'MA', 15, ['transactions'],
  /^\s*(?:COMMIT|ROLLBACK)\s*;/i,
  ['COMMIT or ROLLBACK inside stored code', 'Stored code runs inside the caller transaction; in a trigger this raises ORA-04092, elsewhere it breaks the caller atomicity.', 'Leave transaction control to the caller.'],
  ['저장 코드 안에서 COMMIT이나 ROLLBACK을 합니다', '저장 코드는 호출자 트랜잭션 안에서 돌기 때문에 트리거에서는 ORA-04092가 나고 그 밖에서는 호출자의 원자성이 깨집니다.', '트랜잭션 제어는 호출자에게 맡기세요.'],
  'COMMIT;', 'NULL;',
  { skip: (raw) => /PRAGMA\s+AUTONOMOUS_TRANSACTION/i.test(raw) });
R('autonomous-transaction', 'S', 'MA', 15, ['transactions'],
  /\bPRAGMA\s+AUTONOMOUS_TRANSACTION\b/i,
  ['Autonomous transaction', 'Work in an autonomous transaction commits apart from the caller and needs its own exception handler that rolls back.', 'Use it only for logging, and add an EXCEPTION block with ROLLBACK.'],
  ['자율 트랜잭션입니다', '자율 트랜잭션의 작업은 호출자와 따로 커밋되며 롤백하는 자체 예외 처리기가 필요합니다.', '로깅에만 쓰고 ROLLBACK이 있는 EXCEPTION 블록을 넣으세요.'],
  'PRAGMA AUTONOMOUS_TRANSACTION;', 'PRAGMA SERIALLY_REUSABLE;');
R('null-comparison', 'B', 'CR', 5, ['suspicious'],
  /(?<![:<>!])=\s*NULL\b|(?:<>|!=)\s*NULL\b/i,
  ['Comparison with NULL using = or <>', 'x = NULL is never true; it is always UNKNOWN.', 'Use IS NULL or IS NOT NULL.'],
  ['= 또는 <>로 NULL과 비교합니다', 'x = NULL은 절대 참이 아니고 항상 UNKNOWN입니다.', 'IS NULL이나 IS NOT NULL을 쓰세요.'],
  'IF v_name = NULL THEN', ['IF v_name IS NULL THEN', 'v_name := NULL;'], { ns: true });
R('char-type', 'B', 'MI', 5, ['types'],
  /\b\w+\s+CHAR\s*\(\s*\d+\s*\)/i,
  ['CHAR column or variable', 'CHAR pads with blanks, so comparisons with VARCHAR2 values fail unexpectedly.', 'Use VARCHAR2.'],
  ['CHAR 열이나 변수입니다', 'CHAR는 공백으로 채워져 VARCHAR2 값과 비교가 뜻밖에 실패합니다.', 'VARCHAR2를 쓰세요.'],
  'v_code CHAR(10);', 'v_code VARCHAR2(10);');
R('varchar-type', 'B', 'MI', 2, ['types'],
  /\b\w+\s+VARCHAR\s*\(/i,
  ['VARCHAR instead of VARCHAR2', 'Oracle reserves VARCHAR for future semantics that may differ.', 'Use VARCHAR2.'],
  ['VARCHAR2 대신 VARCHAR를 씁니다', 'Oracle은 VARCHAR를 앞으로 바뀔 수 있는 의미로 예약해 두었습니다.', 'VARCHAR2를 쓰세요.'],
  'v_name VARCHAR(100);', 'v_name VARCHAR2(100);');
R('fetch-without-notfound', 'B', 'MA', 10, ['cursor'],
  /^\s*LOOP\s+FETCH\b(?!.*%NOTFOUND)/i,
  ['FETCH loop without an exit test', 'Without EXIT WHEN cursor%NOTFOUND the loop never ends.', 'Add EXIT WHEN c%NOTFOUND right after FETCH, or use a cursor FOR loop.'],
  ['종료 검사 없는 FETCH 루프입니다', 'EXIT WHEN cursor%NOTFOUND가 없으면 루프가 끝나지 않습니다.', 'FETCH 바로 뒤에 EXIT WHEN c%NOTFOUND를 넣거나 커서 FOR 루프를 쓰세요.'],
  'LOOP FETCH c_emp INTO r_emp; process(r_emp); END LOOP;', 'LOOP FETCH c_emp INTO r_emp; EXIT WHEN c_emp%NOTFOUND; process(r_emp); END LOOP;');
R('delete-without-where', 'B', 'CR', 15, ['sql'],
  /^\s*DELETE\s+(?:FROM\s+)?[\w.$#]+\s*;/i,
  ['DELETE without WHERE', 'Every row of the table is deleted.', 'Add a WHERE clause, or use TRUNCATE on purpose.'],
  ['WHERE 없는 DELETE입니다', '테이블의 모든 행이 지워집니다.', 'WHERE 절을 넣거나 의도적으로 TRUNCATE를 쓰세요.'],
  'DELETE FROM orders;', 'DELETE FROM orders WHERE status = \'CANCELLED\';');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('execute-immediate-concat', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bEXECUTE\s+IMMEDIATE\b.*\|\|/i,
  ['EXECUTE IMMEDIATE with concatenated text', 'Concatenated values can change the dynamic SQL statement.', 'Use bind variables with USING, and DBMS_ASSERT for identifiers.'],
  ['문자열을 이어 붙여 EXECUTE IMMEDIATE를 합니다', '이어 붙인 값이 동적 SQL 문을 바꿀 수 있습니다.', 'USING과 바인드 변수를 쓰고 식별자에는 DBMS_ASSERT를 쓰세요.'],
  "EXECUTE IMMEDIATE 'DELETE FROM t WHERE id = ' || p_id;", "EXECUTE IMMEDIATE 'DELETE FROM t WHERE id = :1' USING p_id;", { ref: 'S2077' });
R('open-for-concat', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bOPEN\s+\w+\s+FOR\s+(?!SELECT\b)[^;]*\|\|/i,
  ['OPEN FOR with concatenated SQL text', 'Concatenated values can change the cursor query.', 'Use bind variables with USING.'],
  ['문자열을 이어 OPEN FOR를 합니다', '이어 붙인 값이 커서 질의를 바꿀 수 있습니다.', 'USING과 바인드 변수를 쓰세요.'],
  "OPEN c FOR 'SELECT * FROM emp WHERE name = ''' || p_name || '''';", "OPEN c FOR 'SELECT * FROM emp WHERE name = :1' USING p_name;");
R('dbms-sql-parse-concat', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bDBMS_SQL\.PARSE\s*\([^;]*\|\|/i,
  ['DBMS_SQL.PARSE with concatenated text', 'Concatenated values can change the parsed statement.', 'Bind values with DBMS_SQL.BIND_VARIABLE.'],
  ['문자열을 이어 DBMS_SQL.PARSE를 합니다', '이어 붙인 값이 파싱할 문장을 바꿀 수 있습니다.', 'DBMS_SQL.BIND_VARIABLE로 값을 바인드하세요.'],
  "DBMS_SQL.PARSE(c, 'SELECT * FROM t WHERE x = ' || v, DBMS_SQL.NATIVE);", "DBMS_SQL.PARSE(c, 'SELECT * FROM t WHERE x = :x', DBMS_SQL.NATIVE);");
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret)\w*\s+(?:CONSTANT\s+)?(?:VARCHAR2|VARCHAR|CHAR)?\s*(?:\(\s*\d+\s*\))?\s*:=\s*'[^'\s]{4,}'|\bIDENTIFIED\s+BY\s+(?!VALUES\b)"?\w{4,}/i,
  ['Hard-coded password', 'Anyone with the source or the data dictionary can read the password.', 'Use an Oracle wallet or a secured external store.'],
  ['비밀번호를 코드에 적었습니다', '소스나 데이터 사전을 볼 수 있는 누구나 비밀번호를 읽을 수 있습니다.', 'Oracle wallet이나 보호된 외부 저장소를 쓰세요.'],
  "v_password VARCHAR2(30) := 'Tiger123';", 'v_password VARCHAR2(30) := get_secret(\'db\');', { ref: 'S2068' });
R('authid-definer', 'H', 'MA', 10, ['cwe-250', 'privileges'],
  /\bAUTHID\s+DEFINER\b/i,
  ['Program runs with definer rights', 'Callers act with the owner privileges, which turns SQL injection into privilege escalation.', 'Use AUTHID CURRENT_USER unless definer rights are required.'],
  ['정의자 권한으로 실행합니다', '호출자가 소유자 권한으로 동작해 SQL 인젝션이 권한 상승이 됩니다.', '정의자 권한이 꼭 필요하지 않으면 AUTHID CURRENT_USER를 쓰세요.'],
  'CREATE OR REPLACE PROCEDURE p AUTHID DEFINER IS', 'CREATE OR REPLACE PROCEDURE p AUTHID CURRENT_USER IS');
R('grant-public', 'V', 'MA', 10, ['cwe-732', 'privileges'],
  /\bGRANT\s+[\w\s,]+\s+TO\s+PUBLIC\b/i,
  ['Privilege granted to PUBLIC', 'Every database user gets the privilege.', 'Grant to a role that only the needed users hold.'],
  ['PUBLIC에 권한을 줍니다', '모든 데이터베이스 사용자가 권한을 얻습니다.', '필요한 사용자만 가진 역할에 주세요.'],
  'GRANT EXECUTE ON pkg_admin TO PUBLIC;', 'GRANT EXECUTE ON pkg_admin TO app_admin_role;');
R('utl-file-dynamic', 'H', 'MA', 10, ['cwe-22', 'files'],
  /\bUTL_FILE\.FOPEN\s*\([^,]*\|\|/i,
  ['UTL_FILE.FOPEN with a built path', 'A path assembled from input can reach other files on the server.', 'Use a fixed directory object and validate file names.'],
  ['조립한 경로로 UTL_FILE.FOPEN을 엽니다', '입력으로 조립한 경로는 서버의 다른 파일에 닿을 수 있습니다.', '고정된 디렉터리 객체를 쓰고 파일 이름을 검증하세요.'],
  "f := UTL_FILE.FOPEN('DATA_DIR' || p_dir, p_name, 'r');", "f := UTL_FILE.FOPEN('DATA_DIR', v_safe_name, 'r');");

// ── Code smells ──────────────────────────────────────────────
R('select-star', 'S', 'MA', 5, ['sql', 'performance'],
  /\bSELECT\s+\*\s+(?:INTO|FROM)\b/i,
  ['SELECT *', 'SELECT * breaks when columns change and reads data you do not need.', 'List the columns.'],
  ['SELECT *를 씁니다', 'SELECT *는 열이 바뀌면 깨지고 필요 없는 데이터까지 읽습니다.', '열을 나열하세요.'],
  'SELECT * INTO r_emp FROM emp WHERE id = p_id;', 'SELECT name, salary INTO v_name, v_sal FROM emp WHERE id = p_id;');
R('dbms-output', 'S', 'MI', 2, ['debug'],
  /\bDBMS_OUTPUT\.PUT(?:_LINE)?\s*\(/i,
  ['DBMS_OUTPUT left in the code', 'DBMS_OUTPUT is only seen by interactive clients and fills a buffer otherwise.', 'Log to a table or with a logging package.'],
  ['DBMS_OUTPUT이 남아 있습니다', 'DBMS_OUTPUT은 대화형 클라이언트만 보며 그 밖에서는 버퍼만 채웁니다.', '테이블이나 로깅 패키지로 기록하세요.'],
  "DBMS_OUTPUT.PUT_LINE('debug ' || v_id);", "logger.log('processing ' || v_id);", { ref: 'S106' });
R('goto', 'S', 'MA', 10, ['brain-overload'],
  /^\s*GOTO\s+\w+\s*;/i,
  ['GOTO statement', 'GOTO makes control flow hard to follow.', 'Use loops, EXIT and CONTINUE.'],
  ['GOTO 문입니다', 'GOTO는 제어 흐름을 따라가기 어렵게 만듭니다.', '반복문, EXIT, CONTINUE를 쓰세요.'],
  'GOTO retry;', 'CONTINUE;', { ref: 'S907' });
R('commented-out-code', 'S', 'MI', 5, ['unused'],
  /^\s*--\s*(?:SELECT|INSERT|UPDATE|DELETE|BEGIN|END|IF|LOOP)\b.*;\s*$/i,
  ['Commented-out code', 'Dead code in comments is noise and goes stale.', 'Delete it; version control keeps the history.'],
  ['주석 처리된 코드입니다', '주석 속 죽은 코드는 잡음이고 금방 낡습니다.', '지우세요. 이력은 버전 관리가 지킵니다.'],
  '-- UPDATE emp SET sal = sal * 2;', '-- Salaries are raised by the yearly batch.', { scope: 'any', ref: 'S125' });
R('implicit-cursor-loop', 'S', 'MI', 5, ['performance'],
  /^\s*FOR\s+\w+\s+IN\s+\(\s*SELECT\b.*\)\s*LOOP\s+(?:INSERT|UPDATE|DELETE)\b/i,
  ['Row-by-row DML in a cursor loop', 'One DML per row is much slower than a set-based statement or FORALL.', 'Use a single INSERT ... SELECT / MERGE, or BULK COLLECT with FORALL.'],
  ['커서 루프에서 행마다 DML을 합니다', '행마다 DML을 하면 집합 연산이나 FORALL보다 훨씬 느립니다.', '단일 INSERT ... SELECT / MERGE나 BULK COLLECT와 FORALL을 쓰세요.'],
  'FOR r IN (SELECT id FROM src) LOOP INSERT INTO dst VALUES (r.id); END LOOP;', 'INSERT INTO dst (id) SELECT id FROM src;');
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '-- TODO: handle duplicates', '-- Duplicates are merged by MERGE above.', { scope: 'any', ref: 'S1135' });
R('number-without-precision', 'S', 'MI', 2, ['types'],
  /\b\w+\s+NUMBER\s*(?::=[^;]*)?;/i,
  ['NUMBER without precision', 'An unconstrained NUMBER accepts any size and hides intent.', 'Give precision and scale, or use PLS_INTEGER for counters.'],
  ['정밀도 없는 NUMBER입니다', '제약 없는 NUMBER는 아무 크기나 받아 의도를 숨깁니다.', '정밀도와 소수 자릿수를 주거나 카운터에는 PLS_INTEGER를 쓰세요.'],
  'v_count NUMBER;', 'v_count PLS_INTEGER;');

module.exports = { RULES: R.rules };
