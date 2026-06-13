# MyProject

Windows용 Gantt 차트 프로젝트 관리 애플리케이션입니다. 태스크 일정, 의존 관계, 리소스 배정, 진행률을 한 화면에서 관리할 수 있습니다.

## 실행 환경

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 (권장) 또는 `dotnet` CLI
- MSI 빌드: [WiX Toolset](https://wixtoolset.org/) (Installer 프로젝트)

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

- **좌측**: 태스크 그리드 (ID, 이름, 시작일, 기간, 진행률)
- **우측**: Gantt 차트 (타임라인, 태스크 바, 의존 관계 연결선)

## 주요 기능

### 프로젝트 파일

- 확장자: `.myprj` (JSON 형식)
- 저장/열기, 변경 사항 추적, 마지막 사용 폴더 기억
- 설정 저장 위치: `%LocalAppData%\MyProject\settings.json`

### 태스크 계층 (트리뷰)

- 하위 태스크를 **무제한 깊이**로 중첩 가능
- 트리 연결선, 접기/펼치기 지원
- 대표(요약) 태스크는 모든 하위 태스크 일정을 자동 롤업

### 의존 관계

- 연결선 종류: **FS**, **FF**, **SS**, **SF**
- 툴바에서 종류 이름과 **선 형태 미리보기**를 함께 선택
- Link 버튼: 선행 태스크 선택 → **Link** → 후행 태스크 선택 (자동 연결)

### 보고 /보내기

- Excel (`.xlsx`): 일정, 리소스, 의존 관계
- Markdown, PDF, 인쇄

### 기타

- 태스크 속성 대화상자 (일반, 색상, 리소스, 메모)
- 우클릭 컨텍스트 메뉴 (그리드 / Gantt)
- 상세 오류 대화상자 (복사 버튼)
- 작업 완료 알림 (저장,보내기, 인쇄)

## 기본 사용법

| 작업 | 방법 |
|------|------|
| 태스크 추가 | Insert 또는 툴바 **Add Task** |
| 하위 태스크 추가 | 우클릭 **Add Subtask** |
| 들여쓰기 / 내어쓰기 | Alt+Right / Alt+Left 또는 툴바 버튼 |
| 태스크 연결 | 선행 태스크 선택 → **Link** → 후행 태스크 선택 (자동 연결) |
| 접기 / 펼치기 | 트리 화살표 클릭 또는 우클릭 메뉴 |
| 속성 편집 | 태스크 더블클릭 |

## MSI 설치 파일

Visual Studio에서 **Release | Any CPU**로 빌드하면 MSI가 자동으로 생성됩니다.  
Debug 빌드에서는 MSI를 만들지 않습니다.

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
├── Controls/            # 태스크 그리드, Gantt 차트, 연결선 선택기
├── Forms/               # 메인 폼, 대화상자
├── Installer/           # WiX MSI 패키지
├── Models/              # 데이터 모델, 저장/보고서
├── Rendering/           # Gantt 렌더링
├── Template/            # 기본 템플릿 프로젝트
└── Theme/               # UI 테마, 아이콘
```

## 라이선스

Copyright © 2026 MyProject
