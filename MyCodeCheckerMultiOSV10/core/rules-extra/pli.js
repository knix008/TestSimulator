'use strict';

// PL/I (Enterprise PL/I on z/OS). GOTO and label variables, ON-unit
// pitfalls, embedded SQL and hard-coded credentials.

const { maker } = require('./util');

const R = maker('pli', ['pli']);

R('goto', 'S', 'MA', 10, ['brain-overload'],
  /\bGO\s*TO\s+\w+\s*;/i,
  ['GOTO statement', 'GOTO makes control flow hard to follow.', 'Use DO loops, LEAVE, ITERATE and SELECT.'],
  ['GOTO 문입니다', 'GOTO는 제어 흐름을 따라가기 어렵게 만듭니다.', 'DO 루프, LEAVE, ITERATE, SELECT를 쓰세요.'],
  '   GOTO RETRY;', '   ITERATE READ_LOOP;', { sonar: 'S907' });
R('label-variable', 'S', 'MA', 15, ['brain-overload'],
  /\b(?:DCL|DECLARE)\s+\w+(?:\s*\([^)]*\))?\s+LABEL\b/i,
  ['LABEL variable', 'A label variable is a computed GOTO target, so the jump destination is decided at run time.', 'Use SELECT with procedure calls.'],
  ['LABEL 변수입니다', 'LABEL 변수는 계산된 GOTO 대상이라 점프할 곳이 실행 중에 정해집니다.', '프로시저 호출과 함께 SELECT를 쓰세요.'],
  '   DCL NEXT_STEP LABEL;', '   DCL NEXT_STEP FIXED BIN(31);');
R('on-error-without-system', 'B', 'MA', 10, ['error-handling'],
  /\bON\s+ERROR\s+(?!SYSTEM\b)(?:SNAP\s+)?BEGIN\s*;(?!.*\bON\s+ERROR\s+SYSTEM\b)/i,
  ['ON ERROR unit without ON ERROR SYSTEM', 'An error raised inside the handler re-enters it and can loop forever.', 'Start the ON ERROR block with ON ERROR SYSTEM;.'],
  ['ON ERROR SYSTEM 없는 ON ERROR 단위입니다', '처리기 안에서 난 오류가 처리기로 다시 들어가 끝없이 돌 수 있습니다.', 'ON ERROR 블록을 ON ERROR SYSTEM;으로 시작하세요.'],
  '   ON ERROR BEGIN; CALL LOG_ERROR; END;', '   ON ERROR BEGIN; ON ERROR SYSTEM; CALL LOG_ERROR; END;');
R('stop', 'B', 'MA', 5, ['design'],
  /^\s*(?:STOP|EXIT)\s*;/i,
  ['STOP or EXIT statement', 'STOP and EXIT end the whole enclave, skipping clean-up in callers.', 'RETURN to the caller with a return code.'],
  ['STOP 또는 EXIT 문입니다', 'STOP과 EXIT은 호출자의 정리 작업을 건너뛰고 enclave 전체를 끝냅니다.', '반환 코드와 함께 호출자에게 RETURN하세요.'],
  '   STOP;', '   RETURN;');
R('display', 'S', 'MI', 2, ['debug'],
  /^\s*(?:DISPLAY\s*\(|PUT\s+(?:SKIP\s+)?(?:LIST|DATA)\b)/i,
  ['DISPLAY / PUT LIST debug output', 'Debug output goes to SYSPRINT or the console and may leak data.', 'Write to a proper log or report file.'],
  ['DISPLAY / PUT LIST 디버그 출력입니다', '디버그 출력은 SYSPRINT나 콘솔로 가며 데이터를 흘릴 수 있습니다.', '제대로 된 로그나 보고서 파일에 쓰세요.'],
  "   PUT SKIP LIST('REC=', REC);", '   WRITE FILE(LOGFILE) FROM(LOG_REC);', { sonar: 'S106' });
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:PASSWORD|PASSWD|PWD|SECRET)\w*\b[^;]*(?:INIT(?:IAL)?\s*\(\s*'[^'\s]{4,}'\s*\)|=\s*'[^'\s]{4,}')/i,
  ['Hard-coded password', 'Anyone with the source or load module can read the password.', 'Read it from a protected data set or the security product.'],
  ['비밀번호를 코드에 적었습니다', '소스나 로드 모듈을 가진 누구나 비밀번호를 읽을 수 있습니다.', '보호된 데이터 세트나 보안 제품에서 읽으세요.'],
  "   DCL DB_PASSWORD CHAR(8) INIT('SECRET01');", '   DCL DB_PASSWORD CHAR(8);', { sonar: 'S2068' });
R('dynamic-sql', 'H', 'MA', 15, ['sql', 'cwe-89', 'owasp-a03'],
  /\bEXEC\s+SQL\s+(?:EXECUTE\s+IMMEDIATE|PREPARE\s+\w+\s+FROM)\s+:/i,
  ['Dynamic SQL', 'SQL text assembled at run time can be changed by the input it contains.', 'Use static SQL with host variables.'],
  ['동적 SQL입니다', '실행 중 조립한 SQL 문은 그 안에 든 입력으로 바뀔 수 있습니다.', '호스트 변수를 쓰는 정적 SQL을 쓰세요.'],
  '   EXEC SQL EXECUTE IMMEDIATE :SQL_TEXT;', '   EXEC SQL DELETE FROM ORDERS WHERE ID = :ORDER_ID;', { sonar: 'S2077' });
R('select-star', 'S', 'MA', 5, ['sql', 'performance'],
  /\bSELECT\s+\*\s/i,
  ['SELECT *', 'SELECT * breaks when columns change and reads data you do not need.', 'List the columns.'],
  ['SELECT *를 씁니다', 'SELECT *는 열이 바뀌면 깨지고 필요 없는 데이터까지 읽습니다.', '열을 나열하세요.'],
  '   EXEC SQL SELECT * INTO :CUST FROM CUSTOMER WHERE ID = :ID;', '   EXEC SQL SELECT NAME INTO :NAME FROM CUSTOMER WHERE ID = :ID;');
R('delete-without-where', 'B', 'CR', 15, ['sql'],
  /\bEXEC\s+SQL\s+DELETE\s+FROM\s+[\w.]+\s*;/i,
  ['DELETE without WHERE', 'Every row of the table is deleted.', 'Add a WHERE clause.'],
  ['WHERE 없는 DELETE입니다', '테이블의 모든 행이 지워집니다.', 'WHERE 절을 넣으세요.'],
  '   EXEC SQL DELETE FROM ORDERS;', '   EXEC SQL DELETE FROM ORDERS WHERE STATUS = :ST;');
R('default-range', 'S', 'MA', 10, ['types'],
  /\bDEFAULT\s+RANGE\s*\(\s*\*\s*\)/i,
  ['DEFAULT RANGE(*)', 'Blanket defaults hide undeclared variables and give them surprising attributes.', 'Declare every variable explicitly and use RULES(NOLAXDCL).'],
  ['DEFAULT RANGE(*)를 씁니다', '일괄 기본값은 선언하지 않은 변수를 숨기고 뜻밖의 속성을 줍니다.', '모든 변수를 명시적으로 선언하고 RULES(NOLAXDCL)를 쓰세요.'],
  '   DEFAULT RANGE(*) FIXED BIN(31);', '   DCL COUNT FIXED BIN(31);');
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '   /* TODO: handle ENDFILE */', '   /* ENDFILE is handled by EOF_UNIT. */', { scope: 'any', sonar: 'S1135' });

module.exports = { RULES: R.rules };
