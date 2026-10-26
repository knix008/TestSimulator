'use strict';

// Dart and Flutter. Null-safety escapes, dynamic typing, async pitfalls,
// Flutter lifecycle bugs and the usual security hotspots.

const { maker } = require('./util');

const R = maker('dart', ['dart']);

// ── Bugs ─────────────────────────────────────────────────────
R('null-assertion', 'S', 'MA', 5, ['null-safety'],
  /[\w)\]]!(?=\s*[.\[)\],;]|\s*$)(?!=)/,
  ['Null assertion operator !', 'x! throws when the value is null.', 'Check for null, use ?. or ?? with a default.'],
  ['null 단언 연산자 !를 씁니다', 'x!는 값이 null이면 예외를 던집니다.', 'null을 검사하거나 ?. 또는 ?? 기본값을 쓰세요.'],
  'final name = user!.name;', 'final name = user?.name ?? \'guest\';', { ns: true });
R('late-final-uninitialised', 'S', 'MA', 5, ['null-safety'],
  /^\s*late\s+(?!final\b)[\w<>?,\s]+\s+\w+\s*;/,
  ['late variable without initialiser', 'Reading a late variable before it is set throws LateInitializationError.', 'Initialise it in the constructor or make it nullable.'],
  ['초기값 없는 late 변수입니다', 'late 변수를 값을 넣기 전에 읽으면 LateInitializationError가 납니다.', '생성자에서 초기화하거나 nullable로 만드세요.'],
  'late String token;', 'String? token;');
R('set-state-after-await', 'B', 'MA', 10, ['flutter', 'async'],
  /\bawait\b.*;\s*setState\s*\(/,
  ['setState after await without mounted check', 'The widget may be disposed when the future completes, and setState then throws.', 'Check if (!mounted) return; before setState.'],
  ['mounted 검사 없이 await 뒤에 setState를 부릅니다', '퓨처가 끝날 때 위젯이 이미 폐기됐으면 setState가 예외를 던집니다.', 'setState 전에 if (!mounted) return;을 확인하세요.'],
  'await api.load(); setState(() => loading = false);', 'await api.load(); if (!mounted) return; setState(() => loading = false);',
  { skip: (raw) => /\bmounted\b/.test(raw) });
R('build-context-async', 'B', 'MA', 10, ['flutter', 'async'],
  /\bawait\b.*;\s*(?:Navigator\.of\s*\(\s*context|ScaffoldMessenger\.of\s*\(\s*context|Theme\.of\s*\(\s*context)/,
  ['BuildContext used across an async gap', 'The context may belong to an unmounted widget after await.', 'Check context.mounted before using it.'],
  ['비동기 경계 너머로 BuildContext를 씁니다', 'await 뒤에는 context가 마운트되지 않은 위젯의 것일 수 있습니다.', '쓰기 전에 context.mounted를 확인하세요.'],
  'await save(); Navigator.of(context).pop();', 'await save(); if (context.mounted) Navigator.of(context).pop();',
  { skip: (raw) => /\bmounted\b/.test(raw) });
R('unawaited-future', 'B', 'MI', 5, ['async'],
  /^\s*(?:\w+\.)*(?:save|delete|write|send|post|put|flush|close|insert|update)\w*\s*\([^;]*\)\s*;\s*$/,
  ['Future result possibly ignored', 'Errors of an un-awaited future are lost and the work may not be finished.', 'await it, or wrap it in unawaited() on purpose.'],
  ['퓨처 결과를 무시할 수 있습니다', 'await하지 않은 퓨처의 오류는 사라지고 작업이 끝나지 않을 수 있습니다.', 'await하거나 의도적으로 unawaited()로 감싸세요.'],
  'repository.save(user);', 'await repository.save(user);',
  { skip: (raw) => /\bawait\b|\bunawaited\b|\breturn\b/.test(raw) });
R('self-comparison', 'B', 'MA', 5, ['suspicious'],
  /\b(\w+(?:\.\w+)*)\s*(?:==|!=|&&|\|\|)\s*\1\b(?![.(\w])/,
  ['Identical expressions on both sides of an operator', 'a == a is always true and usually a copy-paste error.', 'Compare the intended expressions.'],
  ['연산자 양쪽 식이 같습니다', 'a == a는 항상 참이며 보통 복사-붙여넣기 실수입니다.', '의도한 식끼리 비교하세요.'],
  'if (a.id == a.id) save(a);', 'if (a.id == b.id) save(a);', { ns: true, sonar: 'S1764' });
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
  ['Empty catch block', 'The error is silently ignored.', 'Log or handle the error.'],
  ['빈 catch 블록입니다', '오류를 아무 말 없이 무시합니다.', '오류를 기록하거나 처리하세요.'],
  '} catch (e) {}', '} catch (e, st) { log.severe(\'load failed\', e, st); }', { sonar: 'S108' });
R('catch-all-on', 'S', 'MI', 5, ['error-handling', 'cwe-396'],
  /^\s*\}?\s*catch\s*\(\s*\w+\s*\)\s*\{/,
  ['catch without an on clause', 'A bare catch also catches Errors such as StateError and assertion failures.', 'Use on SpecificException catch (e).'],
  ['on 절 없는 catch입니다', 'on 절 없는 catch는 StateError와 assert 실패 같은 Error까지 잡습니다.', 'on SpecificException catch (e)를 쓰세요.'],
  '} catch (e) {', '} on FormatException catch (e) {');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /['"]http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2)[\w.-]+/,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  'final uri = Uri.parse(\'http://api.example.com/v1\');', 'final uri = Uri.parse(\'https://api.example.com/v1\');', { sonar: 'S5332' });
R('bad-certificate-callback', 'V', 'CR', 30, ['tls', 'cwe-295', 'owasp-a07'],
  /\bbadCertificateCallback\s*=\s*\([^)]*\)\s*=>\s*true\b/,
  ['All TLS certificates accepted', 'Returning true from badCertificateCallback allows man-in-the-middle attacks.', 'Remove the callback, or pin the expected certificate.'],
  ['모든 TLS 인증서를 받아들입니다', 'badCertificateCallback이 true를 돌려주면 중간자 공격을 허용합니다.', '콜백을 지우거나 기대하는 인증서를 고정하세요.'],
  'client.badCertificateCallback = (cert, host, port) => true;', 'client.badCertificateCallback = (cert, host, port) => cert.sha1.toString() == pinned;', { sonar: 'S4830' });
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b(?:final|const|var|String)\s+\w*(?:password|passwd|pwd|secret|apiKey|token)\w*\s*=\s*['"][^'"\s]{4,}['"]/i,
  ['Hard-coded credential', 'Anyone with the app bundle can read the secret.', 'Fetch it from a server or secure storage.'],
  ['자격 증명을 코드에 적었습니다', '앱 번들을 가진 누구나 비밀을 읽을 수 있습니다.', '서버나 보안 저장소에서 가져오세요.'],
  'const apiKey = \'sk-12345abcdef\';', 'final apiKey = await storage.read(key: \'apiKey\');', { sonar: 'S2068' });
R('weak-hash', 'V', 'CR', 15, ['crypto', 'cwe-328', 'owasp-a02'],
  /\b(?:md5|sha1)\.convert\s*\(/,
  ['Weak hash algorithm', 'MD5 and SHA-1 collisions are practical.', 'Use sha256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있습니다.', 'sha256 이상을 쓰세요.'],
  'final digest = md5.convert(utf8.encode(password));', 'final digest = sha256.convert(utf8.encode(data));', { sonar: 'S4790' });
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /\bRandom\s*\(\s*\d*\s*\)(?!\.secure)/,
  ['Non-cryptographic random generator', 'Random() is predictable.', 'Use Random.secure() for tokens and keys.'],
  ['암호용이 아닌 난수 생성기입니다', 'Random()은 예측할 수 있습니다.', '토큰과 키에는 Random.secure()를 쓰세요.'],
  'final nonce = Random().nextInt(1 << 32);', 'final nonce = Random.secure().nextInt(1 << 32);', { sonar: 'S2245' });
R('shared-prefs-secret', 'V', 'MA', 15, ['cwe-312', 'storage'],
  /\.set(?:String|Int)\s*\(\s*['"]\w*(?:password|token|secret|pin)\w*['"]/i,
  ['Secret stored in SharedPreferences', 'SharedPreferences is a plain file readable on rooted devices and backups.', 'Use flutter_secure_storage.'],
  ['비밀을 SharedPreferences에 저장합니다', 'SharedPreferences는 루팅된 기기와 백업에서 읽을 수 있는 평문 파일입니다.', 'flutter_secure_storage를 쓰세요.'],
  'await prefs.setString(\'authToken\', token);', 'await secureStorage.write(key: \'authToken\', value: token);');
R('sql-interpolation', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\.(?:rawQuery|rawInsert|rawUpdate|rawDelete|execute)\s*\(\s*(?:"[^"]*\$|'[^']*\$)/,
  ['SQL built by string interpolation', 'Interpolated values can change the SQL statement.', 'Pass ? placeholders and the arguments list.'],
  ['문자열 보간으로 SQL을 만듭니다', '보간한 값이 SQL 문을 바꿀 수 있습니다.', '? 자리표시자와 인자 목록을 넘기세요.'],
  'db.rawQuery("SELECT * FROM users WHERE name = \'$name\'");', 'db.rawQuery(\'SELECT * FROM users WHERE name = ?\', [name]);', { sonar: 'S2077' });
R('webview-js-unrestricted', 'H', 'MA', 10, ['webview', 'cwe-79'],
  /\bJavaScriptMode\.unrestricted\b/,
  ['Unrestricted JavaScript in a web view', 'Scripts of loaded pages can run and call exposed channels.', 'Keep JavaScript disabled unless the content is trusted.'],
  ['웹 뷰에서 JavaScript를 제한 없이 허용합니다', '불러온 페이지의 스크립트가 실행되어 노출된 채널을 호출할 수 있습니다.', '믿을 수 있는 콘텐츠가 아니면 JavaScript를 끄세요.'],
  'controller.setJavaScriptMode(JavaScriptMode.unrestricted);', 'controller.setJavaScriptMode(JavaScriptMode.disabled);');

// ── Code smells ──────────────────────────────────────────────
R('print', 'S', 'MI', 2, ['debug'],
  /^\s*(?:print|debugPrint)\s*\(/,
  ['print left in the code', 'print output ships in release builds and may leak data.', 'Use a logger such as package:logging.'],
  ['print가 남아 있습니다', 'print 출력이 릴리스 빌드에 남아 데이터를 흘릴 수 있습니다.', 'package:logging 같은 로거를 쓰세요.'],
  'print(\'token: $token\');', 'log.fine(\'loaded $count items\');', { sonar: 'S106' });
R('dynamic', 'S', 'MI', 5, ['types'],
  /(?:^|[(<,\s])dynamic\s+\w+/,
  ['Value typed as dynamic', 'dynamic turns off static checks for every use of the value.', 'Use a concrete type or Object? with a type test.'],
  ['값의 타입이 dynamic입니다', 'dynamic은 그 값을 쓰는 모든 곳에서 정적 검사를 끕니다.', '구체 타입이나 타입 검사와 함께 Object?를 쓰세요.'],
  'dynamic payload = jsonDecode(body);', 'final Map<String, Object?> payload = jsonDecode(body) as Map<String, Object?>;');
R('as-cast', 'S', 'MI', 5, ['types'],
  /\bas\s+(?!Map<String,\s*Object\?>)[A-Z]\w*(?:<[^>]*>)?\s*[;)]/,
  ['Unchecked as cast', 'as throws a TypeError when the type is wrong.', 'Use is with a pattern or a type test first.'],
  ['검사하지 않는 as 캐스트입니다', 'as는 타입이 다르면 TypeError를 던집니다.', 'is 패턴이나 먼저 타입 검사를 쓰세요.'],
  'final user = value as User;', 'if (value is User) show(value);');
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '// TODO: cache the response', '// Responses are cached by HttpCache.', { scope: 'any', sonar: 'S1135' });
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /^\s*(?:void|Future<void>|[A-Z]\w*)\s+\w+\s*\([^)]*\)\s*(?:async\s*)?\{\s*\}/,
  ['Empty function', 'An empty body is unfinished or should say why it does nothing.', 'Implement it or add a comment.'],
  ['빈 함수입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'void refresh() {}', 'void refresh() { controller.reload(); }', { sonar: 'S1186' });
R('sleep', 'S', 'MA', 10, ['performance'],
  /\bsleep\s*\(\s*(?:const\s+)?Duration\b/,
  ['Blocking sleep', 'dart:io sleep blocks the isolate, freezing the UI.', 'Use await Future.delayed.'],
  ['막는 sleep입니다', 'dart:io의 sleep은 isolate를 막아 UI를 멈춥니다.', 'await Future.delayed를 쓰세요.'],
  'sleep(const Duration(seconds: 1));', 'await Future.delayed(const Duration(seconds: 1));');

module.exports = { RULES: R.rules };
