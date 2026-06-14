# MyProject

Windows용 Gantt 차트 프로젝트 관리 애플리케이션입니다. 태스크 일정, 의존 관계, 리소스 배정, 진행률, 차트 노트를 한 화면에서 관리하고 다양한 형식으로 보낼 수 있습니다.

**사용자 가이드**: 상세 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 실행 환경

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 (권장) 또는 `dotnet` CLI
- MSI 빌드: [WiX Toolset](https://wixtoolset.org/) (`Installer` 프로젝트)

## 빌드 / 실행

### Visual Studio

1. `MyProject.sln` 열기
2. `MyProject` 프로젝트를 시작 프로젝트로 설정
3. 실행 (F5)

### dotnet CLI

```bash
dotnet build MyProject.csproj -c Debug
dotnet run --project MyProject.csproj -c Debug
```

### 유틸리티 명령

```bash
# 템플릿 프로젝트 파일 갱신
dotnet run --project MyProject.csproj -- --generate-template

# 앱 아이콘 생성 (최초 빌드 전 필요할 수 있음)
dotnet build MyProject.csproj -p:ApplicationIcon=
dotnet run --project MyProject.csproj --no-build -- --generate-icon
```

## 화면 구성

| 영역 | 설명 |
|------|------|
| **좌측** | 태스크 그리드 (ID, 이름, 시작일, 기간, 진행률 등) |
| **가운데** | Gantt 차트 (타임라인, 태스크 바, 의존 관계, 노트) |
| **우측** | 속성 패널 (선택한 태스크·노트의 속성 편집) |

좌측 그리드와 Gantt 차트 사이, Gantt와 속성 패널 사이의 분할선을 드래그하여 너비를 조절할 수 있습니다. 속성 패널은 툴바 또는 **View → Properties Panel**로 표시/숨김할 수 있습니다.

## 주요 기능

### 프로젝트 파일

- 확장자: `.myprj` (JSON 형식, UTF-8)
- 저장/열기, 변경 사항 추적, 마지막 사용 폴더 기억
- 뷰 설정(열 너비, 줌, 분할선, 속성 패널 상태)을 프로젝트에 함께 저장
- 앱 전역 설정: `%LocalAppData%\MyProject\settings.json`

### 태스크

- 하위 태스크 **무제한 깊이** 중첩 (트리뷰, 접기/펼치기)
- 유형: 일반(Normal), 마일스톤(Milestone), 요약(Summary)
- 요약 태스크는 하위 일정 자동 롤업
- 자동 일정(Auto Schedule), 크리티컬 패스 표시
- 태스크 바·진행률 색상, 산출물(Deliverable), 메모

### 의존 관계

- 종류: **FS**, **FF**, **SS**, **SF** (Lag 일수 지원)
- 툴바에서 종류 이름과 **선 형태 미리보기** 선택
- Link 모드: 선행 태스크 선택 → **Link** → 후행 태스크 클릭

### Gantt 노트

- 차트 위 노란색 노트 마커 (태스크 연결 또는 날짜 기준 배치)
- 서식 있는 텍스트: 글꼴, 크기, 굵게, 기울임, 밑줄, 취소선
- Gantt에서 직접 편집 또는 속성 패널에서 편집

### 속성 패널

- 태스크: 이름, 유형, 일정, 진행률, 리소스, 의존 관계, 색상 등
- 노트: 제목, 본문(RTF), 연결 태스크, 기준 날짜

### 보고 / 보내기

| 형식 | 내용 |
|------|------|
| **Excel** (.xlsx) | 요약, 일정, 리소스, 의존 관계, 노트, Gantt 타임라인 |
| **HTML** | 일정·리소스·노트·크리티컬 패스 보고 |
| **Word** (.docx) | HTML과 동일 범위의 문서 보고 |
| **PDF** | 일정·리소스·노트·크리티컬 패스 보고 |
| **Markdown** | 진행률·일정 요약 보고 |
| **Gantt 이미지** | PNG, JPEG, GIF, WebP (PNG/WebP 투명 배경 지원) |
| **인쇄** | Gantt 차트 인쇄 |

## 기본 단축키

| 작업 | 단축키 |
|------|--------|
| 새 프로젝트 | Ctrl+N |
| 열기 | Ctrl+O |
| 저장 | Ctrl+S |
| 태스크 추가 | Insert |
| 하위 태스크 추가 | Ctrl+Shift+Insert |
| 삭제 | Delete |
| 들여쓰기 / 내어쓰기 | Alt+Right / Alt+Left |
| 태스크 연결 | Ctrl+L |
| 태스크 속성 | F2 |
| 줌 확대 / 축소 | Ctrl++ / Ctrl+- |
| 오늘로 이동 | Ctrl+T |
| 인쇄 | Ctrl+P |

전체 단축키와 상세 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## MSI 설치 파일

Visual Studio에서 **Release | Any CPU**로 빌드하면 MSI가 자동으로 생성됩니다. Debug 빌드에서는 MSI를 만들지 않습니다.

```bash
dotnet build MyProject.csproj -c Release
```

MSI를 건너뛰려면 `-p:BuildMsi=false`를 지정하세요.

빌드 출력에 `MSI ready:` 메시지가 표시됩니다.

- MSI 경로: `Installer/bin/Release/MyProject_Setup.msi`
- 복사본: `bin/Release/net8.0-windows/win-x64/MyProject_Setup.msi`

설치 시 바탕 화면·시작 메뉴 바로 가기, 템플릿 프로젝트, 앱 아이콘이 포함됩니다.

## 프로젝트 구조

```
MyProjectWinV10/
├── Assets/              # 앱 아이콘
├── Controls/            # 태스크 그리드, Gantt, 속성 패널, 노트 편집기
├── Forms/               # 메인 폼, 대화상자
├── Installer/           # WiX MSI 패키지
├── Models/              # 데이터 모델, 저장, 보고서 생성
├── Rendering/           # Gantt·노트 렌더링
├── Template/            # 기본 템플릿 프로젝트
├── Theme/               # UI 테마, 아이콘
├── README.md
└── UsersGuide.md        # 사용자 가이드
```

## 의존성 (NuGet)

| 패키지 | 용도 |
|--------|------|
| ClosedXML | Excel 보내기 |
| DocumentFormat.OpenXml | Word 보내기 |
| QuestPDF | PDF 보내기 |
| SixLabors.ImageSharp 3.1.11+ | WebP 등 Gantt 이미지 인코딩 |

## 라이선스

Copyright © 2026 MyProject
