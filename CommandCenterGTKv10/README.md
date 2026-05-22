# CommandCenterGTKv10 (FileMaster)

FileMasterWinV10를 참고하여 GTK3로 작성한 Linux / macOS용 듀얼 패널 파일 관리자입니다.

## 특징

- 좌/우 듀얼 패널 파일 브라우저
- 패널 간 복사(F5) / 이동(F6)
- 폴더 트리 드롭다운, 빠른 경로(홈, /, /tmp, 마운트)
- 파일 미리보기 (이미지, 텍스트, 메타정보)
- 즐겨찾기 (JSON 저장)
- 세션 복원 (마지막 경로, 분할 위치)
- 재귀 파일 검색 (F9)
- 새 폴더/파일, 이름 바꾸기(F2), 삭제(F8)
- 클립보드 복사/붙여넣기 (URI 목록)
- 한국어 UI

## 의존성

### Linux

- GTK 3.x (`libgtk-3-dev`)
- pkg-config, GCC
- GLib/GIO (GTK와 함께 설치)

### macOS

- [Homebrew](https://brew.sh)
- `gtk+3`, `pkg-config` (`make install-deps` 또는 `brew install gtk+3`)

## 빌드

```sh
make                 # 의존성 검사 → 누락 시 자동 설치 → 빌드
./commandcenter
# 또는
make run
```

실행 파일은 프로젝트 루트의 `./commandcenter` 에 생성됩니다. 오브젝트 파일만 `build/` 에 둡니다.

```sh
make check-deps      # 의존성만 검사
make install-deps    # 누락 패키지 수동 설치
make clean           # build/ 및 실행 파일 삭제
```

`make` 시 의존성이 없으면 apt/dnf/pacman으로 자동 설치를 시도합니다. 끄려면 `CC_AUTO_INSTALL=0 make`.

## 설치

시스템 전역 설치 (기본 `PREFIX=/usr/local`):

```sh
make
sudo make install
commandcenter
```

현재 사용자만 설치 (`~/.local`):

```sh
make install PREFIX=$HOME/.local
# PATH에 ~/.local/bin 이 있어야 합니다.
commandcenter
```

설치 항목:

| 경로 | 내용 |
|------|------|
| `$(PREFIX)/bin/commandcenter` | 실행 파일 |
| `$(PREFIX)/share/commandcenter/daemon_hammer.ico` | 앱 아이콘 (실행 파일 검색용) |
| `$(PREFIX)/share/icons/hicolor/256x256/apps/commandcenter.ico` | 데스크톱·작업 표시줄 아이콘 |
| `$(PREFIX)/share/applications/commandcenter.desktop` | 애플리케이션 메뉴 항목 |

제거:

```sh
sudo make uninstall
# 또는
make uninstall PREFIX=$HOME/.local
```

패키징용 스테이징:

```sh
make install DESTDIR=/tmp/stage PREFIX=/usr
```

## macOS 빌드·설치

```sh
# Homebrew + GTK3
make install-deps
make
./commandcenter

# Homebrew 기본 경로에 설치 (/opt/homebrew 또는 /usr/local)
make install
commandcenter
```

macOS에서는 Linux용 `.desktop` 메뉴 항목을 설치하지 않습니다. 터미널에서 `commandcenter`로 실행하거나, Finder에서 실행 파일을 직접 실행합니다.

GTK3(Homebrew) 최초 실행 시 테마/폰트 경고가 나올 수 있습니다. `brew install gtk+3` 후 터미널에서 실행하는 것을 권장합니다.

## 설정 파일

`~/.config/CommandCenterGTKv10/`

- `session.json` — 좌/우 패널 경로, 분할 위치
- `bookmarks.json` — 즐겨찾기 목록

## 단축키

| 키 | 동작 |
|----|------|
| F2 | 이름 바꾸기 |
| F5 | 반대 패널로 복사 |
| F6 | 반대 패널로 이동 |
| F7 | 새 폴더 |
| F8 | 삭제 |
| F9 | 검색 |

## 라이선스

MIT License
