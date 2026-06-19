# MyGit V1.0.0 — 사용자 가이드

MyGit은 Windows용 Git 저장소 뷰어입니다. 커밋 그래프, 변경 파일, diff, 브랜치/태그, GitHub Release를 한 화면에서 탐색할 수 있습니다.

---

## 목차

1. [시작하기](#시작하기)
2. [화면 구성](#화면-구성)
3. [저장소 열기 및 복제](#저장소-열기-및-복제)
4. [Repository 패널](#repository-패널)
5. [Commit History 패널](#commit-history-패널)
6. [Commit Details / Diff 패널](#commit-details--diff-패널)
7. [메뉴 및 도구 모음](#메뉴-및-도구-모음)
8. [바로 가기 및 컨텍스트 메뉴](#바로-가기-및-컨텍스트-메뉴)
9. [GitHub Releases](#github-releases)
10. [설정 및 데이터 저장 위치](#설정-및-데이터-저장-위치)
11. [문제 해결](#문제-해결)

---

## 시작하기

### 실행 방법

- **개발 빌드:** `dotnet run --project MyGitWinV10.App`
- **설치본:** 시작 메뉴 또는 바탕화면의 **MyGit Win V10** 바로 가기

### .NET 런타임

프레임워크 종속(framework-dependent) 빌드를 사용하는 경우 [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)이 필요합니다.

### 마지막 저장소 자동 열기

앱을 종료하기 전에 열어 두었던 저장소가 있으면, 다음 실행 시 자동으로 다시 열립니다.

---

## 화면 구성

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [메뉴: File | Info]  [도구 모음]                                        │
├──────────────┬──────────────────────────────────────────────────────────┤
│  Repository  │  Commit History  │  Commit Details                       │
│  (브랜치/    │  (그래프 +       │  (메타데이터)                          │
│   태그/      │   커밋 목록)     ├──────────────────────────────────────┤
│   Releases)  │                  │  Changed Files  │  Diff                 │
│              │                  │  (변경 파일)    │  (통합 diff)           │
└──────────────┴──────────────────┴─────────────────┴───────────────────────┘
│  상태 표시줄                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

| 영역 | 설명 |
|------|------|
| **Repository** | 로컬/원격 브랜치, 태그, GitHub Release 목록 |
| **Commit History** | 브랜치·머지 그래프와 Message, SHA, Author, Date 컬럼 |
| **Commit Details** | 선택한 커밋의 작성자, 날짜, 메시지 등 |
| **Changed Files** | 해당 커밋에서 변경된 파일 목록 |
| **Diff** | 선택한 파일의 unified diff (색상 구분) |

패널 사이의 분할선을 드래그하여 크기를 조절할 수 있습니다.

---

## 저장소 열기 및 복제

### 로컬 저장소 열기

1. **File → Open...** 또는 도구 모음의 **Open** 버튼
2. `.git` 폴더가 있는 저장소 루트 디렉터리 선택
3. 브랜치 트리와 커밋 히스토리가 로드됩니다

### 원격 저장소 복제

1. **File → Clone...** 또는 도구 모음의 **Clone** 버튼
2. **Repository URL** — 예: `https://github.com/owner/repo.git`
3. **Destination Folder** — 복제 대상 로컬 경로
4. **Clone** 클릭 후 진행률 확인
5. 완료되면 복제된 저장소가 자동으로 열립니다

#### HTTPS 인증

비공개 저장소나 인증이 필요한 HTTPS URL인 경우:

- **GitHub:** 계정 비밀번호 대신 **Personal Access Token(PAT)** 을 사용합니다.  
  토큰 발급: [github.com/settings/tokens](https://github.com/settings/tokens)
- **기타 호스트:** 비밀번호 또는 PAT를 입력할 수 있습니다.

입력한 자격 증명은 **메모리에만** 사용되며 디스크에 저장되지 않습니다.

---

## Repository 패널

### Local Branches

- 현재 저장소의 로컬 브랜치 목록
- **굵은 글씨** — 현재 체크아웃된 브랜치

**로컬 브랜치에서 우클릭:**

| 메뉴 | 동작 |
|------|------|
| **Checkout** | 해당 브랜치로 전환 |
| **Copy Name** | 브랜치 이름을 클립보드에 복사 |

### Remotes

원격 브랜치를 원격 이름별로 그룹화하여 표시합니다.

### Tags

저장소에 등록된 Git 태그 목록입니다. 태그에 마우스를 올리면 연결된 커밋 정보가 툴팁으로 표시됩니다.

### Releases

GitHub `origin` 원격이 연결된 저장소인 경우, GitHub Release 목록을 불러옵니다. Release를 선택하면 Commit Details 영역에 릴리스 정보가 표시됩니다.

### 새로 고침

도구 모음 **Refresh Tree** — 브랜치, 태그, Release 목록을 다시 로드합니다.

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

### 컬럼 너비 조절

헤더 행에서 컬럼 구분선에 마우스를 올리면 커서가 변경됩니다. 드래그하여 너비를 조절할 수 있습니다.

### 스크롤

- **세로 스크롤** — 커밋 목록 탐색 (헤더는 고정)
- **가로 스크롤** — 넓은 그래프/컬럼 탐색 (헤더와 본문이 함께 이동)

### 커밋 선택

행을 클릭하면 해당 커밋이 선택되고, Commit Details·Changed Files·Diff가 갱신됩니다.

**우클릭 메뉴:**

| 메뉴 | 동작 |
|------|------|
| **Copy SHA** | 전체 커밋 해시 복사 |
| **Copy Message** | 커밋 메시지 복사 |

### 그래프 툴팁

그래프의 점·선 위에 마우스를 올리면 커밋 요약 또는 선 종류(브랜치, 머지 등)가 툴팁으로 표시됩니다.

### 새로 고침

도구 모음 **Refresh Graph** — 커밋 히스토리를 다시 로드합니다.

---

## Commit Details / Diff 패널

### Commit Details

선택한 커밋의 SHA, 작성자, 날짜, 전체 메시지 등이 표시됩니다.

### Changed Files

커밋에서 수정·추가·삭제된 파일 목록입니다. 파일을 선택하면 Diff 패널에 해당 파일의 변경 내용이 표시됩니다.

**우클릭:** **Copy Path** — 파일 경로를 클립보드에 복사

### Diff

- unified diff 형식으로 표시
- 추가/삭제 줄은 색상으로 구분
- 도구 모음 **Wrap** — 긴 줄 자동 줄바꿈 토글
- 도구 모음 **Copy** — 현재 diff 텍스트를 클립보드에 복사

---

## 메뉴 및 도구 모음

### File 메뉴

| 항목 | 설명 |
|------|------|
| **Open...** | 로컬 Git 저장소 열기 |
| **Clone...** | 원격 저장소 복제 |
| **Exit** | 앱 종료 |

### Info 메뉴

| 항목 | 설명 |
|------|------|
| **About** | 버전 및 프로그램 정보 |

### 도구 모음 (왼쪽 → 오른쪽)

| 버튼 | 기능 |
|------|------|
| **Open** | 저장소 열기 |
| **Clone** | 저장소 복제 |
| **Refresh Tree** | Repository 트리 새로 고침 |
| **Refresh Graph** | Commit History 새로 고침 |
| **Copy SHA** | 선택 커밋 SHA 복사 |
| **Copy Message** | 선택 커밋 메시지 복사 |
| **Copy Path** | 선택 파일 경로 복사 |
| **Wrap** | Diff 줄바꿈 토글 |
| **Copy** | Diff 텍스트 복사 |
| **Info** | About 대화상자 (오른쪽 정렬) |

모든 도구 모음 버튼은 아이콘만 표시되며, 마우스를 올리면 툴팁으로 기능을 확인할 수 있습니다.

---

## 바로 가기 및 컨텍스트 메뉴

| 동작 | 방법 |
|------|------|
| 저장소 열기 | File → Open... |
| 저장소 복제 | File → Clone... |
| 브랜치 체크아웃 | Repository → 로컬 브랜치 우클릭 → Checkout |
| 커밋 선택 | Commit History 행 클릭 |
| diff 보기 | Changed Files에서 파일 선택 |
| 프로그램 정보 | Info → About 또는 도구 모음 Info |

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
| 마지막으로 연 저장소 경로 | `%AppData%\MyGitWinV10\settings.json` |

설정 파일 예:

```json
{
  "LastRepositoryPath": "C:\\Projects\\my-repo"
}
```

### 저장하지 않는 정보

- HTTPS 사용자 이름 / 비밀번호 / PAT
- 클립보드에 복사한 내용 (OS 클립보드 관리)

---

## 문제 해결

### 저장소를 열 수 없음

- 선택한 폴더에 `.git` 디렉터리가 있는지 확인
- 다른 프로그램이 저장소를 잠그고 있지 않은지 확인
- 오류 메시지 대화상자의 내용을 참고

### Clone 실패

- URL 형식 확인 (`https://...` 또는 `git@...`)
- GitHub 비공개 저장소: PAT 사용
- 대상 폴더에 쓰기 권한 및 충분한 디스크 공간 확인

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
- **About:** Info → About 메뉴에서 확인

개발·빌드 방법은 [README.md](README.md)를 참고하세요.
