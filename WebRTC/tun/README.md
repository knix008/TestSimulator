# TURN 서버 (TUN)

WebRTC NAT traversal을 위한 TURN (Traversal Using Relays around NAT) 릴레이 서버입니다.

## 개요

TURN 서버는 P2P 연결이 불가능한 경우 (예: Symmetric NAT 환경) 데이터를 릴레이하여 WebRTC 통신을 가능하게 합니다. STUN 서버로 해결되지 않는 NAT 환경에서 사용됩니다.

## 설치

```bash
cd tun
npm install
```

## 실행

### 기본 실행 (포트 3478)

```bash
npm start
```

### 커스텀 설정으로 실행

```bash
# PowerShell
$env:TURN_PORT=3479
$env:TURN_USERNAME="myuser"
$env:TURN_PASSWORD="mypassword"
npm start

# Linux/Mac
TURN_PORT=3479 TURN_USERNAME=myuser TURN_PASSWORD=mypassword npm start
```

### 개발 모드 (파일 변경 시 자동 재시작)

```bash
npm run dev
```

## 환경 변수

- `TURN_PORT`: TURN 서버 포트 (기본값: 3478)
- `TURN_HOST`: 바인딩할 호스트 (기본값: 0.0.0.0)
- `TURN_USERNAME`: 인증 사용자명 (기본값: webrtc)
- `TURN_PASSWORD`: 인증 비밀번호 (기본값: webrtc123)
- `TURN_SECRET`: 인증 시크릿 키 (기본값: my-secret-key)
- `TURN_REALM`: TURN 렐름 (기본값: webrtc-turn-server)

## WebRTC 설정에서 사용하기

클라이언트 코드에서 다음과 같이 사용할 수 있습니다:

```javascript
const configuration = {
  iceServers: [
    {
      urls: 'stun:localhost:3478'
    },
    {
      urls: 'turn:localhost:3479',
      username: 'webrtc',
      credential: 'webrtc123'
    }
  ]
};

const peerConnection = new RTCPeerConnection(configuration);
```

## STUN + TURN 함께 사용하기

일반적으로 STUN과 TURN을 함께 설정합니다:

```javascript
const configuration = {
  iceServers: [
    // STUN 서버 (먼저 시도)
    {
      urls: 'stun:localhost:3478'
    },
    // TURN 서버 (STUN 실패 시 폴백)
    {
      urls: 'turn:localhost:3479',
      username: 'webrtc',
      credential: 'webrtc123'
    }
  ]
};
```

## 포트 정보

- **기본 포트**: 3478 (TURN 표준 포트, STUN과 같은 포트 사용 가능)
- **릴레이 포트 범위**: 49152-65535 (동적으로 할당)
- **프로토콜**: UDP, TCP
- **대체 포트**: 3479, 5349 (TURNS - TLS)

## 보안 설정

### 프로덕션 환경에서는 반드시:

1. **강력한 비밀번호 사용**
   ```bash
   $env:TURN_PASSWORD="VeryStr0ng!P@ssw0rd"
   ```

2. **TLS/DTLS 사용 (TURNS)**
   - 포트 5349 사용
   - SSL 인증서 설정 필요

3. **방화벽 설정**
   - TURN 포트 (3478, 3479 등) 개방
   - 릴레이 포트 범위 (49152-65535) 개방

## 참고사항

- TURN 서버는 UDP와 TCP 프로토콜을 모두 지원합니다
- 인증이 필요하므로 username과 password를 설정해야 합니다
- TURN 서버는 대역폭을 많이 사용할 수 있으므로 주의가 필요합니다
- 로컬 테스트 시에는 `localhost` 사용
- 외부 접속 시에는 공인 IP 주소 필요

## STUN vs TURN

| 특징 | STUN | TURN |
|-----|------|------|
| 용도 | NAT 뒤의 공인 IP 발견 | 데이터 릴레이 |
| 연결 방식 | P2P (직접 연결) | 서버 경유 |
| 대역폭 | 적음 | 많음 |
| 비용 | 낮음 | 높음 |
| 성공률 | ~80% | 100% |

## 테스트

```javascript
// 브라우저 콘솔에서 테스트
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:localhost:3478' },
    {
      urls: 'turn:localhost:3479',
      username: 'webrtc',
      credential: 'webrtc123'
    }
  ]
});

pc.createDataChannel('test');
pc.createOffer().then(offer => pc.setLocalDescription(offer));

pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log('ICE Candidate:', event.candidate);
    // relay 타입이 나오면 TURN 서버 사용 중
  }
};
```

## 문제 해결

### "Permission denied" 에러
- 포트 1024 이하는 관리자 권한 필요
- 포트 3479 이상 사용 권장

### 연결 안 됨
- 방화벽 설정 확인
- username/password 일치 확인
- 서버 공인 IP 사용 확인

### 대역폭 과다 사용
- 릴레이 포트 범위 조정
- 동시 연결 수 제한
- STUN 우선 사용 설정
