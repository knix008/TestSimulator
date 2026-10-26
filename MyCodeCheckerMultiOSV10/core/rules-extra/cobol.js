'use strict';

// COBOL (fixed or free format) with embedded SQL. Control-flow rules from
// the SonarQube COBOL pack (ALTER, GO TO, PERFORM THRU, NEXT SENTENCE),
// embedded SQL hygiene and hard-coded credentials.

const { maker } = require('./util');

const R = maker('cobol', ['cobol']);

// ── Bugs ─────────────────────────────────────────────────────
R('alter', 'B', 'CR', 30, ['brain-overload', 'obsolete'],
  /^\s*ALTER\s+[\w-]+\s+TO\s+(?:PROCEED\s+TO\s+)?[\w-]+/i,
  ['ALTER statement', 'ALTER rewrites a GO TO target at run time, so the code no longer says where it jumps.', 'Replace it with a flag and EVALUATE or PERFORM.'],
  ['ALTER 문을 씁니다', 'ALTER는 실행 중에 GO TO 대상을 바꾸므로 코드만 보고 어디로 가는지 알 수 없습니다.', '플래그와 EVALUATE 또는 PERFORM으로 바꾸세요.'],
  '           ALTER P100-SWITCH TO PROCEED TO P300-END.', '           SET END-OF-RUN TO TRUE.');
R('next-sentence', 'B', 'MA', 10, ['suspicious'],
  /\bNEXT\s+SENTENCE\b/i,
  ['NEXT SENTENCE', 'NEXT SENTENCE jumps past the next period, not past END-IF, which skips code unexpectedly.', 'Use CONTINUE.'],
  ['NEXT SENTENCE를 씁니다', 'NEXT SENTENCE는 END-IF가 아니라 다음 마침표 뒤로 건너뛰어 코드를 뜻밖에 빼먹습니다.', 'CONTINUE를 쓰세요.'],
  '               NEXT SENTENCE', '               CONTINUE');
R('delete-without-where', 'B', 'CR', 15, ['sql'],
  /\bDELETE\s+FROM\s+[\w.-]+\s*(?:END-EXEC|\.?\s*$)/i,
  ['DELETE without WHERE', 'Every row of the table is deleted.', 'Add a WHERE clause, or use TRUNCATE on purpose.'],
  ['WHERE 없는 DELETE입니다', '테이블의 모든 행이 지워집니다.', 'WHERE 절을 넣거나 의도적으로 TRUNCATE를 쓰세요.'],
  '               DELETE FROM CUSTOMER END-EXEC.', '               DELETE FROM CUSTOMER WHERE ID = :WS-ID END-EXEC.');
R('update-without-where', 'B', 'CR', 15, ['sql'],
  /\bUPDATE\s+[\w.-]+\s+SET\b(?!.*\bWHERE\b).*\bEND-EXEC\b/i,
  ['UPDATE without WHERE', 'Every row of the table is changed.', 'Add a WHERE clause.'],
  ['WHERE 없는 UPDATE입니다', '테이블의 모든 행이 바뀝니다.', 'WHERE 절을 넣으세요.'],
  '               UPDATE ACCOUNT SET BAL = 0 END-EXEC.', '               UPDATE ACCOUNT SET BAL = 0 WHERE ID = :WS-ID END-EXEC.');
R('whenever-continue', 'B', 'MA', 10, ['sql', 'error-handling'],
  /\bWHENEVER\s+SQLERROR\s+CONTINUE\b/i,
  ['WHENEVER SQLERROR CONTINUE', 'SQL errors are ignored unless SQLCODE is checked after every statement.', 'Branch to an error routine, or check SQLCODE after each statement.'],
  ['WHENEVER SQLERROR CONTINUE를 씁니다', '문장마다 SQLCODE를 확인하지 않으면 SQL 오류가 무시됩니다.', '오류 루틴으로 분기하거나 문장마다 SQLCODE를 확인하세요.'],
  '           EXEC SQL WHENEVER SQLERROR CONTINUE END-EXEC.', '           EXEC SQL WHENEVER SQLERROR GO TO 9000-SQL-ERROR END-EXEC.');
R('comp-float', 'B', 'MI', 5, ['arithmetic'],
  /\b(?:USAGE\s+)?(?:COMP-1|COMP-2|COMPUTATIONAL-[12]|FLOAT-(?:SHORT|LONG))\b/i,
  ['Floating-point data item', 'COMP-1 / COMP-2 are binary floating point and cannot hold decimal amounts exactly.', 'Use packed decimal (COMP-3) or display numerics for money.'],
  ['부동소수점 데이터 항목입니다', 'COMP-1 / COMP-2는 2진 부동소수점이라 10진 금액을 정확히 담지 못합니다.', '금액에는 팩 10진(COMP-3)이나 표시형 숫자를 쓰세요.'],
  '       01  WS-AMOUNT         COMP-2.', '       01  WS-AMOUNT         PIC S9(9)V99 COMP-3.');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /[\w-]*(?:PASSWORD|PASSWD|PWD|SECRET)[\w-]*\s+.*\bVALUE\s+(?:IS\s+)?(?:'[^'\s]{4,}'|"[^"\s]{4,}")/i,
  ['Hard-coded password', 'Anyone with the source or load module can read the password.', 'Read it from a protected data set or the security product (RACF, ACF2).'],
  ['비밀번호를 코드에 적었습니다', '소스나 로드 모듈을 가진 누구나 비밀번호를 읽을 수 있습니다.', '보호된 데이터 세트나 보안 제품(RACF, ACF2)에서 읽으세요.'],
  "       01  WS-DB-PASSWORD    PIC X(8) VALUE 'SECRET01'.", '       01  WS-DB-PASSWORD    PIC X(8) VALUE SPACES.', { sonar: 'S2068' });
R('dynamic-sql', 'H', 'MA', 15, ['sql', 'cwe-89', 'owasp-a03'],
  /\bEXECUTE\s+IMMEDIATE\s+:|\bPREPARE\s+[\w-]+\s+FROM\s+:/i,
  ['Dynamic SQL', 'SQL text assembled at run time can be changed by input it contains.', 'Use static SQL with host variables, or validate every piece of the text.'],
  ['동적 SQL입니다', '실행 중 조립한 SQL 문은 그 안에 든 입력으로 바뀔 수 있습니다.', '호스트 변수를 쓰는 정적 SQL을 쓰거나 문장의 모든 조각을 검증하세요.'],
  '           EXEC SQL EXECUTE IMMEDIATE :WS-SQL-TEXT END-EXEC.', '           EXEC SQL SELECT NAME INTO :WS-NAME FROM CUSTOMER WHERE ID = :WS-ID END-EXEC.', { sonar: 'S2077' });
R('hardcoded-ip', 'H', 'MI', 5, ['network'],
  /\bVALUE\s+(?:IS\s+)?['"](?:\d{1,3}\.){3}\d{1,3}['"]/i,
  ['Hard-coded IP address', 'A fixed address breaks when the network changes and exposes topology.', 'Read the address from configuration.'],
  ['IP 주소를 코드에 적었습니다', '고정 주소는 네트워크가 바뀌면 깨지고 구성 정보를 드러냅니다.', '설정에서 주소를 읽으세요.'],
  "       01  WS-HOST           PIC X(15) VALUE '10.20.30.40'.", "       01  WS-HOST           PIC X(15) VALUE SPACES.", { sonar: 'S1313' });
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /['"]http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/i,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  "       01  WS-URL  PIC X(40) VALUE 'http://api.example.com'.", "       01  WS-URL  PIC X(40) VALUE 'https://api.example.com'.", { sonar: 'S5332' });
R('dynamic-call', 'H', 'MI', 10, ['cwe-470'],
  /^\s*CALL\s+(?!['"])[A-Z][\w-]*(?:\s+USING\b|\s*\.?\s*$)/i,
  ['CALL of a program named by a variable', 'A dynamic CALL runs whatever program name the data item holds.', 'Call a literal program name, or validate the name against a list.'],
  ['변수에 든 이름으로 프로그램을 CALL합니다', '동적 CALL은 데이터 항목에 든 어떤 프로그램 이름이든 실행합니다.', '리터럴 프로그램 이름을 부르거나 이름을 목록과 대조하세요.'],
  '           CALL WS-PGM-NAME USING WS-PARMS.', "           CALL 'CUSTUPD' USING WS-PARMS.");

// ── Code smells ──────────────────────────────────────────────
R('go-to', 'S', 'MA', 10, ['brain-overload'],
  /\bGO\s+TO\s+[\w-]+/i,
  ['GO TO statement', 'GO TO makes control flow hard to follow.', 'Use PERFORM, EVALUATE and structured IF / END-IF.'],
  ['GO TO 문입니다', 'GO TO는 제어 흐름을 따라가기 어렵게 만듭니다.', 'PERFORM, EVALUATE와 구조적인 IF / END-IF를 쓰세요.'],
  '           GO TO 2000-READ-NEXT.', '           PERFORM 2000-READ-NEXT.', { sonar: 'S907' });
R('go-to-depending', 'S', 'MA', 15, ['brain-overload'],
  /\bGO\s+TO\s+(?:[\w-]+\s+)+DEPENDING\s+ON\b/i,
  ['GO TO ... DEPENDING ON', 'A computed GO TO hides which paragraph runs for each value.', 'Use EVALUATE with PERFORM.'],
  ['GO TO ... DEPENDING ON을 씁니다', '계산된 GO TO는 값마다 어느 문단이 실행되는지 숨깁니다.', 'EVALUATE와 PERFORM을 쓰세요.'],
  '           GO TO P100 P200 P300 DEPENDING ON WS-CODE.', '           EVALUATE WS-CODE WHEN 1 PERFORM P100 END-EVALUATE.');
R('perform-thru', 'S', 'MA', 10, ['brain-overload'],
  /\bPERFORM\s+[\w-]+\s+(?:THRU|THROUGH)\s+[\w-]+/i,
  ['PERFORM ... THRU', 'PERFORM THRU runs every paragraph in a range, so moving or adding a paragraph changes behaviour.', 'PERFORM single paragraphs or sections.'],
  ['PERFORM ... THRU를 씁니다', 'PERFORM THRU는 범위 안의 모든 문단을 실행하므로 문단을 옮기거나 더하면 동작이 바뀝니다.', '문단이나 섹션을 하나씩 PERFORM하세요.'],
  '           PERFORM 1000-INIT THRU 1000-EXIT.', '           PERFORM 1000-INIT.');
R('select-star', 'S', 'MA', 5, ['sql', 'performance'],
  /\bSELECT\s+\*\s/i,
  ['SELECT *', 'SELECT * breaks when columns are added and reads data the program does not need.', 'List the columns you need.'],
  ['SELECT *를 씁니다', 'SELECT *는 열이 추가되면 깨지고 필요 없는 데이터까지 읽습니다.', '필요한 열을 나열하세요.'],
  '           EXEC SQL SELECT * INTO :WS-CUST FROM CUSTOMER END-EXEC.', '           EXEC SQL SELECT NAME, CITY INTO :WS-NAME, :WS-CITY FROM CUSTOMER END-EXEC.');
R('lock-table', 'S', 'MA', 10, ['sql', 'concurrency'],
  /\bLOCK\s+TABLE\b/i,
  ['LOCK TABLE', 'Locking a whole table blocks other jobs and online transactions.', 'Rely on row locks and short units of work.'],
  ['LOCK TABLE을 씁니다', '테이블 전체를 잠그면 다른 작업과 온라인 트랜잭션이 막힙니다.', '행 잠금과 짧은 작업 단위를 쓰세요.'],
  '           EXEC SQL LOCK TABLE ACCOUNT IN EXCLUSIVE MODE END-EXEC.', '           EXEC SQL COMMIT END-EXEC.');
R('stop-run', 'S', 'MA', 5, ['design'],
  /\bSTOP\s+RUN\b/i,
  ['STOP RUN', 'STOP RUN ends the whole run unit, which is wrong when the program is called by another.', 'Use GOBACK.'],
  ['STOP RUN을 씁니다', 'STOP RUN은 실행 단위 전체를 끝내므로 다른 프로그램이 부른 경우 틀립니다.', 'GOBACK을 쓰세요.'],
  '           STOP RUN.', '           GOBACK.');
R('move-corresponding', 'S', 'MI', 10, ['brain-overload'],
  /\b(?:MOVE|ADD|SUBTRACT)\s+(?:CORRESPONDING|CORR)\b/i,
  ['CORRESPONDING phrase', 'Which fields move depends on matching names, so renaming a field silently changes the program.', 'Move the fields one by one.'],
  ['CORRESPONDING 구를 씁니다', '어떤 필드가 옮겨질지 이름 일치에 달려 있어 필드 이름을 바꾸면 프로그램이 조용히 바뀝니다.', '필드를 하나씩 옮기세요.'],
  '           MOVE CORRESPONDING IN-REC TO OUT-REC.', '           MOVE IN-NAME TO OUT-NAME.');
R('debugging-mode', 'S', 'MA', 5, ['debug'],
  /\bWITH\s+DEBUGGING\s+MODE\b/i,
  ['WITH DEBUGGING MODE', 'Debugging lines (D in column 7) are compiled into the program.', 'Remove WITH DEBUGGING MODE for production builds.'],
  ['WITH DEBUGGING MODE를 씁니다', '디버깅 줄(7열의 D)이 프로그램에 컴파일됩니다.', '운영 빌드에서는 WITH DEBUGGING MODE를 지우세요.'],
  '       SOURCE-COMPUTER. IBM-370 WITH DEBUGGING MODE.', '       SOURCE-COMPUTER. IBM-370.', { sonar: 'S4507' });
R('display', 'S', 'MI', 2, ['debug'],
  /^\s*DISPLAY\s+(?!.*\bUPON\s+CONSOLE\b)/i,
  ['DISPLAY debug output', 'DISPLAY output goes to SYSOUT and is easy to leave behind with sensitive data.', 'Write to a proper log or report file.'],
  ['DISPLAY 디버그 출력입니다', 'DISPLAY 출력은 SYSOUT으로 가며 민감한 데이터와 함께 남기 쉽습니다.', '제대로 된 로그나 보고서 파일에 쓰세요.'],
  "           DISPLAY 'WS-REC=' WS-REC.", '           WRITE LOG-REC FROM WS-REC.', { sonar: 'S106' });
R('obsolete-statement', 'S', 'MA', 10, ['obsolete'],
  /^\s*(?:EXAMINE|TRANSFORM|ENTER|NOTE|READY\s+TRACE|RESET\s+TRACE|EXHIBIT)\b/i,
  ['Obsolete statement', 'EXAMINE, TRANSFORM, ENTER, NOTE, EXHIBIT and TRACE were removed from standard COBOL.', 'Use INSPECT, comments and the debugger instead.'],
  ['없어진 문장입니다', 'EXAMINE, TRANSFORM, ENTER, NOTE, EXHIBIT, TRACE는 표준 COBOL에서 빠졌습니다.', '대신 INSPECT, 주석, 디버거를 쓰세요.'],
  "           EXAMINE WS-TEXT TALLYING ALL 'A'.", "           INSPECT WS-TEXT TALLYING WS-COUNT FOR ALL 'A'.");
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '      * TODO: handle the overflow case', '      * Overflow is handled in 9100-OVERFLOW.', { scope: 'any', sonar: 'S1135' });

module.exports = { RULES: R.rules };
