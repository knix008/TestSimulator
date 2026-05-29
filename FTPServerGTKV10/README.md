# FTPServerGTK

Linux / macOS용 GTK3 기반 FTP 서버 관리 도구입니다.  
Windows 버전(`FTPServerWinV10`)과 동일한 기능을 제공합니다.

## 지원 프로토콜

| 프로토콜 | 기본 포트 | 설명 |
|---------|---------|------|
| FTP     | 21      | RFC 959 일반 파일 전송 |
| FTPS    | 990     | Implicit TLS (PKCS#12 인증서) |
| SFTP    | 22      | SSH File Transfer Protocol (libssh) |

세 프로토콜을 동시에 실행할 수 있으며 포트를 각각 변경할 수 있습니다.

## 주요 기능

- **공유 폴더 관리**: 가상 이름 → 실제 경로 매핑 (다중 폴더 지원)
- **사용자 관리**: 읽기 / 쓰기 권한 독립 설정, 익명 접근 옵션
- **FTPS 인증서**: PKCS#12(.pfx) 자체 서명 인증서 생성 또는 외부 파일 사용
- **SFTP 호스트 키**: RSA 2048-bit 키 자동 생성 및 SHA-256 지문 표시
- **프로파일 저장/불러오기**: JSON 형식으로 여러 설정 프로파일 관리
- **실시간 로그**: 어두운 테마 로그 창, 복사 및 파일 저장 지원
- **접속 통계**: 현재/누적 접속 수, 업로드/다운로드 바이트

## 빌드

### 의존 패키지 설치 및 빌드 (한 번에)

```bash
make
```

`make` 실행 시 누락된 패키지(`libgtk-3-dev`, `libssl-dev`, `libssh-dev`, `libjson-c-dev`)를
자동으로 감지하여 `sudo apt-get install`로 설치한 후 빌드합니다.

### 패키지만 설치

```bash
make install-packages
```

### 빌드만 실행 (패키지 미설치)

```bash
make all
```

### 빌드 결과물 삭제

```bash
make clean
```

## 실행

```bash
./build/FTPServerGTK
```

## 설정 파일 위치

| 파일 | 경로 |
|------|------|
| 기본 설정 | `~/.config/FTPServerGTK/settings.json` |
| 프로파일  | `~/.config/FTPServerGTK/profiles/<name>.json` |
| SFTP 호스트 키 | `~/.config/FTPServerGTK/ssh_host_rsa_key` |
| 서버 로그 | `~/.config/FTPServerGTK/ftpserver.log` |

## 의존 라이브러리

- GTK+ 3 (`libgtk-3-dev`)
- OpenSSL (`libssl-dev`) — FTPS 및 자체 서명 인증서 생성
- libssh (`libssh-dev`) — SFTP 서버
- json-c (`libjson-c-dev`) — JSON 설정 파일

## 플랫폼

- **Linux**: Ubuntu 22.04 / 24.04 이상 권장
- **macOS**: Homebrew로 동일 패키지 설치 후 빌드 가능  
  ```bash
  brew install gtk+3 openssl libssh json-c
  ```

## Windows 버전과의 설정 호환

프로파일 JSON 형식이 Windows 버전(`FTPServerWinV10`)과 호환됩니다.  
`SettingsVersion: 2` 파일을 그대로 사용할 수 있습니다.
