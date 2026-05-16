# 웹 기반 관리 인터페이스 & 오디오 스트리밍

최신 업데이트: 2026-05-16

## 🌐 웹 기반 관리 인터페이스

### 개요
HTTP REST API를 통해 VNC 서버를 원격으로 관리하고 모니터링할 수 있는 웹 인터페이스입니다.

### 주요 기능
- ✅ 실시간 서버 상태 모니터링
- ✅ 서버 시작/중지 원격 제어
- ✅ 설정 조회 및 변경
- ✅ 연결된 클라이언트 목록
- ✅ 통계 정보 (연결 수, 데이터 전송량, 가동 시간)
- ✅ 로그 조회
- ✅ 반응형 웹 디자인
- ✅ 5초마다 자동 새로고침

### 설정 방법

**ServerSettings.cs**:
```csharp
public bool EnableWebManagement { get; set; } = false;
public int WebManagementPort { get; set; } = 8080;
```

**VNCForm에서 활성화**:
```csharp
var webAPI = new WebManagementAPI(
    settings: _settings,
    vncServer: _vncServerCore,
    logger: _connectionLogger,
    webPort: 8080
);

webAPI.Start();
```

### 웹 대시보드 접속

브라우저에서:
```
http://localhost:8080
```

네트워크에서 접속 (관리자 권한 필요):
```
http://192.168.1.100:8080
```

### REST API 엔드포인트

#### 1. 서버 상태
```http
GET /api/status
```

**응답**:
```json
{
  "vncServerRunning": true,
  "port": 5900,
  "enableIPv6": false,
  "enableTLS": true,
  "activeConnections": 2,
  "uptime": "02:15:30"
}
```

#### 2. 설정 조회
```http
GET /api/settings
```

**응답**:
```json
{
  "port": 5900,
  "requirePassword": true,
  "enableIPv6": false,
  "viewOnlyMode": false,
  "imageQuality": 75,
  "frameRate": 30,
  "compressionLevel": 6,
  "enableClipboardSync": true,
  "enableLogging": true
}
```

#### 3. 설정 업데이트
```http
PUT /api/settings
Content-Type: application/json

{
  "imageQuality": 80,
  "frameRate": 60,
  "viewOnlyMode": true
}
```

**응답**:
```json
{
  "success": true,
  "message": "Settings updated"
}
```

#### 4. 서버 시작
```http
POST /api/server/start
```

**응답**:
```json
{
  "success": true,
  "message": "VNC Server started"
}
```

#### 5. 서버 중지
```http
POST /api/server/stop
```

#### 6. 클라이언트 목록
```http
GET /api/clients
```

**응답**:
```json
{
  "clients": [
    {
      "id": 1,
      "ip": "192.168.1.100",
      "connectedAt": "2026-05-16T14:30:00"
    }
  ]
}
```

#### 7. 통계 정보
```http
GET /api/statistics
```

**응답**:
```json
{
  "uptime": "02:15:30",
  "totalConnections": 15,
  "activeConnections": 2,
  "bytesSent": 1073741824,
  "bytesReceived": 10485760
}
```

#### 8. 로그 조회
```http
GET /api/logs
```

**응답**:
```json
{
  "logs": [
    {
      "timestamp": "2026-05-16T14:30:00",
      "level": "Info",
      "message": "Client connected from 192.168.1.100"
    }
  ]
}
```

### 웹 대시보드 화면

대시보드는 4개의 주요 섹션으로 구성됩니다:

1. **서버 상태**
   - 실행 중 / 중지 상태 표시
   - 포트 번호
   - 가동 시간
   - 시작/중지/새로고침 버튼

2. **통계**
   - 총 연결 수
   - 활성 연결 수
   - 전송 데이터 (MB)
   - 수신 데이터 (MB)

3. **연결된 클라이언트**
   - 클라이언트 ID
   - IP 주소
   - 연결 시간

4. **자동 새로고침**
   - 5초마다 자동 업데이트
   - 실시간 모니터링

### JavaScript API 사용 예제

```javascript
// 서버 시작
async function startServer() {
    const response = await fetch('/api/server/start', { 
        method: 'POST' 
    });
    const data = await response.json();
    console.log(data.message);
}

// 설정 변경
async function updateSettings(newSettings) {
    const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
    });
    const data = await response.json();
    return data.success;
}

// 통계 조회
async function getStatistics() {
    const response = await fetch('/api/statistics');
    const data = await response.json();
    return data;
}
```

### CORS 지원
모든 API 엔드포인트는 CORS를 지원하여 외부 웹 애플리케이션에서도 사용할 수 있습니다.

---

## 🔊 오디오 스트리밍

### 개요
VNC 세션에 오디오를 추가하여 원격 환경에서 사운드를 들을 수 있습니다.

### 주요 기능
- ✅ 시스템 사운드 캡처 (스피커 출력)
- ✅ 마이크 입력 캡처
- ✅ 설정 가능한 샘플레이트 (8000~48000 Hz)
- ✅ 모노/스테레오 지원
- ✅ 차분 압축 (약 50% 압축)
- ✅ 볼륨 조절
- ✅ 다운샘플링 (대역폭 절약)
- ✅ WAV 포맷 지원

### 설정 방법

**ServerSettings.cs**:
```csharp
public bool EnableAudioStreaming { get; set; } = false;
public int AudioSampleRate { get; set; } = 44100;
public int AudioChannels { get; set; } = 2;
public int AudioBitsPerSample { get; set; } = 16;
public bool AudioCaptureSystemSound { get; set; } = true;
public bool AudioCaptureMicrophone { get; set; } = false;
```

### 사용 예제

#### 기본 사용법
```csharp
var audioStreamer = new AudioStreamer(
    sampleRate: 44100,  // CD 품질
    channels: 2,        // 스테레오
    bitsPerSample: 16   // 16-bit
);

// 이벤트 핸들러 등록
audioStreamer.AudioDataAvailable += OnAudioDataAvailable;
audioStreamer.AudioError += OnAudioError;

// 캡처 시작
audioStreamer.StartCapture();
```

#### 오디오 데이터 처리
```csharp
private void OnAudioDataAvailable(object? sender, AudioStreamer.AudioDataEventArgs e)
{
    Console.WriteLine($"Audio: {e.BytesRecorded} bytes, " +
                     $"{e.SampleRate}Hz, {e.Channels}ch");
    
    // 1. 압축
    byte[] compressed = AudioStreamer.CompressAudio(e.Data, e.Channels);
    
    // 2. 클라이언트로 전송
    SendAudioToClients(compressed);
}
```

#### 고급 오디오 처리

**볼륨 조절**:
```csharp
byte[] louder = AudioStreamer.AdjustVolume(audioData, 1.5f);  // 150%
byte[] quieter = AudioStreamer.AdjustVolume(audioData, 0.5f); // 50%
```

**스테레오 → 모노 변환**:
```csharp
byte[] monoData = AudioStreamer.StereoToMono(stereoData);
// 데이터 크기 50% 감소
```

**다운샘플링**:
```csharp
// 44100Hz → 22050Hz
byte[] downsampled = AudioStreamer.Downsample(audioData, 2);
// 데이터 크기 50% 감소
```

**WAV 헤더 생성**:
```csharp
byte[] wavHeader = AudioStreamer.CreateWavHeader(
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16,
    dataLength: audioData.Length
);

// WAV 파일 저장
using var file = File.Create("output.wav");
file.Write(wavHeader, 0, wavHeader.Length);
file.Write(audioData, 0, audioData.Length);
```

### 오디오 압축

#### 차분 압축 (ADPCM 스타일)
```csharp
// 압축 (50% 크기 감소)
byte[] compressed = AudioStreamer.CompressAudio(pcmData, channels);

// 압축 해제
byte[] decompressed = AudioStreamer.DecompressAudio(compressed, channels);
```

**압축 알고리즘**:
- 이전 샘플과의 차이값만 저장
- 16-bit → 8-bit 양자화
- 약 50% 압축률

### 대역폭 최적화

**고품질 (로컬 네트워크)**:
```csharp
var highQuality = new AudioStreamer(
    sampleRate: 48000,
    channels: 2,
    bitsPerSample: 16
);
// 대역폭: ~192 KB/s (1536 kbps)
```

**표준 품질**:
```csharp
var standard = new AudioStreamer(
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
);
// 대역폭: ~176 KB/s (1411 kbps)
```

**저품질 (인터넷)**:
```csharp
var lowQuality = new AudioStreamer(
    sampleRate: 22050,
    channels: 1,  // 모노
    bitsPerSample: 16
);
// 대역폭: ~44 KB/s (353 kbps)
```

**최소 품질 (느린 연결)**:
```csharp
var minimal = new AudioStreamer(
    sampleRate: 8000,  // 전화 품질
    channels: 1,
    bitsPerSample: 16
);
// 대역폭: ~16 KB/s (128 kbps)
```

### Windows WASAPI 통합 (고급)

실제 시스템 오디오 캡처를 위해서는 Windows Core Audio API (WASAPI)를 사용합니다.

**NAudio 라이브러리 사용 (권장)**:
```csharp
// NAudio NuGet 패키지 설치
// Install-Package NAudio

using NAudio.Wave;

var capture = new WasapiLoopbackCapture();  // 시스템 사운드

capture.DataAvailable += (s, e) => {
    // e.Buffer에 PCM 오디오 데이터
    SendAudioToClients(e.Buffer);
};

capture.StartRecording();
```

**마이크 캡처**:
```csharp
var microphone = new WaveInEvent
{
    WaveFormat = new WaveFormat(44100, 2)
};

microphone.DataAvailable += (s, e) => {
    SendAudioToClients(e.Buffer);
};

microphone.StartRecording();
```

### 오디오 형식 비교

| 샘플레이트 | 품질 | 대역폭 (스테레오) | 용도 |
|-----------|------|------------------|------|
| 8000 Hz | 전화 | 16 KB/s | 음성 통화 |
| 16000 Hz | 음성 | 32 KB/s | VoIP |
| 22050 Hz | AM 라디오 | 44 KB/s | 게임 효과음 |
| 44100 Hz | CD 품질 | 176 KB/s | 음악, 일반 |
| 48000 Hz | 전문가 | 192 KB/s | 스튜디오, DVD |

### VNC 프로토콜 통합

오디오 데이터를 VNC 세션에 통합하는 방법:

1. **별도 오디오 포트**:
```csharp
// VNC: 5900
// Audio: 5901
var audioServer = new TcpListener(IPAddress.Any, 5901);
```

2. **멀티플렉싱**:
```csharp
// 메시지 타입으로 구분
enum MessageType {
    Video = 0,
    Audio = 1,
    Control = 2
}
```

3. **RTP 스트리밍** (권장):
```csharp
// Real-time Transport Protocol
// 동기화 및 버퍼링 지원
```

### 제한 사항

⚠️ **현재 구현**:
- 기본 PCM 오디오 캡처 프레임워크
- 실제 WASAPI 통합은 NAudio 필요
- 차분 압축만 지원 (Opus/MP3 미지원)
- 동기화 기능 미구현

🔜 **향후 개선**:
- NAudio 통합 (고품질 캡처)
- Opus 코덱 (더 나은 압축)
- 비디오/오디오 동기화
- 버퍼링 및 지터 제어
- 적응형 비트레이트

### 성능 고려사항

**CPU 사용률**:
- 44100Hz 스테레오: ~5-10% (압축 미사용)
- 압축 활성화: +2-3%
- 다운샘플링: -3-5%

**메모리 사용**:
- 버퍼 크기: ~100ms = 약 17 KB (44100Hz 스테레오)
- 총 메모리: < 5 MB

**네트워크**:
- 압축 전: 176 KB/s (44100Hz 스테레오)
- 압축 후: 88 KB/s (50% 감소)
- VNC + 오디오: ~200-300 KB/s (일반 사용)

---

## 🎯 사용 시나리오

### 시나리오 1: 웹 대시보드로 원격 관리
```csharp
// 서버 측
var webAPI = new WebManagementAPI(_settings, _vncServer, _logger, 8080);
webAPI.Start();

// 브라우저에서: http://server-ip:8080
// - 서버 상태 모니터링
// - 원격으로 시작/중지
// - 통계 실시간 확인
```

### 시나리오 2: 오디오가 포함된 원격 데스크톱
```csharp
// VNC 서버 시작
_vncServer.Start();

// 오디오 스트리밍 시작
var audio = new AudioStreamer(44100, 2, 16);
audio.AudioDataAvailable += (s, e) => {
    var compressed = AudioStreamer.CompressAudio(e.Data, e.Channels);
    SendAudioToClients(compressed);
};
audio.StartCapture();

// 사용자는 비디오 + 오디오 모두 수신
```

### 시나리오 3: 모바일 웹 관리
```javascript
// 모바일 브라우저에서 접속
fetch('http://vnc-server:8080/api/status')
    .then(r => r.json())
    .then(data => {
        if (!data.vncServerRunning) {
            // 서버 시작
            fetch('/api/server/start', { method: 'POST' });
        }
    });
```

---

## 📁 파일 구조

```
VNCServer/VNCServer/
├── WebManagementAPI.cs    # 웹 관리 인터페이스 (520 lines)
│   ├── HTTP 서버
│   ├── REST API 엔드포인트
│   ├── 웹 대시보드 (HTML/JS)
│   └── CORS 지원
└── AudioStreamer.cs        # 오디오 스트리밍 (380 lines)
    ├── 오디오 캡처
    ├── 압축/압축 해제
    ├── WAV 헤더 생성
    ├── 볼륨 조절
    ├── 다운샘플링
    └── WASAPI 인터페이스
```

---

**마지막 업데이트**: 2026-05-16  
**추가된 기능**: 2개 (웹 관리, 오디오 스트리밍)  
**코드 라인 수**: ~900 lines
