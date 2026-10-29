'use strict';

// Shell scripts (sh, bash, zsh).

const { maker } = require('./util');

const R = maker('sh', ['sh']);

const CMD_START = String.raw`(?:^|[;&|(]\s*|\b(?:then|do|else|sudo)\s+)`;

R('chmod-world-writable', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\bchmod\s+(?:-[A-Za-z]+\s+)*(?:0?777|0?666|a\+rwx|ugo\+rwx|[ao]\+w|o\+rwx)(?=\s|$)/,
  ['World-writable permissions', 'chmod 777 / o+w lets every local user change the file.', 'Grant only what is needed, for example 755 or 644.'],
  ['모두가 쓸 수 있는 권한입니다', 'chmod 777 / o+w는 모든 로컬 사용자가 파일을 바꾸게 합니다.', '필요한 만큼만 주세요. 예: 755, 644.'],
  'chmod -R 777 /srv/app', 'chmod -R 755 /srv/app');
R('setuid-bit', 'H', 'MA', 10, ['cwe-250'],
  /\bchmod\s+(?:-[A-Za-z]+\s+)*(?:[ugoa]*\+s|[2467][0-7]{3})(?=\s|$)/,
  ['setuid / setgid bit set', 'A setuid program runs with its owner\'s rights, so any flaw becomes privilege escalation.', 'Avoid setuid; use sudo rules or capabilities.'],
  ['setuid / setgid 비트를 설정합니다', 'setuid 프로그램은 소유자 권한으로 실행되어 결함이 곧 권한 상승이 됩니다.', 'setuid를 피하고 sudo 규칙이나 capability를 쓰세요.'],
  'chmod u+s /usr/local/bin/tool', 'chmod 755 /usr/local/bin/tool');
R('curl-insecure', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /\bcurl\b[^|;&]*\s(?:-k|--insecure|-[A-Za-z]*k[A-Za-z]*)(?=\s|$)/,
  ['curl with TLS verification off', '-k / --insecure accepts any certificate, allowing man-in-the-middle.', 'Remove -k and pass --cacert if a private CA is used.'],
  ['TLS 검증을 끈 curl입니다', '-k / --insecure는 아무 인증서나 받아들여 중간자 공격을 허용합니다.', '-k를 지우고 사설 CA라면 --cacert를 넘기세요.'],
  'curl -sk https://repo.example.com/key.gpg', 'curl -s https://repo.example.com/key.gpg');
R('wget-insecure', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /\bwget\b[^|;&]*--no-check-certificate\b/,
  ['wget with certificate check off', '--no-check-certificate accepts any certificate.', 'Remove the flag and use --ca-certificate if needed.'],
  ['인증서 검사를 끈 wget입니다', '--no-check-certificate는 아무 인증서나 받아들입니다.', '플래그를 지우고 필요하면 --ca-certificate를 쓰세요.'],
  'wget --no-check-certificate https://example.com/a.tgz', 'wget https://example.com/a.tgz');
R('http-download', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /\b(?:curl|wget)\b[^|;&]*\bhttp:\/\/(?!localhost|127\.0\.0\.1)/,
  ['Download over plain HTTP', 'Files fetched over HTTP can be replaced on the network.', 'Use https and verify a checksum or signature.'],
  ['평문 HTTP로 내려받습니다', 'HTTP로 받은 파일은 네트워크에서 바꿔치기될 수 있습니다.', 'https를 쓰고 체크섬이나 서명을 확인하세요.'],
  'curl -o tool.tgz http://downloads.example.com/tool.tgz', 'curl -o tool.tgz https://downloads.example.com/tool.tgz');
R('tmp-predictable', 'H', 'MA', 10, ['cwe-377', 'owasp-a01'],
  /(?:^|[\s>=:"'])\/tmp\/[\w.-]+/,
  ['Fixed name in /tmp', 'Another user can create or symlink the file first.', 'Use mktemp: tmp=$(mktemp).'],
  ['/tmp의 고정 이름입니다', '다른 사용자가 먼저 파일을 만들거나 심볼릭 링크를 걸 수 있습니다.', 'mktemp를 쓰세요: tmp=$(mktemp).'],
  'echo "$data" > /tmp/build.log', 'tmp=$(mktemp) && echo "$data" > "$tmp"',
  { skip: (raw) => /\bmktemp\b/.test(raw) });
R('mktemp-dry-run', 'V', 'MA', 10, ['cwe-377', 'owasp-a01'],
  /\bmktemp\s+(?:-[A-Za-z]*\s+)*-[A-Za-z]*u/,
  ['mktemp -u', '-u only prints a name without creating the file, which reopens the race.', 'Let mktemp create the file.'],
  ['mktemp -u를 씁니다', '-u는 파일을 만들지 않고 이름만 출력해 경쟁 조건이 다시 생깁니다.', 'mktemp가 파일을 만들게 하세요.'],
  'f=$(mktemp -u)', 'f=$(mktemp)');
R('xtrace-enabled', 'H', 'MI', 5, ['cwe-532'],
  /^\s*set\s+-[A-Za-wyz]*x|^\s*set\s+-o\s+xtrace\b|^#!.*\s-[A-Za-z]*x\b/,
  ['Command tracing enabled', 'set -x prints every command with expanded secrets to the log.', 'Remove set -x, or turn it off around secrets.'],
  ['명령 추적을 켭니다', 'set -x는 펼쳐진 시크릿과 함께 모든 명령을 로그에 찍습니다.', 'set -x를 지우거나 시크릿 주변에서 끄세요.'],
  'set -euxo pipefail', 'set -euo pipefail');
R('password-argument', 'V', 'CR', 20, ['cwe-214', 'secrets'],
  /\bmysql(?:dump|admin)?\b[^|;&]*\s-p[^\s-][^\s]*|\bsshpass\s+-p\s*\S+|\b(?:psql|mongo|mongosh)\b[^|;&]*--password[= ]\S+/,
  ['Password passed on the command line', 'Command-line arguments are visible to every user through ps and in shell history.', 'Use an option file, an environment variable or a prompt.'],
  ['명령줄로 비밀번호를 넘깁니다', '명령줄 인자는 ps와 셸 기록으로 모든 사용자에게 보입니다.', '옵션 파일, 환경 변수, 프롬프트를 쓰세요.'],
  'mysql -u root -psecret app < dump.sql', 'mysql --defaults-extra-file="$cnf" app < dump.sql');
R('cleartext-tools', 'H', 'MA', 10, ['cwe-319', 'owasp-a02'],
  new RegExp(String.raw`${CMD_START}(?:telnet|ftp|rsh|rlogin|rcp|tftp)\s+\S`),
  ['Clear-text remote tool', 'telnet, ftp, rsh and rcp send credentials unencrypted.', 'Use ssh, scp or sftp.'],
  ['평문 원격 도구입니다', 'telnet, ftp, rsh, rcp는 자격 증명을 암호화하지 않고 보냅니다.', 'ssh, scp, sftp를 쓰세요.'],
  'ftp -n files.example.com <<EOF', 'sftp files.example.com <<EOF');
R('ssh-host-key-off', 'V', 'CR', 15, ['cwe-295', 'owasp-a07'],
  /StrictHostKeyChecking[=\s]+no\b|UserKnownHostsFile[=\s]+\/dev\/null/,
  ['SSH host key checking disabled', 'Any server can impersonate the host and capture credentials.', 'Add the host key to known_hosts instead.'],
  ['SSH 호스트 키 검사를 끕니다', '아무 서버나 호스트를 사칭해 자격 증명을 가로챌 수 있습니다.', '대신 호스트 키를 known_hosts에 추가하세요.'],
  'ssh -o StrictHostKeyChecking=no deploy@host', 'ssh -o StrictHostKeyChecking=yes deploy@host');
R('rm-root-risk', 'B', 'BL', 15, ['cwe-73'],
  /\brm\s+-[A-Za-z]*r[A-Za-z]*\s+(?:-[A-Za-z]+\s+)*(?:\/\s*$|\/\*|~\/?\s*$|"\$\{?\w+\}?"\/(?:\*|\s|$)|\$\{?\w+\}?\/(?:\*|\s|$))/,
  ['rm -r on a path that can become /', 'If the variable is empty, "$DIR"/ becomes / and the command deletes the system.', 'Use "${DIR:?}"/ so an empty value aborts.'],
  ['/가 될 수 있는 경로에 rm -r을 씁니다', '변수가 비면 "$DIR"/가 /가 되어 시스템을 지웁니다.', '빈 값이면 멈추도록 "${DIR:?}"/를 쓰세요.'],
  'rm -rf "$BUILD_DIR"/*', 'rm -rf "${BUILD_DIR:?}"/*');
R('read-without-r', 'S', 'MI', 2, ['pitfall'],
  /(?:^|[;&|]\s*|\bwhile\s+(?:IFS=\S*\s+)?)read\s+(?:-[a-qs-zA-Z]+\s+)*[A-Za-z_]\w*\s*(?:$|[;<|&)])/,
  ['read without -r', 'Without -r, backslashes in the input are treated as escapes and lost.', 'Use read -r.'],
  ['-r 없는 read입니다', '-r이 없으면 입력의 백슬래시를 이스케이프로 보고 잃습니다.', 'read -r을 쓰세요.'],
  'while read line; do', 'while IFS= read -r line; do');
R('backticks', 'S', 'MI', 2, ['convention'],
  /`[^`]+`/,
  ['Backtick command substitution', 'Backticks nest badly and are hard to read.', 'Use $(...).'],
  ['백틱 명령 치환입니다', '백틱은 중첩이 어렵고 읽기 힘듭니다.', '$(...)를 쓰세요.'],
  'now=`date +%s`', 'now=$(date +%s)');
R('useless-cat', 'S', 'IN', 1, ['performance'],
  /\bcat\s+[^|;&<>\s-][^|;&<>\s]*\s*\|\s*(?:grep|awk|sed|head|tail|wc|sort|cut|tr)\b/,
  ['Useless use of cat', 'cat file | grep starts an extra process for nothing.', 'Pass the file to the command: grep x file.'],
  ['쓸모없는 cat입니다', 'cat file | grep은 쓸데없이 프로세스를 하나 더 띄웁니다.', '파일을 명령에 넘기세요: grep x file.'],
  'cat access.log | grep 500', 'grep 500 access.log');
R('parse-ls', 'B', 'MA', 5, ['pitfall'],
  /\bfor\s+\w+\s+in\s+(?:\$\(\s*ls\b|`\s*ls\b)|\bls\b[^|;&]*\|\s*(?:while\b|xargs\b)/,
  ['Parsing the output of ls', 'File names with spaces or new lines break the loop.', 'Use a glob: for f in ./*; do.'],
  ['ls 출력을 파싱합니다', '공백이나 줄바꿈이 든 파일 이름이 반복을 깨뜨립니다.', 'glob을 쓰세요: for f in ./*; do.'],
  'for f in $(ls *.txt); do', 'for f in ./*.txt; do');
R('dollar-star', 'B', 'MI', 2, ['pitfall'],
  /"\$\*"|(?<!["\w])\$\*(?!["\w])/,
  ['$* instead of "$@"', '$* joins the arguments and loses the original word boundaries.', 'Use "$@".'],
  ['"$@" 대신 $*를 씁니다', '$*는 인자를 합쳐 원래 단어 경계를 잃습니다.', '"$@"를 쓰세요.'],
  ['exec node app.js $*', 'exec node app.js "$*"'], ['exec node app.js "$@"', 'say() { printf \'==> %s\\n\' "$*"; }', 'echo "$*" >&2'],
  // "$*" as one joined string for printf / echo is what it is for.
  { skip: (raw, line) => !/(?<!["\w])\$\*(?!["\w])/.test(line) && /(?:^|[;{(&|]\s*)(?:echo|printf)\b/.test(line) });
R('eq-in-single-bracket', 'B', 'MI', 2, ['portability'],
  /(?<!\[)\[\s+[^\]]*\s==\s[^\]]*\s\](?!\])/,
  ['== inside [ ]', 'POSIX test uses =; == fails in dash and other sh implementations.', 'Use = in [ ], or [[ ]] in bash.'],
  ['[ ] 안에서 ==를 씁니다', 'POSIX test는 =를 쓰며 ==는 dash 등 sh 구현에서 실패합니다.', '[ ] 에서는 =를 쓰거나 bash에서는 [[ ]]를 쓰세요.'],
  'if [ "$a" == "$b" ]; then', 'if [ "$a" = "$b" ]; then');
R('function-keyword', 'S', 'IN', 1, ['portability'],
  /^\s*function\s+\w+\s*\(\s*\)/,
  ['function keyword with ()', 'function name() mixes bash and POSIX syntax.', 'Write name() { ... }.'],
  ['() 가 붙은 function 키워드입니다', 'function name()은 bash와 POSIX 문법을 섞습니다.', 'name() { ... } 로 쓰세요.'],
  'function build() {', 'build() {');
R('hardcoded-secret-export', 'V', 'CR', 20, ['cwe-798', 'secrets'],
  /^\s*(?:export\s+)?\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY)\w*=(?!["']?\$)["']?[^\s"'$]{6,}/i,
  ['Secret value set in the script', 'The secret is stored in the script and in every copy of it.', 'Read it from a secret store or the caller\'s environment.'],
  ['스크립트에 시크릿 값을 둡니다', '시크릿이 스크립트와 그 모든 사본에 저장됩니다.', '시크릿 저장소나 호출자 환경에서 읽으세요.'],
  'export DB_PASSWORD=Sup3rS3cret', 'export DB_PASSWORD="${DB_PASSWORD:?}"');
R('docker-socket', 'H', 'CR', 15, ['cwe-250'],
  /\/var\/run\/docker\.sock\b/,
  ['Docker socket used', 'Access to the Docker socket is root access to the host.', 'Avoid mounting or exposing the socket; use rootless tooling.'],
  ['Docker 소켓을 씁니다', 'Docker 소켓 접근은 호스트의 root 접근입니다.', '소켓을 마운트하거나 노출하지 말고 rootless 도구를 쓰세요.'],
  'docker run -v /var/run/docker.sock:/var/run/docker.sock tool', 'docker run tool');
R('netcat-exec', 'H', 'CR', 20, ['cwe-78'],
  /\b(?:nc|ncat|netcat)\b[^|;&]*\s-[A-Za-z]*[ec]\s/,
  ['netcat with -e / -c', 'nc -e attaches a shell to a network socket (a bind or reverse shell).', 'Remove it; use ssh for remote access.'],
  ['-e / -c가 붙은 netcat입니다', 'nc -e는 네트워크 소켓에 셸을 붙입니다(바인드 / 리버스 셸).', '지우고 원격 접속에는 ssh를 쓰세요.'],
  'nc -l -p 4444 -e /bin/sh', 'nc -z host 443');
R('sudo-tee-redirect', 'B', 'MI', 5, ['pitfall'],
  /\bsudo\s+(?:echo|printf|cat)\b[^|]*\s>>?\s*\/(?:etc|usr|var|opt)\//,
  ['Redirect after sudo runs as the user', 'In sudo echo x > /etc/file the redirect is done by your shell, not by root.', 'Use echo x | sudo tee /etc/file.'],
  ['sudo 뒤의 리다이렉트는 사용자 권한입니다', 'sudo echo x > /etc/file에서 리다이렉트는 root가 아니라 내 셸이 합니다.', 'echo x | sudo tee /etc/file을 쓰세요.'],
  'sudo echo "vm.swappiness=10" >> /etc/sysctl.conf', 'echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf');

// True when the line has a $var / ${...} expansion that the shell splits
// into words and globs: outside "..." and '...', not in [[ ]], (( )) or
// $(( )), not the value of an assignment (a=$b, local a=$b, export a=$b),
// not the word of case $x in, not the list of for x in $list (splitting is
// the point there). "$(cmd "$x")" opens a new quoting level. A line that
// starts with markup (<key>$v</key>) is here-document text.
function unquotedExpansion(line) {
  const s = String(line);
  if (/^\s*<[A-Za-z/!?]/.test(s)) return false;
  const stack = [{ k: 'N' }];
  let wordStart = 0;
  const skipBrace = (i) => { const e = s.indexOf('}', i); return e < 0 ? s.length : e; };
  for (let i = 0; i < s.length; i++) {
    const top = stack[stack.length - 1];
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (top.k === 'D') {
      if (c === '"') stack.pop();
      else if (c === '$' && s[i + 1] === '(' && s[i + 2] === '(') { stack.push({ k: 'A', depth: 0 }); i += 2; }
      else if (c === '$' && s[i + 1] === '(') { stack.push({ k: 'N', close: true }); i += 1; wordStart = i + 1; }
      else if (c === '$' && s[i + 1] === '{') i = skipBrace(i);
      else if (c === '`') { const e = s.indexOf('`', i + 1); i = e < 0 ? s.length : e; }
      continue;
    }
    if (c === "'") { const e = s.indexOf("'", i + 1); i = e < 0 ? s.length : e; continue; }
    if (c === '"') { stack.push({ k: 'D' }); continue; }
    if (top.k === 'A') {
      if (c === '(') top.depth++;
      else if (c === ')') { if (top.depth > 0) top.depth--; else { stack.pop(); i++; } }
      continue;
    }
    if (c === '$' && s[i + 1] === '(' && s[i + 2] === '(') { stack.push({ k: 'A', depth: 0 }); i += 2; continue; }
    if (c === '$' && s[i + 1] === '(') { stack.push({ k: 'N', close: true }); i += 1; wordStart = i + 1; continue; }
    if (c === ')' && top.close) { stack.pop(); continue; }
    if (c === '(' && s[i + 1] === '(' && /(?:^|[;&|(]\s*|\b(?:then|do|else|if|while|until)\s+)$/.test(s.slice(0, i))) { stack.push({ k: 'A', depth: 0 }); i += 1; continue; }
    if (c === '[' && s[i + 1] === '[' && /(?:^|\s)$/.test(s.slice(0, i))) { stack.push({ k: 'B' }); i += 1; continue; }
    if (top.k === 'B' && c === ']' && s[i + 1] === ']') { stack.pop(); i += 1; continue; }
    if (/[\s;&|(<>]/.test(c)) { wordStart = i + 1; continue; }
    if (c !== '$' || top.k === 'B') continue;
    if (!/[A-Za-z_{]/.test(s[i + 1] || '')) continue;
    const word = s.slice(wordStart, i);
    if (/^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/.test(word)) { if (s[i + 1] === '{') i = skipBrace(i); continue; }
    const before = s.slice(0, wordStart);
    if (/\bcase\s+$/.test(before) || /\bfor\s+\w+\s+in\s+(?:\S+\s+)*$/.test(before)) continue;
    return true;
  }
  return false;
}

// set -e (errexit) is on before line index: a failing cd stops the script.
// lines may be the skip() context { index, lines } instead.
function errexitBefore(lines, index) {
  if (lines && !Array.isArray(lines) && typeof lines === 'object') ({ lines, index } = lines);
  if (!Array.isArray(lines) || !Number.isInteger(index)) return false;
  for (let i = 0; i < index && i < lines.length; i++) {
    const l = String(lines[i]);
    if (/^\s*set\s+(?:-[A-Za-z]*e[A-Za-z]*|-o\s+errexit)\b/.test(l) || (i === 0 && /^#!.*\s-[A-Za-z]*e[A-Za-z]*\s*$/.test(l))) return true;
  }
  return false;
}

module.exports = { RULES: R.rules, unquotedExpansion, errexitBefore };
