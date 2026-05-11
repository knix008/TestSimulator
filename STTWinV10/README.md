# STTWinV10 - 실시간 음성 인식 (Whisper STT)

C#과 Whisper 모델을 사용한 실시간 음성 인식 애플리케이션입니다.

## 기능

- ✅ **실시간 음성 인식**: 마이크 입력을 실시간으로 텍스트로 변환
- ✅ **Whisper 모델 사용**: OpenAI의 Whisper 모델 (한국어 지원)
- ✅ **자동 모델 다운로드**: 첫 실행 시 자동으로 모델 다운로드
- ✅ **WPF UI**: 사용하기 쉬운 윈도우 인터페이스
- ✅ **실시간 처리**: 3초마다 자동으로 오디오 처리
- ✅ **수동 처리**: 즉시 처리 버튼으로 수동 실행 가능

## 기술 스택

- **C# .NET 8.0** (WPF)
- **Whisper.net** - OpenAI Whisper 모델의 C# 래퍼
- **NAudio** - 오디오 캡처 라이브러리
- **System.Reactive** - 비동기 이벤트 처리

## 시스템 요구사항

- Windows 10/11
- .NET 8.0 Runtime
- 마이크 (오디오 입력 장치)
- 최소 4GB RAM (모델 로딩용)
- 약 200MB 디스크 공간 (모델 다운로드용)

## 설치 및 실행

### 1. 프로젝트 빌드

```powershell
cd d:\Home\Projects\TestSimulator\STTWinV10
dotnet restore
dotnet build
```

### 2. 실행

```powershell
dotnet run --project STTWinV10\STTWinV10.csproj
```

또는 Visual Studio에서 F5를 눌러 실행합니다.

### 3. 첫 실행

첫 실행 시 Whisper Base 모델(약 140MB)이 자동으로 다운로드됩니다.
모델은 `%APPDATA%\STTWinV10\ggml-base.bin`에 저장됩니다.

## 사용 방법

1. **시작 버튼 클릭**: 실시간 음성 인식을 시작합니다
2. **마이크에 말하기**: 음성이 자동으로 텍스트로 변환됩니다
3. **즉시 처리**: 현재까지 녹음된 오디오를 즉시 처리합니다
4. **중지 버튼**: 음성 인식을 중지합니다
5. **지우기 버튼**: 인식된 텍스트를 지웁니다

## 프로젝트 구조

```
STTWinV10/
├── STTWinV10.sln                    # Visual Studio 솔루션
├── STTWinV10/
│   ├── STTWinV10.csproj            # 프로젝트 파일
│   ├── App.xaml                     # WPF 애플리케이션
│   ├── App.xaml.cs
│   ├── MainWindow.xaml              # 메인 윈도우 UI
│   ├── MainWindow.xaml.cs          # 메인 윈도우 로직
│   └── Services/
│       ├── AudioCaptureService.cs   # 오디오 캡처
│       ├── WhisperSTTService.cs     # Whisper STT 엔진
│       └── RealtimeSTTService.cs    # 실시간 처리 파이프라인
└── README.md
```

## 주요 클래스 설명

### AudioCaptureService
- NAudio를 사용하여 마이크에서 오디오 캡처
- 16kHz, 16-bit, Mono 형식으로 캡처
- 버퍼링된 오디오 데이터 관리

### WhisperSTTService
- Whisper 모델 초기화 및 관리
- 오디오 데이터를 텍스트로 변환
- 한국어 언어 설정 (`ko`)

### RealtimeSTTService
- AudioCaptureService와 WhisperSTTService 연결
- 주기적으로 오디오 버퍼 처리 (기본 3초)
- 이벤트 기반 결과 전달

## 설정 변경

### 처리 간격 변경
`MainWindow.xaml.cs`에서 처리 간격을 조정할 수 있습니다:

```csharp
_sttService = new RealtimeSTTService(whisperService, processingIntervalSeconds: 3.0);
```

### 모델 변경
다른 Whisper 모델을 사용하려면 `WhisperSTTService.cs`의 `DownloadModelAsync` 메서드를 수정하세요:

```csharp
// 옵션: Tiny, Base, Small, Medium, Large
using var modelStream = await WhisperGgmlDownloader.GetGgmlModelAsync(GgmlType.Small);
```

**모델 크기 비교:**
- Tiny: ~75MB (가장 빠름, 정확도 낮음)
- Base: ~140MB (균형)
- Small: ~460MB (더 정확함)
- Medium: ~1.5GB (매우 정확함)
- Large: ~2.9GB (최고 정확도)

### 샘플레이트 변경
`AudioCaptureService` 생성 시 샘플레이트 조정:

```csharp
_audioCaptureService = new AudioCaptureService(sampleRate: 16000, channels: 1);
```

## 문제 해결

### 모델 다운로드 실패
- 인터넷 연결을 확인하세요
- 방화벽 설정을 확인하세요
- 수동으로 모델을 다운로드하여 `%APPDATA%\STTWinV10\`에 저장하세요

### 마이크가 인식되지 않음
- Windows 설정에서 마이크 권한을 확인하세요
- 기본 녹음 장치가 올바르게 설정되었는지 확인하세요

### 인식 정확도가 낮음
- 더 큰 모델(Small 또는 Medium)을 사용해보세요
- 마이크와의 거리를 조정하세요
- 배경 소음을 줄이세요

## 라이선스

이 프로젝트는 교육 및 개인 사용 목적으로 제공됩니다.

## 기여

버그 리포트나 기능 제안은 환영합니다!

## 참고 자료

- [Whisper.net GitHub](https://github.com/sandrohanea/whisper.net)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [NAudio](https://github.com/naudio/NAudio)
