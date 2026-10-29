'use strict';

// Rust.

const { maker } = require('./util');

const R = maker('rs', ['rs']);

// Integration tests, benches, examples, build scripts and test modules kept
// in their own file (tests.rs, tests_menu.rs, parser_test.rs): unwrap,
// expect, panic! and println! are the idiom there.
const RUST_NON_PRODUCT = /(?:^|\/)(?:tests|benches|examples)\/|(?:^|\/)build\.rs$|(?:^|\/)tests?(?:_[^/]*)?\.rs$|(?:^|\/)[^/]*_tests?\.rs$/;
function rustNonProductPath(file) {
  return !!file && RUST_NON_PRODUCT.test(String(file).replace(/\\/g, '/'));
}

R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*([A-Za-z_][\w.]*)\s*=(?!=)\s*\1\s*;/,
  ['Variable is assigned to itself', 'A self-assignment does nothing and usually hides a typo.', 'Assign the intended value or delete the line.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않고 보통 오타를 숨깁니다.', '의도한 값을 대입하거나 줄을 지우세요.'],
  'self.len = self.len;', 'self.len = len;');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w.])(?<![=!<>+\-*\/%&|]\s*)([A-Za-z_][\w.]*)\s*(?:==|!=|<=|>=|&&|\|\|)\s*\1(?![\w.(\[!])(?=\s*(?:[);,{]|&&|\|\||$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use f64::is_nan for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 f64::is_nan을 쓰세요.'],
  'if a.len == a.len {', ['if a.len == b.len {', 'if n >= max || max == 0 {']);
R('nan-comparison', 'B', 'CR', 5, ['pitfall'],
  /[=!]=\s*(?:std::)?(?:f32|f64)::NAN\b|\b(?:f32|f64)::NAN\s*[=!]=/,
  ['Comparison with NAN', 'NaN is not equal to anything, itself included.', 'Use x.is_nan().'],
  ['NAN과 비교합니다', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않습니다.', 'x.is_nan()을 쓰세요.'],
  'if x == f64::NAN {', 'if x.is_nan() {');
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  // x == 0.0 is exact and the usual guard before a division; it is exempt.
  /[=!]=\s*-?(?!0+\.0+(?:_?f(?:32|64))?(?![\d.\w]))\d+\.\d+(?:_?f(?:32|64))?(?![\d.\w])/,
  ['Equality test on a floating-point literal', 'Floating-point results are rarely exactly equal to a literal (other than 0.0).', 'Compare with a tolerance: (a - b).abs() < f64::EPSILON.'],
  ['부동소수점 리터럴과 동등 비교합니다', '부동소수점 결과는 리터럴(0.0 제외)과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하세요: (a - b).abs() < f64::EPSILON.'],
  'if ratio == 0.3 {', ['if (ratio - 0.3).abs() < 1e-9 {', 'if span == 0.0 {', 'let ok = delay != 0.0_f64;']);
R('mem-uninitialized', 'B', 'CR', 20, ['cwe-457', 'unsafe'],
  // mem::uninitialized always; mem::zeroed only for a type with no valid
  // all-zero value (references, Box, Vec, String, NonNull, fn pointers,
  // bool / char). Zeroing a plain C struct for FFI is the documented idiom.
  /\b(?:std::)?mem::uninitialized\s*(?:::<[^>]*>)?\s*\(|:\s*(?:&|Box\b|Vec\b|String\b|NonNull\b|fn\s*\(|bool\b|char\b)[^=;]*=\s*(?:unsafe\s*\{\s*)?(?:std::)?mem::zeroed\s*\(|\bmem::zeroed\s*::<\s*(?:&|Box\b|Vec\b|String\b|NonNull\b|fn\s*\(|bool\b|char\b)/,
  ['mem::uninitialized, or mem::zeroed of a type that cannot be zero', 'These create values that are invalid for the type (an uninitialized value, a null reference or Box), which is undefined behaviour.', 'Use MaybeUninit<T>.'],
  ['mem::uninitialized나 0이 될 수 없는 타입의 mem::zeroed를 씁니다', '타입에 맞지 않는 값(초기화되지 않은 값, null 참조나 Box)을 만들어 정의되지 않은 동작이 됩니다.', 'MaybeUninit<T>를 쓰세요.'],
  ['let buf: [u8; 64] = unsafe { mem::uninitialized() };', 'let r: &Config = unsafe { std::mem::zeroed() };'],
  ['let mut buf = MaybeUninit::<[u8; 64]>::uninit();', 'let mut si: STARTUPINFOEXW = std::mem::zeroed();', 'let mut set: libc::sigset_t = unsafe { mem::zeroed() };']);
R('mem-forget', 'S', 'MA', 10, ['resource'],
  /\b(?:std::)?mem::forget\s*\(/,
  ['mem::forget', 'Forgetting a value skips its destructor and leaks the resource.', 'Use ManuallyDrop, or let the value drop.'],
  ['mem::forget를 씁니다', '값을 잊으면 소멸자를 건너뛰어 리소스가 샙니다.', 'ManuallyDrop을 쓰거나 값이 해제되게 두세요.'],
  'mem::forget(guard);', 'drop(guard);');
R('static-mut', 'S', 'MA', 15, ['concurrency', 'cwe-362'],
  /\bstatic\s+mut\s+\w/,
  ['static mut', 'Mutable statics allow data races and every use needs unsafe.', 'Use an atomic, Mutex, OnceLock or thread_local!.'],
  ['static mut를 씁니다', '가변 정적 변수는 데이터 경쟁을 허용하고 모든 사용에 unsafe가 필요합니다.', 'atomic, Mutex, OnceLock, thread_local!을 쓰세요.'],
  'static mut COUNTER: u32 = 0;', 'static COUNTER: AtomicU32 = AtomicU32::new(0);');
R('panic', 'S', 'MI', 5, ['error-handling'],
  /\bpanic!\s*\(/,
  ['panic! in code', 'A panic aborts the thread; recoverable failures should return Result.', 'Return an error.'],
  ['코드에서 panic!을 부릅니다', 'panic은 스레드를 중단시키므로 복구 가능한 실패는 Result를 돌려줘야 합니다.', '오류를 돌려주세요.'],
  'panic!("bad state");', 'return Err(Error::BadState);',
  { skip: (raw, line, file) => rustNonProductPath(file) });
R('print-debug', 'S', 'IN', 2, ['debug'],
  /\b(?:println|eprintln|print|eprint)!\s*\(/,
  ['Console print macro', 'Prints are not logs and cannot be filtered or switched off.', 'Use the log or tracing crate.'],
  ['콘솔 출력 매크로입니다', '출력은 로그가 아니라 거르거나 끌 수 없습니다.', 'log나 tracing 크레이트를 쓰세요.'],
  'println!("value = {}", v);', ['tracing::debug!(value = v);', 'println!("cargo:rerun-if-changed=build.rs");'],
  { skip: (raw, line, file) => /\bprintln!\s*\(\s*"cargo:/.test(line) || rustNonProductPath(file) });
R('allow-lints', 'S', 'IN', 2, ['convention'],
  /#!?\[\s*allow\s*\([^)]*(?:\b(?:warnings|unused|nonstandard_style|future_incompatible|rust_2018_idioms|let_underscore)\b(?!_)|\bclippy::(?:all|pedantic|nursery|restriction|cargo|complexity|correctness|perf|style|suspicious)\b(?!_))|#!\[\s*allow\s*\([^)]*\b(?:dead_code|unsafe_code)\b/,
  ['Broad lint allowed', 'Allowing a whole lint group, or a lint for the whole crate or module, hides new problems.', 'Allow the single lint on the item where it is justified.'],
  ['넓은 린트를 허용합니다', '린트 그룹 전체나 크레이트·모듈 전체에 린트를 허용하면 새 문제가 숨겨집니다.', '정당한 항목에서 단일 린트만 허용하세요.'],
  ['#![allow(dead_code)]', '#[allow(unused)]', '#![allow(clippy::pedantic)]'], ['#[allow(clippy::too_many_arguments)]', '#[allow(dead_code)]', 'struct Lock(#[allow(dead_code)] File);', '#[allow(unused_mut)]']);
R('weak-hash', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /\bmd5::compute\s*\(|\b(?:Md5|Md4|Md2|Sha1)::(?:new|digest|default)\s*\(/,
  ['Weak hash algorithm', 'MD5, MD4 and SHA-1 are not collision resistant.', 'Use Sha256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD5, MD4, SHA-1은 충돌에 강하지 않습니다.', 'Sha256 이상을 쓰세요.'],
  'let d = Md5::digest(data);', 'let d = Sha256::digest(data);');
R('weak-cipher', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\b(?:Des|TdesEde2|TdesEde3|Rc4|Rc2|Blowfish)::new(?:_from_slices?)?\s*\(|\becb::(?:Encryptor|Decryptor)\b/,
  ['Weak cipher or ECB mode', 'DES, 3DES, RC4, RC2, Blowfish and ECB are broken or leak patterns.', 'Use aes-gcm or chacha20poly1305.'],
  ['약한 암호나 ECB 모드입니다', 'DES, 3DES, RC4, RC2, Blowfish, ECB는 깨졌거나 패턴을 드러냅니다.', 'aes-gcm이나 chacha20poly1305를 쓰세요.'],
  'let cipher = Des::new(&key);', 'let cipher = Aes256Gcm::new(&key);');
R('tls-verification-disabled', 'V', 'CR', 20, ['cwe-295', 'owasp-a07', 'tls'],
  /\bdanger_accept_invalid_(?:certs|hostnames)\s*\(\s*true\s*\)|\.dangerous\s*\(\s*\)\s*\.set_certificate_verifier\b|\bset_verify\s*\(\s*SslVerifyMode::NONE\s*\)/,
  ['TLS verification disabled', 'Accepting invalid certificates allows man-in-the-middle.', 'Keep verification on and add the needed root certificate.'],
  ['TLS 검증을 끕니다', '잘못된 인증서를 받아들이면 중간자 공격을 허용합니다.', '검증을 켜 두고 필요한 루트 인증서를 추가하세요.'],
  'let c = Client::builder().danger_accept_invalid_certs(true).build()?;', 'let c = Client::builder().add_root_certificate(ca).build()?;');
R('predictable-rng', 'H', 'MA', 10, ['cwe-330', 'owasp-a02'],
  /\b\w*Rng::seed_from_u64\s*\(\s*\d|\bSmallRng::(?:from_entropy|seed_from_u64|from_seed)\b|\bStdRng::from_seed\s*\(\s*\[/,
  ['Seeded or non-cryptographic RNG', 'A fixed seed or SmallRng produces predictable values.', 'Use rand::rngs::OsRng or ThreadRng for secrets.'],
  ['시드를 준 RNG나 암호학적이지 않은 RNG입니다', '고정 시드나 SmallRng는 예측 가능한 값을 냅니다.', '시크릿에는 rand::rngs::OsRng나 ThreadRng를 쓰세요.'],
  'let mut rng = StdRng::seed_from_u64(42);', 'let mut rng = OsRng;');
R('command-shell', 'H', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\bCommand::new\s*\(\s*"(?:sh|bash|zsh|cmd|cmd\.exe|powershell|pwsh)"\s*\)/,
  ['Command run through a shell', 'A shell interprets metacharacters in the command string.', 'Run the program directly with .arg() for each value.'],
  ['셸을 거쳐 명령을 실행합니다', '셸은 명령 문자열의 메타 문자를 해석합니다.', '값마다 .arg()로 프로그램을 직접 실행하세요.'],
  'Command::new("sh").arg("-c").arg(cmd).status()?;', 'Command::new("tar").arg("xf").arg(path).status()?;');
R('sql-format', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  // format! straight into a query call, or a format! whose literal is an SQL statement with a {} hole.
  /\b(?:query|query_as|query_scalar|execute|prepare|query_row|batch_execute)\s*(?:::<[^>]*>)?\s*\(\s*&?\s*format!\s*\(|\bformat!\s*\(\s*r?#*"\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|MERGE)\b[^"]*\{/i,
  ['SQL built with format!', 'Values formatted into SQL allow injection.', 'Use bind parameters ($1 / ?) and .bind().'],
  ['format!으로 SQL을 만듭니다', 'SQL에 포맷한 값은 주입을 허용합니다.', '바인드 매개변수($1 / ?)와 .bind()를 쓰세요.'],
  ['sqlx::query(&format!("SELECT * FROM t WHERE id = {id}"))', 'let sql = format!("SELECT id FROM users WHERE name = \'{}\'", name);'],
  ['sqlx::query("SELECT * FROM t WHERE id = $1").bind(id)', 'let msg = format!("selected {} rows", n);', 'sqlx::query(&format!("DELETE FROM {TABLE} WHERE id = ?")).bind(id)'],
  { skip: (raw, line) => sqlHolesAreConstants(line) });
R('world-permissions', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\b(?:from_mode|set_mode|mode)\s*\(\s*0o(?:777|776|766|666)\b/,
  ['World-writable file permissions', 'Mode 0o777 / 0o666 lets every local user change the file.', 'Use 0o600 / 0o644.'],
  ['모두가 쓸 수 있는 파일 권한입니다', '0o777 / 0o666 권한은 모든 로컬 사용자가 파일을 바꾸게 합니다.', '0o600 / 0o644를 쓰세요.'],
  'perms.set_mode(0o777);', 'perms.set_mode(0o600);');
R('bind-all-interfaces', 'H', 'MI', 5, ['cwe-668'],
  /"0\.0\.0\.0:\d+"/,
  ['Server bound to all interfaces', '0.0.0.0 exposes the port on every network the machine is on.', 'Bind to 127.0.0.1 unless the service must be public.'],
  ['서버가 모든 인터페이스에 바인딩합니다', '0.0.0.0은 기계가 속한 모든 네트워크에 포트를 엽니다.', '공개해야 하는 서비스가 아니면 127.0.0.1에 바인딩하세요.'],
  'let listener = TcpListener::bind("0.0.0.0:8080")?;', 'let listener = TcpListener::bind("127.0.0.1:8080")?;');
R('get-unchecked', 'H', 'MA', 10, ['cwe-125', 'unsafe'],
  /\.get_unchecked(?:_mut)?\s*\(/,
  ['Unchecked indexing', 'get_unchecked skips bounds checks; a wrong index is undefined behaviour.', 'Use get() or indexing, and measure before optimizing.'],
  ['검사 없는 인덱싱입니다', 'get_unchecked는 경계 검사를 건너뛰어 잘못된 인덱스가 정의되지 않은 동작이 됩니다.', 'get()이나 인덱싱을 쓰고 최적화 전에 측정하세요.'],
  'let v = unsafe { *items.get_unchecked(i) };', 'let v = items[i];');
R('from-raw-parts', 'H', 'MA', 10, ['cwe-119', 'unsafe'],
  /\bfrom_raw_parts(?:_mut)?\s*\(/,
  ['slice::from_raw_parts', 'A wrong pointer, length or lifetime here is undefined behaviour.', 'Keep it in a small, documented unsafe helper with checked invariants.'],
  ['slice::from_raw_parts를 씁니다', '포인터, 길이, 수명이 틀리면 정의되지 않은 동작입니다.', '불변 조건을 검사하는 작은 문서화된 unsafe 도우미에만 두세요.'],
  'let s = unsafe { std::slice::from_raw_parts(ptr, len) };', 'let s = &buffer[..len];');
R('process-exit', 'S', 'MI', 5, ['design'],
  /\b(?:std::)?process::exit\s*\(/,
  ['process::exit called', 'Exiting skips destructors, so buffers may not flush.', 'Return from main with an ExitCode or a Result.'],
  ['process::exit를 호출합니다', '종료하면 소멸자를 건너뛰어 버퍼가 비워지지 않을 수 있습니다.', 'main에서 ExitCode나 Result로 반환하세요.'],
  'std::process::exit(1);', 'return ExitCode::FAILURE;');
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /\bfn\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:->\s*\(\s*\)\s*)?\{\s*\}/,
  ['Empty function', 'An empty body is unfinished or should explain why it does nothing.', 'Implement it or add a comment.'],
  ['빈 함수입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'fn on_close(&mut self) {}', ['fn on_close(&mut self) { self.flush(); }', 'pub fn allow_microphone(_window: &tauri::WebviewWindow) {}'],
  { skip: (raw, line) => underscoreParamsOnly(line) });
R('type-naming', 'S', 'MI', 2, ['convention'],
  /\b(?:struct|enum|trait|union)\s+[a-z]\w*/,
  ['Type name not in UpperCamelCase', 'Rust types are UpperCamelCase.', 'Rename the type.'],
  ['타입 이름이 UpperCamelCase가 아닙니다', 'Rust 타입 이름은 UpperCamelCase입니다.', '타입 이름을 바꾸세요.'],
  'struct user_record {', 'struct UserRecord {');
R('function-naming', 'S', 'MI', 2, ['convention'],
  /\bfn\s+[a-z]+[A-Z]\w*\s*[<(]/,
  ['Function name in camelCase', 'Rust functions are snake_case.', 'Rename the function.'],
  ['함수 이름이 camelCase입니다', 'Rust 함수 이름은 snake_case입니다.', '함수 이름을 바꾸세요.'],
  'fn loadUser(id: u64) {', 'fn load_user(id: u64) {');
R('wildcard-use', 'S', 'MI', 2, ['convention'],
  /^\s*(?:pub\s+)?use\s+[\w:]+::\*\s*;/,
  ['Wildcard use', 'Glob imports hide where names come from and can clash.', 'Import the items you use.'],
  ['와일드카드 use입니다', '글롭 import는 이름의 출처를 숨기고 충돌할 수 있습니다.', '쓰는 항목을 import하세요.'],
  'use std::collections::*;', ['use std::collections::HashMap;', 'use super::*;', 'use crate::prelude::*;'],
  { skip: (raw, line, file) => /\b(?:super|prelude|tests?|testkit|test_?utils?)::\*/.test(raw) || rustNonProductPath(file) });
R('deprecated-try-macro', 'S', 'MI', 2, ['deprecated'],
  /(?<![\w:])try!\s*\(/,
  ['try! macro', 'try! is deprecated and a reserved word since Rust 2018.', 'Use the ? operator.'],
  ['try! 매크로입니다', 'try!는 사용 중단됐고 Rust 2018부터 예약어입니다.', '? 연산자를 쓰세요.'],
  'let f = try!(File::open(p));', 'let f = File::open(p)?;');
R('redundant-bool', 'S', 'MI', 2, ['clumsy'],
  /[=!]=\s*(?:true|false)\b|\b(?:true|false)\s*[=!]=/,
  ['Comparison with true / false', 'x == true is just x.', 'Use the expression or !x.'],
  ['true / false와 비교합니다', 'x == true는 그냥 x입니다.', '식이나 !x를 쓰세요.'],
  'if ready == true {', ['if ready {', 'if settings["alwaysOnTop"] == true {'],
  { skip: (raw, line) => !/[=!]=\s*(?:true|false)\b|\b(?:true|false)\s*[=!]=/.test(line.replace(/\[\s*"[^"]*"\s*\]\s*[=!]=\s*(?:true|false)\b/g, '')) });

// format!("... {TABLE} ...") whose every hole is a CONSTANT name.
function sqlHolesAreConstants(line) {
  const lits = [];
  const re = /\bformat!\s*\(\s*r?#*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(line))) lits.push(m[1]);
  if (!lits.length) return false;
  for (const lit of lits) {
    const holes = lit.replace(/\{\{|\}\}/g, '').match(/\{[^{}]*\}/g) || [];
    if (!holes.length || holes.some((h) => !/^\{[A-Z][A-Z0-9_]*(?::[^}]*)?\}$/.test(h))) return false;
  }
  return true;
}

// fn name(_a: A, _b: B) {} or fn name(&self, _a: A) {}: every named
// parameter starts with an underscore.
function underscoreParamsOnly(line) {
  const m = /\bfn\s+\w+\s*(?:<[^>]*>)?\s*\(([^)]*)\)/.exec(line);
  if (!m) return false;
  const params = m[1].split(',').map((p) => p.trim()).filter((p) => p && !/^&?(?:'\w+\s+)?(?:mut\s+)?self\b/.test(p));
  return params.length > 0 && params.every((p) => /^(?:mut\s+)?_\w*\s*:/.test(p));
}

module.exports = { RULES: R.rules, rustNonProductPath, sqlHolesAreConstants };
