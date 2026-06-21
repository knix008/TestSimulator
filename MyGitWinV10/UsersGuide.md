# MyGit V1.0.0 — 사용자 가이드

MyGit은 Windows용 Git 클라이언트입니다. 커밋 그래프, 변경 파일, diff, 브랜치/태그, GitHub Release를 한 화면에서 탐색할 수 있으며, 로컬 Clone 저장소에서는 **Git Add / Commit / Push** 작업도 수행할 수 있습니다.

---

## 목차

1. [시작하기](#시작하기)
2. [화면 구성](#화면-구성)
3. [저장소 열기 · 복제 · 원격 탐색](#저장소-열기--복제--원격-탐색)
4. [Repository 패널](#repository-패널)
5. [Files 패널](#files-패널)
6. [Commit History 패널](#commit-history-패널)
7. [Commit Details / Diff 패널](#commit-details--diff-패널)
8. [Git 작업 (Add / Commit / Push)](#git-작업-add--commit--push)
9. [저장소 요약 내보내기](#저장소-요약-내보내기)
10. [메뉴 및 도구 모음](#메뉴-및-도구-모음)
11. [바로 가기 및 컨텍스트 메뉴](#바로-가기-및-컨텍스트-메뉴)
12. [GitHub Releases](#github-releases)
13. [설정 및 데이터 저장 위치](#설정-및-데이터-저장-위치)
14. [문제 해결](#문제-해결)

---

## 시작하기

### 실행 방법

- **개발 빌드:** `dotnet run --project MyGitWinV10.App`
- **설치본:** 시작 메뉴 또는 바탕화면의 **MyGit Win V10** 바로 가기

### .NET 런타임

프레임워크 종속(framework-dependent) 빌드를 사용하는 경우 [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)이 필요합니다.

### 마지막 세션 자동 복원

앱을 종료하기 전에 **성공적으로 연 마지막 저장소**가 다음 실행 시 자동으로 다시 열립니다.

| 이전 작업 | 복원 내용 |
|-----------|-----------|
| **Open** (로컬 폴더) | 해당 로컬 저장소 |
| **Clone** | 복제된 로컬 저장소 |
| **Browse Remote** | 원격 캐시 기반 읽기 전용 보기 (`remote view`) |

Open, Clone, Browse Remote 중 **가장 마지막에 성공한 것**이 우선 복원됩니다.

---

## 화면 구성

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [메뉴: File | Repository | History | Diff | Help]  [도구 모음]          │
├──────────────┬──────────────────────────────────────────────────────────┤
│  Repository  │  Commit History  │  Commit Details                       │
│  (브랜치/    │  (그래프 +       │  (메타데이터)                          │
│   태그/      │   커밋 목록)     ├──────────────────────────────────────┤
│   Releases)  │                  │  Changed Files  │  Diff                 │
├──────────────┤                  │  (변경 파일)    │  (통합 diff)           │
│  Files       │                  │                 │                       │
│  (파일 트리) │                  │                 │                       │
└──────────────┴──────────────────┴─────────────────┴───────────────────────┘
│  상태 표시줄                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

| 영역 | 설명 |
|------|------|
| **Repository** | 로컬/원격 브랜치, 태그, GitHub Release 목록 |
| **Files** | 저장소 폴더/파일 트리 (로컬: 작업 트리, 원격 보기: HEAD 트리) |
| **Commit History** | 브랜치·머지 그래프와 Message, SHA, Author, Date 컬럼 |
| **Commit Details** | 선택한 커밋의 작성자, 날짜, 메시지 등 |
| **Changed Files** | 해당 커밋에서 변경된 파일 목록 |
| **Diff** | 선택한 파일의 unified diff (색상 구분) |

패널 사이의 분할선을 드래그하여 크기를 조절할 수 있습니다.

---

## 저장소 열기 · 복제 · 원격 탐색

### 로컬 저장소 열기

1. **File → Open...** (`Ctrl+O`) 또는 도구 모음 **Open**
2. `.git` 폴더가 있는 저장소 루트 디렉터리 선택
3. 브랜치 트리, Files 패널, 커밋 히스토리가 로드됩니다

### 원격 저장소 복제

1. **File → Clone...** (`Ctrl+Shift+O`) 또는 도구 모음 **Clone**
2. **Repository URL** — 예: `https://github.com/owner/repo.git`
3. **Destination Folder** — 복제 대상 로컬 경로
4. **Clone** 클릭 후 진행률 확인
5. 완료되면 복제된 저장소가 자동으로 열립니다

진행 중에는 **Stop** 버튼(빨간색)으로 작업을 취소할 수 있습니다.

### 원격 저장소 탐색 (Browse Remote)

로컬에 영구 복제본을 만들지 않고 원격 히스토리만 볼 때 사용합니다.

1. **File → Browse Remote...** (`Ctrl+Shift+B`) 또는 도구 모음 **Browse Remote**
2. **Repository URL** 입력
3. **Browse** 클릭 — bare 캐시에 fetch/clone 후 읽기 전용으로 열림
4. 상태 표시줄과 저장소 정보에 `(remote view)` 표시

Browse Remote 모드에서는 **Checkout, Git Add/Commit/Push** 가 비활성화됩니다.

#### HTTPS 인증

비공개 저장소나 인증이 필요한 HTTPS URL인 경우:

- **GitHub:** 계정 비밀번호 대신 **Personal Access Token(PAT)** 을 사용합니다.  
  토큰 발급: [github.com/settings/tokens](https://github.com/settings/tokens)
- **기타 호스트:** 비밀번호 또는 PAT를 입력할 수 있습니다.

입력한 자격 증명은 **메모리에만** 사용되며 디스크에 저장되지 않습니다.

### 최근 저장소

**File** 메뉴 하단에 최근에 연 로컬 저장소 목록이 표시됩니다. 항목을 클릭하면 해당 저장소를 다시 엽니다.

---

## Repository 패널

### Local Branches

- 현재 저장소의 로컬 브랜치 목록
- **굵은 글씨** — 현재 체크아웃된 브랜치

**로컬 브랜치에서 우클릭:**

| 메뉴 | 동작 |
|------|------|
| **Checkout** | 해당 브랜치로 전환 (로컬 저장소만) |
| **Copy Name** | 브랜치 이름을 클립보드에 복사 |
| **Export Summary** | PDF / Word / Markdown 요약 리포트 내보내기 |

### Remotes

원격 브랜치를 원격 이름별로 그룹화하여 표시합니다.

### Tags

저장소에 등록된 Git 태그 목록입니다. 태그에 마우스를 올리면 연결된 커밋 정보가 툴팁으로 표시됩니다.

### Releases

GitHub `origin` 원격이 연결된 저장소인 경우, GitHub Release 목록을 불러옵니다. Release를 선택하면 Commit Details 영역에 릴리스 정보가 표시됩니다.

### 새로 고침

- **Repository → Refresh Tree** (`F5`) 또는 도구 모음 **Refresh Tree**

---

## Files 패널

Repository 패널 아래에 위치하며, 저장소의 폴더/파일 구조를 트리로 표시합니다.

| 모드 | 표시 내용 |
|------|-----------|
| **로컬 저장소** | 작업 디렉터리 (`.git` 제외) |
| **Browse Remote / bare** | HEAD 커밋 기준 Git 트리 |

### 경로별 커밋 로그

추적(tracked) 중인 파일 또는 폴더를 **클릭**하거나 **우클릭 → Show Log** 하면 Commit History 패널이 해당 경로의 커밋만 필터링하여 표시합니다. 제목에 `Commit History — 경로` 형식으로 표시됩니다.

**우클릭 메뉴 (공통):**

| 메뉴 | 동작 |
|------|------|
| **Show Log** | 선택 경로의 커밋 히스토리 필터 |
| **Copy Path** | 저장소 기준 상대 경로 복사 |
| **Show All Commits** | 경로 필터 해제 |

로컬 Clone 저장소에서 추가로 표시되는 메뉴는 [Git 작업](#git-작업-add--commit--push) 절을 참고하세요.

---

## Commit History 패널

### 커밋 그래프

- 각 컬럼(레인)은 브랜치/머지 경로를 나타냅니다
- **원(●)** — 커밋 지점
- **선** — 부모·자식 또는 머지 관계
- 색상은 레인마다 다르게 표시됩니다

### 컬럼

| 컬럼 | 내용 |
|------|------|
| **Graph** | 브랜치/머지 그래프 |
| **Message** | 커밋 메시지 첫 줄 |
| **SHA** | 짧은 해시 (7자) |
| **Author** | 작성자 |
| **Date** | 작성일 (`yyyy-MM-dd`) |

### 컬럼 너비 · 스크롤

- 헤더에서 컬럼 구분선을 드래그하여 너비 조절
- **세로 스크롤** — 커밋 목록 (헤더 고정)
- **가로 스크롤** — 넓은 그래프/컬럼 (헤더와 본문 동시 이동)

### 커밋 선택

행을 클릭하면 Commit Details · Changed Files · Diff가 갱신됩니다.

**우클릭 메뉴:**

| 메뉴 | 동작 |
|------|------|
| **Copy SHA** | 전체 커밋 해시 복사 |
| **Copy Message** | 커밋 메시지 복사 |
| **Export to Folder...** | 해당 커밋 스냅샷을 폴더로 저장 |

### 새로 고침

- **History → Refresh Graph** (`Ctrl+F5`) 또는 도구 모음 **Refresh Graph**

---

## Commit Details / Diff 패널

### Commit Details

선택한 커밋의 SHA, 작성자, 날짜, 전체 메시지 등이 표시됩니다.

### Changed Files

커밋에서 수정·추가·삭제된 파일 목록입니다. 파일을 선택하면 Diff 패널에 해당 파일의 변경 내용이 표시됩니다.

**우클릭:** **Copy Path** — 파일 경로를 클립보드에 복사

### Diff

- unified diff 형식, 추가/삭제 줄 색상 구분
- **Diff → Wrap** (`Ctrl+Shift+W`) 또는 도구 모음 **Wrap** — 긴 줄 자동 줄바꿈
- **Diff → Copy** (`Ctrl+Shift+D`) 또는 도구 모음 **Copy** — diff 텍스트 복사

---

## Git 작업 (Add / Commit / Push)

**로컬 Clone 저장소**(작업 디렉터리가 있는 저장소)에서만 사용할 수 있습니다. Browse Remote 모드에서는 표시되지 않습니다.

Files 패널에서 파일 또는 폴더를 **우클릭**합니다.

| 메뉴 | 동작 |
|------|------|
| **Git Add** | 선택한 파일/폴더를 stage (저장소 루트 선택 시 전체) |
| **Git Commit...** | staged 변경사항 커밋 (카테고리 형식 메시지) |
| **Git Push** | 현재 브랜치를 `origin` 원격으로 push |

### 권장 작업 순서

```
Git Add → Git Commit... → Git Push
```

### Git Commit 다이얼로그

| 항목 | 설명 |
|------|------|
| **Category** | 커밋 분류 (콤보박스에서 선택 또는 직접 입력) |
| **Subject** | 한 줄 요약 |
| **Details** | 추가 설명 (선택) |
| **Preview** | 최종 커밋 메시지 미리보기 |
| **Staged files** | stage된 파일 목록 |
| **Manage...** | Category 목록 관리 |

#### 커밋 메시지 형식

```
[카테고리] Subject 한 줄

Details 본문 (선택)
```

예:

```
[기능추가] 로그인 화면 추가

OAuth 연동 및 세션 저장
```

#### Category 관리

- 콤보박스에 **새 Category를 입력**하고 Commit하면 목록에 자동 추가됩니다.
- **Manage...** 버튼으로 Category 추가 · 수정 · 삭제 · 기본값 복원이 가능합니다.
- Category 목록은 설정 파일에 저장되어 다음 실행 후에도 유지됩니다.

기본 Category: 기능추가, 기능변경, 기능삭제, 버그수정, 문서, 리팩토링, 성능개선, 테스트, 기타

### 사전 요구 사항

| 작업 | 조건 |
|------|------|
| **Git Commit** | stage된 변경이 있어야 함 (`user.name`, `user.email` git config 설정 필요) |
| **Git Push** | `origin` 원격이 설정되어 있어야 함 (HTTPS 시 자격 증명 입력) |

git config 예:

```powershell
git config user.name "Your Name"
git config user.email "you@example.com"
```

---

## 저장소 요약 내보내기

저장소 통계와 차트가 포함된 요약 리포트를 PDF, Word, Markdown 형식으로 내보낼 수 있습니다.

### 실행 방법

- **Repository → Export Summary** (PDF / Word / Markdown)
- Repository 트리 또는 저장소 정보 라벨 **우클릭 → Export Summary**
- 도구 모음 **Export Summary** 드롭다운

| 단축키 | 형식 |
|--------|------|
| `Ctrl+Alt+P` | PDF |
| `Ctrl+Alt+W` | Word (.docx) |
| `Ctrl+Alt+M` | Markdown (.md) |

### 미리보기 후 내보내기

1. 메뉴에서 형식 선택
2. 요약 데이터 생성 후 **미리보기** 창 표시
3. 저장소 정보, 통계, 차트 4종, Recent Commits 확인
4. **Export PDF / Word / Markdown** 중 원하는 형식으로 저장
5. **Close** — 내보내기 없이 닫기

### 포함 차트

- Commit Activity (최근 12개월)
- Top Contributors
- Repository Overview (파이 차트)
- Commit Graph (최대 40커밋)

Markdown 내보내기 시 차트 PNG는 `{파일명}_charts/` 폴더에 함께 저장됩니다.

---

## 메뉴 및 도구 모음

### File 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **Open...** | `Ctrl+O` | 로컬 Git 저장소 열기 |
| **Clone...** | `Ctrl+Shift+O` | 원격 저장소 복제 |
| **Browse Remote...** | `Ctrl+Shift+B` | 원격 히스토리 읽기 전용 탐색 |
| *(최근 저장소)* | — | 최근 연 로컬 저장소 |
| **Exit** | `Alt+F4` | 앱 종료 |

### Repository 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **Refresh Tree** | `F5` | Repository 트리 새로 고침 |
| **Export Summary** | `Ctrl+Alt+P/W/M` | PDF / Word / Markdown 요약 내보내기 |

### History 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **Refresh Graph** | `Ctrl+F5` | Commit History 새로 고침 |
| **Copy SHA** | `Ctrl+Shift+S` | 선택 커밋 SHA 복사 |
| **Copy Message** | `Ctrl+Shift+M` | 선택 커밋 메시지 복사 |

### Diff 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **Copy Path** | `Ctrl+Shift+P` | 선택 파일 경로 복사 |
| **Wrap** | `Ctrl+Shift+W` | Diff 줄바꿈 토글 |
| **Copy** | `Ctrl+Shift+D` | Diff 텍스트 복사 |

### Help 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **About** | `F1` | 버전 및 프로그램 정보 |

### 도구 모음 (왼쪽 → 오른쪽)

| 버튼 | 기능 |
|------|------|
| **Open** | 저장소 열기 |
| **Clone** | 저장소 복제 |
| **Browse Remote** | 원격 히스토리 탐색 |
| **Refresh Tree** | Repository 트리 새로 고침 |
| **Export Summary** | 요약 리포트 내보내기 (PDF/Word/Markdown) |
| **Refresh Graph** | Commit History 새로 고침 |
| **Copy SHA / Copy Message / Copy Path** | 클립보드 복사 |
| **Wrap / Copy** | Diff 줄바꿈 · diff 복사 |
| **Info** | About 대화상자 |

모든 도구 모음 버튼은 아이콘만 표시되며, 마우스를 올리면 툴팁으로 기능을 확인할 수 있습니다.

---

## 바로 가기 및 컨텍스트 메뉴

| 동작 | 방법 |
|------|------|
| 저장소 열기 | File → Open... (`Ctrl+O`) |
| 저장소 복제 | File → Clone... (`Ctrl+Shift+O`) |
| 원격 탐색 | File → Browse Remote... (`Ctrl+Shift+B`) |
| 브랜치 체크아웃 | Repository → 로컬 브랜치 우클릭 → Checkout |
| 경로별 로그 | Files → 파일/폴더 클릭 또는 우클릭 → Show Log |
| Git Add / Commit / Push | Files → 우클릭 (로컬 Clone만) |
| 커밋 diff 보기 | Changed Files에서 파일 선택 |
| 요약 리포트 | Repository → Export Summary |
| 프로그램 정보 | Help → About (`F1`) |

---

## GitHub Releases

다음 조건을 만족하면 Repository 패널에 **Releases** 섹션이 표시됩니다.

- 저장소에 GitHub 원격(`origin` 등)이 설정되어 있음
- 원격 URL이 `github.com/owner/repo` 형식

Release 항목을 선택하면 릴리스 이름, 태그, 게시일, 릴리스 노트(본문)가 Commit Details / Diff 영역에 표시됩니다.

> 공개 저장소의 Release 목록은 인증 없이 조회됩니다. API 제한이나 네트워크 문제 시 목록이 비어 있을 수 있습니다.

---

## 설정 및 데이터 저장 위치

### 사용자 설정

| 항목 | 저장 위치 |
|------|-----------|
| 사용자 설정 | `%AppData%\MyGitWinV10\settings.json` |
| Browse Remote 캐시 | `%LocalAppData%\MyGitWinV10\remote-cache\` |

설정 파일 예:

```json
{
  "LastRepositoryPath": "C:\\Projects\\my-repo",
  "LastSuccessfulSession": {
    "Mode": "local",
    "Path": "C:\\Projects\\my-repo"
  },
  "RecentRepositoryPaths": [
    "C:\\Projects\\my-repo"
  ],
  "RecentCloneUrls": [
    "https://github.com/owner/repo.git"
  ],
  "CommitCategories": [
    "기능추가",
    "기능변경",
    "버그수정"
  ]
}
```

| 필드 | 설명 |
|------|------|
| `LastSuccessfulSession` | 마지막 성공 세션 (`local` 또는 `remote`) |
| `RecentRepositoryPaths` | 최근 연 로컬 저장소 (최대 10개) |
| `RecentCloneUrls` | 최근 입력한 Clone/Browse URL (최대 10개) |
| `CommitCategories` | Git Commit Category 목록 (최대 30개) |

### 저장하지 않는 정보

- HTTPS 사용자 이름 / 비밀번호 / PAT
- 클립보드에 복사한 내용 (OS 클립보드 관리)

---

## 문제 해결

### 저장소를 열 수 없음

- 선택한 폴더에 `.git` 디렉터리가 있는지 확인
- 다른 프로그램이 저장소를 잠그고 있지 않은지 확인
- 오류 메시지 대화상자의 내용을 참고

### Clone / Browse Remote 실패

- URL 형식 확인 (`https://...` 또는 `git@...`)
- GitHub 비공개 저장소: PAT 사용
- Clone 시 대상 폴더에 쓰기 권한 및 충분한 디스크 공간 확인
- Browse Remote 캐시 손상 시 `%LocalAppData%\MyGitWinV10\remote-cache\` 해당 폴더 삭제 후 재시도

### Git Commit 실패

- `git config user.name` 및 `git config user.email` 설정 확인
- Git Add로 stage된 파일이 있는지 확인

### Git Push 실패

- `git remote -v`로 `origin` 원격 존재 확인
- HTTPS 인증(PAT) 확인
- 원격에 이미 push된 커밋과 충돌 시 Git CLI에서 pull/rebase 후 재시도

### Releases가 표시되지 않음

- `git remote -v`로 GitHub 원격 URL 확인
- 인터넷 연결 확인
- GitHub API 일시적 제한 가능

### diff가 비어 있음

- 루트 커밋, merge 커밋, 또는 바이너리-only 변경 등 diff 생성이 어려운 경우일 수 있음
- Changed Files에서 다른 파일 선택

### .NET 런타임 오류

.NET 8 Desktop Runtime 설치 후 다시 실행하세요.

---

## 버전 정보

- **프로그램 이름:** MyGit V1.0.0
- **About:** Help → About (`F1`) 메뉴에서 확인

개발·빌드 방법은 [README.md](README.md)를 참고하세요.
