# MeetingMinuteV10

WPF 기반 회의록 작성 프로그램입니다.  
회의 정보를 편하게 입력하고 Markdown(`.md`) 또는 Word(`.docx`) 형식으로 저장할 수 있습니다.

## 주요 기능

- 현대적인 WPF GUI(다크 테마)
- 날짜 선택 + 시작/종료 시간 입력
- 회의 경과 시간 상태 표시줄(초 단위)
- 한국어/영어 UI 전환(설정 메뉴)
- Markdown 및 Word 형식 저장
- 기본 파일명 자동 생성 (`회의록-날짜-시간`)

## 개발 환경

- .NET SDK 8.0+
- Windows
- Visual Studio 2026 (권장)

## 프로젝트 구조

- `src/MeetingMinute.App/` : WPF 애플리케이션
- `installer/MeetingMinute.Installer.wixproj` : MSI 설치 프로젝트(WiX SDK)
- `MeetingMinuteV10.sln` : 메인 솔루션(앱 + 설치 프로젝트 포함)

## 실행 방법

```bash
dotnet build MeetingMinuteV10.sln -c Debug
dotnet run --project src/MeetingMinute.App/MeetingMinute.App.csproj -c Debug
```

## Release 빌드

```bash
dotnet build MeetingMinuteV10.sln -c Release -p:Platform=x64
```

- 설치 프로젝트는 `WixToolset.Sdk` NuGet 패키지를 사용합니다.
- 별도의 WiX v3 전역 설치 없이도 복원/빌드 시 MSI 생성이 가능합니다.

Visual Studio에서:

- 솔루션: `MeetingMinuteV10.sln`
- 구성: `Release | x64`
- `Build` 또는 `Rebuild`

MSI 출력 경로:

- `installer\bin\Release\MeetingMinuteSetup.msi`
