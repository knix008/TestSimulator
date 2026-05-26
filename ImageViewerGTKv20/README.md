# ImageViewer GTK v1.0

Linux / macOS용 이미지·동영상 폴더 뷰어입니다. [ImageViewerV20](../ImageViewerV20) (Windows)와 비슷한 사용 흐름을 GTK3로 구현했습니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 폴더 탐색 | 폴더 트리(상단) + 파일 목록(하단), 마지막 폴더 자동 복원 |
| 갤러리 | 폴더 선택 → 썸네일 갤러리 (백그라운드 로딩) |
| 이미지 미리보기 | 파일 선택 → 창 크기에 맞춤 표시, 휠 확대/축소, 드래그 패닝 |
| 이미지 편집 (미리보기) | ↺ 반시계 회전, ↻ 시계 회전, ⇔ 좌우 뒤집기 (JPG에 저장) |
| **이미지 편집기** | **✏ 편집** — 색상 조정 · 효과 · 변환 · 배경 제거 (ImageViewerV30과 유사) |
| **이미지 변환** | **우클릭 → 변환… → JPEG / PNG / WebP / BMP / TIFF 선택 후 저장** |
| HEIF / HEIC / HIF | 파일 선택 시 메모리 디코딩, 우클릭 → 변환으로 다른 포맷 저장 |
| HDR 톤 매핑 | 10-bit PQ (HIF) 파일 → PQ EOTF → BT.2020→BT.709 → ACES filmic → sRGB |
| 동영상 재생 | libvlc 기반 재생·일시정지·정지·시크 |
| 파일 관리 | 복사·잘라내기·붙여넣기·복제·삭제·이름 바꾸기 (우클릭 메뉴) |
| 폴더 감시 | 외부 변경 감지 후 파일 목록 자동 새로고침 |

---

## 이미지 편집기 (✏ 편집)

이미지 미리보기 툴바의 **✏ 편집** 을 누르면 전용 편집 창이 열립니다.

| 탭 | 기능 |
|------|------|
| **색상** | 밝기 · 대비 · 채도 · 색조 · 감마 · 색온도 (실시간 미리보기, 적용/초기화) |
| **효과** | 흑백 · 세피아 · 반전 · 비네트 · 엣지 · 글로우 등 / 블러 · 선명 · 픽셀화 · 유화 등 강도 조절 |
| **변환** | 크기 조정 · 회전 · 좌우/상하 뒤집기 · 자르기 |
| **배경** | 스포이드 색상 선택 · 색상 대치 / 가장자리 확장(플러드 필) · **AI(rembg ONNX)** |

**편집기 기타**

- 실행 취소 / 다시 실행 (최대 20단계)
- **저장** · **다른 이름으로 저장** (PNG · JPEG · WebP · BMP 등)
- 저장 후 메인 창 파일 목록 자동 갱신

### AI 배경 제거 (rembg ONNX + ONNX Runtime)

ImageViewerV30과 동일한 **rembg ONNX 모델**을 **ONNX Runtime C API**로 직접 추론합니다 (Python 불필요).

| 모델 | 파일 | 입력 크기 |
|------|------|-----------|
| **u2net** (기본) | `u2net.onnx` | 320×320 |
| RMBG 2.0 | `bria-rmbg-2.0.onnx` | 1024×1024 |

모델 캐시: `~/.local/share/ImageViewerGTK/models/` (없으면 GitHub에서 자동 다운로드)

#### 빌드에 ONNX Runtime 포함하기

```bash
# 1) ONNX Runtime 설치 (프로젝트 third_party/)
make install-onnx

# 2) ONNX 지정 후 빌드
ONNXRUNTIME_ROOT=$PWD/third_party/onnxruntime make

# (선택) 모델 다운로드용 libsoup
sudo apt install libsoup2.4-dev   # 없으면 curl로 다운로드
```

이미 시스템에 설치한 경우:

```bash
ONNXRUNTIME_ROOT=/usr/local make
```

`make` 시 `onnxruntime_c_api.h` 가 없으면 AI 배경 제거는 빌드에서 제외되며, 편집기에서 안내 메시지가 표시됩니다.

---

## 이미지 변환 (Image Conversion)

모든 이미지 파일을 **우클릭 → 변환…** 으로 다른 포맷으로 저장할 수 있습니다.

```
원본:        IMG_1234.HIF
출력 형식:   [JPEG ▼]            ← JPEG / PNG / WebP / BMP / TIFF 선택
품질 (1–100): ━━━━━●━━━ 85       ← JPEG / WebP 에서만 표시
저장 경로:   /path/IMG_1234.jpg  ← 직접 입력 또는 […] 로 선택
                        [취소]  [변환]
```

- 포맷 변경 시 출력 확장자 자동 업데이트
- 원본 파일 덮어쓰기 방지
- 기존 파일 존재 시 덮어쓰기 확인
- 변환은 백그라운드 스레드에서 실행, 완료 후 파일 목록 자동 갱신

---

## 지원 형식

| 종류 | 확장자 |
|------|--------|
| 이미지 입력 | png, jpg, jpeg, gif, bmp, tif, tiff, ico, webp, heif, heic, hif, avif |
| 이미지 출력 | jpeg, png, webp, bmp, tiff |
| 동영상 | mp4, mkv, avi, mov, wmv, webm, m4v, mpeg, mpg, ts, m2ts, flv |

---

## HEIF / HIF HDR 변환 상세

`heif_native.c` (libheif C API) 가 다음 파이프라인으로 10-bit PQ HDR 파일을 sRGB 8-bit 로 변환합니다.

```
HIF (10-bit PQ, BT.2020)
  ↓ libheif: heif_chroma_interleaved_RRGGBB_LE (16-bit 디코딩)
  ↓ PQ EOTF (ST 2084)  →  선형 광 [nits]                 ← LUT(1024 항목)
  ↓ BT.2020 → BT.709  색역 변환 (ITU-T H.273 행렬)
  ↓ ACES filmic 톤 맵  (100 nit = 1.0 기준)
  ↓ sRGB OETF (감마 인코딩)                               ← LUT(4096 항목)
  ↓ GdkPixbuf (8-bit RGB)
```

- SDR HEIC/HEIF: libheif 8-bit 출력을 직접 복사 (추가 변환 없음)
- LUT 최적화로 27 MP(6960×3904) 기준 약 1.5 초

---

## 요구 사항

| 항목 | 용도 |
|------|------|
| gcc, make, pkg-config | 빌드 |
| GTK+ 3 (`libgtk-3-dev`) | UI |
| gdk-pixbuf 2 (`libgdk-pixbuf-2.0-dev`) | 이미지 로드·저장 |
| libheif (`libheif-dev`) | HEIF/HEIC/HIF 디코딩 |
| libvlc (`libvlc-dev`) | 동영상 재생 (선택) |

---

## 빌드 및 실행

```bash
cd ImageViewerGTKv10
make          # 의존성 확인(필요 시 자동 설치) + 빌드
./imageviewer
```

또는:

```bash
make run
```

### 앱 아이콘

프로젝트 루트의 `daemon_hammer.ico`를 사용합니다. 없으면 `../daemon_hammer.ico` 로 연결·복사를 시도합니다.

```bash
ln -sf ../daemon_hammer.ico daemon_hammer.ico
```

### make 대상

| 명령 | 설명 |
|------|------|
| `make` | 의존성 확인(필요 시 설치) + 빌드 (기본) |
| `make run` | 빌드 후 실행 |
| `make clean` | 오브젝트·실행 파일·`tools/gen_icons` 삭제 |
| `make distclean` | `clean` + `assets/icons/.stamp` 삭제 |
| `make debug` | 디버그 심볼로 재빌드 |
| `make assets` | `assets/icons/` 아이콘 PNG 재생성 |
| `make install-deps` | 빌드·실행 의존성 설치 |
| `make check-deps` | 의존성 검증 (누락 시 실패) |
| `make deps` | 의존성 요약 출력 |
| `make install-desktop` | Linux 사용자 데스크톱 메뉴 등록 |
| `make info` | 의존성·컴파일 플래그 출력 |
| `make help` | 도움말 |

### 환경 변수

| 변수 | 설명 |
|------|------|
| `IV_AUTO_INSTALL=0` | `make` 시 자동 apt/brew 설치 비활성화 |
| `IV_VERBOSE=1` | 컴파일·의존성 상세 로그 출력 |

---

## 패키지 설치 (수동)

**Ubuntu / Debian**

```bash
sudo apt-get install -y build-essential pkg-config \
  libgtk-3-dev libgdk-pixbuf-2.0-dev libheif-dev \
  libvlc-dev vlc
```

**Fedora / RHEL**

```bash
sudo dnf install -y gcc make pkg-config \
  gtk3-devel gdk-pixbuf2-devel libheif-devel vlc-devel
```

**macOS (Homebrew)**

```bash
brew install pkg-config gtk+3 gdk-pixbuf libheif vlc
```

또는:

```bash
make install-deps
```

---

## 프로젝트 구조

```
ImageViewerGTKv10/
├── source/
│   ├── main.c          진입점
│   ├── gtk_app.c       메인 창, 레이아웃, gtk_init
│   ├── gtk_browser.c   폴더 트리, 파일 목록, 컨텍스트 메뉴, 변환 다이얼로그
│   ├── gtk_preview.c   갤러리 썸네일, 이미지 미리보기, 동영상 재생
│   ├── gtk_editor.c    이미지 편집기 창 (효과·배경 제거)
│   ├── image_effects.c 픽셀 효과·배경 제거 알고리즘
│   ├── image_io.c      이미지 로드·저장·변환 (포맷 변환 포함)
│   ├── heif_native.c   HEIF/HIF libheif 디코딩 + HDR 톤 매핑
│   ├── state.c         앱 상태 영속화 (마지막 폴더 등)
│   ├── utils.c         확장자 판별, 파일 크기·시간 포맷 등
│   └── assets.c        아이콘 파일 로딩
├── include/
│   ├── app.h           공개 App API (GTK 비의존)
│   ├── gtk_app.h       App 구조체, GTK 창 API
│   ├── gtk_browser.h   브라우저 API
│   ├── gtk_preview.h   미리보기 API
│   ├── image_io.h      이미지 I/O + 포맷 변환 API
│   ├── heif_native.h   HEIF 디코딩 API
│   ├── state.h / utils.h / assets.h
├── tools/
│   └── gen_icons.c     assets/icons/ PNG 생성 (빌드 시 자동 실행)
├── assets/
│   └── icons/          형식·폴더 아이콘 PNG (make 시 자동 생성, .gitignore)
├── build/              컴파일 오브젝트 (make clean 시 삭제, .gitignore)
├── Makefile
├── imageviewer         실행 파일 (빌드 결과, .gitignore)
├── imageviewer.desktop
└── daemon_hammer.ico   앱 아이콘
```

---

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
