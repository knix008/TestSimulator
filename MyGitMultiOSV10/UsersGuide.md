# MyGit V1.0.0 — 사용자 가이드

MyGit은 커밋 그래프, 변경 파일, diff, 브랜치, 태그, GitHub Release를 한 화면에서 보는 Git 클라이언트입니다. 로컬 저장소에서는 Git Add, Reset, Discard, Commit, Fetch, Pull, Push, Stash도 할 수 있습니다.

이 문서는 **MyGitJS**(Web, Windows, macOS, Linux)를 기준으로 설명합니다. Windows 전용 WinForms 앱의 차이만 [Windows WinForms 앱](#windows-winforms-앱)에 따로 적었습니다.

기본 언어는 한국어입니다. Git 명령 이름(Git Add, Git Commit, Git Fetch 등)은 한국어와 English 모두에서 영어로 표시됩니다.

제작자: SHKWON(knix008@naver.com)

---

## 목차

1. [시작하기](#시작하기)
2. [화면 구성](#화면-구성)
3. [저장소 열기 · 복제 · 원격 탐색](#저장소-열기--복제--원격-탐색)
4. [Files 패널](#files-패널)
5. [Repository 패널](#repository-패널)
6. [Commit History](#commit-history)
7. [Commit Details와 Diff](#commit-details와-diff)
8. [Git 작업](#git-작업)
9. [요약 내보내기](#요약-내보내기)
10. [테마, 언어, 환경설정](#테마-언어-환경설정)
11. [메뉴와 도구 모음](#메뉴와-도구-모음)
12. [오류 대화상자](#오류-대화상자)
13. [설정 위치](#설정-위치)
14. [문제 해결](#문제-해결)
15. [Windows WinForms 앱](#windows-winforms-앱)

---

## 시작하기

### 웹

프로젝트 루트에서 실행합니다.

```powershell
npm install
npm run dev:web
```

브라우저에서 http://127.0.0.1:5173 을 엽니다. 이 컴퓨터에 Git이 설치되어 있어야 합니다. 웹에서는 폴더 대화상자 대신 경로를 입력합니다.

### 데스크톱

```powershell
npm run dev
```

Electron 창이 열리고, 운영체제의 폴더 선택 대화상자를 사용할 수 있습니다. 설치 파일은 `npm run dist`로 만들며, 완성본은 프로젝트 루트에 저장됩니다. Windows 설치 마법사에서는 한국어 또는 English를 고르고, 바탕 화면과 시작 메뉴 바로 가기를 만들지 각각 선택할 수 있습니다. 자세한 내용은 [README.md](README.md)를 참고하세요.

### 마지막 세션

마지막으로 연 저장소가 다음 실행 때 다시 열립니다. Open, Clone, Browse Remote 중 마지막에 성공한 것이 복원됩니다.

---

## 화면 구성

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 파일  저장소  히스토리  도움말          [테마] [언어] [정보]              │
│ 열기  복제  원격 탐색  새로 고침  Commit  Pull  Push                      │
├────────────────────────────┬─────────────────────────────────────────────┤
│ Files                      │ Commit History                              │
│ 드라이브 · 폴더 열기        │ 그래프, 메시지, SHA, 작성자, 날짜            │
│ 파일 트리                  ├──────────────────────┬──────────────────────┤
│                            │ Commit Details       │ Diff                 │
│ Repository                 │ 변경 파일            │ unified diff         │
│ 브랜치 · 원격 · 태그 · Release│                     │                      │
└────────────────────────────┴──────────────────────┴──────────────────────┘
```

왼쪽은 **Files가 위**, **Repository가 아래**입니다. 패널 사이 분할선을 드래그하면 크기가 바뀝니다.

메뉴, 메뉴 항목, 도구 모음, 컨텍스트 메뉴에는 아이콘이 함께 표시됩니다. 테마, 언어, 정보는 도구 모음 오른쪽에 있습니다.

---

## 저장소 열기 · 복제 · 원격 탐색

### 로컬 저장소 열기

1. **파일 → 열기...** 또는 도구 모음 **열기**. 웹에서는 `Ctrl+O`도 같은 동작입니다.
2. 데스크톱은 폴더를 고릅니다. 웹은 경로를 입력합니다.
3. `.git`이 있는 폴더면 브랜치, 파일, 커밋 히스토리가 열립니다.

### 복제

1. **파일 → 복제...** 또는 도구 모음 **복제**
2. 저장소 URL과 대상 폴더를 입력합니다.
3. 비공개 HTTPS 저장소는 사용자 이름과 Personal Access Token을 입력합니다.
4. 복제가 끝나면 그 폴더가 열립니다. 원격 URL에는 토큰이 저장되지 않습니다.

진행 중에는 도구 모음 **중지**로 취소할 수 있습니다.

### 원격 탐색

로컬 작업 폴더를 만들지 않고 히스토리만 볼 때 사용합니다.

1. **파일 → 원격 탐색...**
2. URL을 입력하고 확인합니다.
3. bare 캐시에서 읽기 전용으로 열립니다.

이 모드에서는 Checkout, Git Add, Commit, Push가 동작하지 않습니다.

### 최근 항목

- **파일** 메뉴 아래에 최근 저장소가 있습니다.
- Clone과 Browse Remote에 쓴 URL은 설정에 기억됩니다. 최대 10개입니다.

---

## Files 패널

제목 옆에 이 컴퓨터의 드라이브와 **폴더 열기**가 있습니다.

| 동작 | 결과 |
|------|------|
| 드라이브 클릭 | 그 드라이브의 폴더를 나열합니다. 드라이브 루트를 Git 저장소로 열지는 않습니다. |
| **폴더 열기** | Git 저장소면 저장소를 엽니다. 아니면 그 폴더를 탐색합니다. |
| Files 제목 클릭 | 폴더를 탐색 중이고 저장소가 열려 있으면 저장소 파일로 돌아갑니다. |
| 폴더 클릭 | 하위 항목을 펼치거나 접습니다. |
| 파일 더블클릭 | 운영체제 기본 앱으로 엽니다. |

### 상태 배지

| 배지 | 의미 |
|------|------|
| `U` | 추적되지 않은 파일 |
| `±` | 수정됨 |
| `D` | 삭제됨 |
| `R` | 이름 변경 |
| `T` | 종류 변경 |
| `!` | 충돌 |
| `X` | `.gitignore`로 무시됨 |
| `P` | 커밋됐지만 아직 push되지 않음 |

폴더 배지는 그 안의 변경을 모아서 보여 줍니다. 다른 프로그램에서 파일을 바꾸면 잠시 후 목록이 다시 읽힙니다.

### 저장소 파일에서 우클릭

| 메뉴 | 동작 |
|------|------|
| **충돌 해결...** | 충돌한 파일에서만 보입니다. 기본 merge 도구로 엽니다. |
| **Show Log** | 그 경로의 커밋만 히스토리에 표시 |
| **Copy Path** | 저장소 기준 경로 복사 |
| **Show All Commits** | 경로 필터 해제 |
| **Git Add / Git Reset / Discard Changes** | 선택 항목에 대한 Git 작업 |
| **Git Commit / Git Fetch / Git Pull / Git Push / Git Stash / Git Stash Pop / Git Status** | 저장소 전체에 대한 Git 작업. **저장소** 메뉴와 같습니다. |
| **새 파일... / 새 폴더...** | 선택 위치 아래에 만들기 |
| **삭제** | 디스크에서 삭제 |
| **.gitignore에 추가 / 제거** | 무시 규칙 변경 |

파일과 폴더의 메뉴는 같습니다. Git Add, Git Reset, Discard Changes, Show Log는 고른 경로에만 적용되고, Commit과 Fetch / Pull / Push / Stash는 저장소 전체에 적용됩니다.

폴더 탐색 중일 때의 메뉴는 **폴더 열기**와 **경로 복사**입니다.

---

## Repository 패널

왼쪽 아래에 있습니다.

| 구역 | 내용 |
|------|------|
| **Local Branches** | 로컬 브랜치. 현재 브랜치가 표시됩니다. |
| **Remotes** | 원격 브랜치 |
| **Tags** | 태그 |
| **Releases** | `github.com/owner/repo` 형태의 원격이 있을 때 GitHub Release |

로컬 브랜치를 우클릭하면 **Checkout**, **이름 복사**, **요약 내보내기**가 있습니다. Checkout은 작업 폴더가 있는 저장소에서만 됩니다.

원격과 태그는 이름이나 SHA를 복사할 수 있습니다.

---

## Commit History

각 레인은 브랜치와 머지 경로입니다. 행을 클릭하면 오른쪽 상세와 diff가 바뀝니다. 특정 파일의 로그만 볼 때는 그래프가 한 줄로 펴집니다.

우클릭:

| 메뉴 | 동작 |
|------|------|
| **SHA 복사** | 전체 해시 |
| **메시지 복사** | 커밋 메시지 |
| **커밋 스냅샷 내보내기** | 그 커밋의 파일을 폴더로 저장 |

**히스토리 → 모든 커밋 보기**는 경로 필터를 해제합니다.

---

## Commit Details와 Diff

선택한 커밋의 작성자, 날짜, 메시지와 변경 파일 목록이 표시됩니다.

- 변경 파일을 클릭하면 diff가 열립니다.
- 더블클릭하거나 우클릭 **내장 Diff 도구**는 좌우 비교 창을 별도로 띄웁니다.
- 우클릭 **외부 Diff 도구**는 환경설정의 외부 diff 도구를 실행합니다. 도구가 없으면 오류 대화상자에 이유가 표시됩니다.
- Diff 우클릭에서 **복사**와 **줄 바꿈**을 사용할 수 있습니다. 줄 바꿈은 기본으로 켜져 있습니다.

---

## Git 작업

작업 폴더가 있는 저장소에서만 됩니다. Browse Remote에서는 비활성화됩니다.

**저장소** 메뉴 또는 Files 우클릭에서 실행합니다.

| 메뉴 | 동작 |
|------|------|
| **Git Add** | 선택 경로를 stage. 먼저 들어갈 경로를 확인합니다. |
| **Git Reset (Unstage)** | stage 취소 |
| **Discard Changes** | 작업 트리 변경을 되돌림. 추적되지 않은 파일은 지워질 수 있습니다. |
| **Git Commit** | stage된 내용을 커밋 |
| **Git Fetch** | `origin`에서 가져오기 |
| **Git Pull** | fast-forward로 합치기 |
| **Git Push** | 업스트림이 없으면 `origin`의 현재 브랜치로 push |
| **Git Stash / Git Stash Pop** | 변경을 잠시 보관했다가 되돌리기 |
| **Git Status** | `git status` 내용 표시 |
| **충돌 해결...** | 충돌한 파일을 merge 도구로 엽니다. 선택한 파일이 충돌 상태가 아니면 첫 충돌 파일을 씁니다. |

### 충돌 해결

Pull이나 Merge가 충돌로 멈추면 Files 패널의 그 파일에 충돌 배지가 붙습니다. **저장소 → 충돌 해결...**, 도구 모음 **충돌 해결**, 또는 그 파일 우클릭 **충돌 해결...**로 엽니다.

기본값은 **내장 Diff & Merge**이고 별도 창으로 열립니다.

- 충돌 덩어리마다 Base, Local, Remote 세 열이 나란히 보입니다.
- **Base / Local / Remote / 양쪽** 중 하나를 고르면 그 덩어리가 해결 처리됩니다.
- 위쪽에 해결한 개수 / 전체 개수가 표시되고, 전부 고른 다음에만 **저장**이 켜집니다.
- **저장**은 작업 트리 파일을 쓰고 `git add`까지 합니다. 그다음 커밋하면 됩니다.
- 충돌이 없는 파일을 이 창으로 열면 오류 대화상자가 열립니다.

환경설정에서 외부 merge 도구를 고르면 같은 메뉴가 그 도구를 실행합니다.

### 커밋 메시지

```
[분류] 제목

본문 (선택)
```

분류 기본값은 기능추가, 기능변경, 기능삭제, 버그수정, 문서, 리팩토링, 성능개선, 테스트, 기타입니다. **관리...**에서 목록을 고치면 설정에 저장됩니다.

커밋하려면 `user.name`과 `user.email`이 그 저장소 또는 전역 Git 설정에 있어야 합니다.

```powershell
git config user.name "Your Name"
git config user.email "you@example.com"
```

### HTTPS 자격 증명

Fetch, Pull, Push에서 인증이 필요하면 사용자 이름과 토큰을 묻습니다. 성공하면 토큰이 암호화되어 저장되고, 다음부터는 다시 묻지 않습니다. 인증에 실패하면 저장된 값을 지우지 않고, 다음에 대화상자가 다시 나타납니다.

GitHub는 계정 비밀번호 대신 Personal Access Token을 사용합니다. Organization SSO가 필요한 저장소는 토큰을 그 조직에 승인한 뒤 다시 시도합니다.

---

## 요약 내보내기

**히스토리 → 요약 내보내기**, 또는 브랜치 메뉴의 **요약 내보내기**를 선택합니다.

대화상자에는 경로, 브랜치, 원격, 커밋 수, 기여자, 최근 커밋이 Markdown으로 표시됩니다.

- **Markdown 저장** — `summary.md` 다운로드
- **인쇄 / PDF** — 브라우저 인쇄 대화상자

WinForms 앱의 PDF·Word 차트 리포트와는 형식이 다릅니다.

---

## 테마, 언어, 환경설정

### 도구 모음 오른쪽

| 버튼 | 동작 |
|------|------|
| **색상 테마** | Light 20개, Dark 20개. 고르면 바로 적용되고 저장됩니다. |
| **언어** | 한국어 또는 English. 재시작 없이 바뀝니다. |
| **정보** | 버전과 제작자 SHKWON(knix008@naver.com), 설정 파일 경로 |

기본 테마는 Light 클래식입니다.

### 파일 → 환경설정...

- UI 언어
- 색상 테마
- 외부 diff 도구 경로
- 인수 템플릿. 기본값은 `"{left}" "{right}"`
- Merge 도구. 기본값은 **내장 Diff & Merge (기본)**이고, 목록에서 설치된 외부 도구를 고르거나 경로를 직접 적을 수 있습니다.
- Merge 인수 템플릿. 기본값은 `"{base}" "{local}" "{remote}" "{merged}"`

`{left}`와 `{right}`는 비교할 임시 파일 경로로 바뀝니다. `{base}`, `{local}`, `{remote}`는 충돌한 세 버전의 임시 파일이고 `{merged}`는 작업 트리의 파일입니다. 내장 Diff & Merge를 고르면 경로와 인수 칸은 쓰이지 않습니다.

---

## 메뉴와 도구 모음

### 파일

| 항목 | 설명 |
|------|------|
| **열기...** | 로컬 Git 저장소. `Ctrl+O` |
| **복제...** | 원격 저장소를 폴더에 복제 |
| **원격 탐색...** | 읽기 전용 히스토리 |
| 최근 저장소 | 다시 열기 |
| **환경설정...** | 언어, 테마, 외부 diff |

### 저장소

새로 고침, Git Add, Git Reset, Discard Changes, Git Commit, 충돌 해결..., Git Fetch, Git Pull, Git Push, Git Stash, Git Stash Pop, Git Status.

### 히스토리

모든 커밋 보기, 요약 내보내기, 커밋 스냅샷 내보내기.

### 도움말

**정보**. 도구 모음 오른쪽 **정보**와 같습니다.

### 도구 모음

왼쪽부터 열기, 복제, 원격 탐색, 인쇄, 새로 고침, Git Add, Git Commit, 충돌 해결, Git Pull, Git Push, 그리고 왼쪽·오른쪽·아래 패널 접기입니다. **충돌 해결**은 충돌한 파일이 있을 때만 켜집니다. 작업 중에는 **중지**가 나타납니다. 오른쪽 끝은 테마, 언어, 환경설정, 정보입니다.

---

## 오류 대화상자

작업이 실패하면 **오류** 창에 요청 내용, HTTP 상태, 오류 코드, 메시지, 서버가 돌려준 상세 내용이 함께 나옵니다. Git이 출력한 설명도 여기에 포함됩니다.

**복사**를 누르면 그 내용 전체가 클립보드에 들어갑니다. 복사되면 버튼 글자가 **복사했습니다.**로 바뀝니다.

---

## 설정 위치

| OS | 설정 파일 | Browse Remote 캐시 |
|----|-----------|--------------------|
| Windows | `%AppData%\MyGitJS\settings.json` | `%LocalAppData%\MyGitJS\remote-cache\` |
| macOS | `~/Library/Application Support/MyGitJS/settings.json` | `~/Library/Caches/MyGitJS/remote-cache/` |
| Linux | `~/.config/MyGitJS/settings.json` | `~/.cache/MyGitJS/remote-cache/` |

같은 폴더의 `.key`가 토큰 암호화에 쓰입니다. `settings.json`을 열어도 토큰 원문은 보이지 않습니다. 최근 저장소와 최근 URL은 각각 최대 10개입니다.

---

## 문제 해결

### Git을 찾을 수 없음

화면 위에 Git이 없다는 안내가 나오면, `git`이 터미널에서 실행되는지 확인한 뒤 앱을 다시 시작합니다.

### 저장소를 열 수 없음

폴더 안에 `.git`이 있는지 확인합니다. Git 저장소가 아닌 폴더는 **폴더 열기**로 목록만 볼 수 있습니다. 오류 창의 상세를 복사해 두면 원인을 구분하기 쉽습니다.

### 복제 또는 원격 탐색 실패

- URL이 `https://` 또는 `file://` 형태인지 확인합니다.
- 비공개 GitHub 저장소는 PAT를 사용합니다.
- 복제 대상 폴더는 비어 있거나 아직 없어야 합니다.
- 캐시가 꼬이면 해당 URL의 캐시 폴더를 지운 뒤 다시 탐색합니다. Windows에서는 `%LocalAppData%\MyGitJS\remote-cache\`입니다.

### 커밋 또는 push 실패

- `user.name`, `user.email`을 확인합니다.
- Commit 전에 Git Add로 stage했는지 확인합니다.
- push는 `origin`이 있어야 합니다.
- 403이 반복되면 토큰의 조직 SSO 승인을 확인합니다.

### 외부 diff가 열리지 않음

**파일 → 환경설정...**에서 도구 경로를 지정합니다. 지정 전에는 오류 대화상자가 열립니다.

### 도구 창이 열리지 않음

웹 브라우저에서 팝업이 차단되면 내장 Diff나 내장 Diff & Merge 창이 열리지 않고 그 이유가 표시됩니다. 이 주소의 팝업을 허용해 주세요. 데스크톱에서는 Electron이 직접 창을 엽니다.

### Release가 비어 있음

원격 URL이 GitHub `owner/repo` 형태인지, 인터넷이 연결돼 있는지 확인합니다. 공개 저장소는 토큰 없이 조회합니다.

---

## Windows WinForms 앱

`MyGitWinV10.App`은 Windows 전용입니다. 빌드와 MSI는 [README.md](README.md)를 참고하세요.

```powershell
npm run win:run
```

MyGitJS와 다른 점만 적습니다.

| 항목 | WinForms |
|------|----------|
| 왼쪽 패널 | Repository가 위, Files가 아래 |
| 요약 | PDF, Word, Markdown과 차트. `Ctrl+Alt+P`, `Ctrl+Alt+W`, `Ctrl+Alt+M` |
| 설정 | `%AppData%\MyGitWinV10\settings.json` |
| 원격 캐시 | `%LocalAppData%\MyGitWinV10\remote-cache\` |
| 토큰 | Windows DPAPI(현재 사용자) |
| 테마 | MyGitJS의 40개 테마와 드라이브 버튼은 이 앱에 없습니다. |

자주 쓰는 단축키는 Open `Ctrl+O`, Clone `Ctrl+Shift+O`, Browse Remote `Ctrl+Shift+B`, Refresh Tree `F5`, Refresh Graph `Ctrl+F5`, About `F1`입니다. 정보 창의 저작권 표기는 SHKWON(knix008@naver.com)입니다.

.NET 8 Desktop Runtime이 없으면 설치본이 실행되지 않습니다. Release MSI를 만들기 전에 실행 중인 MyGit을 종료하세요. 완성된 `MyGitWinV10Setup.msi`는 프로젝트 루트에 복사됩니다.
