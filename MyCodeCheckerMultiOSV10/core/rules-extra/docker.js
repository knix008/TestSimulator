'use strict';

// Dockerfile / Containerfile.

const { maker } = require('./util');

const R = maker('docker', ['docker']);

R('user-root', 'H', 'MA', 10, ['cwe-250'],
  /^\s*USER\s+(?:root|0)(?::\S+)?\s*$/i,
  ['Image switches to root', 'Processes in the container run as root and a breakout gets root on the host more easily.', 'Create an unprivileged user and switch to it with USER.'],
  ['이미지가 root로 전환합니다', '컨테이너 프로세스가 root로 실행되어 탈출 시 호스트 root를 얻기 쉽습니다.', '권한 없는 사용자를 만들고 USER로 전환하세요.'],
  'USER root', 'USER app');
R('add-instead-of-copy', 'S', 'MI', 2, ['best-practice'],
  /^\s*ADD\s+(?:--\S+\s+)*(?!https?:\/\/|git@)(?![^\s]*\.(?:tar|tar\.gz|tgz|tar\.bz2|tbz2?|tar\.xz|txz|tar\.zst)(?:\s|$))\S+\s+\S+/i,
  ['ADD used for local files', 'ADD also extracts archives and fetches URLs, which surprises readers.', 'Use COPY for plain files.'],
  ['로컬 파일에 ADD를 씁니다', 'ADD는 압축을 풀고 URL도 가져와 독자를 놀라게 합니다.', '일반 파일에는 COPY를 쓰세요.'],
  'ADD package.json /app/', ['COPY package.json /app/', 'ADD rootfs.tar.gz /']);
R('apt-no-install-recommends', 'S', 'MI', 2, ['size'],
  /\bapt-get\s+(?:-\S+\s+)*install\b(?![^&;|]*--no-install-recommends)/,
  ['apt-get install without --no-install-recommends', 'Recommended packages bloat the image and its attack surface.', 'Add --no-install-recommends.'],
  ['--no-install-recommends 없는 apt-get install입니다', '권장 패키지가 이미지와 공격 면을 키웁니다.', '--no-install-recommends를 추가하세요.'],
  'RUN apt-get install -y curl', 'RUN apt-get install -y --no-install-recommends curl');
R('apt-upgrade', 'S', 'MI', 2, ['reproducibility'],
  /\bapt-get\s+(?:-\S+\s+)*(?:dist-)?upgrade\b|\bapk\s+upgrade\b|\b(?:yum|dnf)\s+(?:-\S+\s+)*update\b(?!\s*-y?\s*--security)/,
  ['Package upgrade inside the build', 'Upgrading in the Dockerfile makes builds unreproducible.', 'Update the base image tag instead.'],
  ['빌드 안에서 패키지를 업그레이드합니다', 'Dockerfile에서 업그레이드하면 빌드를 재현할 수 없습니다.', '대신 기본 이미지 태그를 올리세요.'],
  'RUN apt-get upgrade -y', 'RUN apt-get update && apt-get install -y --no-install-recommends curl');
R('apt-lists-not-removed', 'S', 'IN', 2, ['size'],
  /\bapt-get\s+(?:-\S+\s+)*install\b(?!.*\/var\/lib\/apt\/lists)/,
  ['apt cache left in the layer', 'Package lists stay in the image unless removed in the same RUN.', 'End the RUN with && rm -rf /var/lib/apt/lists/*.'],
  ['apt 캐시가 레이어에 남습니다', '같은 RUN에서 지우지 않으면 패키지 목록이 이미지에 남습니다.', 'RUN 끝에 && rm -rf /var/lib/apt/lists/*를 붙이세요.'],
  'RUN apt-get update && apt-get install -y --no-install-recommends git', 'RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*',
  { skip: (raw) => /\\\s*$/.test(raw) });
R('pip-cache', 'S', 'IN', 1, ['size'],
  /\bpip3?\s+install\b(?![^&;|]*--no-cache-dir)(?![^&;|]*-r\s*\S*requirements[^&;|]*--no-cache-dir)/,
  ['pip install keeps its cache', 'The pip cache adds megabytes to the layer.', 'Add --no-cache-dir.'],
  ['pip install이 캐시를 남깁니다', 'pip 캐시가 레이어에 수 MB를 더합니다.', '--no-cache-dir을 추가하세요.'],
  'RUN pip install -r requirements.txt', 'RUN pip install --no-cache-dir -r requirements.txt',
  { skip: (raw) => /PIP_NO_CACHE_DIR/.test(raw) });
R('apk-cache', 'S', 'IN', 1, ['size'],
  /\bapk\s+add\b(?![^&;|]*--no-cache)/,
  ['apk add keeps its index', 'The package index stays in the layer.', 'Use apk add --no-cache.'],
  ['apk add가 인덱스를 남깁니다', '패키지 인덱스가 레이어에 남습니다.', 'apk add --no-cache를 쓰세요.'],
  'RUN apk add curl', 'RUN apk add --no-cache curl');
R('curl-pipe-shell', 'V', 'CR', 20, ['cwe-494', 'owasp-a08'],
  /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
  ['Remote script piped to a shell', 'Whatever the server returns at build time runs in the image.', 'Download a pinned file, verify its checksum, then run it.'],
  ['원격 스크립트를 셸로 파이프합니다', '빌드 시점에 서버가 돌려준 무엇이든 이미지에서 실행됩니다.', '고정된 파일을 받아 체크섬을 확인한 뒤 실행하세요.'],
  'RUN curl -fsSL https://get.example.com/install.sh | sh', 'RUN curl -fsSLo install.sh https://get.example.com/v1.2/install.sh && sha256sum -c install.sha256 && sh install.sh');
R('tls-verification-off', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /\bcurl\b[^|;&]*\s(?:-k|--insecure)(?=\s|$)|\bwget\b[^|;&]*--no-check-certificate\b|NODE_TLS_REJECT_UNAUTHORIZED[= ]+['"]?0|PYTHONHTTPSVERIFY[= ]+['"]?0|GIT_SSL_NO_VERIFY[= ]+['"]?(?:1|true)|\bnpm\s+config\s+set\s+strict-ssl\s+false/i,
  ['TLS verification turned off', 'Downloads during the build accept any certificate.', 'Keep verification on and add the CA certificate to the image.'],
  ['TLS 검증을 끕니다', '빌드 중 내려받기가 아무 인증서나 받아들입니다.', '검증을 켜 두고 CA 인증서를 이미지에 추가하세요.'],
  'RUN curl -k -o app.tgz https://repo.internal/app.tgz', 'RUN curl -o app.tgz https://repo.internal/app.tgz');
R('package-signature-bypass', 'V', 'CR', 15, ['cwe-494', 'owasp-a08', 'supply-chain'],
  /--allow-unauthenticated\b|--nogpgcheck\b|--allow-insecure-repositories\b|--trusted-host\b|\bgpgcheck\s*=\s*0\b|--force-yes\b/,
  ['Package signature check bypassed', 'Unsigned packages from a tampered mirror install silently.', 'Remove the flag and import the repository key.'],
  ['패키지 서명 검사를 우회합니다', '변조된 미러의 서명 없는 패키지가 조용히 설치됩니다.', '플래그를 지우고 저장소 키를 가져오세요.'],
  'RUN apt-get install -y --allow-unauthenticated tool', 'RUN apt-get install -y --no-install-recommends tool');
R('chmod-777', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\bchmod\s+(?:-[A-Za-z]+\s+)*(?:0?777|a\+rwx|o\+w)(?=\s|$)/,
  ['World-writable permissions in the image', 'Any process in the container can change these files.', 'Use 755 / 644 and the right owner.'],
  ['이미지에 모두 쓸 수 있는 권한을 줍니다', '컨테이너의 아무 프로세스나 이 파일을 바꿀 수 있습니다.', '755 / 644와 올바른 소유자를 쓰세요.'],
  'RUN chmod -R 777 /app', 'RUN chown -R app:app /app && chmod -R 755 /app');
R('expose-ssh', 'H', 'MI', 5, ['cwe-668'],
  /^\s*EXPOSE\b[^#\n]*\b22(?:\/tcp)?\b/i,
  ['SSH port exposed', 'Running sshd in a container widens the attack surface.', 'Use docker exec / kubectl exec instead of SSH.'],
  ['SSH 포트를 노출합니다', '컨테이너에서 sshd를 돌리면 공격 면이 넓어집니다.', 'SSH 대신 docker exec / kubectl exec를 쓰세요.'],
  'EXPOSE 22 8080', 'EXPOSE 8080');
R('workdir-relative', 'S', 'MI', 2, ['best-practice'],
  /^\s*WORKDIR\s+(?![\/$"']|[A-Za-z]:[\\/])\S/i,
  ['Relative WORKDIR', 'A relative WORKDIR depends on the previous one and is easy to misread.', 'Use an absolute path.'],
  ['상대 경로 WORKDIR입니다', '상대 WORKDIR은 이전 값에 의존해 잘못 읽기 쉽습니다.', '절대 경로를 쓰세요.'],
  'WORKDIR app', 'WORKDIR /app');
R('cd-in-run', 'S', 'MI', 2, ['best-practice'],
  /^\s*RUN\s+cd\s+\S+/i,
  ['cd in RUN', 'cd only lasts for that RUN, which hides the working directory.', 'Use WORKDIR.'],
  ['RUN에서 cd를 씁니다', 'cd는 그 RUN에서만 유효해 작업 폴더를 숨깁니다.', 'WORKDIR을 쓰세요.'],
  'RUN cd /app && npm ci', 'WORKDIR /app');
R('maintainer', 'S', 'IN', 1, ['deprecated'],
  /^\s*MAINTAINER\b/i,
  ['MAINTAINER is deprecated', 'The instruction is deprecated in favor of labels.', 'Use LABEL org.opencontainers.image.authors="...".'],
  ['MAINTAINER는 사용 중단됐습니다', '이 명령은 레이블로 대체되어 사용 중단됐습니다.', 'LABEL org.opencontainers.image.authors="..."를 쓰세요.'],
  'MAINTAINER dev@example.com', 'LABEL org.opencontainers.image.authors="dev@example.com"');
R('shell-form-entrypoint', 'S', 'MI', 2, ['best-practice'],
  /^\s*(?:CMD|ENTRYPOINT)\s+(?!\[)\S/i,
  ['CMD / ENTRYPOINT in shell form', 'The shell form runs under /bin/sh -c, so the app does not receive SIGTERM.', 'Use the exec form: CMD ["node", "server.js"].'],
  ['셸 형식의 CMD / ENTRYPOINT입니다', '셸 형식은 /bin/sh -c 아래에서 실행되어 앱이 SIGTERM을 받지 못합니다.', 'exec 형식을 쓰세요: CMD ["node", "server.js"].'],
  'CMD npm start', 'CMD ["npm", "start"]');
R('arg-secret', 'V', 'CR', 15, ['cwe-214', 'secrets'],
  /^\s*ARG\s+\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)\w*/i,
  ['Secret passed as a build ARG', 'Build arguments are stored in the image history for anyone who pulls it.', 'Use RUN --mount=type=secret.'],
  ['빌드 ARG로 시크릿을 넘깁니다', '빌드 인자는 이미지를 받는 누구에게나 이력으로 보입니다.', 'RUN --mount=type=secret을 쓰세요.'],
  'ARG NPM_TOKEN', 'ARG NODE_VERSION=20');
R('copy-everything', 'H', 'MI', 5, ['cwe-538'],
  /^\s*(?:COPY|ADD)\s+(?:--\S+\s+)*\.\s+\S+/i,
  ['Whole build context copied', 'COPY . can pull .env files, keys and .git into the image.', 'Copy only what is needed, or keep a strict .dockerignore.'],
  ['빌드 컨텍스트 전체를 복사합니다', 'COPY .는 .env, 키, .git을 이미지로 가져올 수 있습니다.', '필요한 것만 복사하거나 엄격한 .dockerignore를 두세요.'],
  'COPY . /app', 'COPY src/ /app/src/');
R('npm-install', 'S', 'MI', 2, ['reproducibility'],
  /\bnpm\s+(?:install|i)\b(?!\s+(?:-g|--global)\b)(?![^&;|]*\s[@\w][\w@\/.-]*@\d)/,
  ['npm install in an image', 'npm install may change the lockfile and resolve different versions.', 'Use npm ci.'],
  ['이미지에서 npm install을 씁니다', 'npm install은 lockfile을 바꾸고 다른 버전을 고를 수 있습니다.', 'npm ci를 쓰세요.'],
  'RUN npm install', ['RUN npm ci --omit=dev', 'RUN npm install -g pnpm@9.1.0']);
R('http-download', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /\b(?:curl|wget)\b[^|;&]*\bhttp:\/\/(?!localhost|127\.0\.0\.1)/i,
  ['Download over plain HTTP', 'Files fetched over HTTP can be replaced on the network.', 'Use https and verify a checksum.'],
  ['평문 HTTP로 내려받습니다', 'HTTP로 받은 파일은 네트워크에서 바꿔치기될 수 있습니다.', 'https를 쓰고 체크섬을 확인하세요.'],
  'RUN wget http://downloads.example.com/tool.tgz', 'RUN wget https://downloads.example.com/tool.tgz');
R('key-file-copied', 'V', 'CR', 20, ['cwe-798', 'secrets'],
  /^\s*(?:COPY|ADD)\b[^#\n]*(?:\bid_(?:rsa|dsa|ecdsa|ed25519)\b|\.pem\b|\.key\b|\.p12\b|\.pfx\b|\.env\b|\.npmrc\b|\.pypirc\b|credentials\b)/i,
  ['Key or credential file copied into the image', 'Anyone who pulls the image gets the key.', 'Mount it at build time with --mount=type=secret, or inject at run time.'],
  ['키나 자격 증명 파일을 이미지에 복사합니다', '이미지를 받는 누구나 키를 얻습니다.', '빌드 시 --mount=type=secret으로 마운트하거나 실행 시 주입하세요.'],
  'COPY id_rsa /root/.ssh/id_rsa', ['COPY known_hosts /root/.ssh/known_hosts', 'COPY .env.example /app/.env.example'],
  // Templates (.env.example) and CA / public certificates are not secrets.
  { skip: (raw) => !/^\s*(?:COPY|ADD)\b[^#\n]*(?:\bid_(?:rsa|dsa|ecdsa|ed25519)\b(?!\.pub)|(?<!\b(?:ca|cacert|cert|certs?|chain|fullchain|bundle|public|pub|root-ca|ca-bundle))\.pem\b|\.key\b|\.p12\b|\.pfx\b|\.env\b(?!\.(?:example|sample|template|dist|defaults)\b)|\.npmrc\b|\.pypirc\b|credentials\b)/i.test(raw) });
R('healthcheck-none', 'S', 'IN', 1, ['reliability'],
  /^\s*HEALTHCHECK\s+NONE\b/i,
  ['HEALTHCHECK NONE', 'Disabling the health check hides a hung container from the orchestrator.', 'Define a HEALTHCHECK that probes the service.'],
  ['HEALTHCHECK NONE입니다', '상태 검사를 끄면 멈춘 컨테이너를 오케스트레이터가 알 수 없습니다.', '서비스를 확인하는 HEALTHCHECK를 정의하세요.'],
  'HEALTHCHECK NONE', 'HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1');
R('from-platform-hardcoded', 'S', 'IN', 1, ['portability'],
  /^\s*FROM\s+--platform=(?!\$)\S+/i,
  ['FROM with a fixed --platform', 'A hard-coded platform breaks multi-architecture builds.', 'Use --platform=$BUILDPLATFORM / $TARGETPLATFORM.'],
  ['--platform이 고정된 FROM입니다', '고정 플랫폼은 다중 아키텍처 빌드를 깨뜨립니다.', '--platform=$BUILDPLATFORM / $TARGETPLATFORM을 쓰세요.'],
  'FROM --platform=linux/amd64 node:20', 'FROM --platform=$BUILDPLATFORM node:20');

module.exports = { RULES: R.rules };
