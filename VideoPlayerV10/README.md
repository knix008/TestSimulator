# VideoPlayerV10

`VideoPlayerV10`은 C# WinForms 기반의 고화질 비디오 플레이어입니다.  
Visual Studio 2026에서 빌드 가능하며, 로컬 파일/원격 스트림/YouTube 링크 재생을 지원합니다.

## 주요 기능

- 로컬 비디오 파일 재생 (`mp4`, `mkv`, `avi`, `mov`, `wmv`, `webm` 등)
- 원격 스트림 재생 (`rtsp://`, `http://`, `https://`, `rtmp://`)
- YouTube URL 입력 재생 (스트림 URL 자동 해석)
- 재생 제어: 재생/일시정지/정지, 시크바, 볼륨, 배속
- 재생 정보 표시: 코덱, 비트레이트, 해상도, FPS, 재생 배속
- 재생 실패 시 코덱 힌트 표시

## 기술 스택

- .NET 8 (`net8.0-windows`)
- WinForms
- LibVLCSharp + VideoLAN.LibVLC.Windows
- YoutubeExplode
- WiX Toolset (MSI 설치 파일 생성)

## 프로젝트 구조

- `VideoPlayerV10.App`: 플레이어 애플리케이션
- `VideoPlayerV10.Installer`: MSI 설치 프로젝트
- `VideoPlayerV10.slnx`: 솔루션 파일

## 빌드 방법

### Debug 빌드

```bash
dotnet build VideoPlayerV10.slnx -c Debug
```

### Release 빌드 + MSI 생성

```bash
dotnet build VideoPlayerV10.slnx -c Release
```

Release 빌드 시 MSI는 아래 경로에 생성됩니다.

- `VideoPlayerV10.Installer/bin/x64/Release/VideoPlayerV10.Installer.msi`

## 실행 방법

```bash
dotnet run --project VideoPlayerV10.App/VideoPlayerV10.App.csproj
```

## 사용 방법

1. `Open File` 버튼으로 파일 선택 또는 URL 입력창에 스트림/YouTube 링크 입력
2. `Play` 클릭
3. 시크바, 볼륨, 배속으로 재생 제어
4. 하단 정보 영역에서 코덱/비트레이트/해상도/FPS 확인

## 참고

- 일부 YouTube 콘텐츠는 지역/권한/정책 제한으로 재생이 불가할 수 있습니다.
- 코덱/스트림 특성에 따라 하드웨어 가속 동작이 달라질 수 있습니다.
