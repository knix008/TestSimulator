'use strict';

// Scala. Functional-style smells (var, null, return), blocking futures,
// Option.get and the security rules that apply on the JVM.

const { maker } = require('./util');

const R = maker('scala', ['scala']);

// ── Bugs ─────────────────────────────────────────────────────
R('option-get', 'B', 'MA', 5, ['null-safety'],
  /\b(?:\w+Opt(?:ion)?|maybe\w*|\w+\.headOption|\w+\.find\([^)]*\)|\w+\.get\([^)]*\))\.get\b(?!\w|\s*\()/,
  ['Option.get', 'get throws NoSuchElementException on None.', 'Use getOrElse, fold, map or pattern matching.'],
  ['Option.get을 씁니다', 'get은 None이면 NoSuchElementException을 던집니다.', 'getOrElse, fold, map 또는 패턴 매칭을 쓰세요.'],
  'val name = userOpt.get', 'val name = userOpt.getOrElse("guest")');
R('head-on-collection', 'B', 'MI', 5, ['collections'],
  /\.(?:head|last|tail|init)\b(?!\w|Option|\s*[{(])|\.reduce(?:Left|Right)?\s*[({]|\.(?:max|min)\b(?!\w|Option|\s*[{(])/,
  ['head / last / reduce on a collection that may be empty', 'These throw on an empty collection.', 'Use headOption, lastOption or reduceOption.'],
  ['비어 있을 수 있는 컬렉션에 head / last / reduce를 씁니다', '이 메서드들은 컬렉션이 비면 예외를 던집니다.', 'headOption, lastOption 또는 reduceOption을 쓰세요.'],
  'val first = users.head', 'val first = users.headOption', { ns: true });
R('await-inf', 'B', 'CR', 15, ['concurrency'],
  /\bAwait\.(?:result|ready)\s*\([^)]*Duration\.Inf\b/,
  ['Await with an infinite timeout', 'Duration.Inf blocks the thread forever if the future never completes.', 'Use a finite timeout, or compose the future without blocking.'],
  ['무한 시간으로 Await합니다', 'Duration.Inf는 퓨처가 끝나지 않으면 스레드를 영원히 막습니다.', '유한한 시간 제한을 쓰거나 막지 않고 퓨처를 조합하세요.'],
  'val r = Await.result(future, Duration.Inf)', 'val r = Await.result(future, 5.seconds)');
R('await-result', 'S', 'MA', 10, ['concurrency', 'performance'],
  /\bAwait\.result\s*\(/,
  ['Blocking Await.result', 'Blocking on a future ties up a thread and can deadlock a small pool.', 'Compose with map / flatMap or for-comprehensions.'],
  ['막는 Await.result를 씁니다', '퓨처를 기다리며 막으면 스레드를 잡고 작은 풀에서는 교착될 수 있습니다.', 'map / flatMap이나 for 식으로 조합하세요.'],
  'val user = Await.result(api.user(id), 3.seconds)', 'api.user(id).map(render)');
R('return-in-lambda', 'B', 'MA', 10, ['suspicious'],
  /=>\s*\{?[^}]*\breturn\b/,
  ['return inside a lambda', 'return in a closure returns from the enclosing method by throwing an exception.', 'Make the lambda an expression and drop return.'],
  ['람다 안에서 return을 씁니다', '클로저 안의 return은 예외를 던져 바깥 메서드에서 돌아옵니다.', '람다를 식으로 만들고 return을 지우세요.'],
  'items.foreach { x => if (x < 0) return }', 'items.takeWhile(_ >= 0).foreach(handle)', { ns: true });
R('equals-without-hashcode', 'B', 'MA', 10, ['equality'],
  /\boverride\s+def\s+equals\s*\(/,
  ['equals overridden', 'Overriding equals without hashCode breaks hash-based collections.', 'Override hashCode too, or use a case class.'],
  ['equals를 재정의합니다', 'hashCode 없이 equals만 재정의하면 해시 컬렉션이 깨집니다.', 'hashCode도 재정의하거나 case class를 쓰세요.'],
  'override def equals(o: Any): Boolean = o match {', 'final case class Point(x: Int, y: Int)',
  { skip: (raw) => /hashCode/.test(raw) });
R('self-comparison', 'B', 'MA', 5, ['suspicious'],
  /\b(\w+(?:\.\w+)*)\s*(?:==|!=|&&|\|\|)\s*\1\b(?![.(\w])/,
  ['Identical expressions on both sides of an operator', 'a == a is always true and usually a copy-paste error.', 'Compare the intended expressions.'],
  ['연산자 양쪽 식이 같습니다', 'a == a는 항상 참이며 보통 복사-붙여넣기 실수입니다.', '의도한 식끼리 비교하세요.'],
  'if (a.id == a.id) save(a)', 'if (a.id == b.id) save(a)', { ns: true, ref: 'S1764' });
R('catch-throwable', 'B', 'MA', 10, ['error-handling', 'cwe-396'],
  /\bcase\s+\w+\s*:\s*(?:Throwable|Exception)\s*=>/,
  ['Catching Throwable or Exception', 'This also catches fatal errors and control-flow throwables.', 'Use case NonFatal(e) => or catch the specific exception.'],
  ['Throwable이나 Exception을 잡습니다', '치명적인 오류와 제어 흐름용 throwable까지 잡습니다.', 'case NonFatal(e) =>를 쓰거나 구체적인 예외를 잡으세요.'],
  'case e: Throwable => log(e)', 'case NonFatal(e) => log(e)');
R('as-instance-of', 'S', 'MA', 5, ['types'],
  /\.asInstanceOf\s*\[/,
  ['asInstanceOf cast', 'A cast throws ClassCastException when the type is wrong.', 'Use pattern matching on the type.'],
  ['asInstanceOf로 캐스트합니다', '타입이 다르면 ClassCastException을 던집니다.', '타입에 대한 패턴 매칭을 쓰세요.'],
  'val dog = animal.asInstanceOf[Dog]', 'animal match { case d: Dog => bark(d); case _ => () }');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('sql-interpolation', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bs"\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"]*\$/i,
  ['SQL built with s-interpolation', 'Interpolated values can change the SQL statement.', 'Use prepared statements, or the sql"" interpolator of Doobie / Slick / Anorm.'],
  ['s 보간으로 SQL을 만듭니다', '보간한 값이 SQL 문을 바꿀 수 있습니다.', '준비된 문이나 Doobie / Slick / Anorm의 sql"" 보간을 쓰세요.'],
  'stmt.executeQuery(s"SELECT * FROM users WHERE name = \'$name\'")', 'sql"SELECT * FROM users WHERE name = $name".query[User]', { ref: 'S2077' });
R('weak-hash', 'V', 'CR', 15, ['crypto', 'cwe-328', 'owasp-a02'],
  /MessageDigest\.getInstance\s*\(\s*"(?:MD2|MD4|MD5|SHA-?1)"/i,
  ['Weak hash algorithm', 'MD5 and SHA-1 collisions are practical.', 'Use SHA-256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있습니다.', 'SHA-256 이상을 쓰세요.'],
  'val md = MessageDigest.getInstance("MD5")', 'val md = MessageDigest.getInstance("SHA-256")', { ref: 'S4790' });
R('weak-cipher', 'V', 'CR', 15, ['crypto', 'cwe-327', 'owasp-a02'],
  /Cipher\.getInstance\s*\(\s*"(?:DES|DESede|RC2|RC4|Blowfish|AES)(?:\/ECB[^"]*)?"/i,
  ['Weak cipher or ECB mode', 'DES / RC4 are broken and "AES" alone defaults to ECB.', 'Use AES/GCM/NoPadding.'],
  ['약한 암호 또는 ECB 모드입니다', 'DES / RC4는 깨졌고 "AES"만 쓰면 ECB가 기본입니다.', 'AES/GCM/NoPadding을 쓰세요.'],
  'val c = Cipher.getInstance("AES")', 'val c = Cipher.getInstance("AES/GCM/NoPadding")', { ref: 'S5547' });
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /\b(?:scala\.util\.Random|Random\.next\w*|new\s+(?:java\.util\.)?Random\s*\()/,
  ['Non-cryptographic random generator', 'scala.util.Random is predictable.', 'Use java.security.SecureRandom for tokens and keys.'],
  ['암호용이 아닌 난수 생성기입니다', 'scala.util.Random은 예측할 수 있습니다.', '토큰과 키에는 java.security.SecureRandom을 쓰세요.'],
  'val token = Random.nextLong()', 'val token = new SecureRandom().nextLong()', { ref: 'S2245' });
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b(?:val|var)\s+\w*(?:password|passwd|pwd|secret|apiKey|token)\w*\s*(?::\s*String\s*)?=\s*"[^"\s]{4,}"/i,
  ['Hard-coded credential', 'Anyone with the source or jar can read the secret.', 'Read it from configuration or a secret store.'],
  ['자격 증명을 코드에 적었습니다', '소스나 jar를 가진 누구나 비밀을 읽을 수 있습니다.', '설정이나 비밀 저장소에서 읽으세요.'],
  'val password = "p4ssw0rd!"', 'val password = sys.env("DB_PASSWORD")', { ref: 'S2068' });
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /"http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  'val api = "http://api.example.com"', 'val api = "https://api.example.com"', { ref: 'S5332' });
R('process-exec', 'H', 'MA', 10, ['cwe-78', 'owasp-a03'],
  /\bs"[^"]*\$[^"]*"\s*\.\s*(?:!!?|run\b|lineStream\b)|Runtime\.getRuntime\.exec\s*\(/,
  ['OS command built from interpolation', 'Values put into a shell command can run other commands.', 'Pass the command as a Seq of arguments.'],
  ['보간으로 OS 명령을 만듭니다', '셸 명령에 넣은 값이 다른 명령을 실행할 수 있습니다.', '명령을 인자 Seq로 넘기세요.'],
  'val out = s"ls $dir".!!', 'val out = Seq("ls", dir).!!');

// ── Code smells ──────────────────────────────────────────────
R('var', 'S', 'MI', 5, ['functional'],
  /^\s*(?:private\s+|protected\s+)?var\s+\w+/,
  ['Mutable var', 'Mutable state is harder to reason about and to share safely.', 'Use val and transform values instead.'],
  ['변경 가능한 var입니다', '변경 가능한 상태는 추론하고 안전하게 공유하기 어렵습니다.', 'val을 쓰고 값을 변환하세요.'],
  'var total = 0', 'val total = values.sum');
R('null', 'S', 'MA', 5, ['null-safety'],
  /(?:=|==|!=|\(|,)\s*null\b/,
  ['null used in Scala code', 'null bypasses the type system and causes NullPointerException.', 'Use Option.'],
  ['Scala 코드에서 null을 씁니다', 'null은 타입 시스템을 우회해 NullPointerException을 일으킵니다.', 'Option을 쓰세요.'],
  'val user: User = null', 'val user: Option[User] = None', { ns: true });
R('return', 'S', 'MI', 2, ['functional'],
  /^\s*return\b/,
  ['Explicit return', 'The last expression is already the result; return is rarely needed.', 'Drop return and make the body an expression.'],
  ['명시적 return입니다', '마지막 식이 이미 결과라 return은 거의 필요 없습니다.', 'return을 지우고 본문을 식으로 만드세요.'],
  'return total', 'total');
R('println', 'S', 'MI', 2, ['debug'],
  /^\s*(?:println|print|Console\.println)\s*\(/,
  ['println left in the code', 'Console output is not a log and cannot be filtered.', 'Use a logger.'],
  ['println이 남아 있습니다', '콘솔 출력은 로그가 아니라 거를 수 없습니다.', '로거를 쓰세요.'],
  'println(s"user=$user")', 'logger.debug(s"user=$user")', { ref: 'S106' });
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b|(?<![\w.])\?\?\?(?![?\w])/,
  ['TODO, FIXME or ??? left', 'The comment or ??? marks unfinished work; ??? throws NotImplementedError.', 'Finish the work.'],
  ['TODO, FIXME 또는 ???가 남아 있습니다', '주석이나 ???가 끝나지 않은 일을 표시하며 ???는 NotImplementedError를 던집니다.', '작업을 끝내세요.'],
  'def load(): Data = ???', 'def load(): Data = repo.load()', { ref: 'S1135' });
R('empty-method', 'S', 'MI', 5, ['suspicious'],
  /\bdef\s+\w+\s*(?:\[[^\]]*\])?\s*(?:\([^)]*\))*\s*(?::\s*Unit\s*)?=\s*\{\s*\}/,
  ['Empty method', 'An empty body is unfinished or should say why it does nothing.', 'Implement it or add a comment.'],
  ['빈 메서드입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'def close(): Unit = {}', 'def close(): Unit = conn.close()', { ref: 'S1186' });
R('mutable-collection-import', 'S', 'MI', 5, ['functional'],
  /^\s*import\s+scala\.collection\.mutable\b/,
  ['Mutable collections imported', 'Mutable collections are easy to share by accident.', 'Prefer immutable collections; keep mutation local.'],
  ['변경 가능한 컬렉션을 가져옵니다', '변경 가능한 컬렉션은 실수로 공유하기 쉽습니다.', '불변 컬렉션을 쓰고 변경은 지역에 두세요.'],
  'import scala.collection.mutable.ListBuffer', 'import scala.collection.immutable.Vector');
R('thread-sleep', 'S', 'MA', 10, ['concurrency'],
  /\bThread\.sleep\s*\(/,
  ['Thread.sleep', 'Sleeping blocks a thread from the pool.', 'Schedule the work or use a timer from your effect library.'],
  ['Thread.sleep을 씁니다', 'sleep은 풀의 스레드를 막습니다.', '작업을 예약하거나 효과 라이브러리의 타이머를 쓰세요.'],
  'Thread.sleep(1000)', 'IO.sleep(1.second)');
R('any-type', 'S', 'MI', 5, ['types'],
  /:\s*Any\b(?!Ref|Val)/,
  ['Value typed as Any', 'Any hides the real type and pushes checks to run time.', 'Use a concrete type or a type parameter.'],
  ['값의 타입이 Any입니다', 'Any는 실제 타입을 숨기고 검사를 실행 시점으로 미룹니다.', '구체 타입이나 타입 매개변수를 쓰세요.'],
  'def handle(msg: Any) = {', 'def handle(msg: Command) = {',
  { skip: (raw) => /def\s+equals\s*\(/.test(raw) });

module.exports = { RULES: R.rules };
