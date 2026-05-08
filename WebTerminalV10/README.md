# WebTerminalV10

Node.js 기반 웹 내장 터미널 예제입니다.  
브라우저에서 터미널을 사용하고, 기본값으로 `localhost`에 연결할 수 있습니다.

## 기능

- 웹 페이지 내 터미널 UI (`xterm.js`)
- 기본 `localhost` 연결 시 로컬 셸 실행
- 원격 호스트 입력 시 SSH 연결 (`username/password`)
- WebSocket 기반 실시간 입출력

## 요구사항

- Node.js 18+ 권장
- Linux/macOS 환경 권장 (로컬 셸 실행)

## 설치

```bash
npm install
```

## 실행

```bash
npm start
```

브라우저에서 아래 주소로 접속:

- [http://localhost:3000](http://localhost:3000)

## 사용 방법

1. 페이지 접속 후 `Connect` 클릭
2. 기본값(`localhost`)이면 로컬 셸에 연결
3. 원격 서버 접속 시 아래 입력 후 `Connect`
   - `Host` (예: `192.168.0.10`)
   - `Port` (기본 `22`)
   - `SSH username`
   - `SSH password`

## 주의사항

- 현재 구현은 간단한 데모/개발용입니다.
- 운영 환경에서는 인증/권한/감사 로그/비밀정보 처리(키 관리 등)를 강화해야 합니다.

