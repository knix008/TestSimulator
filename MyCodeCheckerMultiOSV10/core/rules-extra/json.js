'use strict';

// JSON: package manifests, tsconfig, composer.json, appsettings.json, cloud
// policies and other configuration.

const { maker } = require('./util');

const R = maker('json', ['json']);

// Keys that hold metadata rather than a dependency spec (lockfiles, advisories).
const META_KEY = /^\s*"(?:resolved|integrity|url|homepage|tarball|version|introduced|fixed|last_affected|contentHash|from|repository|bugs|funding|license|main|module|types|description|name|engines?)"\s*:/;
const notDependency = (raw) => META_KEY.test(raw);

// Package manifests whose values are dependency specs and whose scripts run
// on install. Other JSON (data files, schemas, editor settings) only looks alike.
const MANIFEST = /(?:^|\/)(?:package|composer|bower)\.json$/i;
// Keys that commonly hold "*" without being a dependency (globs, CORS, data).
const NOT_DEP_KEY = /^\s*"(?:versions?|include|exclude|files|origins?|target|pattern|glob|scope|allow|deny|resources?|actions?|paths?|match(?:es)?|hosts?|domains?|methods|headers|types|lib|extends|tag|channel|[A-Z][\w-]*)"\s*:/;
// skip(raw, line, file) of json:star-version: outside a manifest (when the
// path is known) or on a key that is not a package name.
function starVersionSkip(raw, file) {
  if (file && !MANIFEST.test(String(file).replace(/\\/g, '/'))) return true;
  return NOT_DEP_KEY.test(raw) || !/^\s*"(?:@[\w.-]+\/)?[\w.-]+"\s*:/.test(raw);
}
// skip(raw, line, file) of json:postinstall: only package.json runs install scripts.
function installScriptSkip(raw, file) {
  return !!file && !/(?:^|\/)package\.json$/i.test(String(file).replace(/\\/g, '/'));
}

R('http-url', 'H', 'MI', 5, ['cwe-319', 'owasp-a02'],
  // Not loopback, *.localhost, schema / namespace ids, single-label hosts, or
  // an allow-list pattern such as "http://*" or "http://*.example.com/*".
  /:\s*"http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:[\w-]+\.)+localhost\b|\*|json-schema\.org|schemas?\.|www\.w3\.org|[\w-]+(?::\d+)?\/?")/,
  ['URL over plain HTTP', 'Traffic to this URL can be read and changed on the network.', 'Use https.'],
  ['평문 HTTP URL입니다', '이 URL로 가는 통신은 네트워크에서 읽히고 바뀔 수 있습니다.', 'https를 쓰세요.'],
  '  "registry": "http://registry.example.com/"', ['  "registry": "https://registry.example.com/"', '  "$schema": "http://json-schema.org/draft-07/schema#"', '  "url": "http://*"', '  "devUrl": "http://tauri.localhost/"']);
R('url-dependency', 'S', 'MA', 10, ['supply-chain'],
  /^\s*"[@\w.\/-]+"\s*:\s*"(?:https?:\/\/[^"]+\.(?:tgz|tar\.gz|zip)|git\+(?:ssh|https):\/\/[^"#]+|github:[^"#]+|[\w-]+\/[\w.-]+#(?:master|main|develop|HEAD))"/,
  ['Dependency from a URL or branch', 'Tarball URLs and branch references bypass the registry and change without a version bump.', 'Depend on a published version, or pin a commit.'],
  ['URL이나 브랜치에서 받는 의존성입니다', 'tarball URL과 브랜치 참조는 레지스트리를 우회하고 버전 변경 없이 바뀝니다.', '배포된 버전을 쓰거나 커밋을 고정하세요.'],
  '    "left-pad": "git+https://github.com/someone/left-pad.git"', ['    "left-pad": "^1.3.0"', '    "lib": "git+https://github.com/org/lib.git#4f2a9c1"', '      "resolved": "https://registry.npmjs.org/a/-/a-1.0.0.tgz",'],
  { skip: notDependency });
R('open-version-range', 'S', 'MA', 5, ['supply-chain'],
  /^\s*"[@\w.\/-]+"\s*:\s*"(?:>=?\s*\d[^"<]*|x|\d+\.x(?:\.x)?|\*\s*\|\|[^"]*)"/,
  ['Version range without an upper bound', '>= 1.0 or 1.x accepts any future major release, including breaking ones.', 'Use a caret or tilde range, or an exact version.'],
  ['상한 없는 버전 범위입니다', '>= 1.0이나 1.x는 호환이 깨지는 미래 주 버전까지 받아들입니다.', '캐럿이나 틸드 범위, 정확한 버전을 쓰세요.'],
  '    "express": ">=4.0.0"', ['    "express": "^4.19.2"', '    "node": ">=18"'],
  { skip: (raw) => notDependency(raw) || /^\s*"(?:node|npm|yarn|pnpm|vscode|bun|deno|php|ext-[\w-]+)"\s*:/.test(raw) });
R('prerelease-dependency', 'S', 'MI', 2, ['supply-chain'],
  /^\s*"[@\w.\/-]+"\s*:\s*"[\^~]?\d+\.\d+\.\d+-(?:alpha|beta|rc|next|canary|dev|pre|nightly)/i,
  ['Pre-release dependency', 'Alpha, beta and canary builds can change behavior between releases.', 'Use a stable release when one exists.'],
  ['사전 배포 의존성입니다', 'alpha, beta, canary 빌드는 배포마다 동작이 바뀔 수 있습니다.', '안정 배포가 있으면 그것을 쓰세요.'],
  '    "react": "19.0.0-rc.1"', ['    "react": "18.3.1"', '      "introduced": "3.0.0-beta.1"'], { skip: notDependency });
R('script-curl-pipe-shell', 'V', 'CR', 20, ['cwe-494', 'owasp-a08', 'supply-chain'],
  /^\s*"[\w:.-]+"\s*:\s*"[^"]*\b(?:curl|wget)\b[^"]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
  ['npm script pipes a download into a shell', 'Whatever the server returns runs on every developer and CI machine.', 'Download a pinned file and verify a checksum first.'],
  ['npm 스크립트가 내려받은 것을 셸로 파이프합니다', '서버가 돌려준 무엇이든 모든 개발자와 CI 기계에서 실행됩니다.', '고정된 파일을 받아 먼저 체크섬을 확인하세요.'],
  '    "setup": "curl -fsSL https://get.example.com | sh"', '    "setup": "node scripts/setup.mjs"');
R('script-rm-root', 'B', 'CR', 10, ['cwe-73'],
  /^\s*"[\w:.-]+"\s*:\s*"[^"]*\brm\s+-[A-Za-z]*r[A-Za-z]*\s+(?:\/|~|\$\w+\/?)(?:\s|"|\*)/,
  ['npm script deletes a root, home or variable path', 'If the variable is empty or the path is wrong, the script wipes the machine.', 'Delete only project-relative paths, for example rimraf dist.'],
  ['npm 스크립트가 루트, 홈, 변수 경로를 지웁니다', '변수가 비거나 경로가 틀리면 스크립트가 기계를 지웁니다.', 'rimraf dist처럼 프로젝트 상대 경로만 지우세요.'],
  '    "clean": "rm -rf $OUT_DIR/"', '    "clean": "rimraf dist"');
R('tsconfig-strict-off', 'S', 'MA', 10, ['typescript'],
  /^\s*"(?:strict|strictNullChecks|noImplicitAny|strictFunctionTypes)"\s*:\s*false\b/,
  ['TypeScript strict checks turned off', 'Without strict mode, nulls and implicit any slip through the compiler.', 'Enable "strict": true and fix the errors gradually.'],
  ['TypeScript 엄격 검사를 끕니다', '엄격 모드가 없으면 null과 암시적 any가 컴파일러를 통과합니다.', '"strict": true를 켜고 오류를 차차 고치세요.'],
  '    "strict": false,', '    "strict": true,');
R('debug-enabled', 'H', 'MI', 5, ['cwe-489', 'owasp-a05'],
  /^\s*"(?:debug|Debug|DEBUG|DetailedErrors|EnableDetailedErrors|ShowExceptionDetails|IncludeExceptionDetails|displayErrors)"\s*:\s*true\b/,
  ['Debug output enabled in configuration', 'Detailed errors and debug flags reveal internals to users.', 'Keep them off in production settings.'],
  ['설정에서 디버그 출력을 켭니다', '자세한 오류와 디버그 플래그는 내부 정보를 사용자에게 드러냅니다.', '운영 설정에서는 끄세요.'],
  '  "DetailedErrors": true,', '  "DetailedErrors": false,');
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /"(?:Access-Control-Allow-Origin|cors(?:Origin|Origins)?|allowedOrigins|AllowedOrigins|allowOrigins|origin|origins)"\s*:\s*(?:\[\s*)?"\*"/i,
  ['CORS allows any origin', 'Any site can read responses meant for your front end.', 'List the allowed origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 프런트엔드용 응답을 읽을 수 있습니다.', '허용할 origin을 나열하세요.'],
  '  "allowedOrigins": ["*"]', '  "allowedOrigins": ["https://app.example.com"]');
R('policy-wildcard-action', 'V', 'CR', 15, ['cwe-269', 'owasp-a01', 'iam'],
  /"(?:Action|NotAction)"\s*:\s*(?:\[\s*)?"(?:\*|[a-z0-9-]+:\*)"/,
  ['Policy allows every action', '"*" or "service:*" grants far more than needed.', 'List the specific actions.'],
  ['정책이 모든 동작을 허용합니다', '"*"나 "service:*"는 필요보다 훨씬 많이 허용합니다.', '구체적인 동작을 나열하세요.'],
  '      "Action": "s3:*",', '      "Action": "s3:GetObject",');
R('policy-wildcard-principal', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'iam'],
  /"Principal"\s*:\s*(?:"\*"|\{\s*"AWS"\s*:\s*(?:\[\s*)?"\*")/,
  ['Policy grants access to everyone', 'Principal "*" lets any AWS account or anonymous user in.', 'Name the accounts or roles allowed.'],
  ['정책이 모두에게 접근을 허용합니다', 'Principal "*"는 아무 AWS 계정이나 익명 사용자를 들입니다.', '허용할 계정이나 역할을 지정하세요.'],
  '      "Principal": "*",', '      "Principal": { "AWS": "arn:aws:iam::123456789012:root" },');
R('policy-wildcard-resource', 'H', 'MA', 10, ['cwe-732', 'owasp-a01', 'iam'],
  /"Resource"\s*:\s*(?:\[\s*)?"\*"/,
  ['Policy applies to every resource', 'Resource "*" extends the permissions to all resources in the account.', 'Scope the policy to specific ARNs.'],
  ['정책이 모든 리소스에 적용됩니다', 'Resource "*"는 계정의 모든 리소스로 권한을 넓힙니다.', '정책을 특정 ARN으로 좁히세요.'],
  '      "Resource": "*"', '      "Resource": "arn:aws:s3:::logs/*"');
R('composer-insecure', 'V', 'MA', 10, ['cwe-319', 'owasp-a02', 'supply-chain'],
  /"secure-http"\s*:\s*false\b|"disable-tls"\s*:\s*true\b/,
  ['Composer allows insecure downloads', 'Packages can be fetched over plain HTTP and replaced on the network.', 'Keep secure-http true and TLS on.'],
  ['Composer가 안전하지 않은 내려받기를 허용합니다', '패키지를 평문 HTTP로 받아 네트워크에서 바뀔 수 있습니다.', 'secure-http를 true로, TLS를 켜 두세요.'],
  '    "secure-http": false', '    "secure-http": true');
R('minimum-stability-dev', 'S', 'MI', 5, ['supply-chain'],
  /"minimum-stability"\s*:\s*"dev"/,
  ['Composer minimum-stability dev', 'Unstable development versions can be installed.', 'Use stable, with prefer-stable if needed.'],
  ['Composer minimum-stability dev입니다', '불안정한 개발 버전이 설치될 수 있습니다.', 'stable을 쓰고 필요하면 prefer-stable을 쓰세요.'],
  '  "minimum-stability": "dev",', '  "minimum-stability": "stable",');
R('tls-verification-off', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /"(?:strict-ssl|strictSSL|rejectUnauthorized|sslVerify|verify_ssl|verifySsl|http\.sslVerify)"\s*:\s*false\b/i,
  ['TLS verification disabled in configuration', 'Any certificate is accepted, allowing man-in-the-middle.', 'Keep verification on and configure the CA.'],
  ['설정에서 TLS 검증을 끕니다', '아무 인증서나 받아들여 중간자 공격을 허용합니다.', '검증을 켜 두고 CA를 설정하세요.'],
  '  "strict-ssl": false', '  "strict-ssl": true');
R('duplicate-key', 'B', 'MA', 5, ['pitfall'],
  /"([^"\\]+)"\s*:\s*(?:"[^"]*"|[\d.eE+-]+|true|false|null)\s*,\s*"\1"\s*:/,
  ['Duplicate key in an object', 'Parsers keep only one of the values, and which one varies.', 'Remove the duplicate key.'],
  ['객체에 키가 중복됩니다', '파서는 값 하나만 남기며 어느 쪽인지 다릅니다.', '중복 키를 지우세요.'],
  '{ "port": 80, "port": 8080 }', '{ "port": 80, "host": "a" }');
R('trailing-comma', 'B', 'MI', 2, ['syntax'],
  /,\s*[}\]]/,
  ['Trailing comma', 'Strict JSON parsers reject a comma before } or ].', 'Remove the comma (only JSONC files allow it).'],
  ['끝에 쉼표가 있습니다', '엄격한 JSON 파서는 } 나 ] 앞의 쉼표를 거부합니다.', '쉼표를 지우세요(JSONC 파일만 허용).'],
  '{ "a": 1, "b": 2, }', '{ "a": 1, "b": 2 }', { ns: true });
R('comment-in-json', 'B', 'MI', 2, ['syntax'],
  /^\s*(?:\/\/|\/\*)/,
  ['Comment in a JSON file', 'Standard JSON has no comments; strict parsers fail.', 'Remove the comment, or rename the file to .jsonc if the tool supports it.'],
  ['JSON 파일의 주석입니다', '표준 JSON에는 주석이 없어 엄격한 파서가 실패합니다.', '주석을 지우거나 도구가 지원하면 .jsonc로 이름을 바꾸세요.'],
  '// build settings', '"build": {}');
R('engines-missing-node-upper', 'S', 'IN', 1, ['supply-chain'],
  /^\s*"engine-strict"\s*:\s*false\b/,
  ['engine-strict disabled', 'Installs proceed on unsupported runtime versions.', 'Set engine-strict to true, or remove the override.'],
  ['engine-strict를 끕니다', '지원하지 않는 런타임 버전에서도 설치가 진행됩니다.', 'engine-strict를 true로 두거나 재정의를 지우세요.'],
  '  "engine-strict": false', '  "engine-strict": true');
R('public-publish-config', 'H', 'MI', 5, ['supply-chain'],
  /"access"\s*:\s*"public"/,
  ['Package published as public', 'A scoped package with access public is visible to everyone on the registry.', 'Check that the package is meant to be public; use restricted otherwise.'],
  ['패키지를 공개로 배포합니다', 'access public인 범위 패키지는 레지스트리의 모두에게 보입니다.', '공개용인지 확인하고 아니면 restricted를 쓰세요.'],
  '    "access": "public"', '    "access": "restricted"');
R('private-flag-false', 'H', 'MI', 2, ['supply-chain'],
  /^\s*"private"\s*:\s*false\b/,
  ['package.json private set to false', 'An accidental npm publish uploads the whole project.', 'Set "private": true for applications.'],
  ['package.json private가 false입니다', '실수로 npm publish하면 프로젝트 전체가 올라갑니다.', '애플리케이션에는 "private": true를 두세요.'],
  '  "private": false,', '  "private": true,');

module.exports = { RULES: R.rules, starVersionSkip, installScriptSkip };
