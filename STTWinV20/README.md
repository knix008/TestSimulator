# STTWinV20 — 한국어 실시간 음성 인식 (Windows WPF)

C# WPF로 작성한 Windows 전용 한국어 Speech-to-Text 데스크탑 애플리케이션입니다.  
[STTGTKV10](../STTGTKV10)(Linux GTK3/C++) 과 동일한 기능을 Windows에서 제공합니다.

## 기술 스택

| 역할 | 라이브러리 |
|------|-----------|
| STT 엔진 | [Whisper.net](https://github.com/sandrohanea/whisper.net) 1.7.0 (whisper.cpp 래퍼) |
| 오디오 캡처 | NAudio 2.2.1 |
| 동영상·오디오 재생 | WPF MediaElement (Windows Media Foundation) |
| 파일 오디오 추출 | NAudio MediaFoundationReader |
| GUI | WPF (.NET 8, XAML) |
| 모델 다운로드 | HttpClient (Hugging Face) |
| 인스톨러 | WiX Toolset 4.0.5 (MSI) |

## 파일 구조

```
STTWinV20/
├── STTWinV20.slnx                      솔루션
├── STTWinV20/
│   ├── STTWinV20.csproj
│   ├── App.xaml / App.xaml.cs
│   ├── MainWindow.xaml                 전체 UI 레이아웃
│   ├── MainWindow.xaml.cs              이벤트 핸들러 + 상태 관리
│   ├── daemon_hammer.ico               애플리케이션 아이콘
│   └── Services/
│       ├── AudioDevice.cs              마이크 장치 DTO
│       ├── OutputFilter.cs             텍스트 출력 필터 (STTGTKV10 동일 규칙)
│       ├── VadProcessor.cs             VAD (음성 활동 감지, 프리롤 192ms)
│       ├── WhisperModelManager.cs      모델 다운로드·경로 관리
│       ├── SttProcessor.cs             Whisper.net 래퍼 (마이크/파일 모드)
│       ├── MicSttService.cs            마이크 STT 파이프라인
│       └── FileSttService.cs           파일 오디오 추출 + STT 파이프라인
└── STTWinV20.Installer/
    ├── STTWinV20.Installer.wixproj     WiX v4 MSI 프로젝트
    ├── Product.wxs                     설치 정의 (바로가기 선택 포함)
    └── License.rtf
```

## 기능

### 마이크 실시간 STT
- VAD(음성 활동 감지) 기반 — 무음 700ms 후 세그먼트 전송
- 프리롤 버퍼(~192ms)로 단어 시작부 손실 방지
- 마이크 목록 열거 및 전환
- 볼륨 게인 조절 (0 – 200%)

### 동영상 / 오디오 파일 STT
- MP4, MKV, AVI, MOV, WebM, WMV, MP3, WAV, AAC, OGG, FLAC, M4A 지원
- 재생 중 동시 STT (WPF MediaElement + NAudio MediaFoundationReader)
- 재생 제어: 일시정지 / 재생, 시크바 드래그
- 시크 시 파일 STT 위치 자동 재동기화
- 일시정지·재생 시 화면 중앙 아이콘 오버레이(페이드아웃)
- 오디오 전용 파일은 🎵 안내 표시

### 공통
- 모델 선택 및 자동 다운로드 (Hugging Face, 진행률 표시)
- 결과 텍스트 클립보드 복사
- 안전한 백그라운드 스레드 정리

## UI 레이아웃

```
┌─────────────────────────────────────────────┐
│ 🎙️ 마이크  [ComboBox────────────────] [🔄]  │
│ 🤖 모델    [ComboBox────────────────] [⬇]   │
│ 🔊 볼륨    [Slider───────────────────] 100% │
├─────────────────────────────────────────────┤  ← GridSplitter (크기 조절)
│ ┌── 동영상 ──────────────────────────────┐  │
│ │  (파일 미선택 시 안내 / 실제 동영상)    │  │
│ │  [⏸]  [시크바──────────────]  0:00/5:23│  │
│ └────────────────────────────────────────┘  │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ ┌── STT 결과 ─────────────────────────────┐ │
│ │  인식된 텍스트...                        │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ [🎙️ STT 시작] [📂 파일 열기] [⏹ 닫기]      │
│ [🗑️ 지우기]   [📋 복사]                     │
├─────────────────────────────────────────────┤
│ ● 준비                        Whisper STT v2.0│
└─────────────────────────────────────────────┘
```

## STT 처리 모드

| 파라미터 | 마이크 모드 | 파일 모드 |
|----------|------------|---------|
| `vad_thresh` | 0.015 | 0.030 |
| `min_speech_frames` | 8 (256ms) | 12 (384ms) |
| `silence_end` | 700ms | 700ms |
| `rms_normalize` 상한 | 8× | 3× |
| `initial_prompt` | 한국어 프롬프트 | 없음 |

## 출력 필터 규칙

| 규칙 | 예시 |
|------|------|
| `[...]` / `(...)` 시작 거부 | `[음악]`, `(박수)` |
| `-` / `–` / `—` 시작 거부 | `– 음악 환각 패턴` |
| 공백·기호만 거부 | `…`, `♪` |
| 한글 또는 ASCII 영숫자 필수 | |
| Whisper 한국어 환각 패턴 거부 | `MBC 뉴스`, `구독과 좋아요` 등 |
| 연속 중복 억제 | 앞 10자가 직전 결과와 동일하면 차단 |

## 지원 모델

| 이름 | 크기 | 특징 |
|------|------|------|
| Tiny | ~75 MB | 가장 빠름 |
| Base | ~142 MB | 속도/정확도 균형 |
| Small | ~466 MB | **권장** – 한국어 최적 |
| Medium | ~1.5 GB | 고정확도 |
| Large-v3-Turbo | ~1.6 GB | 빠른 대형 모델 |
| Large-v3 | ~3.1 GB | 최고 정확도 |

모델 저장 위치: `%LOCALAPPDATA%\STTWinV20\models\`

## 빌드

### 요구사항
- .NET 8 SDK
- Visual Studio 2022/2026 (WPF 워크로드)
- WiX Toolset 4.0.5 (MSI 빌드 시)

### 앱 빌드

```powershell
dotnet build STTWinV20/STTWinV20.csproj
```

### MSI 인스톨러 빌드 (Release)

```powershell
# 솔루션 전체 빌드 — 앱 + MSI 동시 생성
dotnet build STTWinV20.slnx -c Release

# MSI만 빌드
dotnet build STTWinV20.Installer/STTWinV20.Installer.wixproj -c Release
```

MSI 출력: `STTWinV20.Installer\bin\x64\Release\STTWinV20Setup.msi`

Visual Studio에서 솔루션을 **Release** 구성으로 빌드하면 MSI가 자동 생성됩니다.

### 인스톨러 기능 선택

설치 중 **기능 선택** 화면에서 바로가기를 선택/해제할 수 있습니다:

```
☑ STTWinV20 (필수)
   ☑ 시작 메뉴 바로가기  ← 기본 선택, 해제 가능
   ☑ 바탕화면 바로가기   ← 기본 선택, 해제 가능
```

## 실행

1. 앱 실행
2. 모델 선택 (기본: Small ~466MB) → **⬇ 다운로드** 클릭
3. **마이크 STT**: 🎙️ STT 시작 클릭
4. **파일 STT**: 📂 파일 열기 → 동영상/오디오 선택
