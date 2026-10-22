'use strict';

// YAML: Kubernetes manifests and Helm output, GitHub Actions, GitLab CI,
// Docker Compose and application configuration (Spring, generic).

const { maker } = require('./util');

const R = maker('yaml', ['yaml']);

// ── Kubernetes ───────────────────────────────────────────────
R('allow-privilege-escalation', 'V', 'MA', 10, ['cwe-250', 'k8s'],
  /^\s*allowPrivilegeEscalation\s*:\s*true\b/i,
  ['allowPrivilegeEscalation: true', 'A process in the container can gain more privileges than its parent (setuid binaries).', 'Set allowPrivilegeEscalation: false.'],
  ['allowPrivilegeEscalation: true로 둡니다', '컨테이너의 프로세스가 부모보다 큰 권한을 얻을 수 있습니다(setuid 바이너리).', 'allowPrivilegeEscalation: false로 두세요.'],
  '  allowPrivilegeEscalation: true', '  allowPrivilegeEscalation: false');
R('host-pid-ipc', 'V', 'CR', 15, ['cwe-250', 'k8s'],
  /^\s*host(?:PID|IPC)\s*:\s*true\b/,
  ['Pod shares the host PID or IPC namespace', 'The container can see and signal host processes or read host shared memory.', 'Remove hostPID / hostIPC.'],
  ['Pod가 호스트 PID 또는 IPC 네임스페이스를 공유합니다', '컨테이너가 호스트 프로세스를 보고 신호를 보내거나 공유 메모리를 읽을 수 있습니다.', 'hostPID / hostIPC를 지우세요.'],
  '  hostPID: true', '  hostPID: false');
R('run-as-non-root-false', 'H', 'MA', 10, ['cwe-250', 'k8s'],
  /^\s*runAsNonRoot\s*:\s*false\b/,
  ['runAsNonRoot: false', 'The container may run as root.', 'Set runAsNonRoot: true and a non-zero runAsUser.'],
  ['runAsNonRoot: false로 둡니다', '컨테이너가 root로 실행될 수 있습니다.', 'runAsNonRoot: true와 0이 아닌 runAsUser를 설정하세요.'],
  '  runAsNonRoot: false', '  runAsNonRoot: true');
R('dangerous-capability', 'V', 'CR', 15, ['cwe-250', 'k8s'],
  /^\s*(?:-\s*|add\s*:\s*\[[^\]]*)['"]?(?:CAP_)?(?:SYS_ADMIN|NET_ADMIN|SYS_PTRACE|SYS_MODULE|NET_RAW|DAC_READ_SEARCH|SYS_RAWIO|BPF)\b/,
  ['Dangerous Linux capability added', 'SYS_ADMIN, NET_ADMIN, SYS_PTRACE and similar give near-root power over the node.', 'Drop ALL and add only narrow capabilities you need.'],
  ['위험한 Linux capability를 추가합니다', 'SYS_ADMIN, NET_ADMIN, SYS_PTRACE 등은 노드에 root에 가까운 권한을 줍니다.', 'ALL을 버리고 필요한 좁은 capability만 추가하세요.'],
  '        add: ["SYS_ADMIN"]', '        drop: ["ALL"]');
R('host-path-volume', 'H', 'MA', 10, ['cwe-668', 'k8s'],
  /^\s*hostPath\s*:/,
  ['hostPath volume', 'Mounting host paths lets the container read or change node files.', 'Use a PersistentVolumeClaim, configMap or emptyDir.'],
  ['hostPath 볼륨입니다', '호스트 경로를 마운트하면 컨테이너가 노드 파일을 읽거나 바꿀 수 있습니다.', 'PersistentVolumeClaim, configMap, emptyDir을 쓰세요.'],
  '    hostPath:', '    emptyDir: {}');
R('docker-socket', 'V', 'CR', 15, ['cwe-250', 'k8s', 'docker'],
  /\/var\/run\/docker\.sock\b|\/run\/containerd\/containerd\.sock\b/,
  ['Container runtime socket mounted', 'Access to the runtime socket is root access to the host.', 'Do not mount the socket; use a rootless builder.'],
  ['컨테이너 런타임 소켓을 마운트합니다', '런타임 소켓 접근은 호스트의 root 접근입니다.', '소켓을 마운트하지 말고 rootless 빌더를 쓰세요.'],
  '      - /var/run/docker.sock:/var/run/docker.sock', '      - ./data:/data');
R('read-only-root-fs-false', 'H', 'MI', 5, ['k8s'],
  /^\s*readOnlyRootFilesystem\s*:\s*false\b/,
  ['Writable root filesystem', 'An attacker can drop tools into the container filesystem.', 'Set readOnlyRootFilesystem: true and mount writable paths explicitly.'],
  ['쓰기 가능한 루트 파일 시스템입니다', '공격자가 컨테이너 파일 시스템에 도구를 떨굴 수 있습니다.', 'readOnlyRootFilesystem: true로 두고 쓰기 경로는 명시적으로 마운트하세요.'],
  '  readOnlyRootFilesystem: false', '  readOnlyRootFilesystem: true');
R('automount-service-token', 'H', 'MI', 5, ['cwe-200', 'k8s'],
  /^\s*automountServiceAccountToken\s*:\s*true\b/,
  ['Service account token mounted', 'Every process in the pod can use the token against the API server.', 'Set automountServiceAccountToken: false unless the pod calls the API.'],
  ['서비스 계정 토큰을 마운트합니다', 'Pod의 모든 프로세스가 토큰으로 API 서버를 쓸 수 있습니다.', 'API를 부르지 않으면 automountServiceAccountToken: false로 두세요.'],
  'automountServiceAccountToken: true', 'automountServiceAccountToken: false');
R('unconfined-profile', 'V', 'MA', 10, ['cwe-693', 'k8s'],
  /^\s*type\s*:\s*Unconfined\b|\b(?:seccomp|apparmor)[\w./-]*\s*[:=]\s*['"]?unconfined\b/i,
  ['Seccomp / AppArmor unconfined', 'Without a profile the container can make any system call.', 'Use RuntimeDefault or a custom profile.'],
  ['Seccomp / AppArmor 제한 없음입니다', '프로필이 없으면 컨테이너가 어떤 시스템 호출이든 할 수 있습니다.', 'RuntimeDefault나 사용자 프로필을 쓰세요.'],
  '      type: Unconfined', '      type: RuntimeDefault');
R('host-port', 'H', 'MI', 5, ['cwe-668', 'k8s'],
  /^\s*hostPort\s*:\s*\d+/,
  ['hostPort used', 'hostPort binds the node\'s network and limits scheduling.', 'Use a Service instead.'],
  ['hostPort를 씁니다', 'hostPort는 노드 네트워크에 바인딩하고 스케줄링을 제한합니다.', '대신 Service를 쓰세요.'],
  '          hostPort: 8080', '          containerPort: 8080');
R('rbac-wildcard', 'V', 'CR', 15, ['cwe-269', 'owasp-a01', 'k8s'],
  /^\s*-?\s*(?:verbs|resources|apiGroups)\s*:\s*\[\s*['"]\*['"]\s*\]/,
  ['RBAC rule with a wildcard', '"*" grants every verb or resource, now and in future API versions.', 'List the verbs and resources the role needs.'],
  ['와일드카드가 있는 RBAC 규칙입니다', '"*"는 현재와 미래 API 버전의 모든 동작이나 리소스를 허용합니다.', '역할에 필요한 동작과 리소스를 나열하세요.'],
  '  verbs: ["*"]', '  verbs: ["get", "list"]');
R('cluster-admin-binding', 'H', 'CR', 15, ['cwe-269', 'owasp-a01', 'k8s'],
  /^\s*name\s*:\s*['"]?cluster-admin['"]?\s*$/,
  ['Binding to cluster-admin', 'cluster-admin can do anything in every namespace.', 'Bind a narrow Role or ClusterRole.'],
  ['cluster-admin에 바인딩합니다', 'cluster-admin은 모든 네임스페이스에서 무엇이든 할 수 있습니다.', '좁은 Role이나 ClusterRole을 바인딩하세요.'],
  '  name: cluster-admin', '  name: app-reader');
R('proc-mount-unmasked', 'V', 'CR', 15, ['cwe-250', 'k8s'],
  /^\s*procMount\s*:\s*Unmasked\b/,
  ['procMount: Unmasked', 'The container sees the host\'s full /proc.', 'Use the default procMount.'],
  ['procMount: Unmasked로 둡니다', '컨테이너가 호스트의 /proc 전체를 봅니다.', '기본 procMount를 쓰세요.'],
  '  procMount: Unmasked', '  procMount: Default');
R('default-namespace', 'S', 'MI', 2, ['k8s'],
  /^\s*namespace\s*:\s*['"]?default['"]?\s*$/,
  ['Resource in the default namespace', 'Mixing workloads in default makes RBAC and quotas hard to apply.', 'Use a dedicated namespace.'],
  ['default 네임스페이스의 리소스입니다', 'default에 워크로드를 섞으면 RBAC와 할당량을 적용하기 어렵습니다.', '전용 네임스페이스를 쓰세요.'],
  '  namespace: default', '  namespace: shop');
R('image-without-tag', 'S', 'MA', 5, ['supply-chain'],
  /^\s*-?\s*image\s*:\s*['"]?(?:[\w.-]+\/)*[\w.-]+['"]?\s*$/,
  ['Image without a tag or digest', 'An untagged image means :latest and changes without notice.', 'Pin a version tag, or better a digest.'],
  ['태그나 다이제스트 없는 이미지입니다', '태그 없는 이미지는 :latest이며 예고 없이 바뀝니다.', '버전 태그나 더 나아가 다이제스트로 고정하세요.'],
  '        image: nginx', ['        image: nginx:1.27.0', '        image: nginx@sha256:abc123', '        image: ${IMAGE}']);
R('plain-secret-value', 'V', 'CR', 20, ['cwe-798', 'secrets'],
  /^\s*-?\s*['"]?\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)\w*['"]?\s*[:=]\s*['"]?(?![$<{%(]|true\b|false\b|null\b|~|\s*$)[^\s'"#]{4,}/i,
  ['Secret value in YAML', 'Credentials in manifests end up in Git history and in every rendered copy.', 'Reference a Kubernetes Secret, a CI secret or a vault.'],
  ['YAML에 시크릿 값이 있습니다', '매니페스트의 자격 증명은 Git 이력과 렌더링된 모든 사본에 남습니다.', 'Kubernetes Secret, CI 시크릿, 금고를 참조하세요.'],
  '      DB_PASSWORD: hunter2secret', ['      DB_PASSWORD: ${DB_PASSWORD}', '      DB_PASSWORD: {{ .Values.db.password }}', '      secretKeyRef:', '      AUTH_TOKEN_TTL: 3600'],
  { skip: (raw) => /secretKeyRef|valueFrom|\b(?:TTL|EXPIRY|EXPIRES|LENGTH|HEADER|NAME|FILE|PATH|URL|ENDPOINT)\b\s*:/i.test(raw) || /:\s*\d+\s*$/.test(raw) });

// ── GitHub Actions ───────────────────────────────────────────
R('gha-unpinned-action', 'H', 'MI', 5, ['cwe-829', 'owasp-a08', 'supply-chain', 'github-actions'],
  /^\s*-?\s*uses\s*:\s*['"]?(?!\.\/|docker:\/\/|actions\/|github\/)[\w.-]+\/[\w.\/-]+@(?![0-9a-f]{40}\b)/,
  ['Third-party action not pinned to a commit', 'A tag or branch can be moved to malicious code after you review it.', 'Pin the action to a full commit SHA.'],
  ['외부 액션을 커밋에 고정하지 않았습니다', '태그나 브랜치는 검토 뒤 악성 코드로 옮겨질 수 있습니다.', '액션을 전체 커밋 SHA로 고정하세요.'],
  '      - uses: some-org/deploy-action@v2', ['      - uses: some-org/deploy-action@1f8e4b3a2c9d7e6f5a4b3c2d1e0f9a8b7c6d5e4f', '      - uses: actions/checkout@v4']);
R('gha-script-injection', 'V', 'CR', 20, ['cwe-94', 'owasp-a03', 'github-actions'],
  /\$\{\{\s*github\.(?:event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label|head\.repo\.default_branch)|comment\.body|review\.body|review_comment\.body|discussion\.(?:title|body)|pages\.[^}]*\.page_name|commits\.[^}]*\.(?:message|author\.(?:email|name))|head_commit\.(?:message|author\.(?:email|name))|workflow_run\.head_branch)|head_ref)\s*\}\}/,
  ['Untrusted event data in a workflow expression', 'Titles, bodies and branch names are attacker-controlled; expanded into run: they execute as shell.', 'Pass the value through env: and quote "$VAR" in the script.'],
  ['워크플로 식에 신뢰할 수 없는 이벤트 데이터가 있습니다', '제목, 본문, 브랜치 이름은 공격자가 정하며 run:에 펼치면 셸로 실행됩니다.', 'env:로 값을 넘기고 스크립트에서 "$VAR"로 따옴표 처리하세요.'],
  '        run: echo "${{ github.event.issue.title }}"', '        run: echo "$TITLE"');
R('gha-pull-request-target', 'H', 'MA', 10, ['cwe-829', 'github-actions'],
  /^\s*-?\s*pull_request_target\s*:?|\bon\s*:\s*\[?[^\]#]*\bpull_request_target\b/,
  ['pull_request_target trigger', 'The workflow runs with secrets and write access on code from forks.', 'Use pull_request, or never check out the PR head in this workflow.'],
  ['pull_request_target 트리거입니다', '포크의 코드에 대해 시크릿과 쓰기 권한으로 워크플로가 실행됩니다.', 'pull_request를 쓰거나 이 워크플로에서 PR head를 체크아웃하지 마세요.'],
  '  pull_request_target:', '  pull_request:');
R('gha-write-all', 'V', 'MA', 10, ['cwe-269', 'github-actions'],
  /^\s*permissions\s*:\s*write-all\b/,
  ['permissions: write-all', 'Every step gets a token that can push code and change settings.', 'Grant only the scopes needed, for example contents: read.'],
  ['permissions: write-all로 둡니다', '모든 단계가 코드를 푸시하고 설정을 바꿀 수 있는 토큰을 받습니다.', 'contents: read처럼 필요한 범위만 주세요.'],
  'permissions: write-all', 'permissions:');
R('gha-secrets-inherit', 'H', 'MI', 5, ['cwe-200', 'github-actions'],
  /^\s*secrets\s*:\s*inherit\b/,
  ['secrets: inherit', 'The called workflow receives every secret of the caller.', 'Pass only the secrets it needs.'],
  ['secrets: inherit로 넘깁니다', '호출된 워크플로가 호출자의 모든 시크릿을 받습니다.', '필요한 시크릿만 넘기세요.'],
  '    secrets: inherit', '    secrets:');
R('gha-unsecure-commands', 'V', 'CR', 15, ['cwe-94', 'github-actions'],
  /ACTIONS_ALLOW_UNSECURE_COMMANDS\s*:\s*['"]?true|::(?:set-env|add-path)\s/i,
  ['Deprecated set-env / add-path commands', 'These workflow commands let log output inject environment variables.', 'Write to $GITHUB_ENV and $GITHUB_PATH.'],
  ['사용 중단된 set-env / add-path 명령입니다', '이 워크플로 명령은 로그 출력이 환경 변수를 주입하게 합니다.', '$GITHUB_ENV와 $GITHUB_PATH에 쓰세요.'],
  '      ACTIONS_ALLOW_UNSECURE_COMMANDS: true', '      run: echo "FOO=bar" >> "$GITHUB_ENV"');
R('curl-pipe-shell', 'V', 'CR', 20, ['cwe-494', 'owasp-a08'],
  /\b(?:curl|wget)\b[^|#]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
  ['Remote script piped to a shell', 'Whatever the server returns runs with the job\'s rights.', 'Download, verify a checksum, then run.'],
  ['원격 스크립트를 셸로 파이프합니다', '서버가 돌려준 무엇이든 작업 권한으로 실행됩니다.', '내려받아 체크섬을 확인한 뒤 실행하세요.'],
  '      - run: curl -sSL https://get.example.com | bash', '      - run: ./scripts/install.sh');

// ── GitLab CI ────────────────────────────────────────────────
R('gitlab-ssl-no-verify', 'V', 'CR', 15, ['cwe-295', 'gitlab-ci'],
  /^\s*GIT_SSL_NO_VERIFY\s*:\s*['"]?(?:true|1)\b/i,
  ['GIT_SSL_NO_VERIFY set', 'Git accepts any certificate for clones and fetches.', 'Remove it and add the CA with CI_SERVER_TLS_CA_FILE.'],
  ['GIT_SSL_NO_VERIFY를 설정합니다', 'Git이 clone과 fetch에서 아무 인증서나 받아들입니다.', '지우고 CI_SERVER_TLS_CA_FILE로 CA를 추가하세요.'],
  '  GIT_SSL_NO_VERIFY: "true"', '  GIT_DEPTH: "10"');
R('dind-without-tls', 'V', 'MA', 10, ['cwe-319', 'gitlab-ci', 'docker'],
  /^\s*DOCKER_TLS_CERTDIR\s*:\s*(?:""|'')\s*$|^\s*DOCKER_HOST\s*:\s*['"]?tcp:\/\/[^:'"]+:2375\b/,
  ['Docker-in-Docker without TLS', 'The Docker daemon listens unencrypted and unauthenticated on 2375.', 'Keep DOCKER_TLS_CERTDIR="/certs" and use port 2376.'],
  ['TLS 없는 Docker-in-Docker입니다', 'Docker 데몬이 2375 포트에서 암호화와 인증 없이 듣습니다.', 'DOCKER_TLS_CERTDIR="/certs"를 유지하고 2376 포트를 쓰세요.'],
  '  DOCKER_HOST: tcp://docker:2375', '  DOCKER_HOST: tcp://docker:2376');
R('ci-debug-trace', 'V', 'MA', 10, ['cwe-532', 'gitlab-ci'],
  /^\s*CI_DEBUG_TRACE\s*:\s*['"]?true\b|^\s*CI_DEBUG_SERVICES\s*:\s*['"]?true\b/i,
  ['CI debug tracing on', 'Debug traces print every variable, including masked secrets, into the job log.', 'Turn it off after debugging.'],
  ['CI 디버그 추적을 켭니다', '디버그 추적은 가린 시크릿을 포함한 모든 변수를 작업 로그에 찍습니다.', '디버깅 뒤 끄세요.'],
  '  CI_DEBUG_TRACE: "true"', '  CI_DEBUG_TRACE: "false"');
R('allow-failure', 'S', 'IN', 2, ['gitlab-ci'],
  /^\s*allow_failure\s*:\s*true\b/,
  ['Job allowed to fail', 'Failures in this job never block the pipeline and are easy to ignore.', 'Fix the job or remove allow_failure.'],
  ['실패를 허용한 작업입니다', '이 작업의 실패는 파이프라인을 막지 않아 무시되기 쉽습니다.', '작업을 고치거나 allow_failure를 지우세요.'],
  '  allow_failure: true', '  allow_failure: false');

// ── Docker Compose ───────────────────────────────────────────
R('compose-network-host', 'V', 'MA', 10, ['cwe-668', 'docker'],
  /^\s*network_mode\s*:\s*['"]?host\b/,
  ['network_mode: host', 'The container shares the host network stack and every host port.', 'Use a bridge network and publish only needed ports.'],
  ['network_mode: host로 둡니다', '컨테이너가 호스트 네트워크 스택과 모든 포트를 공유합니다.', 'bridge 네트워크를 쓰고 필요한 포트만 공개하세요.'],
  '    network_mode: host', '    network_mode: bridge');
R('compose-pid-host', 'V', 'MA', 10, ['cwe-250', 'docker'],
  /^\s*(?:pid|ipc)\s*:\s*['"]?host\b/,
  ['pid / ipc: host', 'The container sees host processes or shared memory.', 'Remove the setting.'],
  ['pid / ipc: host로 둡니다', '컨테이너가 호스트 프로세스나 공유 메모리를 봅니다.', '설정을 지우세요.'],
  '    pid: host', '    init: true');
R('compose-root-user', 'H', 'MA', 10, ['cwe-250', 'docker'],
  /^\s*user\s*:\s*['"]?(?:root|0)(?::(?:root|0))?['"]?\s*$/,
  ['Service runs as root', 'A compromised process has root inside the container.', 'Run as an unprivileged user, for example user: "1000:1000".'],
  ['서비스가 root로 실행됩니다', '침해된 프로세스가 컨테이너 안에서 root를 가집니다.', '권한 없는 사용자로 실행하세요. 예: user: "1000:1000".'],
  '    user: root', '    user: "1000:1000"');
R('compose-privileged-port-all-interfaces', 'H', 'MI', 5, ['cwe-668', 'docker'],
  /^\s*-\s*['"]?(?:0\.0\.0\.0:)?(?:3306|5432|6379|27017|9200|11211|5672|2375)\s*:\s*\d+/,
  ['Database or admin port published', 'Publishing database ports exposes them on every host interface.', 'Keep them on an internal network or bind to 127.0.0.1.'],
  ['데이터베이스나 관리 포트를 공개합니다', '데이터베이스 포트를 공개하면 호스트의 모든 인터페이스에 노출됩니다.', '내부 네트워크에 두거나 127.0.0.1에 바인딩하세요.'],
  '      - "5432:5432"', '      - "127.0.0.1:5432:5432"');

// ── Generic configuration ────────────────────────────────────
R('http-url', 'H', 'MI', 5, ['cwe-319', 'owasp-a02'],
  /:\s*['"]?http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w-]+(?::\d+)?(?:\/|['"]?\s*$))/,
  ['Endpoint over plain HTTP', 'Traffic to this URL can be read and changed on the network.', 'Use https.'],
  ['평문 HTTP 엔드포인트입니다', '이 URL로 가는 통신은 네트워크에서 읽히고 바뀔 수 있습니다.', 'https를 쓰세요.'],
  '  url: http://api.example.com/v1', ['  url: https://api.example.com/v1', '  url: http://backend:8080/v1']);
R('debug-enabled', 'H', 'MI', 5, ['cwe-489', 'owasp-a05'],
  /^\s*(?:debug|DEBUG|show[-_]sql|include[-_]stacktrace|include[-_]exception)\s*:\s*['"]?(?:true|always|on)\b/,
  ['Debug output enabled in configuration', 'Debug settings expose stack traces, SQL and internals.', 'Turn them off in production profiles.'],
  ['설정에서 디버그 출력을 켭니다', '디버그 설정은 스택 추적, SQL, 내부 정보를 노출합니다.', '운영 프로필에서는 끄세요.'],
  'debug: true', 'debug: false');
R('actuator-exposed', 'H', 'MA', 10, ['cwe-200', 'owasp-a05', 'spring'],
  /^\s*include\s*:\s*['"]?\*['"]?\s*$/,
  ['All management endpoints exposed', 'include: "*" publishes env, heapdump and other sensitive actuator endpoints.', 'List only health and info.'],
  ['모든 관리 엔드포인트를 노출합니다', 'include: "*"는 env, heapdump 등 민감한 actuator 엔드포인트를 공개합니다.', 'health와 info만 나열하세요.'],
  '        include: "*"', '        include: health,info');
R('truthy-value', 'S', 'MI', 2, ['pitfall'],
  /^\s*[\w.-]+\s*:\s*(?:yes|no|on|off|Yes|No|On|Off|YES|NO|ON|OFF|y|n|Y|N)\s*$/,
  ['Ambiguous YAML 1.1 boolean', 'yes / no / on / off are booleans in YAML 1.1 but strings in 1.2; parsers disagree (the Norway problem).', 'Write true / false, or quote the string.'],
  ['모호한 YAML 1.1 불리언입니다', 'yes / no / on / off는 YAML 1.1에서는 불리언이고 1.2에서는 문자열이라 파서마다 다릅니다(노르웨이 문제).', 'true / false로 쓰거나 문자열에 따옴표를 붙이세요.'],
  'country: NO', ['enabled: true', 'country: "NO"']);
R('tab-indentation', 'B', 'MA', 2, ['syntax'],
  /^\t+\S/,
  ['Tab used for indentation', 'YAML forbids tabs for indentation; parsers reject the file.', 'Indent with spaces.'],
  ['들여쓰기에 탭을 씁니다', 'YAML은 들여쓰기에 탭을 금지해 파서가 파일을 거부합니다.', '공백으로 들여쓰세요.'],
  '\tname: web', '  name: web');

module.exports = { RULES: R.rules };
