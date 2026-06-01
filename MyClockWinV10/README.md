# MyClock

가로형 탁상시계 스타일의 WPF 데스크톱 시계 애플리케이션 (.NET 8 / Windows)

## 기능

| 기능 | 설명 |
|------|------|
| 디지털 / 아날로그 전환 | 타이틀바 버튼으로 즉시 전환 |
| 디지털 스타일 3종 | 7세그먼트 · LCD 텍스트 · 미니멀 |
| 아날로그 스타일 4종 | 클래식 · 미니멀 · 로만 · 인덱스 |
| 12 / 24시간 모드 | 설정 패널에서 전환 |
| 12가지 테마 | 다크·라이트·미드나이트·오션·루비·에메랄드·퍼플·앰버·로즈·모노·선셋·민트 |
| 밝기 / 색상 | 세그먼트 밝기 슬라이더, 숫자 색상 선택기 |
| 세계 시간 | 도시 추가·삭제, 미니 아날로그 시계 동시 표시 |
| 도시 자동완성 | 도시/국가 이름 입력 시 추천 목록 및 시간대 자동 설정 |
| 알람 | 복수 알람, 반복 설정, 팝업 + 시스템 알림음 |
| Google Calendar 연동 | OAuth 2.0 연결, 14일 이내 일정 표시, 구글 캘린더 미리 알림 |
| 사이드 패널 | 화면 여백에 따라 좌·우 자동 전환, 드래그 중 실시간 반영 |
| 시스템 트레이 | 최소화 시 트레이에 미니 아날로그 시계 아이콘으로 상주 |
| 커스텀 타이틀바 | 헤더 드래그로 이동, 리사이즈 가능 |

## 빌드 및 실행

```bash
dotnet build MyClockWinV10.csproj
dotnet run --project MyClockWinV10.csproj
```

**요구사항:** .NET 8 SDK, Windows 10 이상

## MSI 설치 패키지 생성

**Visual Studio 2026:** 구성을 `Release | x64`로 선택한 뒤 **빌드 → 솔루션 빌드**를 하거나, 시작 프로젝트만 빌드해도 Release 빌드 후 MSI가 생성됩니다.

| 위치 | 설명 |
|------|------|
| `bin/Release/net8.0-windows/MyClockWinV10-Setup.msi` | 앱 출력 폴더 (VS에서 찾기 쉬움) |
| `Setup/bin/x64/Release/MyClockWinV10-Setup.msi` | WiX 프로젝트 원본 출력 |

```bash
dotnet build MyClockWinV10.sln -c Release
# 또는
dotnet build Setup/Setup.wixproj -c Release
```

**요구사항:** .NET 8 SDK, [WiX Toolset](https://wixtoolset.org/) MSBuild SDK (`WixToolset.Sdk` — NuGet 복원). 솔루션 탐색기에서 `Setup` 프로젝트가 로드되지 않으면 [HeatWave](https://docs.firegiant.com/wix/using-wix/) 확장을 설치하거나, 위처럼 `dotnet build`를 사용하세요.

## 테마

| 이름 | 설명 |
|------|------|
| 다크 (Dark) | Catppuccin Mocha 기반 — 기본값 |
| 라이트 (Light) | Catppuccin Latte 기반 |
| 미드나이트 (Midnight) | GitHub Dark 계열 |
| 오션 (Ocean) | Navy + Teal |
| 루비 (Ruby) | Deep Red |
| 에메랄드 (Emerald) | Dark Green |
| 퍼플 (Purple) | Neon Purple |
| 앰버 (Amber) | Warm Amber |
| 로즈 (Rose) | Soft Pink |
| 모노 (Mono) | Monochrome Gray |
| 선셋 (Sunset) | Orange + Coral |
| 민트 (Mint) | Fresh Teal Green |

## Google Calendar 연동 설정

자세한 설정 방법은 [사용자 가이드](userguide.md#google-calendar-연동)를 참고하세요.

Google Cloud Console에서 OAuth 2.0 데스크톱 앱 자격증명을 발급받아 아래 경로에 저장합니다.

```
%AppData%\MyClock\google_credentials.json
```

> `google_credentials.json` 과 OAuth 토큰 디렉터리(`google_token/`)는 `.gitignore`에 등록되어 있어 커밋되지 않습니다.

## 프로젝트 구조

```
MyClockWinV10/
├── Controls/
│   ├── AnalogClockControl      — 캔버스 기반 아날로그 시계 (스타일 4종)
│   ├── MiniAnalogClockControl  — 세계 시간용 미니 아날로그 시계
│   ├── SevenSegmentDisplay     — 7세그먼트 디지털 디스플레이
│   └── WorldTimePanel          — 세계 시간 목록 패널
├── Models/
│   ├── AlarmItem               — 알람 데이터 모델
│   ├── AppSettings             — 설정 데이터 모델
│   ├── CalendarEventItem       — 캘린더 이벤트 모델
│   ├── CityDatabase            — 세계 도시 데이터 및 자동완성
│   ├── ClockStyle              — DigitalStyle / AnalogStyle 열거형
│   ├── SettingsManager         — 설정 저장/불러오기 (JSON)
│   └── WorldTimeEntry          — 세계 시간 항목
├── Services/
│   └── GoogleCalendarService   — Google Calendar API 연동
├── Themes/                     — 12가지 색상 테마 (ResourceDictionary)
├── Setup/                      — WiX v5 MSI 설치 패키지 프로젝트
├── CalendarWindow              — Google Calendar 연결·일정 표시 창
├── SidePanelWindow             — 설정 사이드 패널
├── AlarmNotificationWindow     — 알람 팝업
├── Styles.xaml                 — 전역 컨트롤 스타일
└── MainWindow                  — 메인 창 (탁상시계 레이아웃)
```
