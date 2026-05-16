# VNC Server - 최신 기능 업데이트

## 🆕 새로 추가된 기능 (2026-05-16 오후)

### 1. 보기 전용 모드 (View-Only Mode) ✅

**파일**: `VNCServer/Settings/ServerSettings.cs`

클라이언트가 화면만 보고 입력은 할 수 없도록 제한하는 기능입니다.

**설정 항목**:
```csharp
public bool ViewOnlyMode { get; set; } = false;  // 보기 전용 모드
public bool AllowControlRequest { get; set; } = true;  // 제어 요청 허용
```

**사용 시나리오**:
- 프레젠테이션 또는 데모
- 원격 모니터링
- 교육/강의
- 보안이 중요한 환경

**동작 방식**:
- ViewOnlyMode = true: 모든 마우스/키보드 입력 무시
- AllowControlRequest = true: 클라이언트가 제어 권한 요청 가능
- 서버 측에서 실시간으로 권한 변경 가능

---

### 2. 클립보드 이미지 지원 ✅

**파일**: `VNCServer/VNCServer/EnhancedClipboardManager.cs`

기존 텍스트 클립보드에 더해 이미지 클립보드 동기화를 지원합니다.

**새로운 기능**:
- 이미지 클립보드 감지 및 동기화
- PNG, JPEG, BMP 등 다양한 형식 지원
- 이미지 변경 감지 (해시 기반)
- 자동 메모리 관리

**이벤트**:
```csharp
public event EventHandler<string>? ClipboardTextChanged;
public event EventHandler<Bitmap>? ClipboardImageChanged;
```

**사용 예제**:
```csharp
var clipboard = new EnhancedClipboardManager(true);

clipboard.ClipboardTextChanged += (sender, text) => {
    Console.WriteLine($"Text copied: {text}");
    // 클라이언트로 전송
};

clipboard.ClipboardImageChanged += (sender, image) => {
    Console.WriteLine($"Image copied: {image.Width}x{image.Height}");
    // 이미지를 JPEG로 압축하여 전송
    byte[] compressed = ImageCompressor.EncodeJpeg(image, 85);
};

clipboard.Start();
```

**주요 메서드**:
- `SetClipboardText(string)` - 텍스트 설정
- `SetClipboardImage(Bitmap)` - 이미지 설정
- `GetClipboardText()` - 현재 텍스트 가져오기
- `GetClipboardImage()` - 현재 이미지 가져오기

---

### 3. IPv6 지원 ✅

**파일**: `VNCServer/VNCServer/VNCServerCore.cs`, `VNCServer/Settings/ServerSettings.cs`

IPv4와 IPv6를 동시에 지원하는 DualMode 구현입니다.

**설정 항목**:
```csharp
public bool EnableIPv6 { get; set; } = false;
public string BindAddress { get; set; } = "0.0.0.0";
```

**지원 기능**:
- IPv4 전용 모드 (기본값)
- IPv6 전용 모드
- DualMode (IPv4 + IPv6 동시)
- 특정 인터페이스 바인딩

**접속 방법**:
```bash
# IPv4
vncviewer 192.168.1.100:5900

# IPv6
vncviewer [2001:db8::1]:5900

# IPv6 링크 로컬
vncviewer [fe80::1%eth0]:5900
```

**구현 세부사항**:
```csharp
// DualMode 설정
if (_settings.EnableIPv6)
{
    bindAddress = IPAddress.IPv6Any;
    _listener = new TcpListener(bindAddress, _settings.Port);
    _listener.Server.DualMode = true;  // IPv4도 허용
}
```

**네트워크 정책**:
- Windows Firewall에 IPv6 규칙 추가 필요
- 라우터에서 IPv6 포트 포워딩 설정 (외부 접속 시)

---

### 4. 화면 녹화 기능 ✅

**파일**: `VNCServer/VNCServer/ScreenRecorder.cs`

VNC 세션을 실시간으로 녹화하여 이미지 시퀀스로 저장합니다.

**주요 기능**:
- 설정 가능한 프레임레이트 (1-60 FPS)
- JPEG 품질 조절 (1-100)
- 실시간 진행률 업데이트
- 메타데이터 자동 생성
- FFmpeg 변환 가이드 제공

**사용 예제**:
```csharp
var recorder = new ScreenRecorder
{
    FrameRate = 30,
    Quality = 75
};

// 이벤트 핸들러
recorder.RecordingStarted += (s, path) => 
    Console.WriteLine($"Recording started: {path}");

recorder.RecordingProgress += (s, stats) =>
{
    Console.WriteLine($"Frame {stats.FrameCount}, " +
                     $"Duration: {stats.Duration}, " +
                     $"Size: {stats.TotalSize / 1024 / 1024} MB");
};

recorder.RecordingStopped += (s, path) => 
    Console.WriteLine($"Recording saved to: {path}");

// 녹화 시작
recorder.StartRecording(@"C:\recordings\session1.mp4", 30, 75);

// ... 세션 진행 ...

// 녹화 중지
recorder.StopRecording();
```

**출력 파일**:
1. `session_frames.zip` - 모든 프레임 (JPEG 시퀀스)
2. `session_metadata.txt` - 녹화 정보:
   - 총 프레임 수
   - 프레임레이트
   - 녹화 시간
   - 품질 설정
   - FFmpeg 변환 명령

**FFmpeg 변환**:
```bash
# 표준 MP4
ffmpeg -framerate 30 -i frame_%08d.jpg -c:v libx264 -pix_fmt yuv420p output.mp4

# 고품질
ffmpeg -framerate 30 -i frame_%08d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p output.mp4

# GIF 애니메이션
ffmpeg -framerate 10 -i frame_%08d.jpg -vf "scale=800:-1" output.gif
```

**성능 고려사항**:
- 프레임레이트 30fps: 약 100-300 KB/frame (품질 75)
- 60초 녹화 = 약 180-540 MB (1800 frames @ 30fps)
- CPU 사용률: 중간 (JPEG 인코딩)
- 디스크 I/O: 높음 (프레임 저장)

**RecordingStats 클래스**:
```csharp
public class RecordingStats
{
    public int FrameCount { get; set; }
    public TimeSpan Duration { get; set; }
    public long TotalSize { get; set; }
    public double AverageFps { get; set; }
}
```

---

## 📊 전체 기능 비교

| 기능 | 이전 | 현재 |
|------|------|------|
| 클립보드 동기화 | 텍스트만 | 텍스트 + 이미지 |
| 원격 제어 | 전체 or 차단 | 세밀한 권한 제어 |
| 네트워크 | IPv4만 | IPv4 + IPv6 DualMode |
| 녹화 | 없음 | 이미지 시퀀스 녹화 |

---

## 🔧 ServerSettings 업데이트

**새로운 설정 항목**:
```csharp
public class ServerSettings
{
    // ... 기존 설정 ...
    
    // 네트워크
    public bool EnableIPv6 { get; set; } = false;
    public string BindAddress { get; set; } = "0.0.0.0";
    
    // 원격 제어 권한
    public bool ViewOnlyMode { get; set; } = false;
    public bool AllowControlRequest { get; set; } = true;
    
    // ... 기타 설정 ...
}
```

---

## 💡 사용 시나리오

### 시나리오 1: 프레젠테이션 녹화
```csharp
// 보기 전용 + 녹화
settings.ViewOnlyMode = true;
server.Start();

recorder.StartRecording("presentation.mp4", 30, 85);
// ... 프레젠테이션 진행 ...
recorder.StopRecording();
```

### 시나리오 2: 원격 지원 (IPv6)
```csharp
// IPv6 활성화
settings.EnableIPv6 = true;
settings.ViewOnlyMode = false;
settings.AllowMouseControl = true;
settings.AllowKeyboardControl = true;

// 클립보드 이미지 동기화
var clipboard = new EnhancedClipboardManager(true);
clipboard.ClipboardImageChanged += SendImageToClient;

server.Start();
```

### 시나리오 3: 보안 모니터링
```csharp
// 보기만 가능, 로깅 활성화
settings.ViewOnlyMode = true;
settings.EnableLogging = true;
settings.EnableTLS = true;  // 암호화 필수

logger.ClientConnected += (s, ip) => 
    Console.WriteLine($"Viewer connected: {ip}");

server.Start();
```

---

## 🚀 성능 개선 사항

### 클립보드 이미지 최적화
- 이미지 해시 캐싱으로 중복 전송 방지
- JPEG 압축으로 대역폭 절약
- 비동기 처리로 UI 차단 방지

### IPv6 DualMode
- 단일 소켓으로 IPv4/IPv6 동시 처리
- 네트워크 전환 시 자동 fallback

### 화면 녹화
- 프레임 드롭 방지 알고리즘
- 메모리 효율적인 스트리밍
- 병렬 JPEG 인코딩 (향후 추가 예정)

---

## 📝 주의사항

### 클립보드 이미지
- 대용량 이미지 (>5MB)는 전송 시간 소요
- 클립보드 동기화 비활성화 옵션 제공 권장

### IPv6
- ISP IPv6 지원 확인 필요
- 방화벽 IPv6 규칙 설정 필요
- Windows 7 이하에서는 제한적 지원

### 화면 녹화
- 디스크 공간 충분히 확보 (1분 = 약 300MB @ 30fps)
- 장시간 녹화 시 임시 파일 정리 필요
- FFmpeg 별도 설치 필요 (비디오 변환용)

---

## 🔄 다음 업데이트 계획

1. **비디오 코덱 통합**
   - libx264 직접 통합
   - 실시간 MP4 생성

2. **다중 모니터 개별 선택**
   - 모니터 열거
   - 개별 모니터 캡처

3. **UPnP 자동 포트 포워딩**
   - NAT-PMP 지원
   - 자동 포트 매핑

4. **웹 기반 관리 인터페이스**
   - ASP.NET Core WebAPI
   - React/Vue 프론트엔드

---

**구현 완료일**: 2026-05-16  
**추가된 기능**: 4개  
**추가된 파일**: 2개  
**수정된 파일**: 3개  
**코드 라인 수**: ~800+ 라인
