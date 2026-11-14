'use strict';

// Baseline lint for every language except C and C++ (those two live in
// core/rules.js, keys lint:c-*). One shared pair (long lines, mixed
// indentation) plus the check a language's usual linter starts with.
// Security and bug rules stay in the other catalogs.

const { LANGS } = require('../languages');
const { maker } = require('./util');

const ALL = Object.keys(LANGS).filter((id) => id !== 'c' && id !== 'cpp');
const R = maker('lint', ALL);

const LONG = `const label = '${'x'.repeat(130)}';`;

R('long-line', 'S', 'MI', 1, ['style'],
  /.{120}/,
  ['Line is longer than 120 characters', 'A very long line is hard to read and to review in a diff.', 'Break the line, or move the long value out of the source.'],
  ['120자를 넘는 줄입니다', '아주 긴 줄은 읽기 어렵고 diff에서 검토하기도 어렵습니다.', '줄을 나누거나 긴 값을 소스 밖으로 빼세요.'],
  LONG, 'const label = "ok";');

R('mixed-indent', 'S', 'MI', 1, ['style'],
  /^(?: +\t|\t+ +)\S/,
  ['Tabs and spaces are mixed in the indentation', 'Mixed indentation looks aligned in one editor and broken in another.', 'Use either spaces or tabs for the whole file.'],
  ['들여쓰기에 탭과 공백이 섞여 있습니다', '섞인 들여쓰기는 편집기마다 정렬이 달라 보입니다.', '파일 전체에서 공백이나 탭 중 하나만 쓰세요.'],
  ' \tconst label = 1;', ['  const label = 1;', '\tconst label = 1;']);

R('js-extra-semi', 'S', 'MI', 1, ['style'],
  /;\s*;/,
  ['Extra semicolon', 'An empty statement usually means a stray semicolon.', 'Delete the extra semicolon.'],
  ['세미콜론이 하나 더 있습니다', '빈 문장은 보통 세미콜론이 하나 더 붙은 것입니다.', '남은 세미콜론을 지우세요.'],
  'const label = 1;;', ['const label = 1;', 'for (;;) { work(); }'],
  { langs: ['js'], ns: true, skip: (raw, line) => /\bfor\s*\(/.test(line) });

R('js-new-wrapper', 'S', 'MI', 2, ['style'],
  /\bnew\s+(?:String|Number|Boolean)\s*\(/,
  ['Wrapper constructed with new', 'new String, new Number and new Boolean create objects, not primitives, so comparisons surprise you.', 'Call String, Number or Boolean without new, or use a literal.'],
  ['new로 래퍼를 만들었습니다', 'new String, new Number, new Boolean은 원시 값이 아닌 객체를 만들어 비교가 뜻밖입니다.', 'new 없이 호출하거나 리터럴을 쓰세요.'],
  'const label = new String(text);', 'const label = String(text);',
  { langs: ['js'], ns: true });

R('js-throw-literal', 'S', 'MI', 2, ['style'],
  /\bthrow\s+(?:['"`]|\d|true\b|false\b|null\b)/,
  ['Throwing a literal', 'A thrown string or number has no stack you can catch by type.', 'Throw an Error.'],
  ['리터럴을 던집니다', '던진 문자열이나 숫자는 타입으로 잡을 스택이 없습니다.', 'Error를 던지세요.'],
  'throw "failed";', 'throw new Error("failed");',
  { langs: ['js'], ns: true });

R('py-none-cmp', 'S', 'MI', 2, ['style'],
  /(?:==|!=)\s*None\b|\bNone\s*(?:==|!=)/,
  ['Comparison with None', '== None is true for other values that compare equal in odd ways. Identity is the check.', 'Use is None or is not None.'],
  ['None과 값을 비교합니다', '== None은 다른 값과도 참이 될 수 있습니다. 동일성으로 봐야 합니다.', 'is None 또는 is not None을 쓰세요.'],
  'if value == None:', 'if value is None:',
  { langs: ['py'] });

R('py-eq-bool', 'S', 'MI', 1, ['style'],
  /(?:==|!=)\s*(?:True|False)\b|\b(?:True|False)\s*(?:==|!=)/,
  ['Comparison with True or False', '== True is not the same as a truth check and rejects values such as 1.', 'Use the value directly, or is True when identity matters.'],
  ['True 또는 False와 비교합니다', '== True는 참인지 보는 것과 다르며 1 같은 값을 놓칩니다.', '값을 그대로 쓰거나, 동일성이 필요할 때만 is True를 쓰세요.'],
  'if ready == True:', 'if ready:',
  { langs: ['py'] });

R('py-lambda-assign', 'S', 'MI', 2, ['style'],
  /^\s*\w+\s*=\s*lambda\b/,
  ['Lambda assigned to a name', 'A named lambda has no useful traceback. A def does.', 'Write a def.'],
  ['람다를 이름에 넣었습니다', '이름이 있는 람다는 추적 정보가 부실합니다. def는 있습니다.', 'def로 쓰세요.'],
  'double = lambda n: n * 2', 'def double(n):\n    return n * 2',
  { langs: ['py'] });

R('java-stderr', 'S', 'MI', 2, ['style'],
  /\bSystem\.err\.print(?:ln)?\s*\(/,
  ['System.err print left in', 'Error-stream prints bypass the application log and its levels.', 'Log through the application logger.'],
  ['System.err 출력이 남아 있습니다', '오류 스트림 출력은 애플리케이션 로그와 그 단계를 건너뜁니다.', '애플리케이션 로거로 남기세요.'],
  'System.err.println(detail);', 'logger.error("failed", detail);',
  { langs: ['java'], ns: true });

R('kt-bang', 'S', 'MI', 2, ['style'],
  /(?<![=!])!!(?!=)/,
  ['Non-null assertion', '!! throws if the value is null, at a line that does not say why.', 'Handle the null, or use ?.'],
  ['널이 아니라고 단정합니다', '!!는 값이 널이면 던지는데, 그 줄에는 이유가 없습니다.', '널을 처리하거나 ?.를 쓰세요.'],
  'val label = user!!.name', 'val label = user?.name',
  { langs: ['java'], lang: 'kt', ns: true });

R('cs-console', 'S', 'MI', 2, ['style'],
  /\bConsole\.(?:Write|WriteLine)\s*\(/,
  ['Console output left in', 'Console writes show up in whatever hosts the process and skip the log.', 'Use the application logger.'],
  ['Console 출력이 남아 있습니다', 'Console 출력은 프로세스를 띄운 곳에 그대로 나오고 로그를 건너뜁니다.', '애플리케이션 로거를 쓰세요.'],
  'Console.WriteLine(user);', 'logger.LogInformation("user {Id}", user.Id);',
  { langs: ['cs'], ns: true });

R('go-print', 'S', 'MI', 2, ['style'],
  /\bfmt\.Print(?:ln|f)?\s*\(/,
  ['fmt print left in', 'fmt prints are debug output with no level and no structure.', 'Use the application log.'],
  ['fmt 출력이 남아 있습니다', 'fmt 출력은 단계도 구조도 없는 디버그 출력입니다.', '애플리케이션 로그를 쓰세요.'],
  'fmt.Println(user)', 'log.Printf("user %s", user)',
  { langs: ['go'], ns: true });

R('rs-unwrap', 'S', 'MI', 2, ['style'],
  /\.(?:unwrap|expect)\s*\(/,
  ['unwrap or expect', 'unwrap and expect panic on failure instead of returning the error.', 'Propagate the error with ? or handle it.'],
  ['unwrap 또는 expect입니다', 'unwrap과 expect는 실패를 반환하지 않고 패닉합니다.', '?로 오류를 올리거나 처리하세요.'],
  'let n = text.parse::<i32>().unwrap();', 'let n = text.parse::<i32>()?;',
  { langs: ['rs'], ns: true });

R('php-dump', 'S', 'MI', 2, ['style'],
  /\b(?:var_dump|print_r|var_export)\s*\(/,
  ['Debug dump left in', 'var_dump and print_r write internal values to the response.', 'Log through the application logger and remove the dump.'],
  ['디버그 덤프가 남아 있습니다', 'var_dump와 print_r은 내부 값을 응답에 씁니다.', '애플리케이션 로거를 쓰고 덤프는 지우세요.'],
  'var_dump($user);', '$log->info($user->id);',
  { langs: ['php'], ns: true });

R('php-short-tag', 'S', 'MI', 2, ['style'],
  /<\?(?!php\b|=)/,
  ['Short open tag', '<? depends on a php.ini flag and is easy to miss next to XML.', 'Open with <?php.'],
  ['짧은 열기 태그입니다', '<?는 php.ini 설정에 기대고 XML 옆에서 빠지기 쉽습니다.', '<?php로 여세요.'],
  '<? echo $name;', '<?php echo $name;',
  { langs: ['php'] });

R('rb-puts', 'S', 'MI', 1, ['style'],
  /(?<![\w.])puts\b/,
  ['puts left in', 'puts writes to stdout with no level.', 'Use the application logger.'],
  ['puts가 남아 있습니다', 'puts는 단계 없이 표준 출력에 씁니다.', '애플리케이션 로거를 쓰세요.'],
  'puts user.inspect', 'logger.info(user.id)',
  { langs: ['rb'] });

R('sh-backtick', 'S', 'MI', 2, ['style'],
  /`[^`\n]+`/,
  ['Backtick command substitution', 'Backticks do not nest and are easy to miss.', 'Use $(...).'],
  ['백틱으로 명령 치환을 했습니다', '백틱은 중첩되지 않고 눈에 잘 띄지 않습니다.', '$(...)를 쓰세요.'],
  'files=`ls`', 'files=$(ls)',
  { langs: ['sh'] });

R('sh-debug', 'S', 'MI', 2, ['style'],
  /\bset\s+-[A-Za-z]*x\b/,
  ['Shell trace left on', 'set -x prints every command, including values that should stay quiet.', 'Remove the x flag.'],
  ['셸 추적이 켜져 있습니다', 'set -x는 조용히 있어야 할 값까지 명령마다 출력합니다.', 'x 플래그를 지우세요.'],
  'set -x', 'set -eu',
  { langs: ['sh'] });

R('ps-host', 'S', 'MI', 1, ['style'],
  /\bWrite-Host\b/,
  ['Write-Host', 'Write-Host goes to the host, not the pipeline, so callers cannot capture it.', 'Use Write-Output or a logger.'],
  ['Write-Host입니다', 'Write-Host는 파이프라인이 아니라 호스트로 가서 호출하는 쪽이 받을 수 없습니다.', 'Write-Output이나 로거를 쓰세요.'],
  'Write-Host $user', 'Write-Output $user',
  { langs: ['ps1'] });

R('sql-ordinal', 'S', 'MI', 2, ['style'],
  /\bORDER\s+BY\s+\d+\b/i,
  ['ORDER BY column number', 'A positional ORDER BY breaks when the select list is reordered.', 'Name the column.'],
  ['ORDER BY에 열 번호를 썼습니다', '위치 번호 ORDER BY는 select 목록 순서가 바뀌면 깨집니다.', '열 이름을 쓰세요.'],
  'SELECT id, name FROM users ORDER BY 1;', 'SELECT id, name FROM users ORDER BY id;',
  { langs: ['sql'] });

R('html-style', 'S', 'IN', 1, ['style'],
  /\sstyle\s*=/i,
  ['Inline style', 'Inline styles bypass the stylesheet and are hard to keep consistent.', 'Use a class.'],
  ['인라인 스타일입니다', '인라인 스타일은 스타일시트를 건너뛰어 맞추기 어렵습니다.', '클래스를 쓰세요.'],
  '<p style="color:red">hi</p>', '<p class="warn">hi</p>',
  { langs: ['html'] });

R('css-zero', 'S', 'IN', 1, ['style'],
  /:\s*0(?:px|em|rem|pt|%)\b/,
  ['Unit on a zero length', 'Zero is zero in every unit; the unit is noise.', 'Write 0.'],
  ['0에 단위가 붙어 있습니다', '0은 어느 단위나 0이라 단위는 잡음입니다.', '0으로 쓰세요.'],
  '.box { margin: 0px; }', '.box { margin: 0; }',
  { langs: ['css'] });

R('json-comma', 'S', 'MA', 2, ['style'],
  /,(\s*[}\]])/,
  ['Trailing comma in JSON', 'A trailing comma is not valid JSON and fails strict parsers.', 'Remove the comma.'],
  ['JSON에 끝 쉼표가 있습니다', '끝 쉼표는 올바른 JSON이 아니라 엄격한 파서가 거절합니다.', '쉼표를 지우세요.'],
  '{ "a": 1, }', '{ "a": 1 }',
  { langs: ['json'] });

R('yaml-truthy', 'S', 'MI', 2, ['style'],
  /:\s*(?:yes|no|on|off)\s*(?:#.*)?$/i,
  ['YAML yes/no/on/off value', 'These words are booleans in YAML 1.1 and strings in YAML 1.2, so the type depends on the parser.', 'Write true or false, or quote the string.'],
  ['YAML yes/no/on/off 값입니다', '이 단어는 YAML 1.1에서는 불리언이고 1.2에서는 문자열이라 파서에 따라 타입이 달라집니다.', 'true 또는 false로 쓰거나 문자열이면 따옴표로 감싸세요.'],
  'enabled: yes', ['enabled: true', 'enabled: "yes"'],
  { langs: ['yaml'] });

R('docker-maintainer', 'S', 'MI', 1, ['style'],
  /^MAINTAINER\b/i,
  ['MAINTAINER instruction', 'MAINTAINER is obsolete and is not a label consumers can query.', 'Use a LABEL.'],
  ['MAINTAINER 명령입니다', 'MAINTAINER는 폐기되었고 소비자가 조회하는 레이블이 아닙니다.', 'LABEL을 쓰세요.'],
  'MAINTAINER ada@example.com', 'LABEL org.opencontainers.image.authors="ada@example.com"',
  { langs: ['docker'] });

R('tf-interp', 'S', 'MI', 1, ['style'],
  /=\s*"\$\{var\.[A-Za-z0-9_]+\}"/,
  ['Interpolation of a single variable', 'A string that is only ${var.name} is the old interpolation form.', 'Write var.name.'],
  ['변수 하나만 보간했습니다', '${var.name}만 있는 문자열은 옛 보간 형식입니다.', 'var.name으로 쓰세요.'],
  'name = "${var.name}"', ['name = var.name', 'name = "${var.name}-api"'],
  { langs: ['tf'] });

R('swift-print', 'S', 'MI', 1, ['style'],
  /(?<![\w.])print\s*\(/,
  ['print left in', 'print writes to standard output with no level.', 'Use the application logger.'],
  ['print가 남아 있습니다', 'print는 단계 없이 표준 출력에 씁니다.', '애플리케이션 로거를 쓰세요.'],
  'print(user)', 'logger.info("\\(user.id)")',
  { langs: ['swift'], ns: true });

R('objc-nslog', 'S', 'MI', 2, ['style'],
  /\bNSLog\s*\(/,
  ['NSLog left in', 'NSLog is synchronous debug output and can leak values into device logs.', 'Use os_log.'],
  ['NSLog가 남아 있습니다', 'NSLog는 동기 디버그 출력이고 기기 로그로 값이 샐 수 있습니다.', 'os_log를 쓰세요.'],
  'NSLog(@"user %@", user);', 'os_log(OS_LOG_DEFAULT, "user");',
  { langs: ['objc'], ns: true });

R('scala-println', 'S', 'MI', 1, ['style'],
  /(?<![\w.])println\s*\(/,
  ['println left in', 'println writes to stdout with no level.', 'Use the application logger.'],
  ['println이 남아 있습니다', 'println은 단계 없이 표준 출력에 씁니다.', '애플리케이션 로거를 쓰세요.'],
  'println(user)', 'logger.info(user.id)',
  { langs: ['scala'], ns: true });

R('dart-print', 'S', 'MI', 1, ['style'],
  /(?<![\w.])print\s*\(/,
  ['print left in', 'print is debug output and is stripped only in some release modes.', 'Use a logger.'],
  ['print가 남아 있습니다', 'print는 디버그 출력이고 일부 릴리스 모드에서만 빠집니다.', '로거를 쓰세요.'],
  'print(user);', 'logger.i(user.id);',
  { langs: ['dart'], ns: true });

R('vb-resume', 'S', 'MA', 5, ['style'],
  /\bOn\s+Error\s+Resume\s+Next\b/i,
  ['On Error Resume Next', 'Resume Next hides every error until something else fails far away.', 'Handle the error, or jump to a handler.'],
  ['On Error Resume Next입니다', 'Resume Next는 모든 오류를 숨겨 한참 뒤에서야 실패합니다.', '오류를 처리하거나 처리 루틴으로 점프하세요.'],
  'On Error Resume Next', 'On Error GoTo Fail',
  { langs: ['vbnet', 'vb6'] });

R('cobol-alter', 'S', 'MA', 5, ['style'],
  /\bALTER\s+[A-Z0-9-]+\s+TO\b/,
  ['ALTER statement', 'ALTER changes where a GO TO goes, so the program no longer reads as written.', 'Call the paragraph you mean.'],
  ['ALTER 문입니다', 'ALTER는 GO TO의 목적지를 바꿔 프로그램이 적힌 대로 읽히지 않습니다.', '원하는 단락을 호출하세요.'],
  'ALTER PROC-A TO PROC-B.', 'PERFORM PROC-A.',
  { langs: ['cobol'] });

R('plsql-others', 'S', 'MA', 5, ['style'],
  /\bWHEN\s+OTHERS\s+THEN\s+NULL\b/i,
  ['WHEN OTHERS THEN NULL', 'Swallowing every error hides the failure that should roll back or be logged.', 'Log it and re-raise, or handle a specific exception.'],
  ['WHEN OTHERS THEN NULL입니다', '모든 오류를 삼키면 롤백하거나 기록해야 할 실패가 숨습니다.', '기록하고 다시 일으키거나, 특정 예외만 처리하세요.'],
  'WHEN OTHERS THEN NULL;', 'WHEN OTHERS THEN RAISE;',
  { langs: ['plsql'] });

R('abap-break', 'S', 'MA', 2, ['style'],
  /\bBREAK-POINT\b/,
  ['BREAK-POINT left in', 'BREAK-POINT stops a dialog user and is ignored or harmful in a batch job.', 'Remove it before transport.'],
  ['BREAK-POINT가 남아 있습니다', 'BREAK-POINT는 대화 사용자를 멈추고 배치에서는 무시되거나 해를 줍니다.', '전송 전에 지우세요.'],
  'BREAK-POINT.', 'IF sy-subrc <> 0.',
  { langs: ['abap'] });

R('apex-debug', 'S', 'MI', 2, ['style'],
  /\bSystem\.debug\s*\(/,
  ['System.debug left in', 'System.debug writes to the debug log and can include data you did not mean to keep.', 'Use a logger and remove the call.'],
  ['System.debug가 남아 있습니다', 'System.debug는 디버그 로그에 쓰이며 남기려 하지 않은 데이터가 들어갈 수 있습니다.', '로거를 쓰고 호출을 지우세요.'],
  'System.debug(user);', 'log.info(user.Id);',
  { langs: ['apex'], ns: true });

R('rpg-dsply', 'S', 'MI', 2, ['style'],
  /\bdsply\b/i,
  ['dsply left in', 'dsply writes a message to the job and waits in an interactive job.', 'Remove the debug display.'],
  ['dsply가 남아 있습니다', 'dsply는 작업에 메시지를 쓰고 대화형 작업에서는 기다립니다.', '디버그 표시를 지우세요.'],
  'dsply message;', 'monitor;',
  { langs: ['rpg'] });

R('pli-put', 'S', 'MI', 1, ['style'],
  /\bPUT\s+SKIP\b/i,
  ['PUT SKIP left in', 'PUT SKIP writes a debug line to SYSPRINT.', 'Remove it or send the line through the application log.'],
  ['PUT SKIP이 남아 있습니다', 'PUT SKIP은 SYSPRINT에 디버그 줄을 씁니다.', '지우거나 애플리케이션 로그로 보내세요.'],
  'PUT SKIP LIST(user);', 'CALL log_user(user);',
  { langs: ['pli'] });

R('jcl-notify', 'S', 'IN', 1, ['style'],
  /,NOTIFY=/,
  ['NOTIFY on the JOB card', 'NOTIFY sends a message for every run, including batch jobs nobody is watching.', 'Drop NOTIFY unless an operator asked for it.'],
  ['JOB 카드에 NOTIFY가 있습니다', 'NOTIFY는 보는 사람이 없는 배치를 포함해 실행마다 메시지를 보냅니다.', '운영자가 요청하지 않았다면 NOTIFY를 빼세요.'],
  "//JOB1 JOB (ACCT),'NAME',NOTIFY=&SYSUID", "//JOB1 JOB (ACCT),'NAME'",
  { langs: ['jcl'] });

R('flex-trace', 'S', 'MI', 2, ['style'],
  /(?<![\w.])trace\s*\(/,
  ['trace left in', 'trace writes to the debugger and to flashlog on the client.', 'Remove the call.'],
  ['trace가 남아 있습니다', 'trace는 디버거와 클라이언트의 flashlog에 씁니다.', '호출을 지우세요.'],
  'trace(user);', 'logger.info(user);',
  { langs: ['flex'], ns: true });

R('bicep-any', 'S', 'MI', 2, ['style'],
  /\bparam\s+[A-Za-z_][A-Za-z0-9_]*\s+any\b/,
  ['Parameter typed any', 'any turns off type checking for everything passed to this parameter.', 'Name the object, array or primitive type.'],
  ['매개변수가 any입니다', 'any는 이 매개변수로 들어오는 값의 타입 검사를 끕니다.', '객체, 배열 또는 원시 타입을 적으세요.'],
  'param payload any', 'param payload object',
  { langs: ['bicep'] });

R('xml-tab', 'S', 'IN', 1, ['style'],
  /^\t+</,
  ['Tab indentation in XML', 'Tabs make XML diffs depend on the editor tab width.', 'Indent with spaces.'],
  ['XML을 탭으로 들여썼습니다', '탭은 편집기의 탭 너비에 따라 XML diff가 달라지게 합니다.', '공백으로 들여쓰세요.'],
  '\t<root>', '  <root>',
  { langs: ['xml'] });

module.exports = { RULES: R.rules };
