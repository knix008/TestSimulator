# Command Center

Windows용 **듀얼 페인(dual‑pane) 파일 관리자**입니다. 좌·우 두 개의 파일 목록을 나란히 두고, 사이의 버튼 막대로 복사·이동을 빠르게 처리합니다. 전체 드라이브를 백그라운드로 색인해 툴바에서 즉시 파일을 검색할 수 있습니다.

- **프로젝트명**: FileMasterWinV10 (실행 파일: `CommandCenter.exe`)
- **플랫폼**: .NET 8 (`net8.0-windows`), Windows Forms, C# (nullable + implicit usings)
- **아키텍처 타깃**: x64

## 주요 기능

- **듀얼 페인 탐색**: 좌/우 패널, 활성 패널은 전체 테두리 강조로 표시
- **패널 간 복사/이동**: 가운데 버튼 막대(→ 복사, → 이동, ← 복사, ← 이동)
- **드라이브 / 현재 폴더 드롭다운**: 각 패널 상단에서 드라이브 선택 + 폴더 트리 펼치기
- **툴바 인라인 검색**: 검색어 입력 → Enter, 결과가 입력창 바로 아래 드롭다운으로 표시(팝업 없음). 선택 시 해당 폴더로 이동하며 파일을 선택·표시
- **전체 드라이브 색인**: 고정 드라이브 전체를 색인하여 디스크에 저장(`%LocalAppData%\CommandCenter\search-index.bin`), `FileSystemWatcher`로 증분 갱신. 툴바의 **Indexing ↔ 멈춤** 버튼으로 재색인/중지
- **드래그 앤 드롭**: 외부 → 패널(복사, Shift = 이동), 패널 → 외부로 드래그
- **삭제 = 휴지통으로 이동**(영구 삭제 아님)
- **압축/해제**: ZIP 압축, 용량 분할 압축, 압축 해제
- **미리보기 패널**: 선택한 파일 미리보기
- **테마 / 언어**: 라이트·다크 테마, 한국어·English 전환(런타임)
- **즐겨찾기·세션·환경설정** 저장

## 빌드 & 실행

사전 요구: [.NET 8 SDK](https://dotnet.microsoft.com/download) (Windows)

```bash
# 복원 & 빌드
dotnet build FileMasterWinV10.csproj -c Debug

# 실행
dotnet run --project FileMasterWinV10.csproj
```

> 실행 중에는 `CommandCenter.exe`가 잠기므로, 다시 빌드하기 전에 앱을 종료하세요.

### Release 빌드 & 설치 패키지

Release 빌드 시 WiX 기반 MSI 설치 패키지와 부트스트래퍼 `.exe`가 함께 생성됩니다(`CommandCenter.Installer`, `CommandCenter.Bootstrapper`).

```bash
dotnet build FileMasterWinV10.csproj -c Release
```

## 프로젝트 구조

```
FileMasterWinV10/
├─ MainForm.cs / .Designer.cs      # 메인 창: 메뉴·툴바(검색 포함)·스플리터·상태표시줄
├─ Controls/
│  ├─ FilePanel.*                  # 한쪽 파일 패널(목록, 드라이브/폴더 드롭다운, DnD)
│  ├─ PreviewPanel.*               # 파일 미리보기
│  └─ FolderTreeDropdownPanel.*    # 경로 표시줄에서 펼치는 폴더 트리
├─ Dialogs/                        # 검색·압축·입력·진행률·테마 메시지 박스 등
├─ Helpers/
│  ├─ SearchIndexService.cs        # 전체 드라이브 색인 + 영속화 + 감시
│  ├─ FileOperations.cs            # 복사/이동/삭제(휴지통)/검색
│  ├─ DesktopSearchHelper.cs       # 검색어 파싱·매칭·정렬
│  ├─ UiTheme.cs                   # 테마 색상·컨트롤 스타일
│  ├─ LocalizationService.cs       # 다국어 문자열
│  └─ ...                          # 아이콘·설정·세션·즐겨찾기 등
└─ Models/                         # FileEntry 등 데이터 모델
```

자세한 설계는 [Architecture.md](Architecture.md), 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 데이터 저장 위치

애플리케이션 데이터는 리포지토리가 아니라 사용자 프로필에 저장됩니다:

- `%LocalAppData%\CommandCenter\search-index.bin` — 검색 색인
- 환경설정·세션·즐겨찾기 — 앱 데이터 폴더(`CommandCenter`)

## 라이선스 / 제작

SHKWON (knix008@naver.com)
