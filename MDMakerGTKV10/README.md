# MD Maker GTK (V10)

여러 Markdown 파일을 하나로 합치고, 편집·미리보기한 뒤 HTML · Word · PDF로보내는 GTK3 기반 데스크톱 도구입니다.  
Linux와 macOS를 지원하며, Node/Python/pandoc 같은 외부 런타임 없이 동작합니다.

---

## 기능

| 기능 | 설명 |
|---|---|
| 파일 병합 | 디렉토리에서 `.md` 파일을 수집해 순서대로 합침 |
| 정렬 | 이름 오름/내림, 날짜 최신/오래된순, 사용자 지정 |
| 재귀 탐색 | 하위 디렉토리까지 포함 옵션 |
| 파일 제외 | glob 패턴으로 특정 파일/폴더 제외 |
| 섹션 구분 헤더 | 각 파일 앞에 파일명 H2 헤더 자동 삽입 |
| 실시간 미리보기 | WebKitGTK 기반 HTML 렌더링 |
| 미리보기 캐시 | 편집 시 백그라운드에서 HTML을 미리 계산해 탭 전환·갱신 지연 감소 |
| 문서 구조 (아웃라인) | H1–H6 계층 트리, 클릭 시 편집기·미리보기 동기 스크롤 |
| HTML보내기 | 스타일 포함 단일 HTML 파일 |
| Word보내기 | libzip/OpenXML 기반 `.docx` 생성 (pandoc 불필요) |
| PDF보내기 | 파일 저장 대화상자로 PDF 직접 저장 (WebKitGTK 인쇄) |
| 보내기 설정 | 폰트, 크기, 줄 간격, 여백 조정 및 저장 |
| 자동 번호 매기기 | 헤딩에 1.2.3 계층 번호 자동 부여 |
| 편집기 | 모노스페이스 Markdown 편집기 + `Ctrl+S` 저장 |
| 진행 표시 | HTML/Word/PDF보내기 및 저장 시 상태줄 진행 표시 |

---

## 의존성

| 패키지 | Ubuntu/Debian | Fedora | Arch | macOS (Homebrew) |
|---|---|---|---|---|
| GTK3 | `libgtk-3-dev` | `gtk3-devel` | `gtk3` | `gtk+3` |
| WebKitGTK | `libwebkit2gtk-4.1-dev` | `webkitgtk6.0-devel` | `webkit2gtk-4.1` | `webkit2gtk` |
| libcmark | `libcmark-dev` | `cmark-devel` | `cmark` | `cmark` |
| libzip | `libzip-dev` | `libzip-devel` | `libzip` | `libzip` |

WebKitGTK는 **4.1** 또는 **4.0** 중 설치된 쪽을 자동으로 사용합니다.

---

## 빌드

```bash
# 의존성 확인·설치 후 빌드 (기본)
make

# 의존성만 확인
make check-deps

# 의존성 설치 (sudo 필요할 수 있음)
make install-deps

# 컴파일만
make compile

# 빌드 후 실행 (가상 환경용 GL/WebKit 플래그 포함)
make run

# 빌드 결과물 삭제
make clean
```

| 대상 | 설명 |
|---|---|
| `./mdmaker` | 실행 파일 (프로젝트 루트) |
| `build/*.o` | 중간 오브젝트 파일 |

---

## 사용 방법

### 메인 창 (파일 병합)

1. **소스 디렉토리** 선택 — Markdown 파일이 있는 폴더
2. **출력 파일** 지정 — 병합 결과를 저장할 `.md` 경로
3. 필요 시 정렬 방식, 재귀 탐색, 제외 패턴 설정
4. **생성** 클릭
5. 생성된 파일을 미리보거나 **문서 보기** 창에서 편집·보내기

마지막으로 사용한 소스/출력 경로는 설정 파일에 저장됩니다.

### 문서 보기 창

| UI | 동작 |
|---|---|
| **문서 구조** | 헤딩 클릭 → 편집기·미리보기가 같은 제목 위치로 이동 |
| **저장** | 편집 내용 저장 (`Ctrl+S`) |
| **HTML** | HTML 파일로보내기 |
| **Word** | `.docx` 파일로보내기 |
| **PDF** | PDF 파일로보내기 (저장 위치·파일명 선택) |
| **보내기 설정…** | HTML/Word/PDF에 쓰는 글꼴·여백 등 조정 |

**미리보기 탭**은 편집 후 약 400ms 뒤 목차와 HTML을 백그라운드에서 갱신합니다. 미리보기 탭으로 넘어갈 때는 이미 계산된 HTML을 사용해 반응이 빠릅니다.

---

## 설정 파일

경로: `~/.config/MDMakerGTKV10/settings.ini`

### `[General]`

| 키 | 설명 |
|---|---|
| `LastSourceDir` | 마지막 소스 디렉토리 |
| `LastOutputFile` | 마지막 병합 출력 `.md` 경로 |

### `[Pdf]` (보내기 스타일·PDF 기본 폴더)

| 키 | 기본값 | 설명 |
|---|---|---|
| `FontFamily` | `sans-serif` | 글꼴 |
| `FontSizePt` | `10` | 글자 크기 (pt) |
| `LineHeight` | `1.6` | 줄 간격 |
| `ParagraphSpacingEm` | `0.5` | 문단 간격 (em) |
| `MarginVerticalInch` | `0.75` | 위·아래 여백 (inch) |
| `MarginHorizontalInch` | `1.0` | 좌·우 여백 (inch) |
| `OutputDir` | 문서 폴더 | 마지막 PDF 저장 디렉토리 |

---

## VMware / 가상 환경

GPU·EGL 관련 경고가 보이면 소프트웨어 렌더링으로 실행합니다. `make run`에 아래 환경 변수가 포함되어 있습니다.

```bash
LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 ./mdmaker
```

직접 `./mdmaker`만 실행하면 경고가 그대로 나올 수 있습니다.

---

## 소스 구조

```
MDMakerGTKV10/
  Makefile
  README.md
  src/
    main.c                 진입점
    main_window.c/h        메인 윈도우 (파일 병합 UI)
    document_view.c/h      문서 보기 (편집·미리보기·보내기·아웃라인)
    markdown_converter.c/h Markdown → HTML, 아웃라인, 앵커 ID
    md_merger.c/h          파일 수집·정렬·병합
    app_settings.c/h       설정 로드/저장 (INI)
    docx_writer.c/h        .docx 생성 (libzip + OpenXML)
```

---

## 라이선스

상위 [TestSimulator](../LICENSE) 저장소의 `LICENSE`를 따릅니다.
