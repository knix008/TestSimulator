# PandocLinux 1.0

GTK3 기반의 Pandoc 문서 변환 GUI 도구 (C 구현)

## 개요

PandocLinux는 [Pandoc](https://pandoc.org/)을 백엔드로 사용하는 리눅스용 문서 변환 데스크톱 앱입니다.
Word, Markdown, HTML, LaTeX 등 다양한 문서 포맷을 GUI 환경에서 손쉽게 변환할 수 있습니다.

## 주요 기능

- 14종 입력 포맷 / 18종 출력 포맷 지원 (라디오 버튼 선택)
- 입력 파일의 확장자로 입력 포맷 자동 선택
- 출력 포맷 변경 시 출력 파일 경로 자동 갱신
- PDF 출력 시 xelatex 엔진 및 한글 폰트 자동 적용
- Pandoc 추가 인자 입력 지원 (`--toc`, `--standalone` 등)
- 변환 작업을 백그라운드 스레드에서 실행 (UI 응답 유지)
- 변환 로그 실시간 출력
- Pandoc 미설치 시 경고 및 변환 버튼 비활성화

## 지원 포맷

### 입력
| 포맷 ID | 설명 |
|---------|------|
| `docx` | Microsoft Word |
| `odt` | OpenDocument Text |
| `markdown` | Markdown |
| `rst` | reStructuredText |
| `html` | HTML |
| `latex` | LaTeX |
| `textile` | Textile |
| `mediawiki` | MediaWiki |
| `epub` | EPUB |
| `csv` | CSV |
| `json` | JSON |
| `org` | Emacs Org-mode |
| `rtf` | Rich Text Format |
| `txt` | Plain Text |

### 출력
| 포맷 ID | 설명 |
|---------|------|
| `docx` | Microsoft Word |
| `odt` | OpenDocument Text |
| `pdf` | PDF *(xelatex 자동 사용, 한글 지원)* |
| `markdown` | Markdown |
| `rst` | reStructuredText |
| `html` / `html5` | HTML / HTML5 |
| `latex` | LaTeX |
| `epub` / `epub3` | EPUB / EPUB3 |
| `rtf` | Rich Text Format |
| `txt` | Plain Text |
| `mediawiki` | MediaWiki |
| `org` | Emacs Org-mode |
| `beamer` | Beamer (LaTeX 슬라이드) |
| `revealjs` | reveal.js (HTML 슬라이드) |
| `asciidoc` | AsciiDoc |
| `man` | Man 페이지 |

## 요구 사항

| 패키지 | 용도 |
|--------|------|
| `gcc` / `build-essential` | C 컴파일러 |
| `pkg-config` | 라이브러리 경로 탐색 |
| `libgtk-3-dev` | GTK3 GUI 라이브러리 |
| `pandoc` | 문서 변환 엔진 |
| `texlive-xetex` *(PDF 출력 시 필수)* | xelatex PDF 엔진 (한글 포함) |

## 설치 및 빌드

### 자동 설치 (권장)

```bash
chmod +x setup.sh
./setup.sh
```

`setup.sh`는 의존성 설치와 빌드를 자동으로 수행합니다.
PDF 변환이 필요하면 실행 중 LaTeX 설치 여부를 묻는 프롬프트에서 `y`를 입력하세요.

### Makefile 빌드

```bash
# 의존성 설치 (Ubuntu/Debian)
sudo apt-get install build-essential pkg-config libgtk-3-dev pandoc

# 릴리즈 빌드
make

# 디버그 빌드
make debug
```

### CMake 빌드

```bash
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

## 실행

```bash
# Makefile 빌드 결과
./pandoc-linux

# CMake 빌드 결과
./build/pandoc-linux
```

## 사용 방법

1. **파일 선택** — `파일 선택...` 버튼으로 변환할 문서를 엽니다.
   입력 포맷은 확장자에 따라 자동으로 선택됩니다.
2. **포맷 선택** — 좌측 라디오 버튼에서 입력 포맷, 우측 라디오 버튼에서 출력 포맷을 선택합니다.
3. **출력 경로 확인** — 자동 생성된 출력 경로를 확인하거나 `저장 위치...` 버튼으로 변경합니다.
4. **추가 옵션** *(선택)* — `추가 Pandoc 옵션` 섹션을 펼쳐 인자를 입력합니다.
   예: `--toc --standalone --highlight-style=tango`
5. **변환 시작** — `변환 시작` 버튼을 클릭합니다. 하단 로그 창에서 진행 상황을 확인할 수 있습니다.

> **PDF 변환 참고:** 출력 포맷으로 `pdf`를 선택하면 `xelatex` 엔진과 한글 폰트(`Noto Sans CJK KR`)가 자동으로 적용됩니다. `texlive-xetex`가 설치되어 있어야 합니다.

## Makefile 타깃

| 타깃 | 설명 |
|------|------|
| `make` | 릴리즈 빌드 (`pandoc-linux`) |
| `make debug` | 디버그 빌드 (`pandoc-linux-debug`) |
| `make clean` | 빌드 산출물 삭제 (바이너리, `build/`, `*.o`) |
| `make distclean` | `clean` + 변환 결과 파일 (`*_converted.*`) 삭제 |
| `make install` | `/usr/local/bin`에 설치 |
| `make uninstall` | 설치 제거 |

## 파일 구조

```
PandocLinux1.0/
├── main.c          # GTK3 애플리케이션 소스
├── CMakeLists.txt  # CMake 빌드 설정
├── Makefile        # Makefile 빌드 설정
├── setup.sh        # 의존성 설치 + 빌드 스크립트
├── .gitignore      # Git 제외 파일 목록
└── README.md       # 이 문서
```

## 라이선스

MIT License
