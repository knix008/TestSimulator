# MyClock

가로형 탁상시계 스타일의 WPF 데스크톱 시계 애플리케이션 (.NET 8)

## 기능

| 기능 | 설명 |
|------|------|
| 디지털 / 아날로그 시계 | 버튼으로 전환 가능 |
| 12시간 / 24시간 모드 | 설정 탭에서 전환 |
| 8가지 테마 | 다크·라이트·미드나이트·오션·루비·에메랄드·퍼플·앰버 |
| 세계 시간 | 도시 추가·삭제, 미니 아날로그 시계 동시 표시 |
| 도시 자동완성 | 도시/국가 이름 입력 시 추천 목록 표시 및 시간대 자동 설정 |
| 알람 | 복수 알람 설정, 토글 스위치, 팝업 + 시스템 알림음 |
| 시스템 트레이 | 최소화 시 시스템 트레이에 미니 아날로그 시계 아이콘으로 표시 |
| 타이틀바 없음 | 헤더 영역 드래그로 이동, 우상단 최소화·최대화·닫기 |
| 사이드 패널 | ▶ 버튼으로 세계시간·알람·설정 패널 표시/숨김 전환 |

## 빌드 및 실행

```bash
dotnet build
dotnet run
# 또는
dotnet publish -c Release
```

**요구사항:** .NET 8 SDK, Windows 10 이상

## MSI 설치 패키지 생성

Visual Studio에서 `Release` 구성으로 `Setup` 프로젝트를 빌드하면 `Setup/bin/x64/Release/` 아래에 `MyClockWinV10-Setup.msi` 가 생성됩니다.

```bash
dotnet build Setup/Setup.wixproj -c Release
```

**요구사항:** WiX Toolset v5 (`wix` dotnet tool 또는 VS 확장)

## 테마

| 이름 | 색상 |
|------|------|
| 다크 | Catppuccin Mocha (기본) |
| 라이트 | Catppuccin Latte |
| 미드나이트 | GitHub Dark |
| 오션 | Navy + Teal |
| 루비 | Deep Red |
| 에메랄드 | Dark Green |
| 퍼플 | Neon Purple |
| 앰버 | Warm Amber |

## 프로젝트 구조

```
MyClockWinV10/
├── Controls/
│   ├── AnalogClockControl      — 캔버스 기반 아날로그 시계 (Viewbox 자동 크기 조정)
│   ├── MiniAnalogClockControl  — 세계 시간 항목용 미니 아날로그 시계 (72×72)
│   └── WorldTimePanel          — 세계 시간 목록 (도시 추가·삭제)
├── Models/
│   ├── AlarmItem               — 알람 데이터
│   ├── CityDatabase            — 세계 주요 도시 데이터 및 자동완성 검색
│   └── WorldTimeEntry          — 세계 시간 항목
├── Themes/                     — 8가지 색상 테마 (ResourceDictionary)
├── Setup/                      — WiX v5 MSI 설치 패키지 프로젝트
├── Styles.xaml                 — 전역 컨트롤 스타일 (다크 테마 ComboBox 포함)
└── MainWindow                  — 메인 창 (가로형 탁상시계 레이아웃)
```
