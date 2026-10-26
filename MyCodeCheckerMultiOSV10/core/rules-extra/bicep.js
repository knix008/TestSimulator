'use strict';

// Azure Bicep. Network exposure, TLS, public blob access, secrets in
// templates and outputs. The @secure() decorator check needs the line above
// a param, so it lives in core/iac (file-aware) as iac:bicep-secure-param.

const { maker } = require('./util');

const R = maker('bicep', ['bicep']);

R('public-network-access', 'V', 'MA', 10, ['azure', 'network', 'cwe-284'],
  /\bpublicNetworkAccess\s*:\s*'Enabled'/i,
  ['Public network access enabled', 'The resource accepts connections from the whole internet.', "Set publicNetworkAccess: 'Disabled' and use private endpoints."],
  ['공용 네트워크 접근을 켭니다', '리소스가 인터넷 전체의 연결을 받습니다.', "publicNetworkAccess: 'Disabled'로 두고 프라이빗 엔드포인트를 쓰세요."],
  "    publicNetworkAccess: 'Enabled'", "    publicNetworkAccess: 'Disabled'", { ref: 'S6329' });
R('min-tls-version', 'V', 'CR', 10, ['azure', 'tls', 'cwe-327', 'owasp-a02'],
  /\bminimumTlsVersion\s*:\s*'TLS1_[01]'|\bminTlsVersion\s*:\s*'1\.[01]'|\bminimalTlsVersion\s*:\s*'1\.[01]'/i,
  ['Old minimum TLS version', 'TLS 1.0 and 1.1 are deprecated and have known weaknesses.', "Use 'TLS1_2' (or '1.2') or later."],
  ['오래된 최소 TLS 버전입니다', 'TLS 1.0과 1.1은 지원이 끝났고 알려진 약점이 있습니다.', "'TLS1_2'(또는 '1.2') 이상을 쓰세요."],
  "    minimumTlsVersion: 'TLS1_0'", "    minimumTlsVersion: 'TLS1_2'", { ref: 'S4423' });
R('https-only-false', 'V', 'CR', 5, ['azure', 'tls', 'cwe-319'],
  /\b(?:httpsOnly|supportsHttpsTrafficOnly)\s*:\s*false\b/,
  ['HTTPS not enforced', 'The service also accepts plain HTTP traffic.', 'Set httpsOnly / supportsHttpsTrafficOnly to true.'],
  ['HTTPS를 강제하지 않습니다', '서비스가 평문 HTTP 트래픽도 받습니다.', 'httpsOnly / supportsHttpsTrafficOnly를 true로 두세요.'],
  '    httpsOnly: false', '    httpsOnly: true', { ref: 'S5332' });
R('blob-public-access', 'V', 'CR', 10, ['azure', 'storage', 'cwe-284', 'owasp-a01'],
  /\ballowBlobPublicAccess\s*:\s*true\b|\bpublicAccess\s*:\s*'(?:Blob|Container)'/,
  ['Anonymous public blob access allowed', 'Anyone on the internet can read blobs without credentials.', "Set allowBlobPublicAccess: false and publicAccess: 'None'."],
  ['익명 공개 Blob 접근을 허용합니다', '인터넷의 누구나 자격 증명 없이 Blob을 읽을 수 있습니다.', "allowBlobPublicAccess: false와 publicAccess: 'None'을 쓰세요."],
  '    allowBlobPublicAccess: true', '    allowBlobPublicAccess: false');
R('open-nsg-rule', 'V', 'CR', 15, ['azure', 'network', 'cwe-284'],
  /\bsourceAddressPrefix(?:es)?\s*:\s*\[?\s*'(?:\*|0\.0\.0\.0\/0|Internet|Any)'/i,
  ['Network rule open to the whole internet', 'Traffic from any address can reach the resource.', 'Restrict the source to known address ranges or service tags.'],
  ['인터넷 전체에 열린 네트워크 규칙입니다', '어느 주소의 트래픽이든 리소스에 닿을 수 있습니다.', '원본을 알려진 주소 범위나 서비스 태그로 제한하세요.'],
  "          sourceAddressPrefix: '0.0.0.0/0'", "          sourceAddressPrefix: '10.20.0.0/16'");
R('open-firewall-range', 'V', 'CR', 15, ['azure', 'network', 'cwe-284'],
  /\bendIpAddress\s*:\s*'255\.255\.255\.255'/,
  ['Firewall rule allows every IP address', 'A 0.0.0.0 - 255.255.255.255 range opens the server to the internet.', 'Allow only the client ranges that need access.'],
  ['방화벽 규칙이 모든 IP 주소를 허용합니다', '0.0.0.0 - 255.255.255.255 범위는 서버를 인터넷에 엽니다.', '접근이 필요한 클라이언트 범위만 허용하세요.'],
  "    endIpAddress: '255.255.255.255'", "    endIpAddress: '203.0.113.20'");
R('hardcoded-secret', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|secret|accountKey|sharedKey)\w*\s*(?::|string\s*=)\s*'[^'$\s]{4,}'/i,
  ['Hard-coded secret in the template', 'The secret is stored in source control and deployment history.', 'Pass it as a @secure() parameter or reference Key Vault with getSecret().'],
  ['템플릿에 비밀을 적었습니다', '비밀이 소스 관리와 배포 기록에 남습니다.', '@secure() 매개변수로 넘기거나 getSecret()으로 Key Vault를 참조하세요.'],
  "    administratorLoginPassword: 'P@ssw0rd123'", '    administratorLoginPassword: adminPassword', { ref: 'S6418' });
R('secret-output', 'V', 'CR', 15, ['cwe-532', 'secrets'],
  /^\s*output\s+\w*(?:password|secret|key|connectionString|token)\w*\s+\w+|^\s*output\s+\w+\s+\w+\s*=.*\blist(?:Keys|ConnectionStrings|AccountSas)\s*\(/i,
  ['Secret returned as a deployment output', 'Outputs are stored in plain text in the deployment history.', 'Do not output secrets; let consumers read them from Key Vault.'],
  ['비밀을 배포 출력으로 돌려줍니다', '출력은 배포 기록에 평문으로 저장됩니다.', '비밀은 출력하지 말고 사용하는 쪽이 Key Vault에서 읽게 하세요.'],
  'output storageKey string = stg.listKeys().keys[0].value', 'output storageId string = stg.id');
R('ftps-all-allowed', 'V', 'MA', 5, ['azure', 'tls', 'cwe-319'],
  /\bftpsState\s*:\s*'AllAllowed'/,
  ['Plain FTP allowed on the app', 'AllAllowed accepts unencrypted FTP deployments.', "Use 'FtpsOnly' or 'Disabled'."],
  ['앱에 평문 FTP를 허용합니다', 'AllAllowed는 암호화하지 않은 FTP 배포를 받습니다.', "'FtpsOnly'나 'Disabled'를 쓰세요."],
  "      ftpsState: 'AllAllowed'", "      ftpsState: 'Disabled'");
R('remote-debugging', 'H', 'MA', 5, ['azure', 'debug'],
  /\bremoteDebuggingEnabled\s*:\s*true\b/,
  ['Remote debugging enabled', 'Remote debugging opens extra ports into the running app.', 'Turn it off outside short debugging sessions.'],
  ['원격 디버깅을 켭니다', '원격 디버깅은 실행 중인 앱에 추가 포트를 엽니다.', '짧은 디버깅 때 말고는 끄세요.'],
  '      remoteDebuggingEnabled: true', '      remoteDebuggingEnabled: false', { ref: 'S4507' });
R('acr-admin-user', 'H', 'MA', 5, ['azure', 'cwe-798'],
  /\badminUserEnabled\s*:\s*true\b/,
  ['Container registry admin user enabled', 'The shared admin account has full push and pull rights and a static password.', 'Disable it and use managed identities or tokens with scopes.'],
  ['컨테이너 레지스트리 관리자 사용자를 켭니다', '공유 관리자 계정은 푸시와 풀 권한을 모두 가지며 비밀번호가 고정입니다.', '끄고 관리 ID나 범위가 있는 토큰을 쓰세요.'],
  '    adminUserEnabled: true', '    adminUserEnabled: false');
R('local-auth-enabled', 'H', 'MI', 5, ['azure', 'cwe-287'],
  /\bdisableLocalAuth\s*:\s*false\b/,
  ['Local key authentication enabled', 'Access keys bypass Entra ID, conditional access and auditing.', 'Set disableLocalAuth: true and grant RBAC roles.'],
  ['로컬 키 인증을 켭니다', '액세스 키는 Entra ID, 조건부 액세스, 감사를 우회합니다.', 'disableLocalAuth: true로 두고 RBAC 역할을 주세요.'],
  '    disableLocalAuth: false', '    disableLocalAuth: true');
R('keyvault-purge-protection-off', 'S', 'MA', 5, ['azure', 'resilience'],
  /\b(?:enablePurgeProtection|enableSoftDelete)\s*:\s*false\b/,
  ['Key Vault soft delete or purge protection off', 'Deleted keys and secrets cannot be recovered, by mistake or by an attacker.', 'Enable soft delete and purge protection.'],
  ['Key Vault 일시 삭제나 제거 보호를 끕니다', '실수나 공격으로 지운 키와 비밀을 되살릴 수 없습니다.', '일시 삭제와 제거 보호를 켜세요.'],
  '    enablePurgeProtection: false', '    enablePurgeProtection: true');
R('aks-rbac-off', 'V', 'CR', 10, ['azure', 'cwe-284', 'k8s'],
  /\benableRBAC\s*:\s*false\b/,
  ['Kubernetes RBAC disabled', 'Without RBAC every authenticated user can do anything in the cluster.', 'Set enableRBAC: true.'],
  ['Kubernetes RBAC를 끕니다', 'RBAC가 없으면 인증된 사용자 누구나 클러스터에서 무엇이든 할 수 있습니다.', 'enableRBAC: true로 두세요.'],
  '    enableRBAC: false', '    enableRBAC: true');
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /'http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  "    serviceUrl: 'http://backend.example.com'", "    serviceUrl: 'https://backend.example.com'", { ref: 'S5332' });

module.exports = { RULES: R.rules };
