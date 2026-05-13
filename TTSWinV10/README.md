# TTSWinV10

Windows Forms 기반 텍스트 음성 변환(TTS) 데스크톱 앱입니다. 입력한 텍스트 또는 텍스트 파일을 읽어 주고, 볼륨 조절·실시간 파형 표시·WAV/MP3 저장을 지원합니다.

## 요구 사항

- Windows 10 이상 권장
- [.NET Framework 4.8 개발 팩 또는 런타임](https://dotnet.microsoft.com/download/dotnet-framework/net48)
- Visual Studio 2022 또는 `dotnet` CLI(Windows SDK 스타일 프로젝트 빌드 가능한 환경)

## 빌드 및 실행

```powershell
dotnet restore
dotnet build -c Release
dotnet run --project TTSWinV10.csproj
```

실행 파일은 `bin\Release\net481\TTSWinV10.exe` 에 생성됩니다.

## 기능

- 텍스트 입력 및 `.txt` 파일 열기
- **읽기**: `System.Speech`(SAPI)로 합성 후 재생
- **볼륨**: 슬라이더로 재생 및 저장 시 동일하게 적용
- **파형**: 재생 중 패널에 스크롤 형태의 파형 표시
- **저장**: WAV, MP3(Windows Media Foundation 인코더 사용; OS/에디션에 따라 MP3 실패 시 WAV 사용을 권장)

## 사용한 주요 기술

- .NET Framework 4.8, WinForms
- [NAudio](https://github.com/naudio/NAudio) 2.2.1 (재생, 볼륨, WAV/MP3 인코딩)
- `System.Speech` (음성 합성)

## 라이선스

프로젝트에 별도 라이선스 파일이 없다면 저장소 소유자에게 문의하세요.
