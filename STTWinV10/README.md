# STTWinV10 - 실시간 음성 인식 (Whisper STT)

C#과 Whisper 모델을 사용한 실시간 음성 인식 애플리케이션입니다.

## 주요 기능

- ✅ **실시간 음성 인식**: 마이크 입력을 실시간으로 텍스트로 변환 (한국어 전용)
- ✅ **다중 Whisper 모델 지원**: Tiny/Base/Small/Large-v3 모델 선택 가능
- ✅ **자동 모델 다운로드**: 선택한 모델이 없으면 자동으로 다운로드
- ✅ **마이크 선택**: 시스템에 연결된 여러 마이크 중 선택 가능
- ✅ **볼륨 조절**: 마이크 입력 볼륨을 0~200% 범위로 조절
- ✅ **오디오 레벨 모니터링**: 실시간 오디오 입력 강도 표시
- ✅ **모던 다크 테마 UI**: 보기 좋은 그라디언트 다크 테마
- ✅ **텍스트 필터링**: [대괄호] 안의 불필요한 텍스트 자동 제거
- ✅ **실시간 처리**: 3초마다 자동으로 오디오 처리
- ✅ **수동 처리**: 즉시 처리 버튼으로 현재 버퍼 처리 가능

## 기술 스택

- **C# .NET 8.0** (WPF)
- **Whisper.net v1.7.0** - OpenAI Whisper 모델의 C# 래퍼
- **NAudio v2.2.1** - 실시간 오디오 캡처
- **System.Reactive v6.0.0** - 비동기 이벤트 처리

## 시스템 요구사항

- Windows 10/11
- .NET 8.0 Runtime
- 마이크 (오디오 입력 장치)
- RAM: 최소 4GB (Large 모델의 경우 8GB 권장)
- 디스크 공간:
  - Tiny 모델: 75MB
  - Base 모델: 142MB
  - Small 모델: 466MB
  - Large-v3 모델: 2.9GB

## 설치 및 실행

### 방법 1: MSI 설치 파일 (권장)

1. **MSI 다운로드**
   - [Releases](https://github.com/yourname/STTWinV10/releases)에서 최신 `STTWinV10Setup.msi` 다운로드

2. **설치**
   - MSI 파일을 더블클릭하여 설치 마법사 실행
   - 설치 경로: `C:\Program Files\STTWinV10\`
   - 시작 메뉴와 바탕화면에 바로가기 자동 생성

3. **실행**
   - 시작 메뉴에서 "STTWinV10" 또는 바탕화면 바로가기 클릭

### 방법 2: 소스 코드에서 빌드

#### 1. 프로젝트 빌드

```powershell
cd d:\Home\Projects\TestSimulator\STTWinV10
dotnet restore
dotnet build
```

#### 2. 실행

```powershell
dotnet run --project STTWinV10\STTWinV10.csproj
```

또는 Visual Studio에서 F5를 눌러 실행합니다.

### 3. 첫 실행

첫 실행 시 Whisper Base 모델(약 142MB)이 자동으로 다운로드됩니다.
모델은 `%APPDATA%\STTWinV10\ggml-base.bin`에 저장됩니다.

## 사용 방법

### 기본 사용

1. **마이크 선택**: 드롭다운에서 사용할 마이크를 선택합니다
2. **모델 선택**: Tiny(빠름)/Base(권장)/Small(정확)/Large-v3(최고) 중 선택
   - 선택 시 해당 모델이 자동으로 다운로드됩니다
3. **볼륨 조절**: 슬라이더로 마이크 입력 볼륨을 0~200% 범위로 조절
4. **시작 버튼**: 실시간 음성 인식을 시작합니다
5. **오디오 레벨**: 녹색 바로 현재 마이크 입력 강도를 확인
6. **마이크에 말하기**: 음성이 자동으로 텍스트로 변환됩니다 (3초 간격)
7. **즉시 처리 버튼**: 3초를 기다리지 않고 현재 버퍼를 즉시 처리
8. **중지 버튼**: 음성 인식을 중지합니다
9. **지우기 버튼**: 인식된 텍스트를 모두 지웁니다

### 주의사항

- 모델 변경은 인식이 중지된 상태에서만 가능합니다
- Large-v3 모델은 파일 크기가 2.9GB로 크므로 다운로드에 시간이 걸립니다
- 볼륨을 너무 높이면 왜곡이 발생할 수 있습니다 (100%~150% 권장)

## 프로젝트 구조

```
STTWinV10/
├── .gitignore                       # Git 제외 파일 목록
├── README.md                        # 프로젝트 문서
├── STTWinV10.sln                    # Visual Studio 솔루션
├── STTWinV10/
│   ├── STTWinV10.csproj            # 프로젝트 파일
│   ├── daemon_hammer.ico            # 애플리케이션 아이콘
│   ├── App.xaml                     # WPF 애플리케이션
│   ├── App.xaml.cs                  # 전역 예외 처리
│   ├── MainWindow.xaml              # 메인 UI (모던 다크 테마)
│   ├── MainWindow.xaml.cs           # UI 이벤트 핸들러
│   └── Services/
│       ├── AudioCaptureService.cs   # NAudio 기반 오디오 캡처
│       ├── WhisperSTTService.cs     # Whisper 모델 관리 및 STT
│       └── RealtimeSTTService.cs    # 실시간 처리 파이프라인
└── STTWinV10.Installer/
    ├── STTWinV10.Installer.wixproj  # WiX 설치 프로젝트
    ├── Product.wxs                  # MSI 패키지 정의
    ├── License.rtf                  # 라이선스 문서
    └── BUILD.md                     # 빌드 가이드
```

## 주요 클래스 설명

### AudioCaptureService
- **오디오 캡처**: NAudio의 WaveInEvent를 사용하여 마이크 입력 캡처
- **포맷**: 16kHz, 16-bit PCM, Mono 채널
- **장치 선택**: 시스템의 여러 마이크 중 선택 가능 (DeviceNumber)
- **볼륨 게인**: 0.0~2.0 범위로 입력 볼륨 조절 (VolumeGain)
- **오디오 레벨**: RMS(Root Mean Square) 계산으로 실시간 오디오 강도 측정
- **버퍼 관리**: 오디오 데이터를 내부 버퍼에 저장 및 관리

### WhisperSTTService
- **모델 초기화**: Whisper.net을 사용하여 GGML 모델 로드
- **자동 다운로드**: WhisperGgmlDownloader로 누락된 모델 자동 다운로드
- **한국어 전용**: `.WithLanguage("ko")` 설정으로 한국어 인식
- **텍스트 필터링**: 정규식으로 `[대괄호]` 안의 불필요한 텍스트 제거
- **음성 인식**: float[] 오디오 데이터를 텍스트로 변환
- **비동기 처리**: SemaphoreSlim으로 동시 처리 방지

### RealtimeSTTService
- **파이프라인 조율**: AudioCaptureService와 WhisperSTTService를 연결
- **주기적 처리**: Timer를 사용하여 3초마다 버퍼 처리
- **최소 버퍼**: 0.5초(8000 샘플) 이상의 오디오만 처리
- **이벤트 전달**: TranscriptionReceived, StatusChanged, AudioLevelChanged 등
- **마이크 제어**: 장치 선택 및 볼륨 조절 인터페이스 제공
- **수동 처리**: ProcessCurrentBufferAsync()로 즉시 처리 가능

## 고급 설정

### 처리 간격 변경
`MainWindow.xaml.cs`의 RealtimeSTTService 생성 시 간격 조정:

```csharp
_sttService = new RealtimeSTTService(_whisperService, processingIntervalSeconds: 3.0);
```

- 짧은 간격(1~2초): 더 빠른 응답, CPU 사용량 증가
- 긴 간격(5~10초): 더 긴 문장 인식, CPU 사용량 감소

### 모델 선택

**GUI에서 선택**: 애플리케이션 상단의 모델 드롭다운에서 선택
- 실행 중이 아닐 때만 변경 가능
- 선택 시 자동으로 다운로드

**모델 크기 및 특징:**
- **Tiny (75MB)**: 가장 빠름, 정확도 낮음, 저사양 PC 적합
- **Base (142MB)**: 균형잡힌 성능, 기본 권장 모델
- **Small (466MB)**: 높은 정확도, 4GB RAM 이상 권장
- **Large-v3 (2.9GB)**: 최고 정확도, 8GB RAM 이상 권장

### 오디오 설정

**샘플레이트**: `AudioCaptureService` 생성 시 변경 (기본 16kHz)
```csharp
_audioCaptureService = new AudioCaptureService(sampleRate: 16000, channels: 1);
```

**버퍼 크기**: `AudioCaptureService.cs`의 BufferMilliseconds 조정 (기본 100ms)
```csharp
BufferMilliseconds = 100
```

### 텍스트 필터링

`WhisperSTTService.cs`의 `CleanTranscriptionText` 메서드에서 필터링 규칙 수정:
```csharp
private string CleanTranscriptionText(string text)
{
    // [대괄호] 안의 텍스트 제거
    text = Regex.Replace(text, @"\[.*?\]", "");
    return text.Trim();
}
```

## MSI 설치 파일 빌드

### 사전 요구사항

1. **WiX Toolset v4 설치**
   ```powershell
   dotnet tool install --global wix --version 4.0.5
   ```

2. **Visual Studio 2022 이상** (Release 빌드용)

### Release 빌드 및 MSI 생성

#### Visual Studio에서:
1. 빌드 구성을 `Release | x64`로 변경
2. `STTWinV10.Installer` 프로젝트 빌드
3. 생성된 MSI 파일 위치: `STTWinV10.Installer\bin\x64\Release\STTWinV10Setup.msi`

#### 명령줄에서:
```powershell
# 1. Release 모드로 애플리케이션 빌드
dotnet build -c Release

# 2. MSI 설치 파일 생성
dotnet build STTWinV10.Installer\STTWinV10.Installer.wixproj -c Release
```

생성된 MSI 파일: `STTWinV10.Installer\bin\x64\Release\STTWinV10Setup.msi` (약 1.8MB)

### MSI 파일 특징

- **버전**: 1.3.0.0
- **플랫폼**: x64 (64비트)
- **설치 위치**: `C:\Program Files\STTWinV10\`
- **바로가기**: 시작 메뉴 + 바탕화면 (설치 시 선택 가능)
- **아이콘**: daemon_hammer.ico
- **포함 내용**: 모든 실행 파일, DLL, 런타임 파일, 아이콘

설치 시 사용자는 시작 메뉴 바로가기와 바탕화면 바로가기를 선택적으로 설치할 수 있습니다.

자세한 빌드 방법은 [STTWinV10.Installer/BUILD.md](STTWinV10.Installer/BUILD.md)를 참고하세요.

## 문제 해결

### 모델 다운로드 실패
- **원인**: 인터넷 연결 불안정, 방화벽 차단
- **해결**: 
  - 인터넷 연결 확인
  - 방화벽에서 애플리케이션 허용
  - 수동 다운로드: [Whisper Models](https://huggingface.co/ggerganov/whisper.cpp)
  - `%APPDATA%\STTWinV10\` 폴더에 수동으로 저장

### 마이크가 인식되지 않음
- **원인**: 마이크 권한 없음, 드라이버 문제
- **해결**:
  - Windows 설정 → 개인 정보 → 마이크 권한 확인
  - 기본 녹음 장치로 설정
  - 마이크 드라이버 업데이트

### 인식 정확도가 낮음
- **원인**: 배경 소음, 마이크 품질, 작은 모델 사용
- **해결**:
  - Large-v3 모델 사용 (최고 정확도)
  - 배경 소음 제거
  - 마이크와 입의 거리 10~30cm 유지
  - 볼륨 슬라이더를 100~150% 범위로 조정

### 잘못된 글자가 계속 입력됨
- **원인**: 배경 소음이나 작은 소리를 인식
- **해결**:
  - 볼륨 슬라이더를 낮춤 (50~80% 범위)
  - 조용한 환경에서 사용
  - 마이크 감도 조절 (Windows 사운드 설정)

### 애플리케이션 재빌드 실패 (MSB3027)
- **원인**: 실행 중인 프로세스가 파일 잠금
- **해결**:
  ```powershell
  taskkill /F /IM STTWinV10.exe
  ```

### 메모리 부족 오류
- **원인**: Large 모델이 RAM을 많이 사용
- **해결**:
  - Small 또는 Base 모델로 변경
  - 다른 애플리케이션 종료
  - 최소 8GB RAM 확보

## UI 특징

- **모던 다크 테마**: 그라디언트 배경 (#1A1A2E → #16213E → #0F3460)
- **보라색 강조색**: (#6C5CE7)
- **900x900 창 크기**: 넓은 인식 결과 표시 공간
- **드롭 섀도우 효과**: 버튼과 UI 요소에 입체감
- **커스텀 컨트롤**: ComboBox, Slider, ProgressBar 등 맞춤 디자인
- **실시간 피드백**: 오디오 레벨 바, 상태 표시, 애니메이션 효과

## 개발 환경

- Visual Studio 2022 (권장)
- .NET 8.0 SDK
- Windows 10 SDK

## 알려진 제한사항

- 현재 한국어만 지원 (`.WithLanguage("ko")` 설정)
- 실시간 처리는 3초 간격으로 동작 (조정 가능)
- Large-v3 모델은 8GB RAM 이상 권장
- 인터넷 연결이 필요 (첫 실행 시 모델 다운로드)

## 버전 히스토리

- **v1.0**: 기본 실시간 STT 기능
- **v1.1**: 마이크 선택, 볼륨 조절, 오디오 레벨 표시 추가
- **v1.2**: 모델 선택 기능, 자동 다운로드, 텍스트 필터링 추가
- **v1.3**: Large-v3 모델 지원, UI 개선 (900x900 창)

## 라이선스

이 프로젝트는 교육 및 개인 사용 목적으로 제공됩니다.

## 기여

버그 리포트나 기능 제안은 환영합니다!

## 참고 자료

- [Whisper.net GitHub](https://github.com/sandrohanea/whisper.net)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [NAudio](https://github.com/naudio/NAudio)
- [Whisper GGML Models](https://huggingface.co/ggerganov/whisper.cpp)
