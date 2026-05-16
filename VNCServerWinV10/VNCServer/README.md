# VNC Server

C#으로 구현된 Windows용 VNC 서버입니다.

## 주요 기능

### 1. VNC 서버 기능
- **RFB 프로토콜 3.8** 지원
- 실시간 화면 공유
- 원격 마우스/키보드 입력 제어
- 다중 모니터 지원
- 비밀번호 인증
- **TLS/SSL 암호화** 지원 (선택적)

### 2. System Tray 통합
- 작업 표시줄 트레이에 아이콘으로 상주
- 트레이 메뉴에서 서버 시작/중지
- 창 최소화 시 트레이로 이동
- 더블클릭으로 설정 창 열기

### 3. 설정 옵션
- **포트 설정**: VNC 서버 포트 (기본값: 5900)
- **비밀번호 보호**: 접속 시 비밀번호 요구
- **원격 입력 허용**: 클라이언트의 마우스/키보드 입력 허용
- **다중 연결**: 동시에 여러 클라이언트 접속 허용
- **자동 시작**: 프로그램 실행 시 자동으로 서버 시작
- **트레이로 최소화**: 창 닫기 시 트레이로 최소화

### 4. 고급 기능 ✨
- **TLS/SSL 암호화**: 안전한 암호화 통신 지원
- **화면 품질 조절**: JPEG 품질 (1-100) 및 압축 레벨 설정
- **프레임레이트 제어**: 초당 프레임 수 조절 (1-60 FPS)
- **클립보드 동기화**: 서버-클라이언트 간 텍스트 및 이미지 클립보드 자동 동기화
- **선택 영역 공유**: 화면 전체가 아닌 특정 영역만 공유
- **파일 전송**: VNC 세션을 통한 파일 송수신
- **연결 로그 및 통계**: 
  - 접속 로그 기록
  - 총 연결 수, 활성 연결 수
  - 데이터 전송량 통계
  - 서버 가동 시간 (Uptime)
- **보기 전용 모드**: 원격 입력을 차단하여 보기만 가능하도록 설정
- **IPv6 지원**: IPv4/IPv6 DualMode 지원으로 최신 네트워크 환경 대응
- **화면 녹화**: 세션을 이미지 시퀀스로 녹화하여 저장
- **웹 기반 관리**: HTTP REST API를 통한 원격 관리 및 모니터링
- **오디오 스트리밍**: 시스템 사운드 또는 마이크 오디오 전송
- **비디오 코덱 통합**: H.264/H.265 하드웨어 가속 인코딩
- **터치 입력 지원**: 멀티터치 제스처 (탭, 스와이프, 핀치 등)
- **세션 재연결**: 연결 끓김 시 자동 복구
- **다중 모니터 선택**: 개별 모니터 또는 전체 화면 공유
- **UPnP 포트 포워딩**: 자동 라우터 설정

## 설치

### MSI 설치 파일 사용 (권장)
1. `VNCServerSetup.msi` 파일을 다운로드합니다
2. MSI 파일을 실행합니다
3. 설치 마법사의 지시를 따릅니다
4. 설치 중 다음을 선택할 수 있습니다:
   - 바탕화면 바로가기 생성
   - 시작 메뉴 바로가기 생성
5. 설치가 완료되면 바로가기를 통해 프로그램을 실행합니다

## 빌드 및 실행

### 개발 환경 요구사항
- .NET 8.0 SDK
- Visual Studio 2022 이상 (또는 Visual Studio Code)
- WiX Toolset 4.x (MSI 빌드용)

### WiX Toolset 설치
MSI 설치 파일을 빌드하려면 WiX Toolset이 필요합니다:
```powershell
dotnet tool install --global wix
```

### 개발 빌드
```powershell
cd VNCServer
dotnet build
```

### 실행
```powershell
dotnet run
```

또는 빌드된 실행 파일:
```powershell
.\bin\Debug\net8.0-windows\VNCServer.exe
```

### Release 빌드 및 MSI 생성
Visual Studio에서:
1. 솔루션을 엽니다 (`VNCServer.sln`)
2. 빌드 구성을 **Release**로 변경
3. 솔루션 빌드 (Ctrl+Shift+B)
4. MSI 파일이 생성됩니다: `VNCServer.Installer\bin\Release\VNCServerSetup.msi`

명령줄에서:
```powershell
# 솔루션 빌드 (Release 모드)
dotnet build VNCServer.sln -c Release

# MSI 빌드
cd VNCServer.Installer
dotnet build -c Release
```

생성된 MSI 파일 위치:
```
VNCServer.Installer\bin\Release\net8.0-windows\VNCServerSetup.msi
```

## 사용 방법

### 1. 서버 시작
1. 프로그램을 실행합니다
2. 필요한 설정을 구성합니다 (포트, 비밀번호 등)
3. "서버 시작" 버튼을 클릭합니다
4. 상태가 "실행 중"으로 변경됩니다

### 2. VNC 클라이언트 접속
- **주소**: `localhost:5900` (또는 설정한 포트)
- **비밀번호**: 설정 화면에서 입력한 비밀번호

추천 VNC 클라이언트:
- RealVNC Viewer
- TigerVNC
- UltraVNC Viewer
- TightVNC Viewer

### 3. System Tray 사용
- 트레이 아이콘 우클릭: 컨텍스트 메뉴
- 트레이 아이콘 더블클릭: 설정 창 열기
- 창 닫기: 트레이로 최소화 (설정 활성화 시)

## 프로젝트 구조

```
VNCServerWinV10/
├── VNCServer.sln                     # Visual Studio 솔루션
├── .gitignore                        # Git 제외 파일 목록
├── VNCServer/                        # 메인 애플리케이션
│   ├── VNCForm.cs                    # 메인 UI 폼
│   ├── VNCForm.Designer.cs           # UI 디자이너
│   ├── Program.cs                    # 진입점
│   ├── daemon_hammer.ico             # 프로그램 아이콘
│   ├── Settings/
│   │   └── ServerSettings.cs         # 설정 관리
│   └── VNCServer/
│       ├── VNCServerCore.cs          # VNC 서버 코어
│       ├── VNCClient.cs              # 클라이언트 연결 처리
│       ├── ScreenCapture.cs          # 화면 캡처
│       ├── InputSimulator.cs         # 입력 시뮬레이션
│       ├── ImageCompressor.cs        # 이미지 압축 및 인코딩
│       ├── ClipboardManager.cs       # 클립보드 동기화 (텍스트)
│       ├── EnhancedClipboardManager.cs  # 클립보드 동기화 (텍스트+이미지)
│       ├── ConnectionLogger.cs       # 연결 로그 및 통계
│       ├── FileTransferManager.cs    # 파일 전송
│       ├── TLSManager.cs             # TLS/SSL 암호화
│       ├── ScreenRecorder.cs         # 화면 녹화
│       ├── WebManagementAPI.cs       # 웹 관리 인터페이스
│       ├── AudioStreamer.cs          # 오디오 스트리밍
│       ├── VideoEncoder.cs           # 비디오 코덱 (H.264/H.265)
│       ├── TouchInputSimulator.cs    # 터치 입력 시뮤레이터
│       ├── SessionReconnectManager.cs # 세션 재연결 관리
│       ├── MultiMonitorManager.cs    # 다중 모니터 관리
│       └── UPnPPortMapper.cs         # UPnP 포트 포워딩
└── VNCServer.Installer/              # MSI 설치 프로젝트
    ├── VNCServer.Installer.wixproj   # WiX 프로젝트 파일
    ├── Product.wxs                   # WiX 메인 설정
    └── UI.wxs                        # WiX UI 설정
```

## 기술 스택
- **.NET 8.0**
- **Windows Forms**
- **RFB Protocol 3.8**
- **System.Drawing** (화면 캡처)
- **System.Net.Sockets** (네트워크)
- **System.Net.Security** (TLS/SSL)
- **System.IO.Compression** (데이터 압축)
- **WiX Toolset 4.x** (MSI 설치 파일)

## 고급 설정

### TLS/SSL 암호화 사용
1. 설정에서 "TLS 활성화" 체크
2. 인증서 파일 경로 지정 (선택사항)
   - 인증서가 없으면 자동으로 자체 서명 인증서 생성
3. 클라이언트는 TLS 지원 VNC 뷰어 사용 필요

### 화면 품질 최적화
- **이미지 품질**: 1-100 (낮을수록 작은 파일, 빠른 전송)
- **압축 레벨**: 0-9 (높을수록 강한 압축)
- **프레임레이트**: 1-60 FPS (낮을수록 CPU/대역폭 절약)

권장 설정:
- 로컬 네트워크: 품질 90, 압축 3, 30 FPS
- 인터넷: 품질 60, 압축 6, 15 FPS

### 선택 영역 공유
1. "선택 영역만 공유" 체크
2. X, Y, 너비, 높이 지정
3. 특정 모니터나 애플리케이션 창만 공유 가능

### 클립보드 동기화및 이미지 클립보드 자동 동기화
- PNG, JPEG 등 다양한 이미지 형식 지원

### 보기 전용 모드
1. "보기 전용 모드" 활성화
2. 클라이언트는 화면만 볼 수 있고 입력 불가
3. 프레젠테이션이나 모니터링에 유용

### IPv6 지원
1. "IPv6 활성화" 체크
2. DualMode로 IPv4와 IPv6 동시 지원
3. 바인드 주소 지정 가능 (기본: 모든 인터페이스)

접속 예시:
- IPv4: `192.168.1.100:5900`
- IPv6: `[fe80::1]:5900`
- IPv6 링크 로컬: `[fe80::1%eth0]:5900`

### 화면 녹화
녹화 시작:
```csharp
var recorder = new ScreenRecorder();
recorder.StartRecording(
    outputPath: @"C:\recordings\session.mp4",
    frameRate: 30,
    quality: 75
);
```

녹화 중지:
```csharp
recorder.StopRecording();
```

출력 파일:
- `session_frames.zip` - 모든 프레임 (JPEG)
- `session_metadata.txt` - 녹화 정보

FFmpeg로 비디오 변환:
```bash
ffmpeg -framerate 30 -i frame_%08d.jpg -c:v libx264 -pix_fmt yuv420p output.mp4
```

### 웹 기반 관리 인터페이스
1. "웹 관리 활성화" 체크
2. 포트 설정 (기본: 8080)
3. 브라우저로 접속: `http://localhost:8080`

**제공 기능**:
- 서버 시작/중지
- 실시간 통계 및 상태 모니터링
- 연결된 클라이언트 목록
- 설정 변경
- 로그 조회

**REST API 엔드포인트**:
```
GET  /api/status       - 서버 상태
GET  /api/settings     - 현재 설정
PUT  /api/settings     - 설정 업데이트
POST /api/server/start - 서버 시작
POST /api/server/stop  - 서버 중지
GET  /api/clients      - 연결된 클라이언트
GET  /api/statistics   - 통계 정보
GET  /api/logs         - 최근 로그
```

### 오디오 스트리밍
1. "오디오 스트리밍 활성화" 체크
2. 오디오 소스 선택:
   - 시스템 사운드 (스피커 출력)
   - 마이크 입력
3. 샘플레이트 및 품질 설정

**사용 예제**:
```csharp
var audioStreamer = new AudioStreamer(
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
);

audioStreamer.AudioDataAvailable += (sender, e) => {
    // 오디오 데이터를 클라이언트로 전송
    byte[] compressed = AudioStreamer.CompressAudio(e.Data, e.Channels);
    SendToClient(compressed);
};

audioStreamer.StartCapture();
```

**오디오 설정**:
- 샘플레이트: 8000, 16000, 22050, 44100, 48000 Hz
- 채널: 모노(1) 또는 스테레오(2)
- 비트 깊이: 8, 16, 24, 32 bit

**압축 옵션**:
- 차분 압축 (간단, 약 50% 압축)
- 다운샘플링 (대역폭 절약)
- 모노 변환 (스테레오 → 모노)

### 비디오 코덱 통합
1. "비디오 코덱 활성화" 체크
2. 코덱 선택: H.264, H.265, VP8, VP9
3. 품질 설정: Low, Medium, High, VeryHigh, Lossless

**사용 예제**:
```csharp
var encoder = new VideoEncoder(
    codec: VideoEncoder.VideoCodec.H264,
    quality: VideoEncoder.VideoQuality.High,
    width: 1920,
    height: 1080,
    frameRate: 30
);

encoder.Initialize();
var encodedFrame = encoder.EncodeFrame(screenshot);
```

**하드웨어 가속**:
- Intel Quick Sync Video (QSV)
- NVIDIA NVENC
- AMD VCE

**비트레이트 예시** (1080p):
- Low: ~1 Mbps
- Medium: ~2 Mbps
- High: ~4 Mbps
- VeryHigh: ~8 Mbps
- Lossless: ~20 Mbps

### 터치 입력 지원
1. "터치 입력 활성화" 체크
2. 최대 터치 포인트 설정 (기본: 10)

**지원 제스처**:
- 탭 (Tap)
- 더블 탭 (Double Tap)
- 롱 프레스 (Long Press)
- 스와이프 (Swipe)
- 핀치 (Pinch Zoom)
- 회전 (Rotate)

**사용 예제**:
```csharp
var touch = new TouchInputSimulator();

// 탭
touch.SimulateTap(100, 100);

// 스와이프
touch.SimulateSwipe(
    startX: 100, startY: 500,
    endX: 500, endY: 500,
    duration: 300
);

// 핀치 줌
touch.SimulatePinch(
    centerX: 500, centerY: 500,
    startDistance: 100,
    endDistance: 300,
    duration: 500
);
```

### 세션 재연결
1. "세션 재연결 활성화" 체크
2. 타임아웃 설정 (기본: 5분)
3. 최대 재연결 시도 횟수 (기본: 3)

**동작 방식**:
- 연결 끓김 감지
- 세션 상태 저장 (5분간 유지)
- 클라이언트 재접속 시 자동 복구
- 마지막 화면 상태 복원

**사용 예제**:
```csharp
var reconnect = new SessionReconnectManager(
    sessionTimeout: TimeSpan.FromMinutes(5),
    maxReconnectAttempts: 3
);

// 새 세션 생성
var sessionId = reconnect.CreateSession(client);

// 연결 끓김 시
reconnect.HandleDisconnect(sessionId, "Network error");

// 재연결 시도
if (reconnect.TryReconnectSession(sessionId, newClient))
{
    Console.WriteLine("세션 복구 성공");
}
```

### 다중 모니터 선택
1. "모니터 모드" 선택:
   - 모든 모니터 (가상 화면)
   - 주 모니터만
   - 특정 모니터
2. 특정 모니터 선택 시 인덱스 지정

**사용 예제**:
```csharp
var monitorManager = new MultiMonitorManager();

// 모니터 목록 출력
Console.WriteLine(monitorManager.GetMonitorsSummary());

// 특정 모니터 캡처
var bitmap = monitorManager.CaptureMonitor(monitorIndex: 1);

// 모든 모니터 캡처
var allMonitors = monitorManager.CaptureAllMonitors();
```

**모니터 정보**:
```csharp
foreach (var monitor in monitorManager.GetMonitors())
{
    Console.WriteLine($"{monitor.FriendlyName}");
    Console.WriteLine($"  크기: {monitor.Bounds.Width}x{monitor.Bounds.Height}");
    Console.WriteLine($"  위치: ({monitor.Bounds.X}, {monitor.Bounds.Y})");
    Console.WriteLine($"  주 모니터: {monitor.IsPrimary}");
}
```

### UPnP 자동 포트 포워딩
1. "UPnP 활성화" 체크
2. "서버 시작 시 자동 매핑" 체크 (권장)

**동작 방식**:
- 라우터에서 UPnP 게이트웨이 검색
- VNC 포트를 자동으로 라우터에 매핑
- 외부 IP 주소 표시
- 서버 종료 시 자동 제거

**사용 예제**:
```csharp
var upnp = new AutoPortForwardingManager();

// 게이트웨이 검색
if (await upnp.InitializeAsync())
{
    // 포트 포워딩 활성화
    await upnp.EnablePortForwardingAsync(5900);
    
    // 외부 IP 확인
    var externalIP = await upnp.GetExternalIPAsync();
    Console.WriteLine($"외부 접속: {externalIP}:5900");
}
```

**지원 프로토콜**:
- UPnP (Universal Plug and Play)
- SSDP (Simple Service Discovery Protocol)
- SOAP (Simple Object Access Protocol)

**주의사항**:
- 라우터가 UPnP를 지원해야 함
- 보안상 UPnP가 비활성화된 경우 수동 설정 필요
- 공유기 환경에서는 사용 제한될 수 있음

### 파일 전송
- VNC 세션을 통한 파일 송수신
- 단일 파일 또는 ZIP 압축 전송
- 진행률 표시

### 연결 로그 및 통계
로그 파일 위치:
```
%APPDATA%\VNCServer\vnc-server.log
```

통계 정보:
- 서버 가동 시간
- 총 연결 수 / 활성 연결 수
- 총 데이터 송수신량
- 최근 1000개 이벤트 기록

## 설정 파일 위치
설정은 자동으로 저장됩니다:
```
%APPDATA%\VNCServer\settings.json
```

## 보안 고려사항

⚠️ **중요**: 이 VNC 서버는 교육/테스트 목적으로 만들어졌습니다.

- 기본 VNC 인증은 보안이 약합니다
- 인터넷에 직접 노출하지 마세요
- 신뢰할 수 있는 네트워크에서만 사용하세요
- 강력한 비밀번호를 사용하세요
- 프로덕션 환경에서는 VPN이나 SSH 터널을 사용하세요

## 구현된 기능 ✅
- [x] **TLS/SSL 암호화** - 안전한 암호화 통신
- [x] **성능 최적화** - JPEG 압축, Zlib 압축, RLE 인코딩
- [x] **클립보드 동기화** - 텍스트 및 이미지 클립보드 자동 동기화
- [x] **파일 전송** - 단일 파일 및 ZIP 전송
- [x] **접속 로그 및 통계** - 연결 이력, 데이터 전송량 통계
- [x] **화면 품질/프레임레이트 조절** - 이미지 품질 및 FPS 설정
- [x] **선택 영역만 공유** - 특정 영역만 캡처하여 공유
- [x] **보기 전용 모드** - 원격 제어 권한 세밀화 (입력 차단 가능)
- [x] **IPv6 지원** - IPv4/IPv6 DualMode 지원
- [x] **화면 녹화** - 세션 녹화 및 이미지 시퀀스 저장
- [x] **웹 기반 관리 인터페이스** - HTTP REST API 및 웹 대시보드
- [x] **오디오 스트리밍** - 시스템 사운드/마이크 오디오 전송
- [x] **비디오 코덱 통합** - H.264/H.265 하드웨어 가속 인코딩
- [x] **터치 입력 지원** - 멀티터치 제스처 (10포인트)
- [x] **세션 재연결 기능** - 연결 끓김 시 자동 복구
- [x] **다중 모니터 선택** - 개별 모니터 또는 전체 공유
- [x] **UPnP 포트 포워딩** - 자동 라우터 설정

## 향후 개선 사항
- [ ] FFmpeg 통합 (실시간 H.264/H.265 인코딩)
- [ ] NAudio 통합 (고품질 오디오 캡처)
- [ ] Opus 코덱 (오디오 압축)
- [ ] 클라우드 연동 (원격 설정 동기화)
- [ ] 모바일 앱 클라이언트

## 라이선스
MIT License

## 문의
프로젝트 관련 문의나 버그 리포트는 GitHub Issues를 이용해주세요.
