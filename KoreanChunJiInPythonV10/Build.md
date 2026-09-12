# 빌드 · 시험 · 배포

## 필요한 것

| 무엇 | 언제 | 넣는 법 |
|---|---|---|
| **Python 3.10 이상** | 언제나 | [python.org](https://www.python.org/downloads/) |
| **PySide6** | 데스크톱 창을 띄울 때 | `pip install PySide6` |
| **PyInstaller** | 실행 파일을 만들 때 | `pip install pyinstaller` |

엔진과 웹 판 서버는 표준 라이브러리 말고는 아무것도 쓰지 않습니다.
그래서 `python -m chunjiin.web` 은 PySide6 없이도 돕니다.

**PySide6 과 PyInstaller 는 손으로 넣지 않아도 됩니다.** `build` · `test` ·
`package` 스크립트(`.ps1` · `.bat` · `.sh` 모두)가 시작할 때
`scripts/ensure_deps.py` 를 불러, 없는 것만 그 파이썬의 pip 으로 넣습니다.
스크립트가 고른 파이썬에 넣으므로 "깔았는데 못 찾는다" 가 생기지 않습니다.

```sh
python scripts/ensure_deps.py desktop build     # 직접 부를 때
python scripts/ensure_deps.py --check desktop   # 넣지 않고 있는지만
```

망이 막힌 자리라면 미리 넣어 두면 됩니다. 한꺼번에 넣으려면:

```sh
pip install -e ".[desktop,build]"
```

### 운영체제별로 더 필요한 것

**Linux** 는 Qt 가 X11/Wayland 라이브러리를 찾습니다.

```sh
# 데비안 · 우분투
sudo apt install libgl1 libxkbcommon-x11-0 libegl1 libdbus-1-3

# 페도라
sudo dnf install mesa-libGL libxkbcommon-x11 libglvnd-egl
```

**Windows · macOS** 는 파이썬과 PySide6 말고 더 필요한 것이 없습니다.
Rust 판과 달리 컴파일러도, WiX 나 Inno Setup 같은 설치 도구도 필요 없습니다.

## 바로 실행하기

파이썬은 컴파일이 없으므로 **빌드 없이 소스를 그대로 돌리는 것이 가장
빠르고, 언제나 방금 고친 코드가 반영됩니다.**

```sh
python -m chunjiin          # 데스크톱 앱
python -m chunjiin.web      # 웹 판 서버
python -m chunjiin.setup    # 설치 프로그램 (품은 앱이 없으면 안내만)
```

스크립트로도 같습니다.

```powershell
.\build.ps1 -Run
```

```bat
build.bat -run
```

```sh
./build.sh --run
```

## 시험

```powershell
.\test.ps1              # 구역별 집계와 요약
.\test.ps1 -Detail      # 항목마다 한 줄씩
.\test.ps1 -Run 겹받침  # 이름이 맞는 것만
```

```bat
test.bat
test.bat -detail
test.bat -run 겹받침
```

```sh
./test.sh
./test.sh --detail
./test.sh --run 겹받침
```

결과는 색으로 구분해 보여 주고, 구역 이름과 숫자 칸이 세로로 맞습니다.
한글은 터미널에서 두 칸을 차지하므로 **글자 수가 아니라 보이는 폭**으로
칸을 맞춥니다. 색은 화면으로 나갈 때만 켜지고, 파일이나 파이프로
흘려보내면 저절로 꺼집니다. `--color` / `--no-color` 로 못박을 수 있고
`NO_COLOR` · `FORCE_COLOR` 환경 변수도 따릅니다.

**pytest 를 깔지 않아도 됩니다.** `tests/report.py` 가 시험을 찾아 돌리고
결과를 모아 정리합니다. 직접 부를 수도 있습니다.

```sh
python -m tests.report -v
```

돌려주는 값은 다 통과하면 0, 하나라도 틀리면 1 입니다. 그래서 CI 에
그대로 걸 수 있습니다.

### 무엇을 보는가

| 파일 | 무엇 |
|---|---|
| `tests/test_cases.py` | C++ 원본에서 뽑아 온 430항목 (`tests/cases.tsv`) |
| `tests/test_engine.py` | 영문 26자 전수, 라벨-입력 일치, 원본 함수, 경계·예외 |
| `tests/test_ui.py` | 색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림 · 창 스모크 |
| `tests/test_setup.py` | 설치 자리, 만들어 내는 글(.desktop · plist · 레지스트리) |
| `tests/test_web.py` | 서버 경로 처리, 상태 객체, 실제로 띄워 두드려 보기 |
| `tests/test_report.py` | 보고기 자체 - 줄 풀기, 칸 맞추기, 색 |
| `tests/webui.mjs` | 웹 화면(app.js)을 브라우저 없이 서버에 붙여 돌려 보기 |

마지막 것은 Node 가 있을 때만 돕니다. 브라우저를 내려받지 않고도 화면
배선이 끊긴 데가 없는지 보려는 것입니다. Node 가 없으면 건너뜁니다.

창 스모크 시험은 `QT_QPA_PLATFORM=offscreen` 으로 **창을 띄우지 않고**
그립니다. 화면이 없는 자리에서도 그대로 돕니다. PySide6 이 아예 없으면
그 시험만 건너뜁니다.

시험이 설정 파일을 건드릴 때는 임시 폴더로 돌려세우므로, 실제 사용자
설정을 덮어쓰지 않습니다.

## 실행 파일 만들기

```powershell
.\build.ps1              # dist\ 에 앱 · 서버 · 설치 프로그램, 루트에는 chunjiin-setup.exe 하나
.\build.ps1 -OneDir      # dist\chunjiin\ 에 한 폴더로 (설치 프로그램은 만들지 않는다)
```

```bat
build.bat
build.bat -onedir
```

```sh
./build.sh
./build.sh --onedir
```

### 한 파일이냐 한 폴더냐

기본은 **한 파일 묶음**입니다. 만든 것은 모두 `dist/` 에 놓이고,
**저장소 루트에는 나눠 줄 파일인 설치 프로그램 하나만** 복사됩니다. 앱은
그 안에 품겨 있으므로 루트에 따로 둘 까닭이 없습니다. (리눅스·맥의 앱
이름 `chunjiin` 이 소스 패키지 폴더와 같아 루트에 둘 수 없다는 사정도
있습니다.)

| | 한 파일 (기본) | 한 폴더 (`--onedir`) |
|---|---|---|
| 놓이는 곳 | `dist/` (설치 프로그램은 루트에도) | `dist/chunjiin/` |
| 옮길 때 | 파일 하나 | 폴더째 |
| 처음 뜨는 데 | 2~3초 | 곧바로 |
| 크기 | 앱 51MB · 서버 9MB | 앱 125MB · 서버 20MB |

한 파일 묶음은 뜰 때마다 자기를 임시 폴더에 풉니다. 날마다 쓰면서 그것이
거슬리면 `--onedir` 로 만들어 폴더째 쓰면 됩니다. 그때는 **실행 파일만
떼어 놓으면 딸린 파일이 없어 돌지 않으므로** 어디에 만들어졌는지만 알려
주고, 품을 수도 없으니 설치 프로그램은 만들지 않습니다.

갓 만들었거나 갓 설치한 직후 **처음 한 번은 20초 넘게** 걸릴 수 있습니다.
바이러스 검사가 50MB 짜리 새 파일을 통째로 훑기 때문입니다. 그 다음부터는
2~3초입니다.

### 직접 부르기

```sh
python scripts/pyinstaller_build.py --targets app serve setup
python scripts/pyinstaller_build.py --targets app --onefile --copy-root
```

| 옵션 | 무엇 |
|---|---|
| `--targets` | `app` · `serve` · `setup` 중에서 (기본 `app`) |
| `--onefile` | 모두 한 파일로 (기본) |
| `--onedir` | 모두 한 폴더로 (빨리 뜨지만 폴더째 옮겨야 돈다) |
| `--clean` | 중간 파일부터 지우고 |
| `--copy-root` | 설치 프로그램(한 파일)을 저장소 루트에도 |

`.spec` 파일을 저장소에 두지 않고 이 스크립트가 인자를 만들어 넘깁니다.
`.spec` 은 손으로 고칠 자리가 많아 셋이 어긋나기 쉽기 때문입니다.

## 설치용 파일 만들기

```powershell
.\scripts\package.ps1
.\scripts\package.ps1 -SkipTest
.\scripts\package.ps1 -Version 1.0
```

```bat
scripts\package.bat
scripts\package.bat -skiptest
scripts\package.bat -version 1.0
```

```sh
./scripts/package.sh
./scripts/package.sh --skip-test
./scripts/package.sh --version=1.0
```

하는 일은 차례대로 이렇습니다.

1. 시험을 돌린다 (통과하지 못하면 멈춘다)
2. 앱과 서버를 한 파일로 빌드한다
3. 그 앱을 설치 프로그램 안에 넣는다
4. 설치 프로그램을 한 파일로 빌드한다
5. 배포용 묶음을 만든다
6. **설치 프로그램과 배포용 묶음만 저장소 루트에 둔다** (앱과 서버는 `dist/`)

만들어지는 것:

| 파일 | 어디에 | 무엇 | 크기 |
|---|---|---|---|
| `chunjiin` / `.exe` | `dist/` | 데스크톱 앱 | 51MB |
| `chunjiin-serve` / `.exe` | `dist/` | 웹 판을 품은 서버 | 9MB |
| `chunjiin-setup` / `.exe` | 루트 | 설치 프로그램 (앱을 품는다) | 101MB |
| `chunjiin-1.0-windows-x64.zip` | 루트 | Windows 배포 묶음 (셋 다 들어 있다) | 160MB |
| `chunjiin-1.0-linux-amd64.tar.gz` | 루트 | 리눅스 배포 묶음 | |
| `chunjiin-1.0-macos-arm64.dmg` | 루트 | macOS 배포 이미지 | |

설치 프로그램은 앱을 통째로 품으므로 100MB 를 넘습니다. Qt 가 들어 있어
그렇습니다.

## 설치 프로그램

```
chunjiin-setup                       설치 창을 띄운다
chunjiin-setup --uninstall           제거 창을 띄운다
chunjiin-setup --silent --target D   창 없이 그 자리에 설치한다
chunjiin-setup --silent --clean --target D       기존 파일을 모두 지우고 설치한다
chunjiin-setup --silent --uninstall --target D   창 없이 제거한다
```

관리자 권한이 필요 없습니다. 설치 자리는 아래와 같고, 창에서 바꿀 수
있습니다.

**이미 설치된 자리에 다시 설치하면** 기존 파일을 어떻게 할지 묻습니다.

| 고르기 | 하는 일 |
|---|---|
| 기존 파일을 모두 지우고 설치 | 폴더를 통째로 비운 뒤 새로 놓는다 (`--clean`) |
| 덮어쓰기 | 같은 이름의 파일만 갈아 끼운다. 그 밖의 파일은 그대로 둔다 |
| 그만두기 | 아무것도 하지 않는다 |

설치할 때 설치 프로그램 자신을 설치 폴더에 `uninstall.exe` 로 복사해
둡니다. `설정 > 앱 > 제거` 가 그것을 띄우면 **자기가 설치 폴더 안에서
돈다는 것을 알아보고 제거 창으로** 엽니다. 제거기 자신은 돌고 있는 동안
지울 수 없으므로, 창을 닫으면 그때 남은 파일과 폴더가 지워집니다
(콘솔 없이 도는 `ping` 으로 기다리는 배치 파일이 맡습니다).

시작 메뉴 바로 가기와 앱 목록 등록은 사용자마다 하나뿐입니다. 제거할 때
그것이 **다른 폴더의 설치를 가리키고 있으면 건드리지 않습니다.**

| 운영체제 | 설치 자리 |
|---|---|
| Windows | `%LOCALAPPDATA%\Programs\Chunjiin` |
| Linux | `~/.local/share/Chunjiin` |
| macOS | `~/Applications/Chunjiin.app` |

무인 설치가 잘 됐는지 볼 때는 화면이 아니라 파일과 레지스트리로 확인하세요.

```powershell
Test-Path "$env:LOCALAPPDATA\Programs\Chunjiin\chunjiin.exe"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin"
```

## 웹 판

```sh
python -m chunjiin.web                       # http://localhost:8080
python -m chunjiin.web -addr 127.0.0.1:9000  # 다른 자리에서
python -m chunjiin.web -addr :8080           # 같은 망의 다른 기기에도
python -m chunjiin.web -dir web              # 다른 폴더의 화면을 쓴다
python -m chunjiin.web -q                    # 요청 기록을 찍지 않는다
```

기본값은 이 컴퓨터에서만 열립니다. 기본값을 `:8080` 으로 두면 Windows
방화벽이 실행할 때마다 허용 여부를 묻기 때문입니다.

빌드한 `chunjiin-serve` 는 `web/` 전체를 품고 있으므로 그 폴더만 옮겨도
됩니다. `web/` 폴더만 정적 호스팅에 올리는 것은 **안 됩니다.** 조합을
서버가 맡으므로 `/api/*` 가 있어야 합니다.

## 흔히 걸리는 것

### PowerShell 에서 한글이 물음표로 나온다

PowerShell 5.1 은 BOM 없는 `.ps1` 을 ANSI 로 읽습니다. 이 저장소의 `.ps1`
파일은 모두 **UTF-8 BOM + CRLF** 로 저장되어 있습니다. 편집기에서 고칠
때 그 형식을 지키세요.

### `.bat` 파일은 왜 영문뿐인가

`.ps1` 과 `.sh` 는 한글로 적혀 있는데 `build.bat` · `test.bat` ·
`scripts\package.bat` 만 주석과 메시지가 영문입니다. 일부러 그렇습니다.

cmd.exe 는 `chcp 65001` 상태에서 **한글이 든 UTF-8 배치 파일**을 읽을 때
4KB 읽기 경계 근처에 여러 바이트 글자가 걸리면 자리를 잘못 짚고, 줄 한가운데
토막(`dir`, `p`, `ned` 같은)을 명령으로 실행합니다. 파일 크기가 4184
바이트일 때는 돌고 3바이트 줄인 4181 바이트에서는 깨지는 것을 실제로
겪었습니다. 언제 터질지 파일 크기에 달려 있어 고쳐 쓸 때마다 위험합니다.

그래서 `.bat` 은 **모든 바이트를 0x80 미만으로** 두고, `goto` 와 라벨도 쓰지
않습니다(라벨 찾기도 같은 버그를 탑니다). 콘솔은 UTF-8 로 맞춰 두므로
파이썬이 찍는 시험 보고서와 빌드 기록은 한글 그대로 나옵니다.

`.bat` 은 PowerShell 을 부르지 않고 cmd.exe 만으로 돕니다. 옵션은 `.ps1`
과 같고, 앞의 `-` · `--` · `/` 는 무엇을 써도 되며 대소문자를 가리지
않습니다. `QT_QPA_PLATFORM=offscreen` 은 `setlocal` 안에서만 켜므로
아래 "앱이 뜨지 않고…" 문제가 `.bat` 에서는 생기지 않습니다.

### PowerShell 에서 빌드가 곧바로 멈춘다

PowerShell 5.1 은 네이티브 exe 가 stderr 로 찍은 줄을 오류로 잘못 읽습니다.
`$ErrorActionPreference = 'Stop'` 으로 두면 PyInstaller 가 진행 상황을
찍는 것만으로 스크립트가 멈춥니다. 이 저장소의 스크립트는 `Continue` 로
두고 성공 여부를 `$LASTEXITCODE` 로 직접 봅니다.

### 묶은 실행 파일이 `attempted relative import` 로 죽는다

PyInstaller 는 진입점 파일을 `__main__` 으로 돌리므로 상대 임포트가
깨집니다. `chunjiin/__main__.py` 같은 진입점은 **절대 임포트**여야 합니다.

### 앱이 뜨지 않고 "Cannot find font directory" 라고 나온다

그 PowerShell 창에 `QT_QPA_PLATFORM=offscreen` 이 남아 있는 것입니다.
`test.ps1` 은 **지금 이 PowerShell 프로세스 안에서** 도는데, 예전에는
그 값을 세션에 남겨 두어서 이어서 앱을 띄우면 창이 뜨지 않았습니다.
지금은 끝날 때 되돌리지만, 손으로 켰다면 이렇게 끕니다.

```powershell
Remove-Item Env:\QT_QPA_PLATFORM
```

### 리눅스에서 창이 뜨지 않는다

Qt 가 플랫폼 플러그인을 찾지 못하는 경우입니다. 무엇이 없는지 보려면:

```sh
QT_DEBUG_PLUGINS=1 python -m chunjiin
```

보통 위의 `libgl1` · `libxkbcommon-x11-0` 이 빠져 있습니다.
