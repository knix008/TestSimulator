# STUN 서버

WebRTC NAT traversal을 위한 STUN (Session Traversal Utilities for NAT) 서버입니다.

## 개요

STUN 서버는 NAT 뒤에 있는 클라이언트가 자신의 공인 IP 주소와 포트를 발견할 수 있도록 도와줍니다. WebRTC 연결 시 필수적인 구성 요소입니다.

## 설치

```bash
cd stun
npm install
```

## 실행

### 기본 실행 (포트 3478)

```bash
npm start
```

### 커스텀 포트로 실행

```bash
# PowerShell
$env:STUN_PORT=19302
npm start

# Linux/Mac
STUN_PORT=19302 npm start
```

### 개발 모드 (파일 변경 시 자동 재시작)

```bash
npm run dev
```

## 환경 변수

- `STUN_PORT`: STUN 서버 포트 (기본값: 3478)
- `STUN_HOST`: 바인딩할 호스트 (기본값: 0.0.0.0)

## WebRTC 설정에서 사용하기

클라이언트 코드에서 다음과 같이 사용할 수 있습니다:

```javascript
const configuration = {
  iceServers: [
    {
      urls: 'stun:localhost:3478'
      // 또는
      // urls: 'stun:your-server-ip:3478'
    }
  ]
};

const peerConnection = new RTCPeerConnection(configuration);
```

## 포트 정보

- **기본 포트**: 3478 (STUN 표준 포트)
- **프로토콜**: UDP
- **대체 포트**: 19302 (Google STUN 서버와 동일)

## 참고사항

- STUN 서버는 UDP 프로토콜을 사용합니다
- 방화벽에서 해당 포트를 열어야 합니다
- 로컬 테스트 시에는 `localhost` 또는 `127.0.0.1` 사용
- 외부 접속 시에는 공인 IP 주소 필요

## 테스트

온라인 STUN 테스터를 사용하거나, WebRTC 클라이언트에서 설정하여 테스트할 수 있습니다.

```javascript
// 브라우저 콘솔에서 테스트
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:localhost:3478' }]
});

pc.createDataChannel('test');
pc.createOffer().then(offer => pc.setLocalDescription(offer));

pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log('ICE Candidate:', event.candidate);
  }
};
```
