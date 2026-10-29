'use strict';

// Python.

const { maker, blankStrings } = require('./util');

const R = maker('py', ['py']);

function unbalancedClose(line) {
  let depth = 0;
  for (const c of blankStrings(line)) {
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
  }
  return depth < 0;
}

// Test code (pytest / unittest files and folders), where assert and print are
// the point. skip gets the file as { path } (or its path) when the caller passes it.
const PY_TEST_PATH = /(?:^|\/)(?:tests?|testing)\/|(?:^|\/)(?:test_[^/]*|[^/]*_tests?|conftest)\.py$/i;
function pyTestPath(file) {
  const p = typeof file === 'string' ? file : file && file.path;
  return !!p && PY_TEST_PATH.test(String(p).replace(/\\/g, '/'));
}

// ctx = { index, lines } (the line's index and the file's raw lines), when the
// caller passes it; without it these return false and the rule reports.
const indentOf = (s) => /^\s*/.exec(s)[0].replace(/\t/g, '        ').length;

// The except clause on lines[index] has a bare raise (or raise ... from) in its body.
function handlerReraises(ctx) {
  if (!ctx || !Array.isArray(ctx.lines) || ctx.index == null) return false;
  const head = String(ctx.lines[ctx.index]);
  const ind = indentOf(head);
  if (/:\s*raise\b/.test(head)) return true;
  for (let i = ctx.index + 1; i < ctx.lines.length && i < ctx.index + 200; i++) {
    const s = String(ctx.lines[i]);
    if (!s.trim() || /^\s*#/.test(s)) continue;
    if (indentOf(s) <= ind) return false;
    // raise / raise exc (the caught one) / raise Wrapped(...) from exc
    if (/^\s*raise\s*(?:$|#|[a-z_]\w*\s*(?:#.*)?$|.*\bfrom\s+[a-z_]\w*\s*(?:#.*)?$)/.test(s)) return true;
  }
  return false;
}

// The literal on this line is one piece of an implicit string concatenation:
// the previous line ends with a string and the line starts with one, or the
// next line starts with a string.
function inStringConcat(raw, ctx) {
  if (!ctx || !Array.isArray(ctx.lines) || ctx.index == null) return false;
  const cur = String(raw).trim();
  const prev = String(ctx.lines[ctx.index - 1] || '').replace(/#.*$/, '').trim();
  const next = String(ctx.lines[ctx.index + 1] || '').trim();
  const startsStr = (s) => /^[rRbBuUfF]{0,2}['"]/.test(s);
  if (startsStr(cur) && /['"]$/.test(prev)) return true;
  return /['"]$/.test(cur.replace(/#.*$/, '').trim()) && startsStr(next);
}

// ── Bugs ─────────────────────────────────────────────────────
R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*([A-Za-z_][\w.]*)\s+=\s+\1\s*$/,
  ['Variable is assigned to itself', 'Assigning a name to itself does nothing and usually hides a typo.', 'Assign the intended value or delete the line.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않고 보통 오타를 숨깁니다.', '의도한 값을 대입하거나 줄을 지우세요.'],
  'self.name = self.name', 'self.name = name');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w.])(?<![=!<>+\-*\/%]\s*)([A-Za-z_][\w.]*)(?:\s*(?:==|!=|<=|>=)\s*|\s+(?:and|or)\s+)\1(?![\w.(\[])(?=\s*(?:[):,]|and\b|or\b|$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use math.isnan for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 math.isnan을 쓰세요.'],
  'if a.size == a.size:', ['if a.size == b.size:', 'if n >= limit or limit == 0:', 'elif value != value:  # NaN'],
  { ns: true, skip: (raw) => /#.*\bnan\b/i.test(raw) });
R('is-literal', 'B', 'MA', 5, ['pitfall'],
  /(?:\b(?:if|elif|while|assert|return|and|or|not)\s+|[=,]\s*)[\w.\[\]]+\s+is\s+(?:not\s+)?(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)\s*(?::|\)|,|$|\b(?:and|or|else)\b)/,
  ['is used with a literal', 'is compares identity; small ints and strings are only sometimes the same object.', 'Use == or != for values.'],
  ['리터럴과 is로 비교합니다', 'is는 동일성을 비교하며 작은 정수와 문자열이 같은 객체인지는 경우에 따라 다릅니다.', '값 비교에는 == 또는 != 를 쓰세요.'],
  "if status is 'done':", ["if status == 'done':", 'if value is None:', 'set replication factor. default value is 3.'], { ns: true });
R('nan-comparison', 'B', 'CR', 5, ['pitfall'],
  /[=!]=\s*(?:float\(\s*['"]nan['"]\s*\)|(?:math|np|numpy)\.nan\b)/i,
  ['Comparison with NaN', 'NaN is not equal to anything, itself included.', 'Use math.isnan(x) or numpy.isnan(x).'],
  ['NaN과 비교합니다', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않습니다.', 'math.isnan(x)나 numpy.isnan(x)를 쓰세요.'],
  'if x == math.nan:', 'if math.isnan(x):');
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]=\s*-?\d+\.\d+(?![\d.])/,
  ['Equality test on a floating-point literal', 'Results like 0.1 + 0.2 are rarely exactly equal to a literal.', 'Use math.isclose(a, b).'],
  ['부동소수점 리터럴과 동등 비교합니다', '0.1 + 0.2 같은 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', 'math.isclose(a, b)를 쓰세요.'],
  'if ratio == 0.3:', 'if math.isclose(ratio, 0.3):', { ns: true });
R('assert-tuple', 'B', 'CR', 5, ['pitfall'],
  /^\s*assert\s*\((?:[^()]|\([^()]*\))*,(?:[^()]|\([^()]*\))*\)\s*$/,
  ['assert on a tuple', 'A non-empty tuple is always true, so this assert never fails.', 'Write assert condition, "message" without parentheses.'],
  ['튜플에 assert를 씁니다', '비어 있지 않은 튜플은 항상 참이라 이 assert는 실패하지 않습니다.', '괄호 없이 assert 조건, "메시지"로 쓰세요.'],
  "assert (count > 0, 'empty')", ["assert count > 0, 'empty'", 'assert (isinstance(data[0], str)', 'assert (x + y) * 2 == total']);
R('py2-except-syntax', 'B', 'CR', 5, ['python2'],
  /^\s*except\s+\w+\s*,\s*\w+\s*:/,
  ['Python 2 except syntax', 'except A, e: is a syntax error in Python 3.', 'Write except A as e:.'],
  ['Python 2 except 문법입니다', 'except A, e: 는 Python 3에서 문법 오류입니다.', 'except A as e: 로 쓰세요.'],
  'except ValueError, err:', 'except ValueError as err:');
R('raise-string', 'B', 'CR', 5, ['error-handling'],
  /\braise\s+['"]/,
  // ns below keeps prose inside string literals from matching
  ['String raised as an exception', 'Raising a string is a TypeError in Python 3.', 'Raise an exception instance, for example raise ValueError("...").'],
  ['문자열을 예외로 던집니다', 'Python 3에서 문자열을 raise하면 TypeError입니다.', 'raise ValueError("...")처럼 예외 인스턴스를 던지세요.'],
  "raise 'bad input'", ["raise ValueError('bad input')", 'pytest.skip(reason="impl may not raise "'], { ns: true });
R('raise-notimplemented', 'B', 'MA', 5, ['error-handling'],
  /\braise\s+NotImplemented\b(?!Error)/,
  ['raise NotImplemented', 'NotImplemented is a constant for binary operators, not an exception.', 'Raise NotImplementedError.'],
  ['raise NotImplemented를 씁니다', 'NotImplemented는 이항 연산자용 상수이지 예외가 아닙니다.', 'NotImplementedError를 던지세요.'],
  'raise NotImplemented', 'raise NotImplementedError');
R('mutable-default-call', 'B', 'CR', 10, ['pitfall'],
  /def\s+\w+\s*\([^)]*=\s*(?:list|dict|set|bytearray|collections\.defaultdict)\s*\(\s*\)/,
  ['Mutable default built with list() / dict() / set()', 'The default object is created once and shared by every call.', 'Default to None and create the object inside the function.'],
  ['list() / dict() / set()로 만든 가변 기본값', '기본값 객체는 한 번만 만들어져 모든 호출이 공유합니다.', '기본값을 None으로 두고 함수 안에서 만드세요.'],
  'def add(item, bucket=list()):', 'def add(item, bucket=None):');
R('call-in-default', 'B', 'MA', 10, ['pitfall'],
  /def\s+\w+\s*\([^)]*=\s*(?:datetime\.)?(?:datetime\.now|datetime\.utcnow|date\.today|time\.time|uuid\.uuid4)\s*\(\s*\)/,
  ['Time or id computed in a default argument', 'The default is evaluated once at definition, so every call gets the same value.', 'Default to None and compute the value inside the function.'],
  ['기본 인자에서 시간이나 id를 계산합니다', '기본값은 정의 시 한 번만 평가되어 모든 호출이 같은 값을 받습니다.', '기본값을 None으로 두고 함수 안에서 계산하세요.'],
  'def log(msg, at=datetime.now()):', 'def log(msg, at=None):');
R('has-key', 'B', 'CR', 5, ['python2'],
  /\.has_key\s*\(/,
  ['dict.has_key', 'has_key was removed in Python 3.', 'Use key in mapping.'],
  ['dict.has_key를 씁니다', 'has_key는 Python 3에서 제거됐습니다.', 'key in mapping을 쓰세요.'],
  'if opts.has_key("verbose"):', 'if "verbose" in opts:');
R('print-statement', 'B', 'CR', 5, ['python2'],
  /^\s*print\s+(?:['"][^'"]*['"]|[A-Za-z_][\w.]*)\s*(?:[,%].*)?$/,
  ['Python 2 print statement', 'print "x" is a syntax error in Python 3.', 'Call print("x").'],
  ['Python 2 print 문입니다', 'print "x"는 Python 3에서 문법 오류입니다.', 'print("x")를 호출하세요.'],
  'print "done"', ['print("done")', "print the sign of positive values. If ' ', always"]);
R('asyncio-sleep-not-awaited', 'B', 'MA', 5, ['async'],
  /^(?!.*\bawait\b)(?!.*\basyncio\.(?:run|create_task|ensure_future|gather|wait_for)\b).*\basyncio\.sleep\s*\(/,
  ['asyncio.sleep() not awaited', 'Without await the coroutine is created and discarded, so nothing waits.', 'Write await asyncio.sleep(...).'],
  ['asyncio.sleep()을 await하지 않습니다', 'await가 없으면 코루틴이 만들어졌다 버려져 아무도 기다리지 않습니다.', 'await asyncio.sleep(...)로 쓰세요.'],
  '    asyncio.sleep(1)', '    await asyncio.sleep(1)');
R('none-equality', 'S', 'MI', 2, ['convention'],
  /[=!]=\s*None\b|\bNone\s*[=!]=/,
  ['Comparison to None with == / !=', '== can be overridden; identity is what you mean for None.', 'Use is None / is not None.'],
  ['== / != 로 None과 비교합니다', '==는 재정의될 수 있고 None은 동일성으로 비교해야 합니다.', 'is None / is not None을 쓰세요.'],
  'if result == None:', 'if result is None:', { ns: true });
R('bool-equality', 'S', 'MI', 2, ['clumsy'],
  /[=!]=\s*(?:True|False)\b|\b(?:True|False)\s*[=!]=/,
  ['Comparison to True / False', 'x == True is redundant and also fails for truthy non-bool values.', 'Test the value directly: if x: / if not x:.'],
  ['True / False와 비교합니다', 'x == True는 군더더기이고 참으로 평가되는 비불리언 값에서는 틀립니다.', '값을 직접 검사하세요: if x: / if not x:.'],
  'if enabled == True:', 'if enabled:', { ns: true });
R('type-comparison', 'S', 'MA', 5, ['pitfall'],
  /\btype\s*\([^()]*\)\s*[=!]=\s*[A-Za-z_]/,
  ['type() compared directly', 'type(x) == T ignores subclasses.', 'Use isinstance(x, T).'],
  ['type()을 직접 비교합니다', 'type(x) == T는 하위 클래스를 무시합니다.', 'isinstance(x, T)를 쓰세요.'],
  'if type(value) == dict:', 'if isinstance(value, dict):');
R('except-base-exception', 'S', 'MI', 5, ['error-handling', 'cwe-396'],
  /^\s*except\s*\(?\s*BaseException\b/,
  ['except BaseException', 'Catching BaseException also swallows KeyboardInterrupt and SystemExit.', 'Catch Exception or a narrower class.'],
  ['BaseException을 잡습니다', 'BaseException을 잡으면 KeyboardInterrupt와 SystemExit도 삼킵니다.', 'Exception이나 더 좁은 클래스를 잡으세요.'],
  'except BaseException as exc:', 'except ValueError as exc:',
  // A handler that re-raises (add a note, clean up, then raise) swallows nothing.
  { skip: (raw, line, file, ctx) => handlerReraises(ctx) });
R('raise-generic', 'S', 'MA', 5, ['error-handling', 'cwe-397'],
  /\braise\s+(?:Exception|BaseException)\s*\(/,
  ['Generic Exception raised', 'Callers cannot catch a plain Exception without catching everything.', 'Raise a specific built-in or custom exception.'],
  ['일반 Exception을 던집니다', '호출자는 모든 것을 잡지 않고는 일반 Exception만 잡을 수 없습니다.', '구체적인 내장 예외나 사용자 예외를 던지세요.'],
  "raise Exception('not found')", "raise LookupError('not found')");
R('open-without-with', 'S', 'MI', 5, ['resource'],
  /^\s*\w+\s*=\s*open\s*\(/,
  ['File opened without with', 'If an exception happens before close(), the handle leaks.', 'Use with open(...) as f:.'],
  ['with 없이 파일을 엽니다', 'close() 전에 예외가 나면 핸들이 샙니다.', 'with open(...) as f: 를 쓰세요.'],
  "f = open('data.txt')", "with open('data.txt') as f:");
R('len-comparison', 'S', 'IN', 2, ['clumsy'],
  /\blen\s*\([^()]*\)\s*(?:==\s*0|!=\s*0|>\s*0|>=\s*1)(?!\d)/,
  ['len() compared with zero', 'Empty sequences are already false.', 'Write if items: or if not items:.'],
  ['len()을 0과 비교합니다', '빈 시퀀스는 이미 거짓입니다.', 'if items: 또는 if not items: 로 쓰세요.'],
  'if len(items) == 0:', 'if not items:');
R('fstring-no-placeholder', 'S', 'MI', 2, ['clumsy'],
  /(?<![\w'"\\])f(['"])(?!\1)[^{}'"]*\1/,
  ['f-string without placeholders', 'The f prefix does nothing without {}.', 'Drop the f prefix.'],
  ['자리표시자 없는 f-문자열입니다', '{}가 없으면 f 접두사는 아무 일도 하지 않습니다.', 'f 접두사를 지우세요.'],
  "msg = f'done'", ["msg = f'done {count}'", "pair = ('f', 'x')", '    return f"""', "ESC = {'b': '\\b', 'f': '\\f', 'n': '\\n'}"],
  // a piece of an implicit concatenation (f'{a} ' / f'rest') is one f-string with the others
  { skip: (raw, line, file, ctx) => inStringConcat(raw, ctx) });
R('print-debug', 'S', 'IN', 2, ['debug'],
  /^\s*print\s*\(/,
  ['print() left in the code', 'Prints are hard to filter and switch off in production.', 'Use the logging module.'],
  ['print()가 남아 있습니다', 'print는 운영에서 거르거나 끄기 어렵습니다.', 'logging 모듈을 쓰세요.'],
  'print(response)', 'logger.debug("response %s", response)',
  { skip: (raw, line, file) => pyTestPath(file) });
R('debugger', 'S', 'MA', 5, ['debug'],
  /\b(?:pdb|ipdb|pudb)\.set_trace\s*\(|^\s*breakpoint\s*\(\s*\)|^\s*import\s+(?:pdb|ipdb|pudb)\b/,
  ['Debugger call left in', 'A breakpoint stops the program waiting for console input.', 'Remove it before committing.'],
  ['디버거 호출이 남아 있습니다', '중단점은 콘솔 입력을 기다리며 프로그램을 멈춥니다.', '커밋 전에 지우세요.'],
  'import pdb; pdb.set_trace()', 'logger.debug("state %s", state)');
R('global-statement', 'S', 'MI', 5, ['design'],
  /^\s*global\s+\w/,
  ['global statement', 'Functions that rebind globals are hard to test and reason about.', 'Pass values in and return results, or use a class.'],
  ['global 문을 씁니다', '전역을 다시 묶는 함수는 테스트하고 이해하기 어렵습니다.', '값을 넘기고 결과를 반환하거나 클래스를 쓰세요.'],
  '    global counter', '    counter = state.counter');
R('lambda-assignment', 'S', 'MI', 2, ['convention'],
  /^\s*\w+\s+=\s+lambda\b/,
  ['Lambda assigned to a name', 'A named lambda loses its name in tracebacks.', 'Use def.'],
  ['람다를 이름에 대입합니다', '이름 붙인 람다는 traceback에서 이름을 잃습니다.', 'def를 쓰세요.'],
  'square = lambda x: x * x', ['def square(x): return x * x', '    key=lambda tp: tp.name)):', '        true_fn = lambda: tf.argmax(x, axis=1),'],
  // a keyword argument of a call spread over lines: a trailing comma, or more
  // closing than opening brackets (the call's last argument)
  { skip: (raw, line, file, ctx) => /,\s*(?:#.*)?$/.test(raw) || unbalancedClose(line)
    || !!(ctx && Array.isArray(ctx.lines) && /[(,]\s*(?:#.*)?$/.test(String(ctx.lines[ctx.index - 1] || ''))) });
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /^\s*(?:async\s+)?def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:\s*pass\s*$/,
  ['Function body is only pass', 'An empty function is unfinished or should explain why it does nothing.', 'Implement it, add a docstring, or use ... for an abstract stub.'],
  ['함수 본문이 pass뿐입니다', '빈 함수는 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 docstring을 달거나 추상 스텁이면 ...을 쓰세요.'],
  'def on_close(self): pass', 'def on_close(self): self.flush()');
R('class-naming', 'S', 'MI', 2, ['convention'],
  /^\s*class\s+_*[a-z]\w*\s*[(:]/,
  ['Class name not in CapWords', 'PEP 8 names classes in CapWords.', 'Rename the class, for example UserStore.'],
  ['클래스 이름이 CapWords가 아닙니다', 'PEP 8은 클래스 이름을 CapWords로 씁니다.', 'UserStore처럼 이름을 바꾸세요.'],
  'class user_store:', 'class UserStore:');
R('function-naming', 'S', 'MI', 2, ['convention'],
  /^\s*(?:async\s+)?def\s+_*[a-z]+[A-Z]\w*\s*\((?!\s*(?:self|cls)\b)/,
  ['Function name in camelCase', 'PEP 8 names functions in snake_case. Methods are skipped because framework overrides (Qt, unittest) are camelCase.', 'Rename the function, for example load_user.'],
  ['함수 이름이 camelCase입니다', 'PEP 8은 함수 이름을 snake_case로 씁니다. 프레임워크 재정의(Qt, unittest) 때문에 메서드는 건너뜁니다.', 'load_user처럼 이름을 바꾸세요.'],
  'def loadUser(uid):', ['def load_user(uid):', '    def setUp(self):', '    def keyPressEvent(self, e):'],
  { skip: (raw) => /def\s+(?:setUp|tearDown|setUpClass|tearDownClass|asyncSetUp|asyncTearDown|setUpModule|tearDownModule)\b/.test(raw) });
R('builtin-shadowing', 'S', 'MA', 5, ['pitfall'],
  /^\s*(?:list|dict|str|id|type|input|len|max|min|sum|set|map|filter|object|bytes|hash|iter|next|range|format|open|vars|dir)\s*=(?!=)(?!.*,\s*$)/,
  ['Built-in name reassigned', 'Rebinding a built-in like list or id breaks later calls to it.', 'Choose a different name.'],
  ['내장 이름을 다시 대입합니다', 'list나 id 같은 내장을 다시 묶으면 이후 호출이 깨집니다.', '다른 이름을 고르세요.'],
  'list = [1, 2, 3]', ['items = [1, 2, 3]', '    type=socket.SOCK_DGRAM,'], { skip: (raw) => /^\s+\w+=\S/.test(raw) });
R('logging-fstring', 'S', 'MI', 2, ['performance'],
  /\b(?:log|logger|logging|_log|LOG|LOGGER)\.(?:debug|info|warning|warn|error|exception|critical)\s*\(\s*f['"]/,
  ['f-string passed to logging', 'The message is formatted even when the level is off, and log aggregation loses the template.', 'Pass a %-style template and arguments: logger.info("x %s", x).'],
  ['logging에 f-문자열을 넘깁니다', '레벨이 꺼져 있어도 포맷되고 로그 집계에서 템플릿이 사라집니다.', '%-형식 템플릿과 인자를 넘기세요: logger.info("x %s", x).'],
  'logger.info(f"user {uid} logged in")', 'logger.info("user %s logged in", uid)');
R('deprecated-logging-warn', 'S', 'MI', 2, ['deprecated'],
  /\b(?:logging|logger|log|LOG)\.warn\s*\(/,
  ['logging.warn is deprecated', 'warn is an alias kept only for old code.', 'Use warning.'],
  ['logging.warn은 사용 중단됐습니다', 'warn은 예전 코드용으로만 남은 별칭입니다.', 'warning을 쓰세요.'],
  'logger.warn("disk low")', 'logger.warning("disk low")');
R('deprecated-utcnow', 'S', 'MI', 5, ['deprecated'],
  /\bdatetime\.utcnow\s*\(|\bdatetime\.utcfromtimestamp\s*\(/,
  ['datetime.utcnow()', 'utcnow returns a naive datetime and is deprecated since Python 3.12.', 'Use datetime.now(timezone.utc).'],
  ['datetime.utcnow()를 씁니다', 'utcnow는 시간대 없는 값을 돌려주며 Python 3.12부터 사용 중단됐습니다.', 'datetime.now(timezone.utc)를 쓰세요.'],
  'stamp = datetime.utcnow()', 'stamp = datetime.now(timezone.utc)');
R('deprecated-imp', 'S', 'MA', 5, ['deprecated'],
  /^\s*(?:import\s+imp\b|from\s+imp\s+import\b|import\s+(?:asynchat|asyncore|distutils|cgi|telnetlib|smtpd)\b|from\s+(?:asynchat|asyncore|distutils|cgi|smtpd)\b)/,
  ['Removed standard-library module', 'imp, asyncore, asynchat, distutils, cgi and smtpd are removed in current Python.', 'Use importlib, asyncio, setuptools or the documented replacement.'],
  ['제거된 표준 라이브러리 모듈입니다', 'imp, asyncore, asynchat, distutils, cgi, smtpd는 최신 Python에서 제거됐습니다.', 'importlib, asyncio, setuptools 등 문서의 대체제를 쓰세요.'],
  'import imp', 'import importlib');
R('requests-no-timeout', 'B', 'MI', 5, ['cwe-400', 'reliability'],
  /\brequests\.(?:get|post|put|delete|patch|head|request)\s*\((?![^)]*\btimeout\s*=)[^)]*\)/,
  ['HTTP request without a timeout', 'requests waits forever by default, hanging the worker on a stuck server.', 'Pass timeout=(connect, read).'],
  ['시간 제한 없는 HTTP 요청입니다', 'requests는 기본으로 끝없이 기다려 멈춘 서버에서 작업자가 걸립니다.', 'timeout=(연결, 읽기)를 넘기세요.'],
  'r = requests.get(url)', 'r = requests.get(url, timeout=10)');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('weak-cipher', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\b(?:DES|DES3|ARC4|ARC2|Blowfish|CAST)\.new\s*\(|\balgorithms\.(?:TripleDES|Blowfish|ARC4|IDEA|CAST5|SEED)\s*\(/,
  ['Weak cipher algorithm', 'DES, 3DES, RC2, RC4, Blowfish and similar ciphers are broken or too small.', 'Use AES-GCM or ChaCha20-Poly1305.'],
  ['약한 암호 알고리즘입니다', 'DES, 3DES, RC2, RC4, Blowfish 같은 암호는 깨졌거나 너무 작습니다.', 'AES-GCM이나 ChaCha20-Poly1305를 쓰세요.'],
  'cipher = DES.new(key, DES.MODE_CBC, iv)', 'cipher = AES.new(key, AES.MODE_GCM)');
R('ecb-mode', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bMODE_ECB\b|\bmodes\.ECB\s*\(/,
  ['ECB cipher mode', 'ECB maps equal blocks to equal output and leaks patterns.', 'Use GCM, or CBC with an HMAC.'],
  ['ECB 암호 모드입니다', 'ECB는 같은 블록을 같은 결과로 바꿔 패턴이 드러납니다.', 'GCM이나 HMAC을 붙인 CBC를 쓰세요.'],
  'cipher = AES.new(key, AES.MODE_ECB)', 'cipher = AES.new(key, AES.MODE_GCM)');
R('weak-hash-new', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /\bhashlib\.new\s*\(\s*['"](?:md5|md4|sha1|ripemd160)['"]/i,
  ['Weak hash via hashlib.new', 'MD5, MD4 and SHA-1 have practical collisions.', 'Use sha256 or stronger.'],
  ['hashlib.new로 약한 해시를 씁니다', 'MD5, MD4, SHA-1은 실제 충돌이 있습니다.', 'sha256 이상을 쓰세요.'],
  "h = hashlib.new('md5')", "h = hashlib.new('sha256')");
R('fast-password-hash', 'V', 'CR', 20, ['cwe-916', 'owasp-a02', 'crypto'],
  /\bhashlib\.(?:md5|sha1|sha224|sha256|sha384|sha512|sha3_\d+|blake2[bs])\s*\(\s*(?:\w+\.)?(?:password|passwd|pwd|pass_?word)\b/i,
  ['Password hashed with a fast hash', 'Fast hashes let attackers try billions of guesses per second.', 'Use hashlib.scrypt, argon2 or bcrypt with a salt.'],
  ['빠른 해시로 비밀번호를 해시합니다', '빠른 해시는 초당 수십억 번의 추측을 허용합니다.', '솔트와 함께 hashlib.scrypt, argon2, bcrypt를 쓰세요.'],
  'digest = hashlib.sha256(password.encode()).hexdigest()', 'digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)');
R('ssl-unverified', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /\bssl\._create_unverified_context\b|\bssl\.CERT_NONE\b|\bcheck_hostname\s*=\s*False\b/,
  ['TLS certificate check disabled', 'Without verification any certificate is accepted, allowing man-in-the-middle.', 'Use ssl.create_default_context() and keep verification on.'],
  ['TLS 인증서 검사를 끕니다', '검증하지 않으면 아무 인증서나 받아들여 중간자 공격을 허용합니다.', 'ssl.create_default_context()를 쓰고 검증을 켜 두세요.'],
  'ctx = ssl._create_unverified_context()', 'ctx = ssl.create_default_context()');
R('ssl-old-protocol', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'tls'],
  /\bssl\.PROTOCOL_(?:SSLv2|SSLv3|TLSv1|TLSv1_1)\b|\bTLSVersion\.(?:SSLv3|TLSv1|TLSv1_1)\b/,
  ['Outdated SSL / TLS protocol', 'SSLv3, TLS 1.0 and TLS 1.1 have known attacks.', 'Use ssl.PROTOCOL_TLS_CLIENT with minimum_version TLSv1_2.'],
  ['낡은 SSL / TLS 프로토콜입니다', 'SSLv3, TLS 1.0, TLS 1.1에는 알려진 공격이 있습니다.', 'ssl.PROTOCOL_TLS_CLIENT와 minimum_version TLSv1_2를 쓰세요.'],
  'ctx = ssl.SSLContext(ssl.PROTOCOL_TLSv1)', 'ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)');
R('ssh-auto-add-policy', 'V', 'CR', 15, ['cwe-295', 'owasp-a07'],
  /\b(?:AutoAddPolicy|WarningPolicy)\s*\(\s*\)/,
  ['SSH host key accepted without checking', 'AutoAddPolicy trusts whatever server answers, allowing man-in-the-middle.', 'Load known_hosts and use RejectPolicy.'],
  ['SSH 호스트 키를 확인 없이 받아들입니다', 'AutoAddPolicy는 응답하는 아무 서버나 믿어 중간자 공격을 허용합니다.', 'known_hosts를 불러오고 RejectPolicy를 쓰세요.'],
  'client.set_missing_host_key_policy(paramiko.AutoAddPolicy())', 'client.set_missing_host_key_policy(paramiko.RejectPolicy())');
R('django-debug', 'V', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /^\s*DEBUG\s*=\s*True\b/,
  ['Django DEBUG = True', 'Debug pages show settings, SQL and stack traces to anyone.', 'Read DEBUG from the environment and keep it False in production.'],
  ['Django DEBUG = True로 둡니다', '디버그 페이지는 설정, SQL, 스택을 누구에게나 보여 줍니다.', 'DEBUG를 환경에서 읽고 운영에서는 False로 두세요.'],
  'DEBUG = True', "DEBUG = os.environ.get('DEBUG') == '1'");
R('allowed-hosts-wildcard', 'H', 'MA', 10, ['cwe-20', 'owasp-a05'],
  /\bALLOWED_HOSTS\s*=\s*\[\s*['"]\*['"]/,
  ['ALLOWED_HOSTS allows any host', 'A wildcard host enables host-header poisoning of reset links and caches.', 'List the real host names.'],
  ['ALLOWED_HOSTS가 모든 호스트를 허용합니다', '와일드카드 호스트는 재설정 링크와 캐시의 호스트 헤더 오염을 허용합니다.', '실제 호스트 이름을 나열하세요.'],
  "ALLOWED_HOSTS = ['*']", "ALLOWED_HOSTS = ['app.example.com']");
R('cors-allow-all', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /\bCORS_(?:ORIGIN_ALLOW_ALL|ALLOW_ALL_ORIGINS)\s*=\s*True\b|\bCORS\s*\(\s*\w+\s*\)|\borigins\s*=\s*['"]\*['"]|\ballow_origins\s*=\s*\[\s*['"]\*['"]/,
  ['CORS allows any origin', 'Any site can read responses meant for your own front end.', 'List the allowed origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 자기 프런트엔드용 응답을 읽을 수 있습니다.', '허용할 origin을 나열하세요.'],
  'CORS_ALLOW_ALL_ORIGINS = True', "CORS_ALLOWED_ORIGINS = ['https://app.example.com']");
R('cookie-not-secure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\b(?:SESSION|CSRF)_COOKIE_SECURE\s*=\s*False\b|\bset_cookie\s*\([^)]*\bsecure\s*=\s*False/,
  ['Cookie without the Secure flag', 'The cookie is also sent over plain HTTP.', 'Set SESSION_COOKIE_SECURE / CSRF_COOKIE_SECURE = True, or secure=True.'],
  ['Secure 속성이 없는 쿠키입니다', '쿠키가 평문 HTTP로도 전송됩니다.', 'SESSION_COOKIE_SECURE / CSRF_COOKIE_SECURE = True 또는 secure=True를 쓰세요.'],
  'SESSION_COOKIE_SECURE = False', 'SESSION_COOKIE_SECURE = True');
R('cookie-not-httponly', 'H', 'MA', 5, ['cwe-1004', 'owasp-a05', 'cookie'],
  /\b(?:SESSION|CSRF)_COOKIE_HTTPONLY\s*=\s*False\b|\bset_cookie\s*\([^)]*\bhttponly\s*=\s*False/,
  ['Cookie readable from script', 'Without HttpOnly an injected script can steal the cookie.', 'Keep HttpOnly on for session cookies.'],
  ['스크립트가 읽을 수 있는 쿠키입니다', 'HttpOnly가 없으면 주입된 스크립트가 쿠키를 훔칠 수 있습니다.', '세션 쿠키에는 HttpOnly를 켜 두세요.'],
  'SESSION_COOKIE_HTTPONLY = False', 'SESSION_COOKIE_HTTPONLY = True');
R('csrf-exempt', 'H', 'MA', 10, ['cwe-352', 'owasp-a01'],
  /^\s*@csrf_exempt\b/,
  ['CSRF protection disabled for a view', 'A state-changing view without CSRF checks can be triggered from another site.', 'Remove csrf_exempt and send the CSRF token.'],
  ['뷰의 CSRF 보호를 끕니다', 'CSRF 검사가 없는 상태 변경 뷰는 다른 사이트에서 실행될 수 있습니다.', 'csrf_exempt를 지우고 CSRF 토큰을 보내세요.'],
  '@csrf_exempt', '@require_POST');
R('xml-stdlib-parser', 'H', 'MA', 10, ['cwe-776', 'owasp-a05', 'xml'],
  /^\s*(?:from\s+xml\.(?:etree|dom|sax)\b|import\s+xml\.(?:etree|dom|sax)\b)/,
  ['Standard-library XML parser', 'xml.etree, xml.dom and xml.sax are open to entity-expansion attacks on untrusted input.', 'Parse untrusted XML with defusedxml.'],
  ['표준 라이브러리 XML 파서입니다', 'xml.etree, xml.dom, xml.sax는 신뢰할 수 없는 입력에서 엔티티 확장 공격에 취약합니다.', '신뢰할 수 없는 XML은 defusedxml로 파싱하세요.'],
  'import xml.etree.ElementTree as ET', 'import defusedxml.ElementTree as ET');
R('lxml-entities', 'V', 'CR', 15, ['cwe-611', 'owasp-a05', 'xml'],
  /\bresolve_entities\s*=\s*True\b|\bno_network\s*=\s*False\b|\betree\.XMLParser\s*\((?![^)]*resolve_entities\s*=\s*False)[^)]*\)/,
  ['lxml parser resolves external entities', 'Entity resolution lets a document read local files (XXE).', 'Create the parser with resolve_entities=False.'],
  ['lxml 파서가 외부 엔티티를 해석합니다', '엔티티 해석은 문서가 로컬 파일을 읽게 합니다(XXE).', 'resolve_entities=False로 파서를 만드세요.'],
  'parser = etree.XMLParser()', 'parser = etree.XMLParser(resolve_entities=False)');
R('insecure-tempfile', 'V', 'MA', 10, ['cwe-377', 'owasp-a01'],
  /\btempfile\.mktemp\s*\(|\bos\.(?:tempnam|tmpnam)\s*\(/,
  ['Insecure temporary file name', 'mktemp returns a name that another process can create first.', 'Use tempfile.mkstemp or NamedTemporaryFile.'],
  ['안전하지 않은 임시 파일 이름입니다', 'mktemp가 준 이름을 다른 프로세스가 먼저 만들 수 있습니다.', 'tempfile.mkstemp나 NamedTemporaryFile을 쓰세요.'],
  'path = tempfile.mktemp()', 'fd, path = tempfile.mkstemp()');
R('jwt-no-verify', 'V', 'CR', 20, ['cwe-347', 'owasp-a02', 'jwt'],
  /['"]verify_signature['"]\s*:\s*False\b|\bverify\s*=\s*False\s*[,)].*\bjwt\b|\bjwt\.decode\s*\([^)]*\bverify\s*=\s*False/,
  ['JWT signature not verified', 'Claims from an unverified token can be forged.', 'Decode with the key and the expected algorithms.'],
  ['JWT 서명을 검증하지 않습니다', '검증하지 않은 토큰의 클레임은 위조될 수 있습니다.', '키와 기대하는 알고리즘으로 디코딩하세요.'],
  "claims = jwt.decode(token, options={'verify_signature': False})", "claims = jwt.decode(token, key, algorithms=['RS256'])");
R('jwt-none-algorithm', 'V', 'BL', 30, ['cwe-347', 'owasp-a02', 'jwt'],
  /\balgorithms?\s*=\s*\[?\s*['"]none['"]/i,
  ['JWT "none" algorithm', 'An unsigned token can be forged by anyone.', 'Allow only the algorithms you sign with.'],
  ['JWT "none" 알고리즘입니다', '서명 없는 토큰은 누구나 위조할 수 있습니다.', '서명에 쓰는 알고리즘만 허용하세요.'],
  "jwt.decode(token, key, algorithms=['none'])", "jwt.decode(token, key, algorithms=['HS256'])");
R('unsafe-deserialization', 'V', 'CR', 30, ['cwe-502', 'owasp-a08'],
  /\b(?:marshal\.loads?|shelve\.open|jsonpickle\.decode|dill\.loads?|cloudpickle\.loads?|pandas\.read_pickle|pd\.read_pickle|joblib\.load)\s*\(/,
  ['Unsafe deserialization', 'These loaders can run arbitrary code from a crafted file.', 'Load only trusted data, or use JSON.'],
  ['안전하지 않은 역직렬화입니다', '이 로더들은 조작된 파일에서 임의 코드를 실행할 수 있습니다.', '신뢰할 데이터만 불러오거나 JSON을 쓰세요.'],
  'obj = marshal.loads(blob)', 'obj = json.loads(blob)');
R('cleartext-client', 'H', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /\bftplib\.FTP\s*\(|\btelnetlib\.Telnet\s*\(|\bsmtplib\.SMTP\s*\((?![^)]*\b465\b)/,
  ['Clear-text network client', 'FTP, Telnet and plain SMTP send credentials unencrypted.', 'Use FTP_TLS, SSH or SMTP_SSL / starttls().'],
  ['평문 네트워크 클라이언트입니다', 'FTP, Telnet, 평문 SMTP는 자격 증명을 암호화하지 않고 보냅니다.', 'FTP_TLS, SSH, SMTP_SSL / starttls()를 쓰세요.'],
  'ftp = ftplib.FTP(host)', 'ftp = ftplib.FTP_TLS(host)');
R('weak-rsa-key', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'crypto'],
  /\bkey_size\s*=\s*(?:512|768|1024)\b|\bRSA\.generate\s*\(\s*(?:512|768|1024)\b/,
  ['RSA key shorter than 2048 bits', 'Keys of 1024 bits or less can be factored with enough resources.', 'Use at least 2048 bits.'],
  ['2048비트보다 짧은 RSA 키입니다', '1024비트 이하 키는 충분한 자원으로 인수분해할 수 있습니다.', '최소 2048비트를 쓰세요.'],
  'key = rsa.generate_private_key(public_exponent=65537, key_size=1024)', 'key = rsa.generate_private_key(public_exponent=65537, key_size=3072)');
R('pbkdf2-iterations', 'V', 'MA', 10, ['cwe-916', 'owasp-a02', 'crypto'],
  /\bpbkdf2_hmac\s*\([^,]+,[^,]+,[^,]+,\s*\d{1,4}\s*[,)]|\biterations\s*=\s*\d{1,4}\b/,
  ['PBKDF2 with too few iterations', 'Fewer than 10,000 iterations make password guessing cheap.', 'Use at least 600,000 iterations for SHA-256, or scrypt / argon2.'],
  ['반복 횟수가 적은 PBKDF2입니다', '1만 회 미만 반복은 비밀번호 추측을 싸게 만듭니다.', 'SHA-256 기준 최소 60만 회를 쓰거나 scrypt / argon2를 쓰세요.'],
  "dk = hashlib.pbkdf2_hmac('sha256', pw, salt, 1000)", "dk = hashlib.pbkdf2_hmac('sha256', pw, salt, 600000)");
R('os-popen', 'V', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\bos\.(?:popen|popen2|popen3|spawnl|spawnlp|execl|execlp)\s*\(/,
  ['Command run through the shell', 'os.popen passes the string to a shell, so data in it becomes commands.', 'Use subprocess.run with an argument list.'],
  ['셸로 명령을 실행합니다', 'os.popen은 문자열을 셸에 넘겨 데이터가 명령이 됩니다.', '인자 목록과 함께 subprocess.run을 쓰세요.'],
  "out = os.popen('ls ' + folder).read()", "out = subprocess.run(['ls', folder], capture_output=True).stdout");
R('hardcoded-secret-key', 'V', 'CR', 20, ['cwe-798', 'owasp-a07', 'secrets'],
  /^\s*(?:SECRET_KEY|JWT_SECRET_KEY|app\.secret_key|app\.config\[['"]SECRET_KEY['"]\])\s*=\s*['"][^'"]{6,}['"]/,
  ['Hard-coded framework secret key', 'Anyone with the source can sign sessions and tokens.', 'Read the key from the environment or a secret store.'],
  ['하드코딩된 프레임워크 시크릿 키입니다', '소스를 가진 사람은 세션과 토큰에 서명할 수 있습니다.', '환경이나 시크릿 저장소에서 키를 읽으세요.'],
  "SECRET_KEY = 'django-insecure-abc123xyz'", "SECRET_KEY = os.environ['SECRET_KEY']");
R('jinja-autoescape-off', 'V', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /\bautoescape\s*=\s*False\b|\bjinja2\.Environment\s*\((?![^)]*autoescape)[^)]*\)/,
  ['Template autoescape disabled', 'Values rendered without escaping allow XSS.', 'Use autoescape=True or select_autoescape().'],
  ['템플릿 자동 이스케이프를 끕니다', '이스케이프 없이 그린 값은 XSS를 허용합니다.', 'autoescape=True나 select_autoescape()를 쓰세요.'],
  'env = jinja2.Environment(loader=loader)', 'env = jinja2.Environment(loader=loader, autoescape=True)');
R('mark-safe', 'H', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /\b(?:mark_safe|Markup|format_html_join)\s*\(\s*(?!['"])/,
  ['Value marked as safe HTML', 'mark_safe / Markup on data skips escaping and allows XSS.', 'Escape the data first, or build markup with format_html.'],
  ['값을 안전한 HTML로 표시합니다', '데이터에 mark_safe / Markup을 쓰면 이스케이프를 건너뛰어 XSS를 허용합니다.', '먼저 이스케이프하거나 format_html로 만드세요.'],
  'return mark_safe(comment.body)', "return format_html('<b>{}</b>', comment.body)");
R('flask-bind-debug-host', 'H', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /\.run\s*\([^)]*\bhost\s*=\s*['"]0\.0\.0\.0['"][^)]*\bdebug\s*=\s*True|\.run\s*\([^)]*\bdebug\s*=\s*True[^)]*\bhost\s*=\s*['"]0\.0\.0\.0['"]/,
  ['Debug server exposed on all interfaces', 'The Werkzeug debugger allows code execution to anyone who can reach the port.', 'Never combine debug=True with a public host.'],
  ['디버그 서버가 모든 인터페이스에 열립니다', 'Werkzeug 디버거는 포트에 닿는 누구에게나 코드 실행을 허용합니다.', 'debug=True와 공개 호스트를 함께 쓰지 마세요.'],
  "app.run(host='0.0.0.0', debug=True)", "app.run(host='127.0.0.1')");
R('subprocess-shell-string', 'V', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*(?:f['"]|['"][^'"]*['"]\s*(?:\+|%)|[^,()]*\.format\s*\()/,
  ['Command line built from a string', 'A formatted command string invites injection as soon as a shell or split is involved.', 'Pass a list of arguments.'],
  ['문자열로 만든 명령줄입니다', '포맷한 명령 문자열은 셸이나 분리가 끼면 바로 주입을 부릅니다.', '인자 목록을 넘기세요.'],
  "subprocess.run(f'convert {src} {dst}')", "subprocess.run(['convert', src, dst])");

module.exports = { RULES: R.rules, pyTestPath };
