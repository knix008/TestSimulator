# MyGit V1.0.0 — 사용자 가이드

MyGit은 Windows용 Git 클라이언트입니다. 커밋 그래프, 변경 파일, diff, 브랜치/태그, GitHub Release를 한 화면에서 탐색할 수 있으며, 로컬 Clone 저장소에서는 **Git Add / Reset / Discard / Commit / Fetch / Pull / Push / Stash** 등의 작업도 수행할 수 있습니다.

---

## 목차

1. [시작하기](#시작하기)
2. [화면 구성](#화면-구성)
3. [저장소 열기 · 복제 · 원격 탐색](#저장소-열기--복제--원격-탐색)
4. [Repository 패널](#repository-패널)
5. [Files 패널](#files-패널)
6. [Commit History 패널](#commit-history-패널)
7. [Commit Details / Diff 패널](#commit-details--diff-패널)
8. [Git 작업 (Add / Commit / Push 등)](#git-작업-add--commit--push-등)
9. [저장소 요약 내보내기](#저장소-요약-내보내기)
10. [환경설정 (Preferences)](#환경설정-preferences)
11. [메뉴 및 도구 모음](#메뉴-및-도구-모음)
12. [바로 가기 및 컨텍스트 메뉴](#바로-가기-및-컨텍스트-메뉴)
13. [GitHub Releases](#github-releases)
14. [설정 및 데이터 저장 위치](#설정-및-데이터-저장-위치)
15. [문제 해결](#문제-해결)

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
| **Files** | 저장소 폴더/파일 트리 (로컬: 작업 트리, 원격 보기: HEAD 트리). Git 상태 배지·툴팁, 실시간 갱신 |
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

Clone/Browse Remote에서 입력한 자격 증명은 해당 다이얼로그가 열려 있는 동안만 메모리에 보관되며 디스크에 저장되지 않습니다. (Repository 메뉴의 Git Fetch/Pull/Push에서 사용하는 자격 증명은 다르게 동작합니다 — [Fetch / Pull / Push와 HTTPS 인증](#fetch--pull--push와-https-인증) 참고.)

### 최근 URL · 최근 저장소

- **Repository URL** 입력란에 포커스를 주면(아무것도 입력하지 않아도) 최근에 사용한 URL 목록이 바로 드롭다운으로 표시됩니다.
- 목록이 펼쳐진 상태에서 항목을 선택하고 **Delete** 키를 누르면 해당 URL이 히스토리에서 삭제됩니다.
- **File** 메뉴 하단에는 최근에 연 로컬 저장소 목록이 표시됩니다. 항목을 클릭하면 해당 저장소를 다시 엽니다.

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

Repository 패널 아래에 위치하며, 저장소의 폴더/파일 구조를 **"디렉토리/파일"**, **"상태"** 두 컬럼을 가진 트리 구조 목록으로 표시합니다.

| 모드 | 표시 내용 |
|------|-----------|
| **로컬 저장소** | 작업 디렉터리 (`.git` 제외) |
| **Browse Remote / bare** | HEAD 커밋 기준 Git 트리 |

### 실시간 갱신

로컬 Clone 저장소에서는 Git 작업(Git Add, Commit, Pull 등) 직후뿐 아니라, 탐색기나 다른 프로그램에서 파일을 수정·추가·삭제해도 Files 패널과 상태 배지가 자동으로 갱신됩니다(짧은 지연 후 반영).

### 트리 탐색

- 디렉터리 행을 **클릭**하면 펼치기/접기가 토글됩니다 (▸ 접힘 / ▾ 펼쳐짐). 자식이 아직 로드되지 않은 폴더는 처음 펼칠 때 지연 로드됩니다.
- **파일을 더블클릭**하면 Windows 기본 연결 프로그램으로 열립니다 (작업 트리에 있는 파일만).
- 들여쓰기와 연결선으로 디렉터리/파일의 계층 구조를 표시합니다.
- **헤더 컬럼 구분선을 드래그**하면 "디렉토리/파일" 컬럼의 너비를 조절할 수 있습니다. 상태 컬럼 너비는 배지 표시에 맞게 자동 조절됩니다.

### 경로별 커밋 로그

추적(tracked) 중인 파일 또는 폴더를 **선택**하거나 **우클릭 → Show Log** 하면 Commit History 패널이 해당 경로의 커밋만 필터링하여 표시합니다. 제목에 `Commit History — 경로` 형식으로 표시됩니다.

**우클릭 메뉴 (공통):**

| 메뉴 | 동작 |
|------|------|
| **Show Log** | 선택 경로의 커밋 히스토리 필터 |
| **Copy Path** | 저장소 기준 상대 경로 복사 |
| **Show All Commits** | 경로 필터 해제 |

로컬 Clone 저장소에서 추가로 표시되는 메뉴는 [Git 작업](#git-작업-add--commit--push-등) 절을 참고하세요.

### 아이콘과 상태 컬럼

각 파일·디렉터리 아이콘은 Git 상태에 따라 다르게 표시됩니다. **상태** 컬럼에는 변경 종류를 나타내는 **굵은 색상 배지**가 표시됩니다:

| 배지 | 의미 | 색상 |
|------|------|------|
| `±` | 변경됨 (Modified / Staged 등) | 파란색·보라색 |
| `U` | 미추적 (Untracked) | 초록색 |
| `P` | 커밋됐으나 아직 Push 안 됨 | 빨간색 |
| `D` | 삭제됨 (Deleted) | 빨간색 |
| `R` | 이름변경 (Renamed) | 파란색 |
| `!` | 충돌 (Conflicted) | 빨간색 |
| `X` | 무시됨 (.gitignore) | 회색 |

폴더 행에는 자식 항목의 변경·미 Push 상태가 요약되어 표시될 수 있습니다.

마우스를 파일/디렉터리 위에 올리면 해당 경로의 Git 상태(스테이징·작업 트리·Push 대기 등)가 툴팁으로 표시됩니다.

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

**더블클릭:** [환경설정](#환경설정-preferences)에서 외부 Diff 도구가 설정되어 있으면, 더블클릭 시 내장 Diff 패널 대신 해당 외부 도구로 비교 화면이 열립니다.

**우클릭:** **Copy Path** — 파일 경로를 클립보드에 복사

### Diff

- unified diff 형식, 추가/삭제 줄 색상 구분
- **기본적으로 자동 줄바꿈(Word Wrap)이 켜져 있습니다**
- **Diff → Wrap** (`Ctrl+Shift+W`) 또는 도구 모음 **Wrap** — 자동 줄바꿈 토글
- **Diff → Copy** (`Ctrl+Shift+D`) 또는 도구 모음 **Copy** — diff 텍스트 복사
- Diff 영역을 **우클릭**하면 **Copy**, **Word Wrap** 토글을 바로 사용할 수 있습니다

---

## Git 작업 (Add / Commit / Push 등)

**로컬 Clone 저장소**(작업 디렉터리가 있는 저장소)에서만 사용할 수 있습니다. Browse Remote 모드에서는 표시되지 않습니다.

Files 패널에서 파일 또는 폴더를 **우클릭**하거나, 메뉴 모음의 **Repository → Git**에서 저장소 전체에 대해 실행합니다.

> **Git 명령어 이름**(Git Add, Git Commit, Git Fetch 등)은 UI 언어가 한국어여도 **영어로 표시**됩니다. 설명·상태 표시줄·완료 메시지 등은 선택한 언어(한국어/English)로 표시됩니다.

### Repository → Git / Files 우클릭 (Git)

| 메뉴 | 동작 |
|------|------|
| **Git Add** | 선택한 파일/폴더를 stage (저장소 루트 선택 시 전체). 완료 후 스테이징된 경로 목록 대화상자 표시 |
| **Git Reset (Unstage)** | stage를 취소 |
| **Git Discard Changes** | 작업 트리의 변경사항을 되돌림 (확인 대화상자) |
| **Git Commit...** | staged 변경사항 커밋 (카테고리 형식 메시지) |
| **Git Fetch** | `origin`에서 변경사항만 가져옴 (병합 없음) |
| **Git Pull** | `origin`의 변경사항을 가져와 병합 |
| **Git Push** | 현재 브랜치를 `origin` 원격으로 push |
| **Git Stash** | 작업 트리의 변경사항을 임시 보관 |
| **Git Stash Pop** | 가장 최근 stash를 적용하고 제거 |
| **Git Status...** | 현재 staged/work tree 상태를 대화상자로 표시 |

### Files 우클릭 (작업 트리)

| 메뉴 | 동작 |
|------|------|
| **New File...** | 선택 폴더(또는 저장소 루트) 아래에 새 파일 생성 |
| **New Folder...** | 선택 위치 아래에 새 폴더 생성 |
| **Delete** | 선택한 파일 또는 폴더를 디스크에서 삭제 (확인 후, 되돌릴 수 없음) |
| **Add to .gitignore** | 선택 경로를 `.gitignore`에 추가 |
| **Remove from .gitignore** | `.gitignore`에서 해당 패턴 제거 |

### 권장 작업 순서

```
Git Add → Git Commit... → Git Push
```

### Fetch / Pull / Push와 HTTPS 인증

- 처음 실행할 때 username과 PAT를 입력하는 대화상자가 표시됩니다 (대화상자는 데이터 연결이 끝나고 실제로 시간이 걸릴 때만 나타나며, 인증 대기 중에는 표시되지 않습니다).
- 인증에 **성공**하면 username/PAT가 암호화되어 저장되고, 다음부터는 대화상자 없이 자동으로 재사용됩니다.
- 인증 후 작업이 **실패**하면(예: 403) 다음 시도에 대화상자가 다시 나타나지만, 입력했던 값은 지워지지 않고 그대로 채워져 있습니다 — 값 자체가 아니라 "자동 재사용" 여부만 초기화되기 때문입니다.
- `403` 오류가 반복되면 PAT 자체가 아니라, GitHub organization의 **SSO(SAML) 정책으로 토큰이 아직 승인되지 않은 경우**가 흔한 원인입니다. GitHub의 Personal access token 설정 페이지에서 해당 조직에 대해 토큰을 "Authorize"했는지 확인하세요.

### Git Add 결과 대화상자

Git Add가 완료되면 **Git Add Complete** 대화상자에 스테이징된 경로와 상태 배지(`U`, `±`, `D`, `R` 등)가 표시됩니다.

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
| **Git Fetch / Pull / Push** | `origin` 원격이 설정되어 있어야 함 (HTTPS 시 자격 증명 입력, 이후 자동 재사용) |
| **Git Stash Pop** | 적용할 stash 항목이 있어야 함 |

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

## 환경설정 (Preferences)

**File → Preferences...** 메뉴에서 다음 두 가지를 설정할 수 있습니다.

### 외부 Diff 도구

| 항목 | 설명 |
|------|------|
| **Tool Path** | 외부 Diff 도구의 실행 파일 경로 (**Browse...** 로 찾아보기) |
| **Arguments** | 실행 인수 템플릿. `{left}`와 `{right}`는 비교할 두 임시 파일 경로로 자동 치환됩니다. 기본값: `"{left}" "{right}"` |

도구가 설정되어 있으면, Changed Files 목록에서 파일을 **더블클릭**할 때 내장 Diff 패널 대신 해당 외부 도구가 실행되며, 선택한 파일의 변경 전/변경 후 내용이 임시 파일로 전달됩니다. 도구가 설정되어 있지 않으면 평소처럼 내장 Diff 패널이 사용됩니다.

### 언어 (Language)

- **한국어** (기본값) 또는 **English** 중 선택
- 변경 사항은 **재시작 없이 즉시** 적용됩니다 (열려 있는 환경설정·Git 대화상자 포함)
- **한국어로 번역되는 항목:** 메인 메뉴, 도구 모음, 패널 제목, 컬럼 헤더, 상태 표시줄, 확인/오류/완료 메시지, 클론·원격 탐색·커밋 카테고리 등 대부분의 대화상자
- **영어로 유지되는 항목:** Git 명령 메뉴 이름 및 완료/실패 제목 (`Git Add`, `Git Commit Complete`, `Git Fetch Failed` 등), GitHub/PAT 관련 고유명사, 저장소 데이터(브랜치명, 커밋 메시지, SHA)

설정한 값은 다음 실행 시에도 유지됩니다 ([설정 및 데이터 저장 위치](#설정-및-데이터-저장-위치) 참고).

---

## 메뉴 및 도구 모음

### File 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **Open...** | `Ctrl+O` | 로컬 Git 저장소 열기 |
| **Clone...** | `Ctrl+Shift+O` | 원격 저장소 복제 |
| **Browse Remote...** | `Ctrl+Shift+B` | 원격 히스토리 읽기 전용 탐색 |
| *(최근 저장소)* | — | 최근 연 로컬 저장소 |
| **Preferences...** | — | 외부 Diff 도구 및 언어 설정 |
| **Exit** | `Alt+F4` | 앱 종료 |

### Repository 메뉴

| 항목 | 단축키 | 설명 |
|------|--------|------|
| **Refresh Tree** | `F5` | Repository 트리 새로 고침 |
| **Git** | — | Git Add / Reset / Commit / Fetch / Pull / Push / Stash / Status (로컬 Clone만) |
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
| 작업 트리 파일 열기 | Files → 파일 **더블클릭** (시스템 기본 앱) |
| 새 파일/폴더 | Files → 우클릭 → New File... / New Folder... |
| 파일/폴더 삭제 | Files → 우클릭 → Delete |
| .gitignore 관리 | Files → 우클릭 → Add to / Remove from .gitignore |
| Git Add / Commit / Fetch / Pull / Push / Stash | Files → 우클릭, 또는 Repository → Git 메뉴 (로컬 Clone만) |
| 커밋 diff 보기 | Changed Files에서 파일 선택 |
| 외부 Diff 도구로 보기 | Changed Files에서 파일 더블클릭 (도구가 설정된 경우) |
| 요약 리포트 | Repository → Export Summary |
| 환경설정 (외부 Diff 도구 / 언어) | File → Preferences... |
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
  ],
  "ExternalDiffToolPath": "C:\\Program Files\\WinMerge\\WinMergeU.exe",
  "ExternalDiffToolArguments": "\"{left}\" \"{right}\"",
  "Language": "Korean"
}
```

| 필드 | 설명 |
|------|------|
| `LastSuccessfulSession` | 마지막 성공 세션 (`local` 또는 `remote`) |
| `RecentRepositoryPaths` | 최근 연 로컬 저장소 (최대 10개) |
| `RecentCloneUrls` | 최근 입력한 Clone/Browse URL (최대 10개) |
| `CommitCategories` | Git Commit Category 목록 (최대 30개) |
| `GitHubUsername` | Git Fetch/Pull/Push에서 마지막으로 사용한 username |
| `GitHubTokenProtected` | 마지막으로 사용한 PAT — Windows DPAPI(현재 사용자 기준)로 암호화되어 저장 |
| `ExternalDiffToolPath` | [환경설정](#환경설정-preferences)에서 설정한 외부 Diff 도구 실행 파일 경로 |
| `ExternalDiffToolArguments` | 외부 Diff 도구 실행 인수 템플릿 (`{left}`/`{right}` 치환) |
| `Language` | UI 언어 (`Korean` 또는 `English`, 기본값 `Korean`) |

### 저장하지 않는 정보

- Clone / Browse Remote 다이얼로그에서 입력한 자격 증명 (해당 다이얼로그가 열려 있는 동안만 메모리에 유지)
- 클립보드에 복사한 내용 (OS 클립보드 관리)

> `GitHubTokenProtected`는 평문이 아니라 DPAPI로 암호화된 값입니다. 같은 Windows 사용자 계정에서만 복호화할 수 있으며, `settings.json` 파일 자체를 열어봐도 PAT 원문은 보이지 않습니다.

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
- **403 오류가 PAT를 올바르게 입력했는데도 발생**하면, PAT 자체보다 GitHub organization의 SSO(SAML) 정책이 원인인 경우가 많습니다. PAT 발급 페이지에서 해당 조직에 토큰을 "Authorize"했는지 확인하세요. 실패한 자격 증명 값은 지워지지 않으므로 재시도 시 다시 입력할 필요 없이 그대로 다시 시도하면 됩니다.

### Releases가 표시되지 않음

- `git remote -v`로 GitHub 원격 URL 확인
- 인터넷 연결 확인
- GitHub API 일시적 제한 가능

### diff가 비어 있음

- 루트 커밋, merge 커밋, 또는 바이너리-only 변경 등 diff 생성이 어려운 경우일 수 있음
- Changed Files에서 다른 파일 선택

### .NET 런타임 오류

.NET 8 Desktop Runtime 설치 후 다시 실행하세요.

### MSI 설치 파일 빌드

개발자용 — Release MSI는 다음 중 하나로 빌드합니다.

```powershell
dotnet build MyGitWinV10.slnx -c Release
```

또는

```powershell
dotnet build installer/MyGitWinV10.Installer.wixproj -c Release -p:Platform=x64
```

출력: `installer/bin/Release/MyGitWinV10Setup.msi`

- 빌드 전 실행 중인 MyGit 프로세스를 종료하세요.
- MSI 크기가 비정상적으로 작으면(수 KB) publish 출력이 비어 있는 것이므로 **솔루션 전체** 또는 **installer 프로젝트**로 다시 빌드하세요.
- 자세한 내용은 [README.md](README.md)를 참고하세요.

---

## 버전 정보

- **프로그램 이름:** MyGit V1.0.0
- **About:** Help → About (`F1`) 메뉴에서 확인

개발·빌드 방법은 [README.md](README.md)를 참고하세요.
