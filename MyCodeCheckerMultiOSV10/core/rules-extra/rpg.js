'use strict';

// IBM i RPG (RPGLE / SQLRPGLE, mostly free format). Indicator-driven logic,
// GOTO, copy members, embedded SQL and command injection through QCMDEXC.

const { maker } = require('./util');

const R = maker('rpg', ['rpg']);

R('goto', 'S', 'MA', 10, ['brain-overload'],
  /(?:^|\s)(?:GOTO|CAB(?:EQ|NE|LT|LE|GT|GE)?)\s+\w+/i,
  ['GOTO / CABxx branch', 'Branching to tags makes control flow hard to follow.', 'Use DOW / DOU / IF / SELECT and procedures.'],
  ['GOTO / CABxx 분기입니다', '태그로 분기하면 제어 흐름을 따라가기 어렵습니다.', 'DOW / DOU / IF / SELECT와 프로시저를 쓰세요.'],
  '       GOTO ENDPGM;', '       LEAVE;', { ref: 'S907' });
R('numbered-indicator', 'S', 'MA', 5, ['readability'],
  /\*IN\d{2}\b|\*IN\(\s*\d+\s*\)/i,
  ['Numbered indicator', '*IN01..*IN99 carry no meaning and are shared by the whole program.', 'Use named indicators or boolean (N) variables.'],
  ['번호 표시자를 씁니다', '*IN01..*IN99는 뜻이 없고 프로그램 전체가 함께 씁니다.', '이름 있는 표시자나 불(N) 변수를 쓰세요.'],
  '       IF *IN03;', '       IF exitRequested;');
R('halt-indicator', 'B', 'MA', 10, ['error-handling'],
  /\*INH[1-9]\b/i,
  ['Halt indicator', 'Halt indicators end the program abnormally with little information.', 'Signal an escape message or return an error code.'],
  ['정지 표시자를 씁니다', '정지 표시자는 정보가 거의 없이 프로그램을 비정상 종료합니다.', '이스케이프 메시지를 보내거나 오류 코드를 돌려주세요.'],
  '       *INH1 = *ON;', '       sendEscape(\'CPF9898\': msgText);');
R('copy-member', 'S', 'MI', 5, ['design'],
  /^\s*\/COPY\b/i,
  ['/COPY of source members', 'Copied source hides code and duplicates it in every program.', 'Use /INCLUDE for prototypes only and put shared logic in service programs.'],
  ['/COPY로 소스 멤버를 복사합니다', '복사한 소스는 코드를 숨기고 프로그램마다 중복시킵니다.', '프로토타입에만 /INCLUDE를 쓰고 공통 로직은 서비스 프로그램에 두세요.'],
  '      /COPY QRPGLESRC,CUSTLOGIC', '      /INCLUDE QPROTOSRC,CUSTAPI');
R('subroutine', 'S', 'MI', 10, ['design'],
  /^\s*(?:EXSR|BEGSR)\s+\w+/i,
  ['Subroutine instead of a procedure', 'Subroutines share all program variables and have no parameters.', 'Use subprocedures with prototypes.'],
  ['프로시저 대신 서브루틴을 씁니다', '서브루틴은 프로그램 변수를 모두 공유하고 매개변수가 없습니다.', '프로토타입이 있는 하위 프로시저를 쓰세요.'],
  '       EXSR calcTotals;', '       total = calcTotals(items);');
R('obsolete-opcode', 'S', 'MI', 5, ['obsolete'],
  /^\s*(?:C\s+.*)?\b(?:MOVEL?|Z-ADD|Z-SUB|MULT|DIV|ADD|SUB)\s+\S+\s+\S+/i,
  ['Obsolete fixed-form opcode', 'MOVE, MOVEL, Z-ADD and the arithmetic opcodes are hard to read and silently truncate.', 'Use free-form EVAL expressions and %EDITC / %CHAR.'],
  ['없어진 고정 형식 연산 코드입니다', 'MOVE, MOVEL, Z-ADD와 산술 연산 코드는 읽기 어렵고 조용히 잘라 냅니다.', '자유 형식 EVAL 식과 %EDITC / %CHAR를 쓰세요.'],
  '     C                   MOVEL     CUSNAM        WKNAME', '       wkName = cusNam;');
R('dsply', 'S', 'MI', 2, ['debug'],
  /(?:^|\s)DSPLY\b/i,
  ['DSPLY debug output', 'DSPLY waits for an operator reply in batch and leaks data to the job log.', 'Write to a log or message queue.'],
  ['DSPLY 디버그 출력입니다', 'DSPLY는 일괄 작업에서 운영자 응답을 기다리고 작업 로그로 데이터를 흘립니다.', '로그나 메시지 큐에 쓰세요.'],
  '       DSPLY custNo;', '       log(\'processed \' + %char(custNo));', { ref: 'S106' });
R('on-error-all', 'S', 'MI', 5, ['error-handling', 'cwe-396'],
  /^\s*ON-ERROR\s*;/i,
  ['ON-ERROR without status codes', 'A bare ON-ERROR catches every error, including programming mistakes.', 'List the status codes you expect.'],
  ['상태 코드 없는 ON-ERROR입니다', '그냥 ON-ERROR는 프로그래밍 실수를 포함해 모든 오류를 잡습니다.', '예상하는 상태 코드를 나열하세요.'],
  '       ON-ERROR;', '       ON-ERROR 1211;');
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret)\w*\b[^;]*(?:INZ\s*\(\s*'[^'\s]{4,}'\s*\)|=\s*'[^'\s]{4,}')/i,
  ['Hard-coded password', 'Anyone with the source or program object can read the password.', 'Read it from a validation list or a protected data area.'],
  ['비밀번호를 코드에 적었습니다', '소스나 프로그램 객체를 가진 누구나 비밀번호를 읽을 수 있습니다.', '검증 목록이나 보호된 데이터 영역에서 읽으세요.'],
  "       DCL-S password CHAR(10) INZ('SECRET01');", '       DCL-S password CHAR(10);', { ref: 'S2068' });
R('qcmdexc-concat', 'V', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\bQCMDEXC\s*\([^)]*\+/i,
  ['QCMDEXC command built by concatenation', 'Values joined into a CL command can run other commands.', 'Validate every value, or call the API that does the job directly.'],
  ['문자열을 이어 QCMDEXC 명령을 만듭니다', 'CL 명령에 이어 붙인 값이 다른 명령을 실행할 수 있습니다.', '모든 값을 검증하거나 해당 작업을 하는 API를 직접 부르세요.'],
  "       QCMDEXC('DLTF FILE(' + libName + '/' + fileName + ')': 80);", "       QCMDEXC('DLTF FILE(QTEMP/WORK)': 22);");
R('dynamic-sql', 'H', 'MA', 15, ['sql', 'cwe-89', 'owasp-a03'],
  /\bEXEC\s+SQL\s+(?:EXECUTE\s+IMMEDIATE|PREPARE\s+\w+\s+FROM)\s+:/i,
  ['Dynamic SQL', 'SQL text assembled at run time can be changed by the input it contains.', 'Use static SQL with host variables or parameter markers.'],
  ['동적 SQL입니다', '실행 중 조립한 SQL 문은 그 안에 든 입력으로 바뀔 수 있습니다.', '호스트 변수나 매개변수 표시를 쓰는 정적 SQL을 쓰세요.'],
  '       EXEC SQL EXECUTE IMMEDIATE :sqlText;', '       EXEC SQL DELETE FROM orders WHERE id = :orderId;', { ref: 'S2077' });
R('select-star', 'S', 'MA', 5, ['sql', 'performance'],
  /\bSELECT\s+\*\s/i,
  ['SELECT *', 'SELECT * breaks when columns change and reads data you do not need.', 'List the columns.'],
  ['SELECT *를 씁니다', 'SELECT *는 열이 바뀌면 깨지고 필요 없는 데이터까지 읽습니다.', '열을 나열하세요.'],
  '       EXEC SQL SELECT * INTO :cust FROM customer WHERE id = :id;', '       EXEC SQL SELECT name, city INTO :name, :city FROM customer WHERE id = :id;');
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '       // TODO: handle locked records', '       // Locked records are retried by retryRead.', { scope: 'any', ref: 'S1135' });

module.exports = { RULES: R.rules };
