'use strict';

// Terraform / HCL. Single-line attribute checks for common AWS, Azure and GCP
// misconfigurations, in the spirit of the reference IaC rules.

const { maker } = require('./util');

const R = maker('tf', ['tf']);

// ── Generic / AWS ────────────────────────────────────────────
R('s3-public-access-block-off', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'aws'],
  /^\s*(?:block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets)\s*=\s*false\b/,
  ['S3 public access block disabled', 'The bucket can be made public by an ACL or policy.', 'Set all four public access block options to true.'],
  ['S3 공개 접근 차단을 끕니다', 'ACL이나 정책으로 버킷이 공개될 수 있습니다.', '공개 접근 차단 옵션 네 개를 모두 true로 두세요.'],
  '  block_public_acls = false', '  block_public_acls = true');
R('authenticated-read-acl', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'aws'],
  /\bacl\s*=\s*"(?:authenticated-read|log-delivery-write)"/,
  ['Bucket readable by any AWS account', 'authenticated-read means every AWS user, not just your account.', 'Use private and grant access through policies.'],
  ['모든 AWS 계정이 읽을 수 있는 버킷입니다', 'authenticated-read는 내 계정이 아니라 모든 AWS 사용자를 뜻합니다.', 'private을 쓰고 정책으로 접근을 주세요.'],
  '  acl = "authenticated-read"', '  acl = "private"');
R('encryption-disabled', 'V', 'MA', 10, ['cwe-311', 'owasp-a02'],
  /^\s*(?:encrypted|storage_encrypted|encryption_enabled|enable_encryption|at_rest_encryption_enabled|transit_encryption_enabled|encrypt_at_rest|kms_encryption_enabled|infrastructure_encryption_enabled|encryption_at_host_enabled|enable_https_traffic_only_encryption)\s*=\s*false\b/,
  ['Encryption at rest or in transit turned off', 'Data on disk or on the wire is readable if the storage or network is compromised.', 'Enable encryption, ideally with a customer-managed key.'],
  ['저장 또는 전송 암호화를 끕니다', '저장소나 네트워크가 뚫리면 디스크나 회선의 데이터를 읽을 수 있습니다.', '가능하면 고객 관리 키로 암호화를 켜세요.'],
  '  storage_encrypted = false', '  storage_encrypted = true');
R('db-publicly-accessible', 'V', 'CR', 15, ['cwe-668', 'owasp-a01', 'aws'],
  /^\s*publicly_accessible\s*=\s*true\b/,
  ['Database publicly accessible', 'The database gets a public endpoint reachable from the internet.', 'Keep it in private subnets with publicly_accessible = false.'],
  ['데이터베이스가 공개 접근 가능합니다', '데이터베이스가 인터넷에서 닿는 공개 엔드포인트를 얻습니다.', 'publicly_accessible = false로 사설 서브넷에 두세요.'],
  '  publicly_accessible = true', '  publicly_accessible = false');
R('public-ip-assigned', 'H', 'MA', 10, ['cwe-668', 'aws'],
  /^\s*(?:associate_public_ip_address|map_public_ip_on_launch)\s*=\s*true\b/,
  ['Public IP assigned automatically', 'Instances become reachable from the internet if a security group allows it.', 'Use private subnets and a load balancer or bastion.'],
  ['공개 IP를 자동으로 줍니다', '보안 그룹이 허용하면 인스턴스가 인터넷에서 닿습니다.', '사설 서브넷과 로드 밸런서나 배스천을 쓰세요.'],
  '  associate_public_ip_address = true', '  associate_public_ip_address = false');
R('ipv6-open-cidr', 'V', 'CR', 15, ['cwe-284', 'owasp-a01'],
  /["']::\/0["']/,
  ['Rule open to all IPv6 addresses', '::/0 allows traffic from the whole IPv6 internet.', 'Limit the CIDR to known ranges.'],
  ['모든 IPv6 주소에 열린 규칙입니다', '::/0은 IPv6 인터넷 전체의 통신을 허용합니다.', 'CIDR을 알려진 범위로 제한하세요.'],
  '  ipv6_cidr_blocks = ["::/0"]', '  ipv6_cidr_blocks = ["2001:db8::/32"]');
R('iam-wildcard-action', 'V', 'CR', 15, ['cwe-269', 'owasp-a01', 'iam'],
  /^\s*(?:"?Action"?|actions|NotAction)\s*[=:]\s*\[?\s*"(?:\*|[a-z0-9-]+:\*)"/i,
  ['IAM policy allows every action', '"*" or "service:*" grants far more than the workload needs.', 'List the specific actions.'],
  ['IAM 정책이 모든 동작을 허용합니다', '"*"나 "service:*"는 워크로드에 필요한 것보다 훨씬 많이 허용합니다.', '구체적인 동작을 나열하세요.'],
  '  actions = ["s3:*"]', '  actions = ["s3:GetObject"]');
R('iam-wildcard-resource', 'H', 'MA', 10, ['cwe-732', 'owasp-a01', 'iam'],
  /^\s*(?:"?Resource"?|resources)\s*[=:]\s*\[?\s*"\*"/i,
  ['IAM policy on every resource', 'Resource "*" applies the permissions to all resources in the account.', 'Scope the policy to specific ARNs.'],
  ['IAM 정책이 모든 리소스에 적용됩니다', 'Resource "*"는 계정의 모든 리소스에 권한을 적용합니다.', '정책을 특정 ARN으로 좁히세요.'],
  '  resources = ["*"]', '  resources = [aws_s3_bucket.logs.arn]');
R('iam-principal-wildcard', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'iam'],
  /"?Principal"?\s*[=:]\s*(?:"\*"|\{\s*"?AWS"?\s*[=:]\s*"\*")|\bidentifiers\s*=\s*\[\s*"\*"\s*\]|^\s*principal\s*=\s*"\*"/i,
  ['Policy grants access to everyone', 'Principal "*" lets any AWS account or anonymous user in.', 'Name the accounts or roles allowed.'],
  ['정책이 모두에게 접근을 허용합니다', 'Principal "*"는 아무 AWS 계정이나 익명 사용자를 들입니다.', '허용할 계정이나 역할을 지정하세요.'],
  '      identifiers = ["*"]', '      identifiers = ["arn:aws:iam::123456789012:root"]');
R('http-listener', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /^\s*protocol\s*=\s*"HTTP"\s*$/,
  ['Load balancer listener on plain HTTP', 'Traffic between clients and the load balancer is unencrypted.', 'Use HTTPS with a certificate, and redirect HTTP to HTTPS.'],
  ['평문 HTTP 로드 밸런서 리스너입니다', '클라이언트와 로드 밸런서 사이 통신이 암호화되지 않습니다.', '인증서와 HTTPS를 쓰고 HTTP는 HTTPS로 리다이렉트하세요.'],
  '  protocol = "HTTP"', '  protocol = "HTTPS"',
  { skip: (raw) => /health|redirect/i.test(raw) });
R('weak-tls-policy', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'tls'],
  /\bssl_policy\s*=\s*"ELBSecurityPolicy-(?:2015-05|2016-08|TLS-1-0-2015-04|TLS-1-1-2017-01)"|\bminimum_protocol_version\s*=\s*"(?:SSLv3|TLSv1|TLSv1_2016|TLSv1\.1_2016)"|\bmin(?:imum)?_tls_version\s*=\s*"(?:1\.0|1\.1|TLS1_0|TLS1_1|TLSv1|TLSv1\.0|TLSv1\.1|TLS_1_0|TLS_1_1)"|\btls_security_policy\s*=\s*"Policy-Min-TLS-1-0-2019-07"/,
  ['TLS policy allows old protocol versions', 'TLS 1.0 / 1.1 and SSL 3 have known attacks.', 'Require TLS 1.2 or later.'],
  ['TLS 정책이 낡은 프로토콜을 허용합니다', 'TLS 1.0 / 1.1과 SSL 3에는 알려진 공격이 있습니다.', 'TLS 1.2 이상을 요구하세요.'],
  '  min_tls_version = "TLS1_0"', '  min_tls_version = "TLS1_2"');
R('cloudfront-allow-http', 'V', 'MA', 10, ['cwe-319', 'owasp-a02', 'aws'],
  /\bviewer_protocol_policy\s*=\s*"allow-all"/,
  ['CloudFront allows HTTP viewers', 'Viewers can reach the distribution over plain HTTP.', 'Use redirect-to-https or https-only.'],
  ['CloudFront가 HTTP 접속을 허용합니다', '평문 HTTP로 배포에 접속할 수 있습니다.', 'redirect-to-https나 https-only를 쓰세요.'],
  '    viewer_protocol_policy = "allow-all"', '    viewer_protocol_policy = "redirect-to-https"');
R('kms-rotation-off', 'V', 'MA', 10, ['cwe-320', 'owasp-a02', 'aws'],
  /\benable_key_rotation\s*=\s*false\b|\brotation_enabled\s*=\s*false\b/,
  ['Key rotation disabled', 'A leaked key stays valid for all past and future data.', 'Enable automatic key rotation.'],
  ['키 순환을 끕니다', '유출된 키가 과거와 미래 데이터 모두에 계속 유효합니다.', '자동 키 순환을 켜세요.'],
  '  enable_key_rotation = false', '  enable_key_rotation = true');
R('imds-v1', 'V', 'MA', 10, ['cwe-918', 'owasp-a10', 'aws'],
  /\bhttp_tokens\s*=\s*"optional"/,
  ['Instance metadata v1 allowed', 'IMDSv1 lets an SSRF bug read instance credentials.', 'Set http_tokens = "required".'],
  ['인스턴스 메타데이터 v1을 허용합니다', 'IMDSv1은 SSRF 버그로 인스턴스 자격 증명을 읽게 합니다.', 'http_tokens = "required"로 두세요.'],
  '    http_tokens = "optional"', '    http_tokens = "required"');
R('trail-validation-off', 'V', 'MA', 10, ['cwe-778', 'owasp-a09', 'aws'],
  /\benable_log_file_validation\s*=\s*false\b|\bis_multi_region_trail\s*=\s*false\b/,
  ['CloudTrail integrity or coverage reduced', 'Log files can be altered undetected, or other regions are not recorded.', 'Enable log file validation and multi-region trails.'],
  ['CloudTrail 무결성이나 범위를 줄입니다', '로그 파일이 몰래 바뀌거나 다른 리전이 기록되지 않습니다.', '로그 파일 검증과 다중 리전 추적을 켜세요.'],
  '  enable_log_file_validation = false', '  enable_log_file_validation = true');
R('deletion-protection-off', 'H', 'MI', 5, ['reliability'],
  /\bdeletion_protection(?:_enabled)?\s*=\s*false\b/,
  ['Deletion protection disabled', 'The resource can be destroyed by a single mistaken apply.', 'Turn deletion protection on for stateful resources.'],
  ['삭제 보호를 끕니다', '한 번의 잘못된 apply로 리소스가 파괴될 수 있습니다.', '상태가 있는 리소스에는 삭제 보호를 켜세요.'],
  '  deletion_protection = false', '  deletion_protection = true');
R('backup-retention-zero', 'H', 'MA', 5, ['reliability'],
  /\bbackup_retention_period\s*=\s*0\b/,
  ['Automated backups disabled', 'A retention of 0 turns off automated backups and point-in-time recovery.', 'Keep at least 7 days of backups.'],
  ['자동 백업을 끕니다', '보존 0은 자동 백업과 특정 시점 복구를 끕니다.', '최소 7일 백업을 유지하세요.'],
  '  backup_retention_period = 0', '  backup_retention_period = 7');
R('eks-public-endpoint', 'H', 'MA', 10, ['cwe-668', 'aws'],
  /\bendpoint_public_access\s*=\s*true\b/,
  ['Kubernetes API endpoint public', 'The control plane is reachable from the internet.', 'Use a private endpoint or restrict public_access_cidrs.'],
  ['Kubernetes API 엔드포인트가 공개입니다', '컨트롤 플레인이 인터넷에서 닿습니다.', '사설 엔드포인트를 쓰거나 public_access_cidrs를 제한하세요.'],
  '    endpoint_public_access = true', '    endpoint_public_access = false');
R('enforce-https-off', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /\benforce_https\s*=\s*false\b|\brequire_ssl\s*=\s*false\b|\bssl_enforcement_enabled\s*=\s*false\b|\bssl_enforcement\s*=\s*"Disabled"/,
  ['HTTPS / SSL enforcement disabled', 'Clients may connect without encryption.', 'Require encrypted connections.'],
  ['HTTPS / SSL 강제를 끕니다', '클라이언트가 암호화 없이 연결할 수 있습니다.', '암호화된 연결을 요구하세요.'],
  '    enforce_https = false', '    enforce_https = true');
R('access-keys-in-provider', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /^\s*(?:access_key|secret_key|client_secret|token)\s*=\s*"(?!\$\{|var\.)[^"]{8,}"/,
  ['Cloud credentials in Terraform code', 'Keys in .tf files end up in Git and in state files.', 'Use environment variables, a profile or OIDC.'],
  ['Terraform 코드에 클라우드 자격 증명이 있습니다', '.tf 파일의 키는 Git과 상태 파일에 남습니다.', '환경 변수, 프로필, OIDC를 쓰세요.'],
  '  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"', '  secret_key = var.aws_secret_key');
R('module-source-http', 'V', 'MA', 10, ['cwe-494', 'owasp-a08', 'supply-chain'],
  /\bsource\s*=\s*"(?:git::)?http:\/\//,
  ['Module downloaded over plain HTTP', 'The module code can be replaced on the network.', 'Use https or a registry source.'],
  ['평문 HTTP로 모듈을 내려받습니다', '모듈 코드가 네트워크에서 바꿔치기될 수 있습니다.', 'https나 레지스트리 소스를 쓰세요.'],
  '  source = "http://modules.example.com/vpc.zip"', '  source = "https://modules.example.com/vpc.zip"');
R('module-unpinned', 'S', 'MA', 5, ['supply-chain'],
  /\bsource\s*=\s*"git::(?![^"]*[?&]ref=)[^"]+"|\bsource\s*=\s*"github\.com\/(?![^"]*[?&]ref=)[^"]+"/,
  ['Git module without a ref', 'Without ?ref= the module follows the default branch and changes silently.', 'Pin a tag or commit with ?ref=.'],
  ['ref 없는 Git 모듈입니다', '?ref=가 없으면 모듈이 기본 브랜치를 따라가 조용히 바뀝니다.', '?ref=로 태그나 커밋을 고정하세요.'],
  '  source = "git::https://github.com/org/vpc.git"', '  source = "git::https://github.com/org/vpc.git?ref=v1.4.0"');
R('versioning-suspended', 'H', 'MI', 5, ['reliability', 'aws'],
  /^\s*status\s*=\s*"(?:Suspended|Disabled)"\s*$/,
  ['Bucket versioning suspended', 'Overwritten or deleted objects cannot be recovered.', 'Enable versioning on buckets that hold important data.'],
  ['버킷 버전 관리를 중지합니다', '덮어쓰거나 지운 객체를 되살릴 수 없습니다.', '중요한 데이터가 있는 버킷은 버전 관리를 켜세요.'],
  '    status = "Suspended"', '    status = "Enabled"');

// ── Azure ────────────────────────────────────────────────────
R('azure-https-only-off', 'V', 'MA', 10, ['cwe-319', 'owasp-a02', 'azure'],
  /^\s*(?:https_only|enable_https_traffic_only|https_traffic_only_enabled)\s*=\s*false\b/,
  ['Azure resource accepts HTTP', 'Requests and data travel unencrypted.', 'Set https_only / https_traffic_only_enabled = true.'],
  ['Azure 리소스가 HTTP를 받습니다', '요청과 데이터가 암호화되지 않고 전송됩니다.', 'https_only / https_traffic_only_enabled = true로 두세요.'],
  '  https_only = false', '  https_only = true');
R('azure-public-blob', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'azure'],
  /\b(?:allow_blob_public_access|allow_nested_items_to_be_public)\s*=\s*true\b|\bcontainer_access_type\s*=\s*"(?:blob|container)"/,
  ['Public blob access', 'Blobs can be read anonymously from the internet.', 'Keep containers private and use SAS tokens or identities.'],
  ['공개 Blob 접근입니다', '인터넷에서 익명으로 Blob을 읽을 수 있습니다.', '컨테이너를 비공개로 두고 SAS 토큰이나 ID를 쓰세요.'],
  '  container_access_type = "blob"', '  container_access_type = "private"');
R('azure-public-network', 'H', 'MA', 10, ['cwe-668', 'azure'],
  /\bpublic_network_access_enabled\s*=\s*true\b/,
  ['Public network access enabled', 'The service accepts connections from the internet.', 'Use private endpoints and disable public access.'],
  ['공개 네트워크 접근을 켭니다', '서비스가 인터넷의 연결을 받습니다.', '사설 엔드포인트를 쓰고 공개 접근을 끄세요.'],
  '  public_network_access_enabled = true', '  public_network_access_enabled = false');
R('azure-firewall-open', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'azure'],
  /\bend_ip_address\s*=\s*"255\.255\.255\.255"/,
  ['Firewall rule allows every IP address', 'The range ending at 255.255.255.255 opens the server to the internet.', 'Allow only known client ranges.'],
  ['방화벽 규칙이 모든 IP를 허용합니다', '255.255.255.255로 끝나는 범위는 서버를 인터넷에 엽니다.', '알려진 클라이언트 범위만 허용하세요.'],
  '  end_ip_address = "255.255.255.255"', '  end_ip_address = "203.0.113.20"');
R('azure-nsg-any-source', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'azure'],
  /\bsource_address_prefix\s*=\s*"(?:\*|Internet|Any)"/,
  ['NSG rule allows any source', 'Inbound traffic from the whole internet reaches the port.', 'Restrict source_address_prefix to known ranges.'],
  ['NSG 규칙이 모든 출발지를 허용합니다', '인터넷 전체의 인바운드 통신이 포트에 닿습니다.', 'source_address_prefix를 알려진 범위로 제한하세요.'],
  '    source_address_prefix = "*"', '    source_address_prefix = "10.0.0.0/16"');
R('azure-rbac-disabled', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'azure'],
  /\brole_based_access_control_enabled\s*=\s*false\b|\benable_rbac_authorization\s*=\s*false\b/,
  ['RBAC disabled', 'Without RBAC, access cannot be scoped per identity.', 'Enable RBAC.'],
  ['RBAC를 끕니다', 'RBAC가 없으면 ID별로 접근 범위를 정할 수 없습니다.', 'RBAC를 켜세요.'],
  '  role_based_access_control_enabled = false', '  role_based_access_control_enabled = true');
R('azure-local-auth', 'H', 'MA', 10, ['cwe-284', 'azure'],
  /\blocal_auth_enabled\s*=\s*true\b|\badmin_enabled\s*=\s*true\b|\bshared_access_key_enabled\s*=\s*true\b/,
  ['Shared-key or admin account authentication enabled', 'Static keys and admin users bypass Azure AD controls and audit.', 'Disable local authentication and use managed identities.'],
  ['공유 키나 관리자 계정 인증을 켭니다', '정적 키와 관리자 사용자는 Azure AD 통제와 감사를 우회합니다.', '로컬 인증을 끄고 관리 ID를 쓰세요.'],
  '  admin_enabled = true', '  admin_enabled = false');
R('azure-purge-protection-off', 'H', 'MI', 5, ['reliability', 'azure'],
  /\bpurge_protection_enabled\s*=\s*false\b/,
  ['Key Vault purge protection off', 'Deleted keys and secrets can be purged immediately and lost.', 'Enable purge protection.'],
  ['Key Vault 제거 보호를 끕니다', '삭제된 키와 시크릿이 바로 제거되어 잃을 수 있습니다.', '제거 보호를 켜세요.'],
  '  purge_protection_enabled = false', '  purge_protection_enabled = true');

// ── GCP ──────────────────────────────────────────────────────
R('gcp-public-member', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'gcp'],
  /\bmembers?\s*=\s*\[?\s*"(?:allUsers|allAuthenticatedUsers)"/,
  ['IAM binding for allUsers', 'allUsers / allAuthenticatedUsers make the resource public.', 'Bind specific users, groups or service accounts.'],
  ['allUsers에 IAM 바인딩을 줍니다', 'allUsers / allAuthenticatedUsers는 리소스를 공개합니다.', '특정 사용자, 그룹, 서비스 계정을 바인딩하세요.'],
  '  member = "allUsers"', '  member = "group:devs@example.com"');
R('gcp-uniform-access-off', 'H', 'MA', 10, ['cwe-284', 'gcp'],
  /\buniform_bucket_level_access\s*=\s*false\b/,
  ['Uniform bucket-level access off', 'Per-object ACLs make it easy to expose a single object by mistake.', 'Enable uniform bucket-level access.'],
  ['균일 버킷 수준 접근을 끕니다', '객체별 ACL은 실수로 객체 하나를 공개하기 쉽게 합니다.', '균일 버킷 수준 접근을 켜세요.'],
  '  uniform_bucket_level_access = false', '  uniform_bucket_level_access = true');
R('gcp-legacy-abac', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'gcp'],
  /\benable_legacy_abac\s*=\s*true\b/,
  ['GKE legacy ABAC enabled', 'Legacy ABAC grants broad permissions outside RBAC.', 'Disable legacy ABAC.'],
  ['GKE 레거시 ABAC를 켭니다', '레거시 ABAC는 RBAC 밖에서 넓은 권한을 줍니다.', '레거시 ABAC를 끄세요.'],
  '  enable_legacy_abac = true', '  enable_legacy_abac = false');
R('gcp-serial-port', 'V', 'MA', 10, ['cwe-284', 'gcp'],
  /"?serial-port-enable"?\s*=\s*"?(?:true|TRUE|1)"?/,
  ['Serial port access enabled', 'The interactive serial console bypasses network controls.', 'Keep serial-port-enable off.'],
  ['직렬 포트 접근을 켭니다', '대화형 직렬 콘솔은 네트워크 통제를 우회합니다.', 'serial-port-enable을 꺼 두세요.'],
  '    serial-port-enable = "true"', '    serial-port-enable = "false"');
R('gcp-os-login-off', 'H', 'MI', 5, ['cwe-284', 'gcp'],
  /"?enable-oslogin"?\s*=\s*"?(?:false|FALSE)"?/,
  ['OS Login disabled', 'SSH keys are managed per instance instead of through IAM.', 'Enable OS Login.'],
  ['OS Login을 끕니다', 'SSH 키가 IAM 대신 인스턴스별로 관리됩니다.', 'OS Login을 켜세요.'],
  '    enable-oslogin = "FALSE"', '    enable-oslogin = "TRUE"');
R('gcp-ip-forward', 'H', 'MI', 5, ['cwe-668', 'gcp'],
  /\bcan_ip_forward\s*=\s*true\b/,
  ['IP forwarding enabled', 'The instance can route traffic for other addresses.', 'Disable it unless the VM is a router or NAT.'],
  ['IP 전달을 켭니다', '인스턴스가 다른 주소의 통신을 라우팅할 수 있습니다.', 'VM이 라우터나 NAT가 아니면 끄세요.'],
  '  can_ip_forward = true', '  can_ip_forward = false');
R('gcp-full-api-scope', 'H', 'MA', 10, ['cwe-269', 'gcp'],
  /"https:\/\/www\.googleapis\.com\/auth\/cloud-platform"|\bscopes\s*=\s*\[\s*"cloud-platform"/,
  ['Service account with the cloud-platform scope', 'The instance token can call every Google Cloud API the account may use.', 'Grant narrow scopes and roles.'],
  ['cloud-platform 범위의 서비스 계정입니다', '인스턴스 토큰이 계정이 쓸 수 있는 모든 Google Cloud API를 부를 수 있습니다.', '좁은 범위와 역할을 주세요.'],
  '    scopes = ["cloud-platform"]', '    scopes = ["https://www.googleapis.com/auth/logging.write"]');
R('gcp-private-nodes-off', 'H', 'MA', 10, ['cwe-668', 'gcp'],
  /\benable_private_nodes\s*=\s*false\b/,
  ['GKE nodes with public IPs', 'Nodes get public addresses reachable from the internet.', 'Enable private nodes.'],
  ['공개 IP가 있는 GKE 노드입니다', '노드가 인터넷에서 닿는 공개 주소를 얻습니다.', '사설 노드를 켜세요.'],
  '    enable_private_nodes = false', '    enable_private_nodes = true');
R('gcp-sql-public-ip', 'H', 'MA', 10, ['cwe-668', 'gcp'],
  /\bipv4_enabled\s*=\s*true\b/,
  ['Cloud SQL with a public IP', 'The database gets an address on the internet.', 'Use private IP and the Cloud SQL Auth Proxy.'],
  ['공개 IP가 있는 Cloud SQL입니다', '데이터베이스가 인터넷 주소를 얻습니다.', '사설 IP와 Cloud SQL Auth Proxy를 쓰세요.'],
  '      ipv4_enabled = true', '      ipv4_enabled = false');

module.exports = { RULES: R.rules };
