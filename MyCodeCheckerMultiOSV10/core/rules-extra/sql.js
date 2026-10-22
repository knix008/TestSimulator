'use strict';

// SQL (generic, T-SQL, PL/SQL and PostgreSQL scripts).

const { maker } = require('./util');

const R = maker('sql', ['sql']);

R('update-without-where', 'B', 'CR', 10, ['data-loss'],
  /^\s*update\s+[\w.\[\]"`]+\s+set\b(?![^;]*\bwhere\b)[^;]*;/i,
  ['UPDATE without WHERE', 'The statement changes every row in the table.', 'Add a WHERE clause, or state the intent with WHERE 1 = 1 and a comment.'],
  ['WHERE 없는 UPDATE입니다', '이 문장은 테이블의 모든 행을 바꿉니다.', 'WHERE 절을 넣거나 WHERE 1 = 1과 주석으로 의도를 밝히세요.'],
  "UPDATE users SET active = 0;", "UPDATE users SET active = 0 WHERE last_login < '2020-01-01';");
R('null-comparison', 'B', 'CR', 5, ['pitfall'],
  /\b(?:where|and|or|on|when|having)\s+[\w.]+\s*(?:=|<>|!=)\s*null\b/i,
  ['Comparison with NULL using = or <>', 'col = NULL is never true; NULL compares as unknown.', 'Use IS NULL / IS NOT NULL.'],
  ['= 나 <>로 NULL과 비교합니다', 'col = NULL은 절대 참이 아니며 NULL은 알 수 없음으로 비교됩니다.', 'IS NULL / IS NOT NULL을 쓰세요.'],
  'SELECT * FROM t WHERE deleted_at = NULL;', 'SELECT * FROM t WHERE deleted_at IS NULL;');
R('not-in-subquery', 'B', 'MA', 10, ['pitfall'],
  /\bnot\s+in\s*\(\s*select\b/i,
  ['NOT IN with a subquery', 'If the subquery returns a NULL, NOT IN returns no rows at all.', 'Use NOT EXISTS.'],
  ['서브쿼리와 NOT IN을 씁니다', '서브쿼리가 NULL을 하나라도 돌려주면 NOT IN은 아무 행도 돌려주지 않습니다.', 'NOT EXISTS를 쓰세요.'],
  'SELECT * FROM a WHERE id NOT IN (SELECT a_id FROM b);', 'SELECT * FROM a WHERE NOT EXISTS (SELECT 1 FROM b WHERE b.a_id = a.id);');
R('nolock-hint', 'B', 'MA', 10, ['concurrency'],
  /\bwith\s*\(\s*nolock\s*\)|\bread\s+uncommitted\b/i,
  ['NOLOCK / READ UNCOMMITTED', 'Dirty reads can return rows twice, skip rows or read rolled-back data.', 'Use READ COMMITTED SNAPSHOT or a proper isolation level.'],
  ['NOLOCK / READ UNCOMMITTED를 씁니다', '더티 읽기는 행을 두 번 돌려주거나 건너뛰거나 롤백된 데이터를 읽을 수 있습니다.', 'READ COMMITTED SNAPSHOT이나 적절한 격리 수준을 쓰세요.'],
  'SELECT * FROM orders WITH (NOLOCK);', 'SELECT * FROM orders;');
R('float-money', 'B', 'MA', 10, ['pitfall'],
  /\b\w*(?:price|amount|cost|balance|total|salary|fee|money)\w*\s+(?:float|real|double(?:\s+precision)?)\b/i,
  ['Money stored as a floating type', 'Binary floating point cannot represent most decimal amounts exactly.', 'Use DECIMAL / NUMERIC with a fixed scale.'],
  ['금액을 부동소수점 타입으로 저장합니다', '이진 부동소수점은 대부분의 십진 금액을 정확히 표현하지 못합니다.', '고정 소수 자릿수의 DECIMAL / NUMERIC을 쓰세요.'],
  'price FLOAT NOT NULL,', 'price DECIMAL(12, 2) NOT NULL,');
R('drop-object', 'H', 'MA', 5, ['data-loss'],
  /\bdrop\s+(?:table|database|schema|view|procedure|function|user)\b/i,
  ['DROP statement', 'Dropping objects destroys data and permissions and cannot be undone.', 'Check the target and keep a backup; prefer migrations with a rollback.'],
  ['DROP 문입니다', '객체를 삭제하면 데이터와 권한이 사라지며 되돌릴 수 없습니다.', '대상을 확인하고 백업을 두며 롤백이 있는 마이그레이션을 쓰세요.'],
  'DROP TABLE customers;', 'ALTER TABLE customers ADD COLUMN note TEXT;');
R('truncate-table', 'H', 'MA', 5, ['data-loss'],
  /\btruncate\s+table\b/i,
  ['TRUNCATE TABLE', 'TRUNCATE removes every row without firing triggers or logging rows.', 'Make sure the target is correct and backed up.'],
  ['TRUNCATE TABLE입니다', 'TRUNCATE는 트리거와 행 로그 없이 모든 행을 지웁니다.', '대상이 맞는지, 백업이 있는지 확인하세요.'],
  'TRUNCATE TABLE audit_log;', "DELETE FROM audit_log WHERE created < '2020-01-01';");
R('leading-wildcard-like', 'S', 'MI', 5, ['performance'],
  /\blike\s+(?:N)?['"]%/i,
  ['LIKE with a leading wildcard', 'A leading % prevents index use and forces a full scan.', 'Use a full-text index, or anchor the pattern at the start.'],
  ['앞쪽 와일드카드 LIKE입니다', '앞의 %는 인덱스를 못 쓰게 해 전체 스캔을 강제합니다.', '전문 검색 인덱스를 쓰거나 패턴을 앞에 고정하세요.'],
  "SELECT * FROM users WHERE email LIKE '%@example.com';", "SELECT * FROM users WHERE email LIKE 'admin%';");
R('union-without-all', 'S', 'IN', 2, ['performance'],
  /\bunion\b(?!\s+all\b)/i,
  ['UNION without ALL', 'UNION sorts and removes duplicates, which is often not needed.', 'Use UNION ALL when duplicates are impossible or acceptable.'],
  ['ALL 없는 UNION입니다', 'UNION은 정렬하고 중복을 지우는데 보통 필요 없습니다.', '중복이 없거나 괜찮으면 UNION ALL을 쓰세요.'],
  'SELECT id FROM a UNION SELECT id FROM b;', 'SELECT id FROM a UNION ALL SELECT id FROM b;');
R('order-by-ordinal', 'S', 'MI', 2, ['maintainability'],
  /\border\s+by\s+\d+\b/i,
  ['ORDER BY column number', 'ORDER BY 2 silently changes meaning when the select list changes.', 'Order by column names.'],
  ['열 번호로 ORDER BY합니다', 'ORDER BY 2는 선택 목록이 바뀌면 조용히 의미가 바뀝니다.', '열 이름으로 정렬하세요.'],
  'SELECT name, age FROM people ORDER BY 2;', 'SELECT name, age FROM people ORDER BY age;');
R('group-by-ordinal', 'S', 'MI', 2, ['maintainability'],
  /\bgroup\s+by\s+\d+\b/i,
  ['GROUP BY column number', 'GROUP BY 1 silently changes meaning when the select list changes.', 'Group by column names.'],
  ['열 번호로 GROUP BY합니다', 'GROUP BY 1은 선택 목록이 바뀌면 조용히 의미가 바뀝니다.', '열 이름으로 묶으세요.'],
  'SELECT dept, count(*) FROM emp GROUP BY 1;', 'SELECT dept, count(*) FROM emp GROUP BY dept;');
R('insert-without-columns', 'S', 'MA', 5, ['maintainability'],
  /\binsert\s+into\s+[\w.\[\]"`]+\s+values\b/i,
  ['INSERT without a column list', 'The statement breaks or writes to the wrong columns when the table changes.', 'List the target columns.'],
  ['열 목록 없는 INSERT입니다', '테이블이 바뀌면 문장이 깨지거나 엉뚱한 열에 씁니다.', '대상 열을 나열하세요.'],
  "INSERT INTO users VALUES (1, 'a');", "INSERT INTO users (id, name) VALUES (1, 'a');");
R('cursor', 'S', 'MI', 10, ['performance'],
  /\bdeclare\s+\w+\s+(?:\w+\s+)*cursor\b/i,
  ['Cursor declared', 'Row-by-row processing is usually much slower than a set-based statement.', 'Rewrite as a set-based UPDATE / INSERT ... SELECT.'],
  ['커서를 선언합니다', '행 단위 처리는 보통 집합 기반 문장보다 훨씬 느립니다.', '집합 기반 UPDATE / INSERT ... SELECT로 바꾸세요.'],
  'DECLARE c CURSOR FOR SELECT id FROM t;', 'UPDATE t SET flag = 1 WHERE id IN (SELECT id FROM s);');
R('goto', 'S', 'MA', 10, ['confusing'],
  /\bgoto\s+\w+/i,
  ['GOTO statement', 'GOTO makes procedures hard to follow.', 'Use structured control flow such as IF / WHILE / TRY.'],
  ['GOTO 문입니다', 'GOTO는 프로시저를 따라가기 어렵게 합니다.', 'IF / WHILE / TRY 같은 구조적 흐름을 쓰세요.'],
  'GOTO cleanup;', 'RETURN;');
R('function-on-column-in-where', 'S', 'MI', 5, ['performance'],
  /\bwhere\s+(?:upper|lower|trim|ltrim|rtrim|convert|cast|year|month|day|substring|left|right|date|isnull|coalesce)\s*\(/i,
  ['Function applied to a column in WHERE', 'Wrapping the column in a function prevents index use.', 'Compare the raw column with a transformed value or add a computed index.'],
  ['WHERE에서 열에 함수를 씌웁니다', '열을 함수로 감싸면 인덱스를 못 씁니다.', '원래 열을 변환한 값과 비교하거나 계산 인덱스를 추가하세요.'],
  "SELECT * FROM orders WHERE YEAR(created) = 2024;", "SELECT * FROM orders WHERE created >= '2024-01-01' AND created < '2025-01-01';");
R('identified-by-literal', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\bidentified\s+by\s+(?:password\s+)?['"][^'"]+['"]|\bwith\s+password\s*=\s*(?:N)?'[^']+'/i,
  ['Password literal in a user definition', 'The password is stored in the script and in its history.', 'Set the password from a secret at deploy time.'],
  ['사용자 정의에 비밀번호 리터럴이 있습니다', '비밀번호가 스크립트와 그 이력에 저장됩니다.', '배포 시점에 시크릿에서 비밀번호를 설정하세요.'],
  "CREATE USER app IDENTIFIED BY 'S3cret!';", 'CREATE USER app IDENTIFIED BY :app_password;');
R('grant-to-public', 'V', 'CR', 15, ['cwe-732', 'owasp-a01'],
  /\bgrant\b[^;]*\bto\s+public\b/i,
  ['Privilege granted to PUBLIC', 'PUBLIC includes every current and future database user.', 'Grant to a specific role.'],
  ['PUBLIC에 권한을 줍니다', 'PUBLIC은 현재와 미래의 모든 데이터베이스 사용자를 포함합니다.', '특정 역할에 권한을 주세요.'],
  'GRANT SELECT ON salaries TO PUBLIC;', 'GRANT SELECT ON salaries TO hr_reader;');
R('xp-cmdshell', 'V', 'CR', 30, ['cwe-78', 'owasp-a03'],
  /\bxp_cmdshell\b/i,
  ['xp_cmdshell used or enabled', 'xp_cmdshell runs operating-system commands from SQL.', 'Keep it disabled and move OS work out of the database.'],
  ['xp_cmdshell을 쓰거나 켭니다', 'xp_cmdshell은 SQL에서 운영체제 명령을 실행합니다.', '꺼 두고 OS 작업은 데이터베이스 밖으로 옮기세요.'],
  "EXEC xp_cmdshell 'dir c:\\';", "EXEC sp_configure 'show advanced options', 0;");
R('dynamic-sql-concat', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  /\b(?:sp_executesql|execute\s+immediate|exec\s*\(\s*@\w+)\b[^;]*(?:\+|\|\|)|\b(?:execute|exec)\s+immediate\s+['"][^'"]*['"]\s*\|\|/i,
  ['Dynamic SQL built by concatenation', 'Concatenated values in dynamic SQL allow injection.', 'Pass parameters to sp_executesql or use USING binds.'],
  ['문자열 연결로 동적 SQL을 만듭니다', '동적 SQL에 이어 붙인 값은 주입을 허용합니다.', 'sp_executesql에 매개변수를 넘기거나 USING 바인드를 쓰세요.'],
  "EXECUTE IMMEDIATE 'DELETE FROM t WHERE id = ' || p_id;", "EXECUTE IMMEDIATE 'DELETE FROM t WHERE id = :1' USING p_id;");
R('implicit-join', 'S', 'MI', 5, ['maintainability'],
  /\bfrom\s+[\w.]+(?:\s+(?:as\s+)?\w+)?\s*,\s*[\w.]+(?:\s+(?:as\s+)?\w+)?\s+where\b/i,
  ['Comma-separated join', 'Old-style joins hide the join condition in WHERE and turn into cross joins when it is missing.', 'Write explicit JOIN ... ON.'],
  ['쉼표로 이은 조인입니다', '예전 방식 조인은 조인 조건을 WHERE에 숨기고 빠지면 교차 조인이 됩니다.', '명시적인 JOIN ... ON을 쓰세요.'],
  'SELECT * FROM orders o, customers c WHERE o.cid = c.id;', 'SELECT * FROM orders o JOIN customers c ON o.cid = c.id;');
R('order-by-random', 'S', 'MI', 5, ['performance'],
  /\border\s+by\s+(?:rand|random|newid|dbms_random\.value)\s*(?:\(\s*\))?/i,
  ['ORDER BY random()', 'Sorting the whole table by a random value is slow on large tables.', 'Sample with TABLESAMPLE or a random key range.'],
  ['ORDER BY random()을 씁니다', '테이블 전체를 무작위 값으로 정렬하면 큰 테이블에서 느립니다.', 'TABLESAMPLE이나 무작위 키 범위로 표본을 뽑으세요.'],
  'SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1;', 'SELECT * FROM quotes TABLESAMPLE SYSTEM (1) LIMIT 1;');
R('sp-prefix', 'S', 'MI', 2, ['convention', 'performance'],
  /\bcreate\s+(?:or\s+alter\s+)?proc(?:edure)?\s+(?:\[?\w+\]?\.)?\[?sp_/i,
  ['Stored procedure named sp_', 'SQL Server looks for sp_ procedures in master first, which costs time and can pick the wrong one.', 'Use another prefix, such as usp_.'],
  ['sp_로 시작하는 저장 프로시저입니다', 'SQL Server는 sp_ 프로시저를 master에서 먼저 찾아 시간이 들고 엉뚱한 것을 고를 수 있습니다.', 'usp_ 같은 다른 접두사를 쓰세요.'],
  'CREATE PROCEDURE dbo.sp_GetUser @id INT AS', 'CREATE PROCEDURE dbo.usp_GetUser @id INT AS');

module.exports = { RULES: R.rules };
