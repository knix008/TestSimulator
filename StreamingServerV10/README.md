# Streaming Server V10

WebRTC SFU 기반 다채널 스트리밍 서버입니다.  
채널 생성/관리, 비밀번호 보호, 실시간 방송 및 다수 시청자 지원을 제공합니다.

---

## 기술 스택

| 구성 | 라이브러리 | 역할 |
|------|-----------|------|
| 런타임 | Node.js | 서버 실행 환경 |
| SFU | mediasoup v3 | WebRTC 미디어 라우팅 |
| 시그널링 | Socket.io v4 | 실시간 양방향 통신 |
| HTTP | Express v4 | REST API 및 정적 파일 서빙 |
| 클라이언트 | mediasoup-client v3 | 브라우저 WebRTC 연결 |
| 빌더 | esbuild | 클라이언트 번들 |

## 아키텍처

```
방송자 (Producer)
    │
    │  WebRTC (UDP/TCP)
    ▼
┌─────────────────────────────┐
│     mediasoup SFU Router    │  ← 채널당 1개
│  (트랜스코딩 없이 전달만)     │
└─────────────────────────────┘
    │
    │  WebRTC (UDP/TCP) × N
    ▼
시청자1, 시청자2, 시청자3, ...

서버 역할: 채널 관리 + WebRTC 신호(SDP/ICE) 중계
미디어 데이터: 서버를 경유하나 전달(포워딩)만 수행, 재인코딩 없음
```

## 디렉토리 구조

```
StreamingServerV10/
├── src/
│   ├── index.js            # 서버 진입점
│   ├── config.js           # 서버/mediasoup 설정
│   ├── ChannelManager.js   # 채널 CRUD, 비밀번호 관리
│   ├── mediasoupManager.js # Worker/Router/Transport 생성
│   └── signalingServer.js  # Socket.io 이벤트 핸들러
├── client/
│   ├── broadcaster.js      # 방송자 클라이언트 소스
│   └── viewer.js           # 시청자 클라이언트 소스
├── public/
│   ├── index.html          # 채널 목록 + 시청 페이지
│   ├── broadcast.html      # 방송 페이지
│   └── bundle/             # 빌드 결과물 (자동 생성, git 제외)
└── scripts/
    └── build-client.js     # esbuild 번들 스크립트
```

---

## 시작하기

### 요구사항

- Node.js 18 이상
- npm 9 이상

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 클라이언트 번들 빌드
npm run build:client

# 서버 실행
npm start
```

브라우저에서 `http://localhost:3000` 접속.

### 개발 모드 (핫 리로드)

```bash
npm run dev
```

> 코드 변경 시 서버가 자동 재시작됩니다. 클라이언트 코드 변경 시에는 `npm run build:client`를 별도로 실행해야 합니다.

---

## 설정

### 포트 변경

```bash
PORT=8080 npm start
```

### LAN / 인터넷 배포

mediasoup은 클라이언트에게 자신의 IP를 알려줘야 WebRTC 연결이 성립됩니다.  
`ANNOUNCED_IP` 환경 변수에 서버의 실제 IP를 지정하세요.

```bash
# LAN 내부 서버인 경우
ANNOUNCED_IP=192.168.1.100 npm start

# 공인 IP가 있는 경우
ANNOUNCED_IP=203.0.113.10 npm start
```

또는 `src/config.js`에서 직접 수정:

```js
server: {
  announcedIp: '192.168.1.100',
}
```

### RTC 포트 범위

mediasoup이 사용하는 UDP/TCP 포트 범위는 기본값이 **40000–49999** 입니다.  
방화벽/라우터에서 해당 범위를 열어주어야 합니다.

`src/config.js`에서 변경 가능:

```js
workerSettings: {
  rtcMinPort: 40000,
  rtcMaxPort: 49999,
}
```

---

## 채널 관리

### 채널 생성

1. `/broadcast.html` 접속
2. 채널명, 설명(선택), 비밀번호(선택) 입력
3. **채널 생성** 클릭

채널 생성 시 서버에서 `ownerToken`을 발급합니다.  
이 토큰은 브라우저의 `localStorage`에 저장되며, 비밀번호 변경과 채널 삭제에 사용됩니다.

### 비밀번호 관리

| 동작 | 방법 |
|------|------|
| 비밀번호 설정 / 변경 | "채널 관리" 영역에서 새 비밀번호 입력 후 **변경** |
| 비밀번호 제거 | 비밀번호 필드를 비운 채 **변경** |

### 채널 삭제

"채널 관리" 영역의 **채널 삭제** 버튼을 클릭합니다.  
삭제 시 모든 시청자에게 알림이 전송됩니다.

---

## Socket.io 이벤트 API

클라이언트에서 직접 Socket.io를 사용하는 경우 참고하세요.  
모든 이벤트는 `(data, callback)` 형식이며, callback은 `{ error }` 또는 결과를 반환합니다.

### 채널 관리

| 이벤트 | 데이터 | 응답 |
|--------|--------|------|
| `getChannels` | `{}` | `{ channels[] }` |
| `createChannel` | `{ name, description?, password? }` | `{ channel, ownerToken }` |
| `deleteChannel` | `{ channelId, ownerToken }` | `{ success }` |
| `setChannelPassword` | `{ channelId, ownerToken, password? }` | `{ success, channel }` |

### 방송 (Producer)

| 이벤트 | 데이터 | 응답 |
|--------|--------|------|
| `joinAsProducer` | `{ channelId, password? }` | `{ transportParams, rtpCapabilities }` |
| `connectProducerTransport` | `{ dtlsParameters }` | `{ success }` |
| `produce` | `{ kind, rtpParameters }` | `{ producerId }` |

### 시청 (Consumer)

| 이벤트 | 데이터 | 응답 |
|--------|--------|------|
| `joinAsConsumer` | `{ channelId, password?, rtpCapabilities }` | `{ transportParams, consumers[] }` |
| `connectConsumerTransport` | `{ dtlsParameters }` | `{ success }` |
| `consumeNewProducer` | `{ producerId }` | `{ consumer }` |
| `resumeConsumer` | `{ consumerId }` | `{ success }` |
| `leaveChannel` | `{}` | `{ success }` |

### 서버 → 클라이언트 이벤트

| 이벤트 | 데이터 | 설명 |
|--------|--------|------|
| `channelCreated` | `channel` | 새 채널이 생성됨 |
| `channelDeleted` | `{ channelId }` | 채널이 삭제됨 |
| `channelUpdated` | `{ id, isLive, viewerCount, hasPassword }` | 채널 정보 변경 |
| `newProducer` | `{ producerId, kind }` | 채널에 새 Producer 등장 |

---

## 확장 가이드

### HTTPS 적용

실제 서비스 환경에서는 HTTPS가 필요합니다 (카메라/마이크 API 요구사항).

```js
// src/index.js 수정
const https = require('https');
const fs = require('fs');

const server = https.createServer({
  key:  fs.readFileSync('cert/key.pem'),
  cert: fs.readFileSync('cert/cert.pem'),
}, app);
```

### 다중 서버 (수평 확장)

현재 채널 정보는 프로세스 메모리에 저장됩니다.  
여러 서버 인스턴스를 운영하려면 `ChannelManager.js`의 저장소를 Redis로 교체하고  
Socket.io에 `@socket.io/redis-adapter`를 추가하세요.

### TURN 서버

기업 네트워크나 엄격한 NAT 환경에서는 STUN만으로 연결이 안 될 수 있습니다.  
[coturn](https://github.com/coturn/coturn)을 설치하고 `src/config.js`의  
`webRtcTransportOptions`에 `iceServers`를 추가하세요.

---

## 라이선스

MIT
