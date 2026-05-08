# WebRTC 영상/음성 분리 예제

이 프로젝트는 WebRTC로 영상과 음성을 각각 독립적으로 송수신하는 최소 예제입니다.

## 요구 사항

- Node.js 18 이상
- 최신 Chrome/Edge 브라우저

## 디렉토리 구조

- `server`: 시그널링 서버 + 서버 GUI 대시보드
- `client1`: 브라우저 클라이언트 1(정적 웹 앱)
- `client2`: 브라우저 클라이언트 2(정적 웹 앱)
- `stun`: STUN 서버 (NAT traversal)
- `tun`: TURN 서버 (릴레이 서버)

각 디렉토리는 서로의 파일을 직접 참조하지 않으며, 독립적으로 실행됩니다.
루트에는 실행용 `package.json`이 없고, 각 디렉토리에서 별도로 실행합니다.

## 실행 방법

### 1) STUN 서버 실행 (선택사항)

```bash
cd stun
npm install
npm start
```

기본 포트: `3478` (UDP)

### 2) TURN 서버 실행 (선택사항)

```bash
cd tun
npm install
npm start
```

기본 포트: `3478` (포트 충돌 시 3479로 변경)

인증 정보:
- Username: `webrtc`
- Password: `webrtc123`

**참고**: STUN/TURN 서버는 NAT 환경에서 WebRTC 연결을 위해 사용됩니다. 로컬 테스트 시에는 선택사항입니다.

### 3) 시그널링 서버 실행

```bash
cd server
npm install
npm start
```

기본 주소: `ws://localhost:3000`
서버 GUI: `http://localhost:3000`

포트 충돌이 나면:

```bash
# PowerShell
$env:PORT=3001
npm start
```

이 경우 서버 주소는 `ws://localhost:3001`, 서버 GUI는 `http://localhost:3001`입니다.

### 4) 클라이언트1 실행

```bash
cd client1
npm install
npm start
```

기본 주소: `http://localhost:5174`

### 5) 클라이언트2 실행

```bash
cd client2
npm install
npm start
```

기본 주소: `http://localhost:5175`

## 사용 방법

1. (선택) STUN/TURN 서버를 실행합니다.
2. 시그널링 서버 GUI를 열어 상태를 확인합니다.  
   - 예: `http://localhost:3001`
3. `client1`, `client2`를 각각 엽니다.  
   - 예: `http://127.0.0.1:5174`, `http://127.0.0.1:5175`
4. 두 클라이언트 모두 같은 값을 입력합니다.  
   - `Signaling URL`: `ws://localhost:3001`  
   - `Room ID`: 같은 문자열 (예: `demo-room`)
5. 각 클라이언트에서 `방 입장` 클릭 후, 영상/음성 시작 버튼으로 송수신을 확인합니다.

참고: WebRTC는 P2P이므로 최소 2개 클라이언트가 같은 룸에 들어와야 통신이 시작됩니다.

## 동작 방식

- `영상 시작/중지`: 비디오 트랙만 추가/제거
- `음성 시작/중지`: 오디오 트랙만 추가/제거
- 트랙 상태(시작/중지)는 시그널링 채널로 상대에게 별도 전달

## 파일 구성

- `server/server.js`: 시그널링 + 서버 GUI/API
- `server/gui/*`: 서버 GUI 화면
- `client1/*`: 클라이언트1 UI 및 WebRTC 로직
- `client2/*`: 클라이언트2 UI 및 WebRTC 로직
- `stun/*`: STUN 서버 (NAT 공인 IP 발견)
- `tun/*`: TURN 서버 (데이터 릴레이)

## STUN/TURN 서버 사용하기

WebRTC 클라이언트에서 STUN/TURN 서버를 사용하려면:

```javascript
const configuration = {
  iceServers: [
    // STUN 서버
    { urls: 'stun:localhost:3478' },
    // TURN 서버
    {
      urls: 'turn:localhost:3479',
      username: 'webrtc',
      credential: 'webrtc123'
    }
  ]
};

const peerConnection = new RTCPeerConnection(configuration);
```

자세한 설정은 각 디렉토리의 README.md를 참고하세요:
- [stun/README.md](stun/README.md)
- [tun/README.md](tun/README.md)
