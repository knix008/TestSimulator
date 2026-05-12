# STTWinV10 — 실시간 음성 인식 (Whisper STT)

C#과 Whisper 모델을 사용한 Windows용 실시간 음성 인식(WPF) 애플리케이션입니다.

## 주요 기능

- **실시간 음성 인식**: 마이크 입력을 실시간으로 텍스트로 변환 (한국어)
- **다중 Whisper 모델**: Tiny / Base / Small / Large-v3 선택
- **자동 모델 다운로드**: 선택한 모델이 없으면 자동 다운로드
- **마이크 선택**, **볼륨(0~200%)**, **오디오 레벨 모니터링**
- **다크 테마 UI**, **대괄호 `[...]` / `［...］` 메타 구간 제거**(Whisper 자막·태그)
- **주기 처리**(기본 약 3초) + **즉시 처리** 버튼

## 기술 스택

- **C# .NET 8** (WPF)
- **Whisper.net** 1.7.0 — Whisper GGML 모델
- **NAudio** 2.2.1 — 오디오 캡처
- **System.Reactive** 6.0.0 — 비동기 파이프라인
- **WiX Toolset SDK** 7 (`WixToolset.Sdk`, NuGet) — MSI 설치 패키지

## 시스템 요구사항

- Windows 10/11 (x64)
- [.NET 8 런타임](https://dotnet.microsoft.com/download/dotnet/8.0)
- 마이크
- RAM: 최소 4GB (Large-v3는 8GB 권장)
- 디스크(모델): Tiny ~75MB · Base ~142MB · Small ~466MB · Large-v3 ~2.9GB

## 설치 및 실행

### 방법 1: MSI 설치 파일

1. `STTWinV10Setup.msi` 실행(배포 페이지 또는 `STTWinV10.Installer\bin\x64\Release\`에서 빌드 산출물 사용)  
2. 기본 설치 경로: `C:\Program Files\STTWinV10\`  
3. 시작 메뉴·바탕화면 바로가기는 설치 마법사에서 선택 가능합니다.

### 방법 2: 소스에서 빌드·실행

```powershell
cd <저장소 루트>
dotnet restore
dotnet build -c Debug
dotnet run --project STTWinV10\STTWinV10.csproj
```

Visual Studio에서는 `STTWinV10.sln`을 연 뒤 F5로 실행합니다.

### 첫 실행과 모델 경로

선택한 모델이 없으면 자동으로 내려받습니다. 예시(Base):

`%APPDATA%\STTWinV10\ggml-base.bin`

## 사용 방법

1. **마이크** 선택  
2. **모델** 선택(인식 중이 아닐 때만 변경). 필요 시 자동 다운로드  
3. **볼륨** 슬라이더로 입력 게인 조절(100~150% 권장)  
4. **시작**으로 인식 시작 → 주기적으로 또는 **즉시 처리**로 변환  
5. **중지** / **지우기**로 제어  

**주의**: Large-v3는 용량·RAM 부담이 큽니다. 모델 변경은 인식 **중지 후**에만 가능합니다.

## 프로젝트 구조

```
STTWinV10/
├── .gitignore
├── README.md
├── STTWinV10.sln
├── STTWinV10/
│   ├── STTWinV10.csproj
│   ├── PERFORMANCE_GUIDE.md      # 성능 튜닝 참고
│   ├── App.xaml / App.xaml.cs
│   ├── MainWindow.xaml / .cs
│   └── Services/
│       ├── AudioCaptureService.cs
│       ├── WhisperSTTService.cs
│       └── RealtimeSTTService.cs
└── STTWinV10.Installer/
    ├── STTWinV10.Installer.wixproj
    ├── Product.wxs
    ├── License.rtf
    └── BUILD.md
```

## 주요 클래스 요약

### AudioCaptureService

- NAudio `WaveInEvent`, 기본 **16 kHz**, mono, 장치 번호·**VolumeGain**(0~2)·RMS 레벨

### WhisperSTTService

- Whisper.net으로 GGML 로드, **`WithLanguage("ko")`만 지정**하고 나머지는 라이브러리 기본값, 출력에서 **`[` `]` / `［` `］` 메타 블록만** 구조적으로 제거

### RealtimeSTTService

- 캡처와 Whisper 연결, 타이머 주기 처리, 최소 버퍼 샘플 수, `ProcessCurrentBufferAsync()` 즉시 처리

고급 설정 예시는 아래 **고급 설정**을 참고하세요.

## 고급 설정

### 처리 간격

`MainWindow.xaml.cs`에서 `RealtimeSTTService` 생성 시:

```csharp
_sttService = new RealtimeSTTService(_whisperService, processingIntervalSeconds: 3.0);
```

간격을 줄이면 반응은 빨라지고 CPU 부하는 늘어날 수 있습니다.

### 오디오

`AudioCaptureService`의 샘플레이트·채널, `BufferMilliseconds`(기본 100ms) 등은 해당 클래스에서 조정합니다.

### Whisper 디코더

`WhisperSTTService`는 **`ko`만 고정**하고, `CreateBuilder()`에는 **`WithLanguage` 외 옵션을 넣지 않습니다**. 추가 튜닝은 `WhisperSTTService.cs`의 빌더 체인을 수정하세요. 실시간 간격·버퍼는 `RealtimeSTTService`와 [PERFORMANCE_GUIDE.md](STTWinV10/PERFORMANCE_GUIDE.md)를 참고하세요.

### 대괄호·메타 텍스트

`WhisperSTTService`는 **`[` `]` / `［` `］`로만 감싼 블록**을 제거합니다(Whisper 자막·이벤트 태그 형식). 괄호 밖의 전사는 바꾸지 않으며, 키워드 추측·치환은 하지 않습니다.

## MSI 빌드 (개발자)

설치 프로젝트는 **WiX Toolset SDK 7**을 NuGet 패키지(`WixToolset.Sdk`)로 사용합니다. 일반적으로 **별도 WiX 전역 도구 설치 없이** `dotnet restore` 후 빌드하면 됩니다.

| 방법 | 설명 |
|------|------|
| 솔루션 Release | `dotnet build STTWinV10.sln -c Release` — 앱과 설치 프로젝트가 함께 빌드되면 MSI 생성 |
| 앱 프로젝트만 Release | `dotnet build STTWinV10\STTWinV10.csproj -c Release` — Release 시 MSI까지 연쇄 빌드 |
| 설치 프로젝트만 | `dotnet build STTWinV10.Installer\STTWinV10.Installer.wixproj -c Release -p:Platform=x64` |

**MSI 출력 경로**

`STTWinV10.Installer\bin\x64\Release\STTWinV10Setup.msi`

Visual Studio에서는 **Release** 구성으로 **솔루션 빌드**하고, **구성 관리자**에서 `STTWinV10.Installer`에 **빌드**가 체크되어 있는지 확인하세요.

연쇄 MSI를 끄려면: `/p:DisableInstallerChain=true`

상세 절차·기능 트리 UI는 [STTWinV10.Installer/BUILD.md](STTWinV10.Installer/BUILD.md)를 참고하세요.

## 문제 해결

### 모델 다운로드 실패

- 네트워크·방화벽 확인  
- [Whisper GGML 모델](https://huggingface.co/ggerganov/whisper.cpp)에서 수동 다운로드 후 `%APPDATA%\STTWinV10\`에 배치

### 마이크 미인식

- Windows 설정 → 개인 정보 → 마이크  
- 기본 녹음 장치·드라이버 확인

### 정확도 낮음

- 더 큰 모델, 조용한 환경, 마이크 거리(약 10~30cm), 볼륨 100~150% 근처

### 빌드 시 파일 잠김 (MSB3027 등)

```powershell
taskkill /F /IM STTWinV10.exe
```

### 메모리 부족(Large)

- Base/Small로 낮추거나 RAM·다른 앱 사용량 조정

## UI·개발 환경

- 다크 그라디언트 테마, 강조색, 그림자 등 WPF 커스텀 스타일  
- **Visual Studio 2022 이상** 권장, **.NET 8 SDK**, Windows 10 SDK  

성능 관련 팁은 [STTWinV10/PERFORMANCE_GUIDE.md](STTWinV10/PERFORMANCE_GUIDE.md)를 참고하세요.

## 알려진 제한 사항

- 인식 언어는 현재 한국어 중심 설정  
- 주기 처리 간격은 기본 약 3초(코드에서 변경 가능)  
- Large-v3는 8GB RAM 권장  
- 첫 모델 다운로드에는 인터넷 필요  

## 버전 히스토리

- **v1.0**: 기본 실시간 STT  
- **v1.1**: 마이크 선택, 볼륨, 레벨 미터  
- **v1.2**: 모델 선택, 자동 다운로드, 텍스트 필터  
- **v1.3**: Large-v3, UI(900×900 등) 개선  

## 라이선스·기여

교육·개인 목적 배포에 가깝게 제공됩니다. 버그·제안은 이슈로 남겨 주세요.

## 참고 자료

- [Whisper.net](https://github.com/sandrohanea/whisper.net)  
- [OpenAI Whisper](https://github.com/openai/whisper)  
- [NAudio](https://github.com/naudio/NAudio)  
- [WiX Toolset](https://wixtoolset.org/docs/intro/)  
