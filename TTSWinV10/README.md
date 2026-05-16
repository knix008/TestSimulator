# TTSWinV10

Windows Forms 기반 텍스트 음성 변환(TTS) 데스크톱 앱입니다. 입력한 텍스트 또는 텍스트 파일을 읽어 주고, 볼륨 조절·실시간 파형·텍스트–재생 동기·WAV/MP3 저장을 지원합니다.

## 요구 사항

- Windows 10 이상 권장(자동 Sherpa 모델 설치 시 **내장 `tar.exe`** 로 `.tar.bz2` 해제)
- [.NET Framework 4.8 개발 팩 또는 런타임](https://dotnet.microsoft.com/download/dotnet-framework/net48)
- Visual Studio 2022 또는 `dotnet` CLI(Windows에서 SDK 스타일 `net481` WinForms 프로젝트 빌드 가능한 환경)

## 빌드 및 실행

```powershell
dotnet restore
dotnet build -c Release
dotnet run --project TTSWinV10.csproj
```

실행 파일은 `bin\Release\net481\TTSWinV10.exe` 에 생성됩니다. Release 빌드 시 솔루션에 WiX 설치 프로젝트가 포함되어 있으면 MSI가 이어서 빌드될 수 있습니다(실행 중인 exe가 출력 폴더를 잠그면 복사 오류가 날 수 있음).

## 음성 합성 방식

합성 방식 콤보에서 선택할 수 있습니다.

| 방식 | 설명 |
|------|------|
| **SAPI 5** | `System.Speech` — 설치형 데스크톱 음성 |
| **WinRT** | `Windows.Media.SpeechSynthesis` — 시스템 음성 |
| **Sherpa ONNX (한국어)** | [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 오프라인 VITS(Mimic3 KSS low). NuGet 패키지 `org.k2fsa.sherpa.onnx` 사용 |

### Sherpa 한국어 모델

- 첫 재생 시 모델이 없으면 공식 `tts-models` 아카이브에서 **자동 다운로드·압축 해제**합니다.
- 기본 저장 위치: **프로젝트 루트 `models\vits-mimic3-ko_KO-kss_low\`** (쓰기 불가 시 `%LocalAppData%\TTSWinV10\models\` 등).
- **다른 디스크/폴더에 ONNX를 두려면** 다음 중 하나를 사용합니다.
  - 환경 변수 **`TTSWINV10_SHERPA_KO_MODEL_DIR`**: `ko_KO-kss_low.onnx`, `tokens.txt`, `espeak-ng-data` 가 들어 있는 **모델 폴더 전체** 경로.
  - 환경 변수 **`TTSWINV10_SHERPA_MODELS_ROOT`**: 그 아래에 `models\vits-mimic3-ko_KO-kss_low\` 구조로 저장하거나 받습니다.
  - 실행 파일과 같은 폴더의 **`SherpaKoModelDir.txt`** / **`SherpaModelsRoot.txt`**: 위와 동일 의미로 **한 줄**(주석은 `#` 로 시작). 환경 변수가 우선합니다.
- 경로에 `%USERNAME%` 등 환경 변수 치환을 사용할 수 있습니다. 이 두 설정 파일은 보통 PC마다 경로가 달라 `.gitignore`에 포함되어 있습니다.

## 기능

- 텍스트 입력 및 `.txt` 파일 열기(예: `inputs\sample_korean_tts.txt`)
- **읽기**: 선택한 합성 방식으로 WAV 합성 후 재생
- **볼륨**: 슬라이더로 재생 및 저장 시 동일하게 적용
- **파형**: 합성 후 베이크된 파형, 재생 중 재생 위치 표시·드래그 시크
- **저장**: WAV, MP3(Windows Media Foundation 인코더 사용; OS/에디션에 따라 MP3 실패 시 WAV 사용을 권장)

## 사용한 주요 기술

- .NET Framework 4.8, WinForms
- [NAudio](https://github.com/naudio/NAudio) 2.2.1 (재생, 볼륨, WAV/MP3 인코딩)
- `System.Speech`(SAPI), Windows SDK Contracts(WinRT 음성)
- [org.k2fsa.sherpa.onnx](https://www.nuget.org/packages/org.k2fsa.sherpa.onnx)(Sherpa-ONNX 한국어 오프라인 TTS)

## 라이선스

프로젝트에 별도 라이선스 파일이 없다면 저장소 소유자에게 문의하세요. 서드파티(NAudio, sherpa-onnx, ONNX Runtime, WiX 등)는 각 패키지/프로젝트 라이선스를 따릅니다.
