'use strict';

// Infrastructure-as-code checks that depend on what a file IS, not only on
// one line: CloudFormation, Kubernetes manifests, Ansible playbooks, ARM
// templates and Bicep. A YAML / JSON file is classified by its content
// (core/rules-extra line rules cannot see the whole file), then format rules
// run as line patterns or as block checks (resource, container, task).
// Contract: core/ENGINE_CONTRACT.md.

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

const RULES = [];

// R(id, formats, type, sev, debt, tags, en[name, why, fix], ko[...], { re, check, ref })
//   re:    tested on every code line of a document of that format
//   check: (doc) => [{ line (0-based in doc), en?, ko? }]
function R(id, formats, type, sev, debtMin, tags, en, ko, impl) {
  const allTags = ['iac', ...tags].map((t) => String(t).toLowerCase());
  const cwe = [];
  const owasp = [];
  for (const t of allTags) {
    let m = /^cwe-(\d+)$/.exec(t);
    if (m) cwe.push(`CWE-${m[1]}`);
    m = /^owasp-(a\d\d)$/.exec(t);
    if (m) owasp.push(m[1].toUpperCase());
  }
  const standards = {};
  if (cwe.length) standards.cwe = cwe;
  if (owasp.length) standards.owasp2021 = owasp;
  const langs = new Set();
  for (const f of formats) for (const l of FORMAT_LANGS[f]) langs.add(l);
  RULES.push({
    key: `iac:${id}`,
    formats,
    langs: [...langs],
    type: TYPES[type],
    severity: SEVS[sev],
    debtMin,
    tags: allTags,
    name: { en: en[0], ko: ko[0] },
    why: { en: en[1], ko: ko[1] },
    fix: { en: en[2], ko: ko[2] },
    cwe: cwe[0] || '',
    standards,
    ...(impl.ref ? { ref: impl.ref } : {}),
    re: impl.re || null,
    check: impl.check || null,
  });
}

const FORMAT_LANGS = {
  cfn: ['yaml', 'json'],
  k8s: ['yaml'],
  ansible: ['yaml'],
  arm: ['json'],
  bicep: ['bicep'],
};

// ── Text helpers ─────────────────────────────────────────────
function stripYamlComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function stripSlashComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q && line[i - 1] !== '\\') q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

const indentOf = (l) => /^\s*/.exec(l)[0].length;
const blank = (l) => !l || !l.trim();

// YAML: the block owned by the nearest line above idx with smaller indent.
function yamlParent(lines, idx) {
  const ind = indentOf(lines[idx]);
  let start = idx;
  for (let j = idx - 1; j >= 0; j--) {
    if (blank(lines[j])) continue;
    if (indentOf(lines[j]) < ind) { start = j; break; }
  }
  return [start, yamlEnd(lines, start)];
}

function yamlEnd(lines, start) {
  const base = indentOf(lines[start]);
  let end = start + 1;
  for (; end < lines.length; end++) {
    if (blank(lines[end])) continue;
    const ind = indentOf(lines[end]);
    if (ind < base) break;
    if (ind === base && (/^\s*-\s/.test(lines[end]) || !/^\s*-\s/.test(lines[start]))) break;
  }
  return end;
}

// YAML: the list item ("- ...") that contains idx, or null.
function yamlItem(lines, idx) {
  const ind = indentOf(lines[idx]);
  for (let j = idx; j >= 0; j--) {
    if (blank(lines[j])) continue;
    const jind = indentOf(lines[j]);
    if (/^\s*-(?:\s|$)/.test(lines[j]) && (j === idx || jind < ind)) return [j, yamlEnd(lines, j)];
    if (j !== idx && jind < ind && !/^\s*-(?:\s|$)/.test(lines[j])) {
      // A mapping key above us at a smaller indent: keep looking only if the
      // item marker can still be further up at an even smaller indent.
      continue;
    }
  }
  return null;
}

// JSON: the lines of the object that encloses position (idx, col). Brackets
// inside strings are not expected in the keys and values we look at.
function jsonEnclosing(lines, idx, col = 0) {
  let depth = 0;
  let sl = -1;
  let sc = -1;
  outer: for (let j = idx; j >= 0; j--) {
    const s = lines[j];
    for (let k = (j === idx ? col : s.length) - 1; k >= 0; k--) {
      const c = s[k];
      if (c === '}' || c === ']') depth++;
      else if (c === '{' || c === '[') {
        if (depth > 0) { depth--; continue; }
        if (c === '{') { sl = j; sc = k; break outer; }
        // An enclosing array: keep looking for the object around it.
      }
    }
  }
  if (sl < 0) return [0, lines.length];
  let d = 0;
  for (let j = sl; j < lines.length; j++) {
    const s = lines[j];
    for (let k = j === sl ? sc : 0; k < s.length; k++) {
      if (s[k] === '{') d++;
      else if (s[k] === '}') { d--; if (d === 0) return [sl, j + 1]; }
    }
  }
  return [sl, lines.length];
}

function blockOf(doc, idx, col = 0) {
  return doc.json ? jsonEnclosing(doc.lines, idx, col) : yamlParent(doc.lines, idx);
}

function itemOf(doc, idx, col = 0) {
  if (doc.json) return jsonEnclosing(doc.lines, idx, col);
  return yamlItem(doc.lines, idx) || yamlParent(doc.lines, idx);
}

const slice = (doc, [a, b]) => doc.lines.slice(a, b).join('\n');
const kv = (key, value) => new RegExp(`["']?\\b(?:${key})["']?\\s*:\\s*["']?(?:${value})["']?(?=[\\s,}\\]]|$)`, 'i');

// ── Format detection ─────────────────────────────────────────
function formatsOf(text, lang, path) {
  const out = new Set();
  if (lang === 'bicep') { out.add('bicep'); return out; }
  if (lang !== 'yaml' && lang !== 'json') return out;
  if (/AWSTemplateFormatVersion/.test(text)
    || (/(?:^|[{,])\s*["']?Resources["']?\s*:/m.test(text) && /["']?Type["']?\s*:\s*["']?AWS::/.test(text))) out.add('cfn');
  if (lang === 'json' && /"\$schema"\s*:\s*"[^"]*deploymentTemplate\.json/i.test(text)) out.add('arm');
  if (lang === 'yaml') {
    if (!out.has('cfn') && /^apiVersion\s*:/m.test(text) && /^kind\s*:/m.test(text)) out.add('k8s');
    const play = /^\s*-?\s*hosts\s*:/m.test(text) && /^\s*-?\s*(?:tasks|pre_tasks|post_tasks|handlers|roles)\s*:/m.test(text);
    const roleFile = /(?:^|\/)roles\/[^/]+\/(?:tasks|handlers)\/[^/]+\.ya?ml$/i.test(String(path || ''));
    if (play || roleFile) out.add('ansible');
  }
  return out;
}

// A file becomes one or more documents (YAML "---" separators).
function documentsOf(text, lang) {
  const raw = String(text).split(/\r?\n/);
  const json = lang === 'json';
  const strip = lang === 'bicep' ? stripSlashComment : json ? (l) => l : stripYamlComment;
  const code = raw.map(strip);
  if (lang !== 'yaml') return [{ offset: 0, lines: code, raw, json, text: String(text) }];
  const docs = [];
  let start = 0;
  for (let i = 0; i <= code.length; i++) {
    if (i === code.length || /^---\s*$/.test(code[i]) || /^\.\.\.\s*$/.test(code[i])) {
      if (i > start) {
        docs.push({ offset: start, lines: code.slice(start, i), raw: raw.slice(start, i), json, text: raw.slice(start, i).join('\n') });
      }
      start = i + 1;
    }
  }
  return docs;
}

// ── CloudFormation ───────────────────────────────────────────
function cfnResources(doc) {
  const out = [];
  doc.lines.forEach((l, i) => {
    const m = /["']?\bType["']?\s*:\s*["']?(AWS::[\w:]+)/.exec(l);
    if (!m) return;
    const block = blockOf(doc, i, m.index);
    out.push({ type: m[1], line: i, block, body: slice(doc, block) });
  });
  return out;
}

const OPEN_V4 = kv('CidrIp', '0\\.0\\.0\\.0/0');
const OPEN_V6 = kv('CidrIpv6', '::/0');

function numberNear(text, key) {
  const m = new RegExp(`["']?${key}["']?\\s*:\\s*["']?(-?\\d+)`, 'i').exec(text);
  return m ? Number(m[1]) : null;
}

R('cfn-s3-public-acl', ['cfn'], 'V', 'BL', 10, ['aws', 's3', 'cwe-284', 'owasp-a01'],
  ['S3 bucket with a public canned ACL', 'PublicRead / PublicReadWrite / AuthenticatedRead let anyone list or change objects.', 'Use AccessControl: Private and a PublicAccessBlockConfiguration.'],
  ['공개 ACL을 쓰는 S3 버킷입니다', 'PublicRead / PublicReadWrite / AuthenticatedRead는 누구나 객체를 나열하거나 바꾸게 합니다.', 'AccessControl: Private와 PublicAccessBlockConfiguration을 쓰세요.'],
  { re: kv('AccessControl', 'PublicRead|PublicReadWrite|AuthenticatedRead'), ref: 'S6265' });
R('cfn-s3-public-access-block-off', ['cfn'], 'V', 'CR', 10, ['aws', 's3', 'cwe-284', 'owasp-a01'],
  ['S3 public access block turned off', 'Disabling a public access block setting allows public ACLs or policies.', 'Set BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls and RestrictPublicBuckets to true.'],
  ['S3 공개 접근 차단을 끕니다', '공개 접근 차단 설정을 끄면 공개 ACL이나 정책이 허용됩니다.', 'BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, RestrictPublicBuckets를 true로 두세요.'],
  { re: kv('BlockPublicAcls|BlockPublicPolicy|IgnorePublicAcls|RestrictPublicBuckets', 'false'), ref: 'S6281' });
R('cfn-s3-no-encryption', ['cfn'], 'V', 'MA', 10, ['aws', 's3', 'cwe-311'],
  ['S3 bucket without explicit encryption', 'Without BucketEncryption the bucket relies on account defaults and does not use your KMS key.', 'Add BucketEncryption with SSE-KMS (or at least AES256).'],
  ['명시적 암호화 없는 S3 버킷입니다', 'BucketEncryption이 없으면 계정 기본값에 기대고 사용자 KMS 키를 쓰지 않습니다.', 'SSE-KMS(최소한 AES256)로 BucketEncryption을 넣으세요.'],
  { check: (doc) => cfnResources(doc).filter((r) => r.type === 'AWS::S3::Bucket' && !/BucketEncryption/.test(r.body)).map((r) => ({ line: r.line })), ref: 'S6245' });
R('cfn-s3-no-public-access-block', ['cfn'], 'H', 'MI', 5, ['aws', 's3', 'cwe-284'],
  ['S3 bucket without a public access block', 'Nothing stops a later ACL or policy change from making the bucket public.', 'Add PublicAccessBlockConfiguration with all four settings true.'],
  ['공개 접근 차단 없는 S3 버킷입니다', '나중에 ACL이나 정책을 바꿔 버킷을 공개해도 막을 것이 없습니다.', '네 설정이 모두 true인 PublicAccessBlockConfiguration을 넣으세요.'],
  { check: (doc) => cfnResources(doc).filter((r) => r.type === 'AWS::S3::Bucket' && !/PublicAccessBlockConfiguration/.test(r.body)).map((r) => ({ line: r.line })) });
R('cfn-sg-open-admin-port', ['cfn'], 'V', 'CR', 15, ['aws', 'network', 'cwe-284', 'owasp-a01'],
  ['Security group opens SSH / RDP or all ports to the internet', '0.0.0.0/0 on port 22, 3389 or every port invites brute-force and exploit attempts.', 'Restrict CidrIp to known ranges or use SSM Session Manager / a bastion.'],
  ['보안 그룹이 SSH / RDP 또는 모든 포트를 인터넷에 엽니다', '22, 3389 또는 모든 포트를 0.0.0.0/0에 열면 무차별 대입과 공격 시도를 부릅니다.', 'CidrIp를 알려진 범위로 제한하거나 SSM Session Manager / 배스천을 쓰세요.'],
  {
    check: (doc) => {
      const out = [];
      doc.lines.forEach((l, i) => {
        const m = OPEN_V4.exec(l) || OPEN_V6.exec(l);
        if (!m) return;
        const item = slice(doc, itemOf(doc, i, m.index));
        if (/["']?IpProtocol["']?\s*:\s*["']?-1\b/.test(item)) { out.push({ line: i }); return; }
        const from = numberNear(item, 'FromPort');
        const to = numberNear(item, 'ToPort');
        if (from == null) return;
        const hi = to == null ? from : to;
        if ([22, 3389].some((p) => from <= p && p <= hi) || (from <= 0 && hi >= 65535)) out.push({ line: i });
      });
      return out;
    },
    ref: 'S6321',
  });
R('cfn-rds-public', ['cfn'], 'V', 'CR', 10, ['aws', 'rds', 'cwe-284'],
  ['RDS instance publicly accessible', 'The database gets a public endpoint reachable from the internet.', 'Set PubliclyAccessible: false and keep it in private subnets.'],
  ['RDS 인스턴스를 공개 접근 가능하게 둡니다', '데이터베이스가 인터넷에서 닿는 공개 엔드포인트를 얻습니다.', 'PubliclyAccessible: false로 두고 프라이빗 서브넷에 두세요.'],
  { re: kv('PubliclyAccessible', 'true') });
R('cfn-rds-unencrypted', ['cfn'], 'V', 'MA', 10, ['aws', 'rds', 'cwe-311'],
  ['RDS storage not encrypted', 'Database files, snapshots and backups are stored unencrypted.', 'Set StorageEncrypted: true (and KmsKeyId).'],
  ['RDS 저장소를 암호화하지 않습니다', '데이터베이스 파일, 스냅숏, 백업이 암호화 없이 저장됩니다.', 'StorageEncrypted: true(와 KmsKeyId)를 설정하세요.'],
  {
    check: (doc) => cfnResources(doc)
      .filter((r) => (r.type === 'AWS::RDS::DBInstance' && !/DBClusterIdentifier/.test(r.body)) || r.type === 'AWS::RDS::DBCluster')
      .filter((r) => !kv('StorageEncrypted', 'true').test(r.body))
      .map((r) => ({ line: r.line })),
    ref: 'S6303',
  });
R('cfn-ebs-unencrypted', ['cfn'], 'V', 'MA', 5, ['aws', 'ebs', 'cwe-311'],
  ['EBS volume encryption disabled', 'Data on the volume and its snapshots is stored unencrypted.', 'Set Encrypted: true.'],
  ['EBS 볼륨 암호화를 끕니다', '볼륨과 스냅숏의 데이터가 암호화 없이 저장됩니다.', 'Encrypted: true로 두세요.'],
  { re: kv('Encrypted', 'false'), ref: 'S6275' });
R('cfn-iam-wildcard-action', ['cfn'], 'V', 'CR', 15, ['aws', 'iam', 'cwe-269', 'owasp-a01'],
  ['IAM policy allows every action', 'Action "*" grants full control over the account resources it covers.', 'List only the actions the principal needs.'],
  ['IAM 정책이 모든 작업을 허용합니다', 'Action "*"는 해당 리소스에 대한 모든 권한을 줍니다.', '주체에게 필요한 작업만 나열하세요.'],
  {
    // A Deny statement with Action "*" restricts; only an Allow grants everything.
    check: (doc) => {
      const out = [];
      doc.lines.forEach((l, i) => {
        const m = /["']?\bAction["']?\s*:\s*(?:\[\s*)?["']\*["']/.exec(l);
        if (!m) return;
        if (kv('Effect', 'Deny').test(slice(doc, itemOf(doc, i, m.index)))) return;
        out.push({ line: i });
      });
      return out;
    },
    ref: 'S6302',
  });
R('cfn-hardcoded-secret', ['cfn'], 'V', 'BL', 30, ['aws', 'cwe-798', 'owasp-a07', 'secrets'],
  ['Hard-coded password in the template', 'The secret is stored in source control and visible in the stack configuration.', 'Use {{resolve:secretsmanager:...}}, a NoEcho parameter or ManageMasterUserPassword.'],
  ['템플릿에 비밀번호를 적었습니다', '비밀이 소스 관리에 남고 스택 구성에서 보입니다.', '{{resolve:secretsmanager:...}}, NoEcho 매개변수 또는 ManageMasterUserPassword를 쓰세요.'],
  { re: /(?:^|[\s{,])["']?(?:MasterUserPassword|DBPassword|Password|SecretString|AuthToken)["']?\s*:\s*(?!!|\{|["']\{\{resolve|["']?\$\{)["']?[^\s"'{}!][^"']{3,}/, ref: 'S6418' });
R('cfn-cloudtrail-log-validation-off', ['cfn'], 'V', 'MA', 5, ['aws', 'logging', 'cwe-354'],
  ['CloudTrail log file validation disabled', 'Tampering with trail log files cannot be detected.', 'Set EnableLogFileValidation: true.'],
  ['CloudTrail 로그 파일 검증을 끕니다', '추적 로그 파일 변조를 알아챌 수 없습니다.', 'EnableLogFileValidation: true로 두세요.'],
  { re: kv('EnableLogFileValidation', 'false') });
R('cfn-http-listener', ['cfn'], 'H', 'MI', 10, ['aws', 'tls', 'cwe-319'],
  ['Load balancer listener on plain HTTP', 'Traffic between clients and the load balancer is not encrypted.', 'Use HTTPS / TLS listeners and redirect HTTP to HTTPS.'],
  ['로드 밸런서 리스너가 평문 HTTP입니다', '클라이언트와 로드 밸런서 사이 트래픽이 암호화되지 않습니다.', 'HTTPS / TLS 리스너를 쓰고 HTTP는 HTTPS로 리디렉트하세요.'],
  {
    check: (doc) => cfnResources(doc)
      .filter((r) => r.type === 'AWS::ElasticLoadBalancingV2::Listener' && kv('Protocol', 'HTTP').test(r.body) && !/redirect/i.test(r.body))
      .map((r) => ({ line: r.line })),
    ref: 'S5332',
  });

// ── Kubernetes ───────────────────────────────────────────────
const WORKLOADS = /^kind\s*:\s*["']?(Pod|Deployment|StatefulSet|DaemonSet|ReplicaSet|Job|CronJob|ReplicationController)\b/m;

function kindLine(doc) {
  return Math.max(0, doc.lines.findIndex((l) => /^kind\s*:/.test(l)));
}

// List items under containers: / initContainers:.
function containers(doc) {
  const out = [];
  const L = doc.lines;
  for (let i = 0; i < L.length; i++) {
    const m = /^(\s*)(?:-\s+)?(?:containers|initContainers|ephemeralContainers)\s*:\s*$/.exec(L[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < L.length && blank(L[j])) j++;
    if (j >= L.length || !/^\s*-\s/.test(L[j])) continue;
    const itemIndent = indentOf(L[j]);
    while (j < L.length) {
      if (blank(L[j])) { j++; continue; }
      const ind = indentOf(L[j]);
      if (ind < itemIndent || (ind === itemIndent && !/^\s*-\s/.test(L[j]))) break;
      if (ind === itemIndent) {
        const end = yamlEnd(L, j);
        out.push({ line: j, body: L.slice(j, end).join('\n') });
        j = end;
      } else j++;
    }
  }
  return out;
}

const k8sWorkload = (fn) => (doc) => (WORKLOADS.test(doc.lines.join('\n')) ? fn(doc) : []);

R('k8s-no-resource-limits', ['k8s'], 'B', 'MA', 10, ['k8s', 'resources', 'cwe-770'],
  ['Container without resource limits', 'A container with no CPU / memory limit can starve the node and its neighbours.', 'Set resources.limits (and requests) for cpu and memory.'],
  ['리소스 한도 없는 컨테이너입니다', 'CPU / 메모리 한도 없는 컨테이너는 노드와 이웃을 굶길 수 있습니다.', 'cpu와 memory에 resources.limits(와 requests)를 설정하세요.'],
  { check: k8sWorkload((doc) => containers(doc).filter((c) => !/^\s*limits\s*:/m.test(c.body)).map((c) => ({ line: c.line }))), ref: 'S6864' });
R('k8s-privilege-escalation-not-disabled', ['k8s'], 'H', 'MA', 5, ['k8s', 'cwe-250'],
  ['Container does not disable privilege escalation', 'allowPrivilegeEscalation defaults to true, so setuid binaries can gain root.', 'Set securityContext.allowPrivilegeEscalation: false.'],
  ['컨테이너가 권한 상승을 막지 않습니다', 'allowPrivilegeEscalation은 기본이 true라 setuid 바이너리가 root를 얻을 수 있습니다.', 'securityContext.allowPrivilegeEscalation: false로 두세요.'],
  { check: k8sWorkload((doc) => containers(doc).filter((c) => !/allowPrivilegeEscalation\s*:\s*false\b/.test(c.body)).map((c) => ({ line: c.line }))) });
R('k8s-run-as-non-root-missing', ['k8s'], 'H', 'MI', 5, ['k8s', 'cwe-250'],
  ['Workload may run as root', 'No runAsNonRoot: true (or non-zero runAsUser) is set, so the image user decides, often root.', 'Set securityContext.runAsNonRoot: true and runAsUser.'],
  ['워크로드가 root로 실행될 수 있습니다', 'runAsNonRoot: true(또는 0이 아닌 runAsUser)가 없어 이미지 사용자가 정하며 흔히 root입니다.', 'securityContext.runAsNonRoot: true와 runAsUser를 설정하세요.'],
  {
    check: k8sWorkload((doc) => {
      const t = doc.lines.join('\n');
      if (/runAsNonRoot\s*:\s*true\b/.test(t) || /runAsUser\s*:\s*[1-9]/.test(t)) return [];
      return [{ line: kindLine(doc) }];
    }),
  });
R('k8s-automount-token', ['k8s'], 'H', 'MI', 5, ['k8s', 'cwe-522'],
  ['Service account token mounted automatically', 'Every pod gets an API token by default; a compromised container can call the API.', 'Set automountServiceAccountToken: false unless the pod talks to the API.'],
  ['서비스 계정 토큰이 자동으로 마운트됩니다', '모든 Pod가 기본으로 API 토큰을 받아 침해된 컨테이너가 API를 부를 수 있습니다.', 'Pod가 API를 쓰지 않으면 automountServiceAccountToken: false로 두세요.'],
  {
    check: k8sWorkload((doc) => (/automountServiceAccountToken\s*:\s*false\b/.test(doc.lines.join('\n')) ? [] : [{ line: kindLine(doc) }])),
    ref: 'S6865',
  });
R('k8s-secret-in-env', ['k8s'], 'V', 'BL', 30, ['k8s', 'cwe-798', 'secrets'],
  ['Secret value written into an env variable', 'The secret is stored in the manifest and visible to anyone who can read the workload.', 'Use valueFrom.secretKeyRef.'],
  ['비밀 값을 환경 변수에 적었습니다', '비밀이 매니페스트에 저장되고 워크로드를 읽을 수 있는 누구에게나 보입니다.', 'valueFrom.secretKeyRef를 쓰세요.'],
  {
    check: (doc) => {
      const out = [];
      const L = doc.lines;
      for (let i = 0; i < L.length; i++) {
        if (!/^\s*-\s+name\s*:\s*["']?\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY)\w*["']?\s*$/i.test(L[i])) continue;
        // TOKEN_TTL, PASSWORD_FILE, SECRET_NAME ... configure a secret, they do not hold one.
        if (/(?:TTL|EXPIRY|EXPIRES|LENGTH|FILE|PATH|DIR|NAME|URL|URI|ENDPOINT|HEADER|TYPE|MODE|ENABLED|ID)["']?\s*$/i.test(L[i])) continue;
        for (let j = i + 1; j < L.length && j <= i + 3; j++) {
          if (/^\s*-\s/.test(L[j])) break;
          const m = /^\s*value\s*:\s*["']?([^"'\s]{4,})/.exec(L[j]);
          if (m && !/^\$\(|^\{\{|^(?:\d+|true|false|yes|no)$/i.test(m[1])) { out.push({ line: j }); break; }
        }
      }
      return out;
    },
  });
R('k8s-loadbalancer-open', ['k8s'], 'H', 'MA', 10, ['k8s', 'network', 'cwe-284'],
  ['LoadBalancer service open to every address', 'Without loadBalancerSourceRanges the service is reachable from the whole internet.', 'Set loadBalancerSourceRanges, or use an internal load balancer or Ingress.'],
  ['모든 주소에 열린 LoadBalancer 서비스입니다', 'loadBalancerSourceRanges가 없으면 서비스가 인터넷 전체에서 닿습니다.', 'loadBalancerSourceRanges를 설정하거나 내부 로드 밸런서나 Ingress를 쓰세요.'],
  {
    check: (doc) => {
      const t = doc.lines.join('\n');
      if (!/^kind\s*:\s*["']?Service\b/m.test(t) || /loadBalancerSourceRanges\s*:/.test(t)) return [];
      const i = doc.lines.findIndex((l) => /^\s*type\s*:\s*["']?LoadBalancer\b/.test(l));
      return i >= 0 ? [{ line: i }] : [];
    },
  });

// ── Ansible ──────────────────────────────────────────────────
R('ansible-validate-certs-off', ['ansible'], 'V', 'CR', 10, ['ansible', 'tls', 'cwe-295', 'owasp-a07'],
  ['TLS certificate validation turned off', 'validate_certs: no lets a man in the middle serve any content.', 'Keep validate_certs: yes and install the CA certificate.'],
  ['TLS 인증서 검증을 끕니다', 'validate_certs: no는 중간자가 아무 내용이나 내려주게 합니다.', 'validate_certs: yes로 두고 CA 인증서를 설치하세요.'],
  { re: /^\s*(?:-\s+)?validate_certs\s*:\s*["']?(?:no|false|n|off)["']?\s*$/i, ref: 'S4830' });
R('ansible-shell-with-variables', ['ansible'], 'H', 'MA', 10, ['ansible', 'cwe-78', 'owasp-a03'],
  ['shell / command built from variables', 'A variable expanded into a shell line can inject other commands.', 'Use a dedicated module, or the command module with argv and | quote.'],
  ['변수로 shell / command 줄을 만듭니다', '셸 줄에 펼친 변수가 다른 명령을 끼워 넣을 수 있습니다.', '전용 모듈을 쓰거나 argv와 | quote로 command 모듈을 쓰세요.'],
  { re: /^\s*(?:-\s+)?(?:ansible\.builtin\.)?(?:shell|command|raw)\s*:\s*(?![>|]\s*$).*\{\{(?![^}]*\|\s*quote\b)/ });
R('ansible-become-without-user', ['ansible'], 'H', 'MI', 5, ['ansible', 'cwe-250'],
  ['become without become_user', 'Privilege escalation without become_user runs as root.', 'Set become_user to the least-privileged account that can do the work.'],
  ['become_user 없는 become입니다', 'become_user 없이 권한을 올리면 root로 실행됩니다.', '작업을 할 수 있는 가장 낮은 권한 계정을 become_user로 지정하세요.'],
  {
    check: (doc) => {
      const out = [];
      doc.lines.forEach((l, i) => {
        if (!/^\s*(?:-\s+)?become\s*:\s*["']?(?:yes|true)["']?\s*$/i.test(l)) return;
        if (!/become_user\s*:/.test(slice(doc, itemOf(doc, i)))) out.push({ line: i });
      });
      return out;
    },
  });
R('ansible-no-log-missing', ['ansible'], 'V', 'MA', 5, ['ansible', 'cwe-532'],
  ['Task handles a password without no_log', 'Task arguments, including the password, are printed in the output and logs.', 'Add no_log: true to the task.'],
  ['no_log 없이 비밀번호를 다루는 작업입니다', '비밀번호를 포함한 작업 인자가 출력과 로그에 찍힙니다.', '작업에 no_log: true를 넣으세요.'],
  {
    check: (doc) => {
      const out = [];
      const seen = new Set();
      doc.lines.forEach((l, i) => {
        if (!/^\s+(?:password|login_password|api_password|admin_password|secret|token|api_key)\s*:\s*\S/i.test(l)) return;
        const item = itemOf(doc, i);
        if (seen.has(item[0])) return;
        seen.add(item[0]);
        if (!/no_log\s*:\s*["']?(?:yes|true)\b/i.test(slice(doc, item))) out.push({ line: i });
      });
      return out;
    },
  });
R('ansible-hardcoded-password', ['ansible'], 'V', 'BL', 30, ['ansible', 'cwe-798', 'owasp-a07', 'secrets'],
  ['Hard-coded password in a playbook', 'The secret is stored in source control in plain text.', 'Use Ansible Vault or a lookup from a secret manager.'],
  ['플레이북에 비밀번호를 적었습니다', '비밀이 소스 관리에 평문으로 남습니다.', 'Ansible Vault나 비밀 관리자 lookup을 쓰세요.'],
  { re: /^\s*(?:-\s+)?(?:password|login_password|ansible_password|ansible_become_pass(?:word)?|ansible_ssh_pass|admin_password)\s*:\s*(?!["']?\{\{|!vault)["']?[^\s"'{][^"']{3,}/i, ref: 'S2068' });
R('ansible-world-writable-mode', ['ansible'], 'V', 'MA', 5, ['ansible', 'cwe-732'],
  ['File made writable by everyone', 'Mode 0777 / 0666 lets any local user change the file.', 'Use the narrowest mode, such as 0640 or 0750.'],
  ['모든 사용자가 쓸 수 있는 파일입니다', '0777 / 0666 모드는 로컬 사용자 누구나 파일을 바꾸게 합니다.', '0640이나 0750처럼 가장 좁은 모드를 쓰세요.'],
  { re: /^\s*(?:-\s+)?mode\s*:\s*["']?0?[0-7][0-7][2367]["']?\s*$|^\s*(?:-\s+)?mode\s*:\s*["']?[ugoa]*\+?[^"'\s]*o[+=][rwx]*w/i, ref: 'S2612' });
R('ansible-http-url', ['ansible'], 'H', 'MI', 5, ['ansible', 'tls', 'cwe-319'],
  ['Download over plain HTTP', 'Files fetched over http:// can be replaced on the way.', 'Use https:// and a checksum.'],
  ['평문 HTTP로 내려받습니다', 'http://로 가져온 파일은 도중에 바뀔 수 있습니다.', 'https://와 checksum을 쓰세요.'],
  { re: /^\s*(?:-\s+)?(?:url|repo|baseurl)\s*:\s*["']?http:\/\/(?!localhost|127\.0\.0\.1)/i, ref: 'S5332' });
R('ansible-ignore-errors', ['ansible'], 'S', 'MA', 5, ['ansible', 'error-handling'],
  ['ignore_errors: yes', 'Failures are hidden and later tasks run against a broken state.', 'Use failed_when / changed_when, or block with rescue.'],
  ['ignore_errors: yes를 씁니다', '실패가 숨겨지고 뒤 작업이 깨진 상태에서 실행됩니다.', 'failed_when / changed_when을 쓰거나 block과 rescue를 쓰세요.'],
  { re: /^\s*(?:-\s+)?ignore_errors\s*:\s*["']?(?:yes|true)["']?\s*$/i });
R('ansible-state-latest', ['ansible'], 'S', 'MI', 5, ['ansible', 'reproducibility'],
  ['Package state: latest', 'Each run may install a different version, so environments drift.', 'Pin the version and use state: present.'],
  ['패키지 state: latest를 씁니다', '실행할 때마다 다른 버전이 설치될 수 있어 환경이 어긋납니다.', '버전을 고정하고 state: present를 쓰세요.'],
  { re: /^\s*(?:-\s+)?state\s*:\s*["']?latest["']?\s*$/ });

// ── ARM templates ────────────────────────────────────────────
const SECRET_NAME = /(?:password|secret|token|connectionstring|accountkey|sharedkey|apikey)/i;
// A parameter that names or configures a secret (keyVaultSecretName,
// tokenLifetime, passwordLength) instead of holding it.
const SECRET_SETTING = /(?:Name|Id|Uri|Url|Version|Type|Length|Count|Lifetime|Expiry|Expiration|Days|Enabled|Policy|Mode)$/;

function armParams(doc) {
  const out = [];
  doc.lines.forEach((l, i) => {
    const m = /^\s*"(\w+)"\s*:\s*\{\s*$/.exec(l);
    if (!m || !SECRET_NAME.test(m[1]) || SECRET_SETTING.test(m[1])) return;
    const block = jsonEnclosing(doc.lines, i, l.length);
    const body = slice(doc, block);
    if (!/"type"\s*:\s*"/i.test(body)) return;
    out.push({ name: m[1], line: i, body });
  });
  return out;
}

R('arm-secret-param-not-secure', ['arm'], 'V', 'CR', 10, ['azure', 'cwe-532', 'secrets'],
  ['Secret parameter not typed securestring', 'A string parameter is logged in the deployment history in plain text.', 'Use "type": "securestring" (or secureObject).'],
  ['securestring이 아닌 비밀 매개변수입니다', 'string 매개변수는 배포 기록에 평문으로 남습니다.', '"type": "securestring"(또는 secureObject)을 쓰세요.'],
  { check: (doc) => armParams(doc).filter((p) => /"type"\s*:\s*"(?:string|object)"/i.test(p.body)).map((p) => ({ line: p.line })) });
R('arm-secret-default-value', ['arm'], 'V', 'BL', 30, ['azure', 'cwe-798', 'owasp-a07', 'secrets'],
  ['Secret parameter with a default value', 'The default secret is stored in source control.', 'Remove defaultValue and pass the secret at deployment or from Key Vault.'],
  ['기본값이 있는 비밀 매개변수입니다', '기본 비밀이 소스 관리에 남습니다.', 'defaultValue를 지우고 배포 때나 Key Vault에서 비밀을 넘기세요.'],
  { check: (doc) => armParams(doc).filter((p) => /"defaultValue"\s*:\s*"(?!\[)[^"]{4,}"/.test(p.body)).map((p) => ({ line: p.line })), ref: 'S6418' });
R('arm-public-network-access', ['arm'], 'V', 'MA', 10, ['azure', 'network', 'cwe-284'],
  ['Public network access enabled', 'The resource accepts connections from the whole internet.', 'Set "publicNetworkAccess": "Disabled" and use private endpoints.'],
  ['공용 네트워크 접근을 켭니다', '리소스가 인터넷 전체의 연결을 받습니다.', '"publicNetworkAccess": "Disabled"로 두고 프라이빗 엔드포인트를 쓰세요.'],
  { re: /"publicNetworkAccess"\s*:\s*"Enabled"/i, ref: 'S6329' });
R('arm-min-tls-version', ['arm'], 'V', 'CR', 10, ['azure', 'tls', 'cwe-327', 'owasp-a02'],
  ['Old minimum TLS version', 'TLS 1.0 and 1.1 are deprecated and have known weaknesses.', 'Use TLS1_2 / 1.2 or later.'],
  ['오래된 최소 TLS 버전입니다', 'TLS 1.0과 1.1은 지원이 끝났고 알려진 약점이 있습니다.', 'TLS1_2 / 1.2 이상을 쓰세요.'],
  { re: /"(?:minimumTlsVersion|minTlsVersion|minimalTlsVersion)"\s*:\s*"(?:TLS1_[01]|1\.[01])"/i, ref: 'S4423' });
R('arm-https-only-false', ['arm'], 'V', 'CR', 5, ['azure', 'tls', 'cwe-319'],
  ['HTTPS not enforced', 'The service also accepts plain HTTP traffic.', 'Set httpsOnly / supportsHttpsTrafficOnly to true.'],
  ['HTTPS를 강제하지 않습니다', '서비스가 평문 HTTP 트래픽도 받습니다.', 'httpsOnly / supportsHttpsTrafficOnly를 true로 두세요.'],
  { re: /"(?:httpsOnly|supportsHttpsTrafficOnly)"\s*:\s*false\b/, ref: 'S5332' });
R('arm-blob-public-access', ['arm'], 'V', 'CR', 10, ['azure', 'storage', 'cwe-284', 'owasp-a01'],
  ['Anonymous public blob access allowed', 'Anyone on the internet can read blobs without credentials.', 'Set "allowBlobPublicAccess": false.'],
  ['익명 공개 Blob 접근을 허용합니다', '인터넷의 누구나 자격 증명 없이 Blob을 읽을 수 있습니다.', '"allowBlobPublicAccess": false로 두세요.'],
  { re: /"allowBlobPublicAccess"\s*:\s*true\b|"publicAccess"\s*:\s*"(?:Blob|Container)"/ });
R('arm-open-nsg-rule', ['arm'], 'V', 'CR', 15, ['azure', 'network', 'cwe-284'],
  ['Inbound rule open to the whole internet', 'Traffic from any address can reach the resource.', 'Restrict sourceAddressPrefix to known ranges or service tags.'],
  ['인터넷 전체에 열린 인바운드 규칙입니다', '어느 주소의 트래픽이든 리소스에 닿을 수 있습니다.', 'sourceAddressPrefix를 알려진 범위나 서비스 태그로 제한하세요.'],
  {
    check: (doc) => {
      const out = [];
      doc.lines.forEach((l, i) => {
        const m = /"sourceAddressPrefix"\s*:\s*"(?:\*|0\.0\.0\.0\/0|Internet|Any)"/i.exec(l);
        if (!m) return;
        const body = slice(doc, jsonEnclosing(doc.lines, i, m.index));
        if (/"direction"\s*:\s*"Outbound"/i.test(body) || /"access"\s*:\s*"Deny"/i.test(body)) return;
        out.push({ line: i });
      });
      return out;
    },
  });
R('arm-ftps-all-allowed', ['arm'], 'V', 'MA', 5, ['azure', 'tls', 'cwe-319'],
  ['Plain FTP allowed on the app', 'AllAllowed accepts unencrypted FTP deployments.', 'Use "FtpsOnly" or "Disabled".'],
  ['앱에 평문 FTP를 허용합니다', 'AllAllowed는 암호화하지 않은 FTP 배포를 받습니다.', '"FtpsOnly"나 "Disabled"를 쓰세요.'],
  { re: /"ftpsState"\s*:\s*"AllAllowed"/ });

// ── Bicep ────────────────────────────────────────────────────
R('bicep-secure-param', ['bicep'], 'V', 'CR', 10, ['azure', 'cwe-532', 'secrets'],
  ['Secret parameter without @secure()', 'Without @secure() the value is logged in the deployment history in plain text.', 'Put @secure() on the parameter.'],
  ['@secure() 없는 비밀 매개변수입니다', '@secure()가 없으면 값이 배포 기록에 평문으로 남습니다.', '매개변수에 @secure()를 다세요.'],
  {
    check: (doc) => {
      const out = [];
      const L = doc.lines;
      L.forEach((l, i) => {
        const m = /^\s*(@secure\(\)\s*)?param\s+(\w+)\s+(?:string|object)\b/.exec(l);
        if (!m || m[1]) return;
        const name = m[2];
        if (!SECRET_NAME.test(name) || SECRET_SETTING.test(name)) return;
        for (let j = i - 1; j >= 0; j--) {
          if (blank(L[j])) continue;
          if (!/^\s*@/.test(L[j])) break;
          if (/^\s*@secure\(\)/.test(L[j])) return;
        }
        out.push({ line: i });
      });
      return out;
    },
  });

// ── Engine entry points ──────────────────────────────────────
function ruleMeta(rule) {
  const { re, check, formats, ...rest } = rule;
  return { ...rest, category: `IaC - ${formats.join(', ')}` };
}

function catalog() {
  return RULES.map(ruleMeta);
}

function analyzeFile(file, inactive) {
  const lang = file.lang;
  const text = String(file.text || '');
  const findings = [];
  for (const doc of documentsOf(text, lang)) {
    const formats = formatsOf(lang === 'yaml' ? doc.text : text, lang, file.path);
    if (!formats.size) continue;
    for (const rule of RULES) {
      if (inactive.has(rule.key) || !rule.formats.some((f) => formats.has(f))) continue;
      const hits = [];
      if (rule.re) {
        doc.lines.forEach((l, i) => {
          if (!blank(l) && rule.re.test(l)) hits.push({ line: i });
        });
      }
      if (rule.check) hits.push(...rule.check(doc));
      const seen = new Set();
      for (const h of hits) {
        if (seen.has(h.line)) continue;
        seen.add(h.line);
        const raw = doc.raw[h.line] || '';
        findings.push({
          rule: rule.key,
          file: file.path,
          line: doc.offset + h.line + 1,
          column: indentOf(raw) + 1,
          message: { en: h.en || rule.name.en, ko: h.ko || rule.name.ko },
        });
      }
    }
  }
  return findings;
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive instanceof Set ? ctx.inactive : new Set(ctx.inactive || []);
  const out = [];
  for (const file of files || []) {
    if (!file || !['yaml', 'json', 'bicep'].includes(file.lang)) continue;
    out.push(...analyzeFile(file, inactive));
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return out;
}

module.exports = { catalog, analyze, formatsOf, RULES };
