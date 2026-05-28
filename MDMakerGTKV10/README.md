# MD Maker GTK

여러 Markdown 파일을 하나로 합치고 HTML · Word · PDF로 내보내는 GTK3 기반 데스크톱 도구입니다.  
Linux와 macOS를 지원하며, 외부 런타임 없이 동작합니다.

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
| 문서 구조 (아웃라인) | H1–H6 계층 트리, 클릭 시 편집·미리보기 동기 이동 |
| HTML 내보내기 | 스타일 포함 단일 HTML 파일 |
| Word 내보내기 | libzip/OpenXML 기반 `.docx` 생성 (pandoc 불필요) |
| PDF 인쇄 | WebKitGTK 프린트 대화상자 |
| 내보내기 설정 | 폰트, 크기, 줄 간격, 여백 조정 및 저장 |
| 자동 번호 매기기 | 헤딩에 1.2.3 계층 번호 자동 부여 |
| 편집기 | 모노스페이스 Markdown 편집기 + Ctrl+S 저장 |

---

## 의존성

| 패키지 | Ubuntu/Debian | Fedora | Arch | macOS |
|---|---|---|---|---|
| GTK3 | `libgtk-3-dev` | `gtk3-devel` | `gtk3` | `gtk+3` |
| WebKitGTK | `libwebkit2gtk-4.1-dev` | `webkitgtk6.0-devel` | `webkit2gtk-4.1` | `webkit2gtk` |
| libcmark | `libcmark-dev` | `cmark-devel` | `cmark` | `cmark` |
| libzip | `libzip-dev` | `libzip-devel` | `libzip` | `libzip` |

---

## 빌드

```bash
# 의존성 확인 및 설치 후 빌드 (한 번에)
make

# 빌드만
make compile

# 빌드 후 실행
make run

# 빌드 결과물 삭제
make clean
```

빌드 결과물은 프로젝트 루트의 `./mdmaker`에 생성됩니다.

---

## 사용 방법

1. **소스 디렉토리** 선택 — Markdown 파일이 있는 폴더
2. **출력 파일** 지정 — 병합 결과를 저장할 `.md` 경로
3. 원하는 경우 정렬 방식, 재귀 탐색, 제외 패턴 설정
4. **생성** 버튼 클릭
5. 생성된 파일을 미리보거나 **문서 보기** 창에서 편집·내보내기

### 문서 보기 창

- 왼쪽 **문서 구조** 패널에서 헤딩 클릭 → 편집기·미리보기 동시 이동
- **저장** — 편집 내용 저장 (단축키: `Ctrl+S`)
- **HTML** — HTML 파일로 내보내기
- **Word** — `.docx` 파일로 내보내기
- **PDF 인쇄** — 시스템 인쇄 대화상자 (PDF 저장 가능)
- **내보내기 설정…** — 폰트·여백 등 조정 (설정은 `~/.config/MDMakerGTKV10/settings.ini`에 저장)

---

## 설정 파일

```
~/.config/MDMakerGTKV10/settings.ini
```

| 항목 | 기본값 |
|---|---|
| FontFamily | sans-serif |
| FontSizePt | 10 |
| LineHeight | 1.6 |
| ParagraphSpacingEm | 0.5 |
| MarginVerticalInch | 0.75 |
| MarginHorizontalInch | 1.0 |

---

## VMware / 가상 환경

GPU 관련 경고가 뜨는 경우 다음 환경 변수로 실행합니다 (`make run`에 자동 포함).

```bash
LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 ./mdmaker
```

---

## 소스 구조

```
src/
  main.c                 진입점
  main_window.c/h        메인 윈도우 (파일 병합 UI)
  document_view.c/h      문서 보기 창 (편집·미리보기·내보내기)
  markdown_converter.c/h Markdown → HTML 변환, 아웃라인 추출
  md_merger.c/h          파일 수집·정렬·병합
  app_settings.c/h       설정 로드/저장 (INI)
  docx_writer.c/h        .docx 생성 (libzip + OpenXML)
```
