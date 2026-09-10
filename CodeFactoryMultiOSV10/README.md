# CodeFactory

**다언어 소스 코드 분석기** — Web / Windows / macOS / Linux.

[CodeFactoryWinV10](../CodeFactoryWinV10)(C# WinForms)의 분석 기능을 JavaScript로 다시 구현해
브라우저와 Electron에서 동일하게 동작하도록 만든 판입니다. 12종 프로그래밍 언어의 소스를 읽어
호출 관계·구조·품질 메트릭·데이터베이스 접근·버그 위험·보안 취약 패턴을 한 화면에서 보여 줍니다.

> **참고:** 여기서 "언어"는 두 가지 뜻으로 쓰입니다.
> **프로그래밍 언어**(C#, Python, Java …)는 분석 대상이고,
> **화면 언어**(한국어 / English)는 UI 표시 언어입니다.

| 문서 | 내용 |
|------|------|
| **[UsersGuide.md](UsersGuide.md)** | 화면·메뉴·뷰·검색·내보내기 등 사용 방법 |
| **[CodeAnalysisGuide.md](CodeAnalysisGuide.md)** | 메트릭·인사이트·임계값 해석 가이드 |
| **[Architecture.md](Architecture.md)** | 코드 구조와 설계 결정 |

---

## 빠른 시작

```bash
npm install

npm start        # Electron 데스크톱 앱 (개발 모드, 핫 리로드)
npm run web      # 브라우저 전용 개발 서버 (http://localhost:5183)
npm test         # 단위 테스트 (분류별 결과 + 요약)
```

### 사용 흐름

1. **찾아보기...** 로 루트 디렉터리 선택
2. **프로그래밍 언어는 자동으로 감지·선택**됩니다. 분석할 하위 디렉터리를 확인하세요
   (`bin`, `obj`, `node_modules` 등은 자동 제외)
3. **분석 실행**
4. 툴바의 뷰 선택기로 호출 그래프 · 클래스 다이어그램 · 코드 메트릭 · DB ERD · 버그 위험 등으로 전환
5. **Ctrl+F** 검색, 항목 더블클릭으로 소스 위치 이동, 우클릭으로 컨텍스트 메뉴
   (다이어그램은 처음에 상단 정렬로 맞춰지고, 확대·축소 상태는 뷰마다 따로 기억됩니다)
6. 보고서(HTML / Markdown / Word / PDF), 다이어그램(PNG / WebP / JPEG / GIF / SVG / PDF), 메트릭 CSV 내보내기

---

## 주요 기능

### 분석 범위

- 루트 디렉터리 선택 후 하위 디렉터리 자동 수집, **체크한 디렉터리만** 분석
- `bin`, `obj`, `.git`, `node_modules`, `dist`, `target`, `venv` 등은 기본 제외
- **12종 프로그래밍 언어** 선택 분석
- 2 MB 초과 파일·바이너리 파일은 건너뛰고 그 이유를 Summary에 표시

### 뷰

| 뷰 | 내용 |
|----|------|
| **분석 Summary** | 코드 건강 점수, 우선 조치, 언어 구성, 검사 항목별 결과 |
| **호출 그래프** | 연결선이 있는 진입점 트리뷰 + 다이어그램 (좌→우 / 위→아래), 처음부터 모두 펼침, 재귀 표시 |
| **클래스 다이어그램** | UML 박스(속성·연산), 상속·구현 관계선 |
| **상속 다이어그램** | 상속 관계만 계층으로 배치 |
| **시퀀스 다이어그램** | 진입점에서 시작하는 호출 흐름, 파일 단위 라이프라인, 페이지 분할 |
| **데이터/제어 흐름** | 한 함수의 입력(호출자·읽는 전역·읽는 테이블)과 출력 |
| **파일 관계 / 디렉터리 관계** | 호출 그래프를 파일·디렉터리 단위로 축약한 그래프 |
| **코드 메트릭** | 파일 · 함수 · 타입 · 패키지 · 아키텍처 탭 |
| **중복 코드** | 중복 그룹과 모든 발생 위치, 원문 비교 |
| **전역 변수** | 전역·정적 변수와 읽기/쓰기 접근 함수 |
| **DB ERD** | 테이블·컬럼·키·관계 다이어그램 |
| **DB 테이블 접근** | 테이블·컬럼별 접근 함수와 CRUD, DB 인스턴스 목록 |
| **버그 위험 분석** | 빈 catch, 항상 참인 조건, 도달 불가 코드, 리소스 누수 등 |
| **정보 보호 및 보안** | 언어별 보안 smell과 조치 방법 |

### 코드 품질·메트릭

- Cyclomatic / Cognitive 복잡도, 중첩 깊이, 매개변수·return 수, 매직 넘버
- Fan-in / Fan-out, 유지보수 지수(MI), Halstead 볼륨, 문장 수, switch/case 수
- 타입: LCOM(응집도 부족), DIT(상속 깊이), NOC, WMC, RFC
- 패키지: Ca / Ce / 불안정성 I / 추상도 A / 주계열 거리 D
- Git 변경 핫스팟(Electron에서 `git`이 있을 때), 테스트 코드 비율, public API 밀도
- 임계값 초과 시 **경고 / 심각** 2단계로 표 안에서 바로 강조

### 데이터베이스 분석

정적 분석으로 스키마와 접근 코드를 함께 찾아 연결합니다.

| 출처 | 인식 대상 |
|------|-----------|
| SQL DDL | `CREATE TABLE`, 컬럼·자료형·PK·FK·NULL 허용 |
| EF Core | `DbSet<T>`, `[Table]`, `[Key]`, `[Column]`, `[ForeignKey]` |
| JPA | `@Entity`, `@Table`, `@Id`, `@Column`, `@JoinColumn`, 연관관계 애너테이션 |
| Prisma | `model` 블록, `@id`, `@relation` |
| TypeORM / Sequelize | `@Entity`, `@Column`, `sequelize.define` |
| Django / SQLAlchemy | `models.Model` 필드, `__tablename__` + `Column(...)` |

- 함수 본문의 **SQL 문장**(SELECT / INSERT / UPDATE / DELETE / JOIN / DDL)과 **ORM 호출**을 추적해
  테이블·컬럼 단위 접근과 CRUD를 기록합니다.
- 연결 문자열·SQLite 파일 경로에서 **데이터베이스 인스턴스**를 수집합니다.
- 같은 테이블이 DDL과 ORM 양쪽에 정의된 경우 **컬럼 단위로 병합**하며, 자료형과 외래 키는 DDL을 우선합니다.

### 설정

- **분석 항목 설정**: 검사 항목 44개를 개별로 켜고 끄며, 항목별 임계값 지정
- **테마 6종**: 미드나이트 / 데이라이트 / 노르드 / 솔라라이즈드 / 고대비 / 포레스트 —
  **툴바의 팔레트 버튼**에서 고르며 누르는 즉시 적용됩니다
- **화면 언어**: 한국어 · English — **툴바 버튼**(아이콘이 현재 언어를 표시), 역시 즉시 적용
- **팝업은 모두 별도 OS 창**이라 앱 창 밖으로 끌어낼 수 있고, 앱을 닫으면 함께 닫힙니다
- 설정 저장 위치 — Electron: `%APPDATA%/CodeFactory/settings.json` (플랫폼별 userData), Web: `localStorage`
- **프로젝트 파일** (`.cfproj`): 루트 경로·언어·포함 디렉터리·분석 설정을 함께 저장·불러오기

### 내보내기

| 대상 | 형식 |
|------|------|
| 분석 보고서 | HTML · Markdown · Word(.docx) · PDF |
| 다이어그램 | PNG · WebP · JPEG · GIF · SVG · PDF (투명 배경 선택, 1~4× 해상도, 도형에 맞춰 자동 크롭) |
| 메트릭 | CSV (UTF-8 BOM, Excel 호환) |
| 분석 결과 | JSON (다시 불러오기 가능) |

보고서는 개요 · 건강 점수 · 우선 조치 · 임계값 · 품질 요약 · 코드 메트릭 · 아키텍처 ·
중복 코드 · 전역 변수 · 데이터베이스 · 버그 위험 · 보안 · 용어집 13개 절로 구성되며,
필요한 절만 골라 생성할 수 있습니다. 보고서 본문도 한국어/영어를 따라갑니다.

---

## 지원 프로그래밍 언어

| 언어 | 확장자 | 본문 구분 | 정밀도 |
|------|--------|-----------|--------|
| C# | `.cs` | `{ }` | Syntax |
| VB.NET | `.vb` | `End Sub` / `End Function` | Approximate |
| Python | `.py` | 들여쓰기 | Syntax |
| Java | `.java` | `{ }` | Syntax |
| Kotlin | `.kt`, `.kts` | `{ }` | Approximate |
| C / C++ | `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.hh` | `{ }` | Syntax |
| Go | `.go` | `{ }` | Syntax |
| Rust | `.rs` | `{ }` | Syntax |
| Swift | `.swift` | `{ }` | Syntax |
| JavaScript / TypeScript | `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | `{ }` | Syntax |
| Ruby | `.rb` | `end` | Syntax |
| PHP | `.php` | `{ }` | Syntax |

스키마 파일 `.sql`, `.prisma`도 함께 읽습니다.

---

## 빌드와 설치 파일

### 웹

```bash
npm run build:web        # dist/ 생성 (상대 경로, 어떤 정적 호스트에도 배치 가능)
npm run serve:web        # 로컬에서 dist/ 서빙 (기본 http://localhost:8080)
```

브라우저 판은 **File System Access API**(Chrome·Edge)로 폴더를 읽습니다.
지원하지 않는 브라우저에서는 **폴더 업로드** 버튼을 쓰세요.
어느 쪽이든 **파일은 브라우저 안에서만 읽히며 서버로 전송되지 않습니다.**

### 데스크톱 설치 파일

| 플랫폼 | 명령 | 결과물 |
|--------|------|--------|
| Windows | `npm run build:win` | `release/CodeFactory Setup <ver>.exe` (NSIS) |
| macOS | `npm run build:mac` | `release/CodeFactory-<ver>.dmg` (x64 + arm64) |
| Linux | `npm run build:linux` | `release/*.AppImage`, `*.deb`, `*.rpm` |

빌드가 끝나면 `scripts/copy-installer.js`가 설치 파일을 프로젝트 루트로 복사합니다.

**플랫폼 제약** — 패키징 도구는 크로스 플랫폼이 아닙니다.

- `deb` / `rpm`은 `fpm`이 필요하며 **Windows에서는 만들 수 없습니다.** Linux(또는 WSL/Docker)에서 빌드하세요.
- `AppImage`를 Windows에서 만들려면 심볼릭 링크 권한(개발자 모드 또는 관리자 권한)이 필요합니다.
- `.dmg`는 **macOS에서만** 만들 수 있습니다.

세 플랫폼을 한 번에 만들려면 [`.github/workflows/build.yml`](.github/workflows/build.yml)의
GitHub Actions 워크플로를 사용하세요 — 각 러너에서 네이티브로 빌드해 아티팩트를 올립니다.

### Windows 설치 관리자

NSIS 설치 관리자는 설치 경로를 바꿀 수 있고, **바탕화면 / 시작 메뉴 바로가기**를
체크박스로 고를 수 있습니다(한국어·영어 자동). 이전 버전이 있으면 재설치 시 앱 데이터를 정리합니다.

---

## 테스트

```bash
npm test              # 분류별 결과 + 요약 표
npm run test:verbose  # 모든 테스트 이름까지 출력
npm run test:json     # 기계 판독용 JSON 요약
npm run test:raw      # node --test 원본 출력
npm run smoke         # Electron UI 스모크 테스트 (dist/ 빌드 필요)
```

단위 테스트는 10개 분류 163개로, 소스 텍스트 처리부터 다언어 프로젝트 전체 파이프라인까지 덮습니다.
결과는 분류별 통과/실패와 별도의 요약 표로 나뉘어 출력됩니다.

---

## 기술 스택

- **분석 엔진**: 의존성 없는 순수 JavaScript (`src/core/`) — 브라우저·Electron·Node에서 동일 실행
- **UI**: React 18 + Vite 5
- **데스크톱**: Electron 31 + electron-builder 24
- **현지화**: i18next / react-i18next
- **Word 내보내기**: 자체 OOXML + ZIP 작성기 (`src/lib/zip.js`) — 외부 라이브러리 없음
- **GIF 내보내기**: 자체 GIF89a 인코더 (`src/lib/gif.js`) — 미디언 컷 + LZW, 외부 라이브러리 없음
  (캔버스가 스스로 만들 수 있는 형식은 PNG·JPEG·WebP뿐입니다)
- **PDF**: Electron `printToPDF`, 브라우저는 인쇄 대화상자

---

## 정밀도와 한계

| 수준 | 방식 |
|------|------|
| **Syntax** | 문자열·주석을 마스킹한 뒤 언어별 선언 패턴 + 괄호/들여쓰기 매칭으로 본문 확정 |
| **Approximate** | 정규식 근사 (Kotlin, VB.NET) |

- 동적 호출, 리플렉션, 매크로, 조건부 컴파일은 누락될 수 있습니다.
- Fan-in/out과 순환 호출은 **호출 그래프에 포함된 함수**에 한해 의미가 있습니다.
- DB 테이블 접근은 **정적 SQL과 알려진 ORM API** 위주이며, 런타임에 조립되는 쿼리는 누락됩니다.
- Git 핫스팟·테스트 비율·보안 smell은 **휴리스틱**이며 전용 도구를 대체하지 않습니다.

자세한 해석 방법: **[CodeAnalysisGuide.md](CodeAnalysisGuide.md)**

---

## 제작자

**SHKWON** (knix008@naver.com) — MIT License
