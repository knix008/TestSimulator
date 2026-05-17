# ImageViewer GTK v1.0

Linux / macOS용 이미지·동영상 폴더 뷰어입니다. [ImageViewerV20](../ImageViewerV20) (Windows)와 비슷한 사용 흐름을 GTK3로 구현했습니다.

## 기능

- 폴더 선택 및 마지막 폴더 복원 (`~/.config/ImageViewerGTKv10/appstate.json`)
- 왼쪽 패널: 폴더 트리(상단) + 파일 목록(하단), 항목 앞에 형식별 아이콘
- **폴더 선택** → 오른쪽에 썸네일 갤러리
- **파일 선택** → 이미지 미리보기(확대·팬) 또는 동영상 재생
- **HEIF / HEIC / HIF**: 파일을 **마우스로 선택했을 때만** JPG로 변환 (갤러리는 메모리 디코딩, `.hif`만 아이콘)
- 변환 후 원본 HEIF는 같은 폴더의 `hif/` 하위로 이동
- 이미지 편집: ↺ 반시계 회전, ↻ 시계 회전, ⇔ 좌우 뒤집기 (JPG에 저장)
- 동영상 재생 (libvlc, 없으면 안내 메시지)
- 폴더 변경 감시 후 목록 자동 새로고침 (갤러리 로딩 중에는 썸네일 재시작하지 않음)
- 폴더 스캔·썸네일·이미지 로드·삭제 등은 **백그라운드 스레드**에서 처리해 UI 멈춤 최소화

## 지원 형식

| 종류 | 확장자 |
|------|--------|
| 이미지 | png, jpg, jpeg, gif, bmp, tif, tiff, ico, webp, heif, heic, hif, avif |
| 동영상 | mp4, mkv, avi, mov, wmv, webm, m4v, mpeg, mpg, ts, m2ts, flv |

## 요구 사항

| 항목 | 용도 |
|------|------|
| gcc, make, pkg-config | 빌드 |
| GTK+ 3 | UI |
| gdk-pixbuf 2 | 이미지 로드 |
| libheif-dev | HIF/HEIC/HEIF → JPG **내장 C 변환기** (`heif_native.c`) |
| libvlc + vlc | 동영상 재생 (선택, 없으면 `NO_LIBVLC`로 빌드) |

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

### 아이콘

앱·창 아이콘은 프로젝트 루트의 `daemon_hammer.ico`를 사용합니다. 없으면 빌드 시 상위 폴더(`../daemon_hammer.ico`)로 연결·복사를 시도합니다.

```bash
# 수동 연결 예
ln -sf ../daemon_hammer.ico daemon_hammer.ico
```

### make 대상

| 명령 | 설명 |
|------|------|
| `make` | 의존성 확인(필요 시 설치) + 빌드 (기본) |
| `make setup` | `make`와 동일 |
| `make deps` | 의존성 요약 |
| `make install-deps` | 빌드·실행 의존성 설치 |
| `make check-deps` | 의존성 검증 (누락 시 실패) |
| `make run` | 빌드 후 실행 |
| `make clean` | 오브젝트·실행 파일 삭제 |
| `make assets` | `assets/icons/` 형식·폴더 아이콘 PNG 재생성 |
| `make distclean` | `clean` + 아이콘 생성 도구 정리 |
| `make debug` | 디버그 심볼로 재빌드 |
| `make install-desktop` | Linux 사용자 데스크톱 메뉴 등록 |
| `make info` | 의존성·컴파일 플래그 출력 |
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
  libgtk-3-dev libgdk-pixbuf-2.0-dev libheif-dev \
  libvlc-dev vlc
```

```bash
make install-deps
```

**macOS (Homebrew)**

```bash
make install-deps
make IV_AUTO_INSTALL=0     # 자동 설치 끄고 수동 brew 시:
# brew install pkg-config gtk+3 gdk-pixbuf libheif vlc
```

## HEIF / JPG 변환 참고

- **순수 C** 구현: `heif_native.c` (libheif C API) + `image_io.c` (JPEG 저장). **Python·ffmpeg·heif-convert CLI 미사용.**
- 이미 같은 이름의 `.jpg`가 있으면 다시 변환하지 않습니다.
- **이미 만들어진 `.jpg`는 다시 변환하지 않습니다.** 밝기가 이상하면 해당 JPG를 삭제한 뒤 HIF를 다시 선택하세요.

## 프로젝트 구조

```
ImageViewerGTKv10/
├── source/             # C 소스
│   ├── main.c          # 진입점
│   ├── gtk_app.c       # 메인 창, 레이아웃, gtk_init
│   ├── gtk_browser.c   # 폴더 트리, 파일 목록
│   ├── gtk_preview.c   # 갤러리, 미리보기, HEIF 변환
│   ├── state.c / utils.c / assets.c / image_io.c / heif_native.c
├── include/            # 헤더
│   ├── app.h           # 공개 API (GTK 비의존)
│   └── gtk_*.h, state.h, utils.h, assets.h, image_io.h, heif_native.h
├── tools/gen_icons.c   # assets/icons PNG 생성
├── build/              # 오브젝트 (make clean 시 삭제)
├── Makefile
├── imageviewer         # 실행 파일 (빌드 결과)
├── imageviewer.desktop
├── daemon_hammer.ico
└── assets/icons/       # 형식·폴더 아이콘 (make 시 자동 생성)
```

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
