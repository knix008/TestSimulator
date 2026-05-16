# ImageViewer GTK v1.0

Linux / macOS용 이미지·동영상 폴더 뷰어입니다. [ImageViewerV20](../ImageViewerV20) (Windows)와 같은 사용 흐름을 GTK3로 구현했습니다.

## 기능

- 폴더 선택 및 마지막 폴더 복원 (`~/.config/ImageViewerGTKv10/appstate.json`)
- 왼쪽 패널: 폴더 트리(상단) + 파일 목록(하단)
- 썸네일 갤러리, 이미지 확대·이동(팬)
- **HEIF / HEIC / HIF**: 파일을 **선택했을 때만** JPG로 변환 (갤러리 썸네일은 메모리 디코딩)
- 변환 후 원본 HEIF는 같은 폴더의 `hif/` 하위로 이동
- 이미지 편집: ↺ 반시계 회전, ↻ 시계 회전, ⇔ 좌우 뒤집기 (JPG에 저장)
- 동영상 재생 (libvlc)
- 폴더 변경 감시 후 목록·갤러리 자동 새로고침

## 요구 사항

| 항목 | 용도 |
|------|------|
| gcc, make, pkg-config | 빌드 |
| GTK+ 3 | UI |
| gdk-pixbuf 2 | 이미지 로드 |
| libheif + gdk-pixbuf HEIF 플러그인 | HEIF/HEIC/HIF |
| libvlc + vlc | 동영상 재생 |

## 빌드 및 실행

```bash
cd ImageViewerGTKv10
make          # 의존성 확인(필요 시 설치) + 빌드
./imageviewer
```

또는:

```bash
make run
```

### make 대상

| 명령 | 설명 |
|------|------|
| `make` | 설치 + 빌드 (기본) |
| `make deps` | 의존성 요약 |
| `make install-deps` | 패키지 수동 설치 |
| `make check-deps` | 의존성 검증 (누락 시 실패) |
| `make clean` | 오브젝트·실행 파일 삭제 |
| `make install-desktop` | Linux 데스크톱 메뉴 등록 |
| `make help` | 도움말 |

### 환경 변수

| 변수 | 설명 |
|------|------|
| `IV_AUTO_INSTALL=0` | `make` 시 자동 `apt` 설치 비활성화 |
| `IV_VERBOSE=1` | 컴파일·의존성 상세 로그 |

## 패키지 설치 (수동)

**Ubuntu / Debian**

```bash
sudo apt-get install -y build-essential pkg-config \
  libgtk-3-dev libgdk-pixbuf-2.0-dev \
  libvlc-dev vlc \
  libheif1 libheif-plugin-gdk-pixbuf
```

선택: HEIF→JPG 변환 품질 향상

```bash
sudo apt-get install -y libheif-examples   # heif-convert
```

**macOS (Homebrew)**

```bash
brew install pkg-config gtk+3 gdk-pixbuf libheif vlc
make IV_AUTO_INSTALL=0
```

## HEIF / JPG 변환 참고

- 이미 같은 이름의 `.jpg`가 있으면 다시 변환하지 않습니다.
- JPG 저장 시 ICC 색상 프로필을 유지하고 품질 100으로 저장합니다.
- 예전에 만든 JPG가 색이 흐리면, 해당 `.jpg`를 삭제한 뒤 HEIF를 다시 열어 변환하세요.

## 프로젝트 구조

```
main.c app.c browser.c preview.c state.c utils.c image_io.c
Makefile
imageviewer.desktop
assets/icons/          # 빌드 시 복사 (ImageViewerV10 참조)
daemon_hammer.ico      # 아이콘
```

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
