'use strict';

// Apache Flex / ActionScript 3. Flash Player sandbox settings, JavaScript
// bridges, local storage of secrets and ActionScript smells.

const { maker } = require('./util');

const R = maker('flex', ['flex']);

R('trace', 'S', 'MI', 2, ['debug'],
  /^\s*trace\s*\(/,
  ['trace() left in the code', 'trace output is visible with a debug player and may leak data.', 'Remove it or use mx.logging with levels.'],
  ['trace()가 남아 있습니다', 'trace 출력은 디버그 플레이어에서 보이며 데이터를 흘릴 수 있습니다.', '지우거나 수준이 있는 mx.logging을 쓰세요.'],
  'trace("token=" + token);', 'log.debug("loaded {0} items", count);', { ref: 'S106' });
R('allow-domain-any', 'V', 'CR', 15, ['cwe-942', 'owasp-a05'],
  /\.allow(?:Insecure)?Domain\s*\(\s*["']\*["']\s*\)/,
  ['allowDomain("*")', 'Any SWF from any site can script this movie and read its data.', 'Allow only the exact domains that need access.'],
  ['allowDomain("*")를 씁니다', '어느 사이트의 SWF든 이 무비를 스크립트로 다루고 데이터를 읽을 수 있습니다.', '접근이 필요한 정확한 도메인만 허용하세요.'],
  'Security.allowDomain("*");', 'Security.allowDomain("cdn.example.com");');
R('allow-insecure-domain', 'V', 'MA', 10, ['tls', 'cwe-319'],
  /\bSecurity\.allowInsecureDomain\s*\(/,
  ['Security.allowInsecureDomain', 'SWFs loaded over plain HTTP may script this HTTPS movie.', 'Use allowDomain and serve every SWF over HTTPS.'],
  ['Security.allowInsecureDomain을 씁니다', '평문 HTTP로 불러온 SWF가 이 HTTPS 무비를 스크립트로 다룰 수 있습니다.', 'allowDomain을 쓰고 모든 SWF를 HTTPS로 제공하세요.'],
  'Security.allowInsecureDomain("partner.example.com");', 'Security.allowDomain("partner.example.com");');
R('exact-settings-off', 'V', 'MA', 10, ['cwe-346'],
  /\bSecurity\.exactSettings\s*=\s*false\b/,
  ['Security.exactSettings = false', 'Relaxed domain matching lets sibling subdomains share the sandbox.', 'Keep exactSettings true.'],
  ['Security.exactSettings = false를 씁니다', '느슨한 도메인 일치는 형제 하위 도메인이 샌드박스를 함께 쓰게 합니다.', 'exactSettings를 true로 두세요.'],
  'Security.exactSettings = false;', 'Security.exactSettings = true;');
R('external-interface-dynamic', 'V', 'CR', 20, ['cwe-79', 'owasp-a03'],
  /\bExternalInterface\.call\s*\(\s*(?!["'])[\w.]+/,
  ['ExternalInterface.call with a dynamic function name', 'A name from input can run arbitrary JavaScript in the hosting page.', 'Call a fixed JavaScript function name and pass data as arguments.'],
  ['동적 함수 이름으로 ExternalInterface.call을 부릅니다', '입력에서 온 이름은 호스트 페이지에서 임의 JavaScript를 실행할 수 있습니다.', '고정된 JavaScript 함수 이름을 부르고 데이터는 인자로 넘기세요.'],
  'ExternalInterface.call(callbackName, result);', 'ExternalInterface.call("onResult", result);');
R('external-interface-callback', 'H', 'MI', 10, ['cwe-749'],
  /\bExternalInterface\.addCallback\s*\(/,
  ['Method exposed to JavaScript', 'Any script in the hosting page can call the exposed method.', 'Validate every argument and expose as few methods as possible.'],
  ['메서드를 JavaScript에 노출합니다', '호스트 페이지의 어떤 스크립트든 노출된 메서드를 부를 수 있습니다.', '모든 인자를 검증하고 노출하는 메서드를 최소로 하세요.'],
  'ExternalInterface.addCallback("setUser", setUser);', 'addEventListener(Event.COMPLETE, onComplete);');
R('fscommand', 'H', 'MI', 10, ['cwe-749'],
  /(?<![\w.])fscommand\s*\(/,
  ['fscommand call', 'fscommand sends commands to the host application or page.', 'Use ExternalInterface with fixed names and validated data.'],
  ['fscommand를 호출합니다', 'fscommand는 호스트 애플리케이션이나 페이지에 명령을 보냅니다.', '고정 이름과 검증한 데이터로 ExternalInterface를 쓰세요.'],
  'fscommand("exec", "app.exe");', 'ExternalInterface.call("onExit");');
R('navigate-dynamic', 'H', 'MA', 10, ['cwe-601'],
  /\bnavigateToURL\s*\(\s*new\s+URLRequest\s*\(\s*(?!["'])\w+/,
  ['navigateToURL with a URL from a variable', 'A URL from input can open a javascript: link or a phishing site.', 'Allow only known URLs or check the scheme and host.'],
  ['변수에 든 URL로 navigateToURL을 부릅니다', '입력에서 온 URL은 javascript: 링크나 피싱 사이트를 열 수 있습니다.', '알려진 URL만 허용하거나 스킴과 호스트를 확인하세요.'],
  'navigateToURL(new URLRequest(link), "_blank");', 'navigateToURL(new URLRequest("https://www.example.com/help"), "_blank");');
R('shared-object-secret', 'V', 'MA', 15, ['cwe-312', 'storage'],
  /\.data\.\w*(?:password|passwd|token|secret)\w*\s*=/i,
  ['Secret stored in a SharedObject', 'Local shared objects are plain files any local user can read.', 'Do not persist secrets on the client.'],
  ['비밀을 SharedObject에 저장합니다', '로컬 공유 객체는 로컬 사용자 누구나 읽을 수 있는 평문 파일입니다.', '클라이언트에 비밀을 저장하지 마세요.'],
  'so.data.password = txtPassword.text;', 'so.data.lastUser = txtUser.text;');
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b(?:var|const)\s+\w*(?:password|passwd|pwd|secret|apiKey|token)\w*\s*(?::\s*String\s*)?=\s*["'][^"'\s]{4,}["']/i,
  ['Hard-coded credential', 'Anyone can decompile the SWF and read the secret.', 'Keep secrets on the server.'],
  ['자격 증명을 코드에 적었습니다', '누구나 SWF를 디컴파일해 비밀을 읽을 수 있습니다.', '비밀은 서버에 두세요.'],
  'private const API_TOKEN:String = "a1b2c3d4e5";', 'private var apiToken:String = session.token;', { ref: 'S2068' });
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /["']http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  'var req:URLRequest = new URLRequest("http://api.example.com/data");', 'var req:URLRequest = new URLRequest("https://api.example.com/data");', { ref: 'S5332' });
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /\bMath\.random\s*\(\s*\)/,
  ['Math.random() used', 'Math.random is predictable and must not produce tokens or keys.', 'Generate secrets on the server, or use flash.crypto.generateRandomBytes.'],
  ['Math.random()을 씁니다', 'Math.random은 예측할 수 있어 토큰이나 키를 만들면 안 됩니다.', '비밀은 서버에서 만들거나 flash.crypto.generateRandomBytes를 쓰세요.'],
  'var nonce:Number = Math.random();', 'var nonce:ByteArray = generateRandomBytes(16);', { ref: 'S2245' });
R('dynamic-class', 'S', 'MA', 10, ['types'],
  /^\s*(?:public\s+|internal\s+)?(?:final\s+)?dynamic\s+class\b/,
  ['dynamic class', 'Properties of a dynamic class can be added at run time, which hides typos and defeats type checks.', 'Declare the properties and drop dynamic.'],
  ['dynamic 클래스입니다', 'dynamic 클래스는 실행 중에 속성을 더할 수 있어 오타를 숨기고 타입 검사를 무력하게 합니다.', '속성을 선언하고 dynamic을 지우세요.'],
  'public dynamic class Settings {', 'public class Settings {');
R('with-statement', 'S', 'MA', 5, ['confusing'],
  /(?<![\w.])with\s*\(\s*\w/,
  ['with statement', 'with makes it unclear which object a name refers to.', 'Use an explicit reference.'],
  ['with 문입니다', 'with는 이름이 어느 객체를 가리키는지 흐리게 만듭니다.', '명시적인 참조를 쓰세요.'],
  'with (panel) { width = 100; }', 'panel.width = 100;');
R('untyped', 'S', 'MI', 2, ['types'],
  /\b(?:var|const)\s+\w+\s*:\s*\*|\bfunction\s+\w+\s*\([^)]*\)\s*:\s*\*/,
  ['Untyped (*) declaration', 'The * type turns off compile-time checks.', 'Declare the real type.'],
  ['타입 없는(*) 선언입니다', '* 타입은 컴파일 시점 검사를 끕니다.', '실제 타입을 선언하세요.'],
  'var item:* = list.getItemAt(0);', 'var item:Order = Order(list.getItemAt(0));');
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
  ['Empty catch block', 'The error is silently ignored.', 'Log or handle the error.'],
  ['빈 catch 블록입니다', '오류를 아무 말 없이 무시합니다.', '오류를 기록하거나 처리하세요.'],
  '} catch (e:Error) {}', '} catch (e:Error) { log.error(e.message); }', { ref: 'S108' });

module.exports = { RULES: R.rules };
