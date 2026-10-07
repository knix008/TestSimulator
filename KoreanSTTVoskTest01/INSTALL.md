# 설치 안내

한국어 음성 인식(Vosk) 프로그램을 처음부터 빌드해 실행하기까지의 절차입니다.
Windows · Linux · macOS 모두 같은 소스에서 빌드합니다.

- 사용법은 [USERSGUIDE.md](USERSGUIDE.md)
- 코드 구조는 [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 0. 준비물 요약

| 항목 | 내용 | 받는 방법 |
|---|---|---|
| C++ 컴파일러 | C++17 (g++ 9↑ / clang 10↑) | 아래 OS별 안내 |
| CMake | 3.16 이상 | 아래 OS별 안내 |
| GTK4 개발 패키지 | GTK4 GUI 를 빌드할 때만 | 아래 OS별 안내 |
| libvosk | Vosk 공유 라이브러리 | `fetch_deps` 스크립트가 받음 |
| 한국어 모델 | `vosk-model-small-ko-0.22` (내려받기 83MB, 풀면 253MB) | `fetch_deps` 스크립트가 받음 |

디스크는 모두 합쳐 약 **1GB** 정도 봅니다(모델 253MB + libvosk 25MB + 툴체인).

---

## 1. Windows

### 1-1. MSYS2 설치

<https://www.msys2.org> 에서 설치 프로그램을 받아 기본 경로(`C:\msys64`)에 설치합니다.
이미 다른 경로에 있다면 환경변수 `MSYS2_ROOT` 에 그 경로를 넣어 두세요.

> **왜 MSYS2 인가 — 중요**
>
> Vosk 가 배포하는 `libvosk.dll` 은 **MSVCRT 계열 MinGW** 로 만들어져 있습니다.
> 그래서 이 프로젝트의 Windows 빌드는 MSYS2 의 **MINGW64** 환경(`C:\msys64\mingw64`)을
> 씁니다. UCRT64 환경으로 빌드하면, GTK 가 끌어오는 UCRT 판 `libstdc++-6.dll` 과
> Vosk 가 쓰는 MSVCRT 판이 한 프로세스에서 부딪혀
> `libvosk.dll` 적재가 *"지정된 프로시저를 찾을 수 없습니다"* 로 실패합니다.
> 빌드 스크립트가 알아서 `mingw64` 쪽 g++ 를 고르므로, 보통은 신경 쓸 일이 없습니다.

### 1-2. 의존물 받기

PowerShell 을 열고 프로젝트 폴더에서:

```powershell
.\fetch_deps.ps1 -InstallSystemDeps
```

이 한 줄이 하는 일:

1. `third_party\vosk-win64-0.3.45\` 에 libvosk 를 내려받아 풉니다.
2. `models\vosk-model-small-ko-0.22\` 에 한국어 모델을 내려받아 풉니다.
3. pacman 으로 MINGW64 툴체인과 GTK4 를 설치합니다
   (`mingw-w64-x86_64-gcc`, `-gtk4`, `-pkgconf`, `-cmake`, `-ninja`).

`-InstallSystemDeps` 를 빼면 설치 명령만 보여 주고 라이브러리·모델만 받습니다.

> GTK4 는 **GTK4 판 GUI 를 빌드할 때만** 필요합니다. Windows 기본값인 Win32
> 네이티브 GUI 만 쓸 거라면 `mingw-w64-x86_64-gcc`, `-cmake`, `-ninja` 만 있으면 됩니다.

### 1-3. 빌드

```powershell
.\build.ps1                 # Win32 네이티브 GUI (기본)
.\build.ps1 -Gui gtk4       # GTK4 판
.\build.ps1 -Gui all        # 둘 다
.\build.ps1 -Debug -Clean   # 디버그로 처음부터
.\clean.ps1                 # 산출물 지우기
.\clean.ps1 -Deps           # 내려받은 libvosk·모델까지 (완전 초기화)
```

### 1-4. 실행

```powershell
.\run.ps1                   # GUI
.\run.ps1 cli --list-devices
.\test.ps1                  # 시험까지 돌려 설치 확인
```

실행 파일은 **프로젝트 루트**에 놓입니다(중간 산출물 `.o`·`.a` 만 `build\` 안에
남습니다).

```
KoreanSTTVoskTest01\
  kstt-gui.exe           ← 기본 GUI (네이티브 판의 복사본)
  kstt-gui-native.exe
  kstt-gui-gtk4.exe      ← -Gui gtk4 / all 로 빌드했을 때
  kstt-cli.exe
  kstt-tests.exe
  libvosk.dll
  libstdc++-6.dll  libgcc_s_seh-1.dll  libwinpthread-1.dll
  models\  third_party\  ...
```

Win32 네이티브 GUI 는 바로 옆 DLL 들만으로 돌기 때문에, 이 파일들과 `models\` 를
함께 복사하면 다른 PC 에서도 그대로 실행됩니다(모델 위치는 환경변수 `KSTT_MODEL`
로도 알려 줄 수 있습니다).

> GTK4 판은 GTK 런타임 DLL 수십 개가 더 필요해서 `C:\msys64\mingw64\bin` 이
> PATH 에 있어야 합니다. `run.ps1` 이 그 일을 대신 해 줍니다.

---

## 2. Linux

### 2-1. 의존물 받기

```bash
./fetch_deps.sh --system-deps
```

배포판을 알아보고 아래 중 맞는 것을 실행합니다. 직접 하려면:

| 배포판 | 명령 |
|---|---|
| Debian · Ubuntu | `sudo apt-get install -y build-essential cmake ninja-build pkg-config libgtk-4-dev libasound2-dev` |
| Fedora · RHEL | `sudo dnf install -y gcc-c++ cmake ninja-build pkgconf-pkg-config gtk4-devel alsa-lib-devel` |
| Arch | `sudo pacman -S --needed base-devel cmake ninja pkgconf gtk4 alsa-lib` |
| openSUSE | `sudo zypper install -y gcc-c++ cmake ninja pkg-config gtk4-devel alsa-devel` |

libvosk 는 아키텍처에 맞는 것을 자동으로 고릅니다
(`x86_64` / `aarch64` / `armv7l`).

### 2-2. 빌드와 실행

```bash
./build.sh
./run.sh            # GUI
./test.sh           # 시험
./clean.sh          # 산출물 지우기 (--deps 를 주면 모델·libvosk 까지)
```

Linux 에서는 GTK4 가 곧 네이티브 GUI 입니다. `--gui native` 와 `--gui gtk4` 는
같은 것을 빌드합니다.

### 2-3. 마이크

ALSA 로 직접 엽니다. PulseAudio/PipeWire 를 쓰는 환경이라면 보통
`default` 장치가 그쪽으로 연결돼 있어 그대로 동작합니다. 장치 목록은:

```bash
./run.sh cli --list-devices
```

---

## 3. macOS

### 3-1. 의존물 받기

```bash
brew install cmake ninja pkg-config   # GTK4 판도 쓰려면 gtk4 추가
./fetch_deps.sh
```

### 3-2. 빌드와 실행

```bash
./build.sh          # Cocoa 네이티브 GUI (.app 번들)
./build.sh --gui gtk4
./run.sh cli --wav tests/data/sample-ko.wav
open kstt-gui-native.app
```

### 3-3. 마이크 권한

macOS 는 마이크 접근에 사용자 허가가 필요합니다.

- `.app` 번들로 실행하면 처음 인식을 시작할 때 허가 창이 뜹니다
  (`Info.plist` 의 `NSMicrophoneUsageDescription`).
- 터미널에서 `kstt-cli` 를 실행하면 **터미널 앱**의 마이크 권한을 따릅니다.
  시스템 설정 ▸ 개인정보 보호 및 보안 ▸ 마이크에서 터미널을 켜 주세요.

> macOS·Linux 쪽 코드는 작성되어 있으나, 이 저장소를 만든 장비가 Windows 라
> 해당 OS 에서의 빌드·실행은 아직 확인되지 않았습니다. 문제가 있으면 알려 주세요.

---

## 4. 설치가 잘 됐는지 확인

```bash
./test.sh                  # Windows: .\test.ps1
```

마지막 줄이 `요약: 통과 12 · 실패 0 · 건너뜀 0` 이면 모델·라이브러리까지 모두
제자리입니다. 종단 시험이 "건너뜀" 으로 나오면 모델이나 libvosk 를 못 찾은 것이니
`./run.sh cli --paths` 로 어디를 뒤졌는지 확인하세요.

```
$ ./run.sh cli --paths
오디오 백엔드 : waveIn
libvosk       : ...\KoreanSTTVoskTest01\libvosk.dll
모델          : ...\KoreanSTTVoskTest01\models\vosk-model-small-ko-0.22
탐색 뿌리     :
  ...\KoreanSTTVoskTest01
  ...
```

---

## 5. 자주 막히는 곳

| 증상 | 원인과 해결 |
|---|---|
| 실행하자마자 아무 말 없이 끝남 (종료 코드 127) | DLL 적재 실패. 실행 파일 옆(프로젝트 루트)에 `libvosk.dll` 과 MinGW 런타임 3개가 있는지 보고, 없으면 다시 빌드하세요. |
| `could not load libvosk.dll … 지정된 프로시저를 찾을 수 없습니다` | UCRT64 로 빌드한 경우입니다. `build.ps1`/`build.sh` 를 쓰면 MINGW64 를 고릅니다. 직접 빌드했다면 `C:\msys64\mingw64\bin\g++.exe` 를 쓰세요. |
| Vosk 꾸러미의 `libstdc++-6.dll` 을 exe 옆에 복사했더니 깨짐 | 그 DLL 은 2022년판이라 최신 g++ 바이너리를 망가뜨립니다. **libvosk 만** 복사하세요(빌드가 그렇게 합니다). |
| `no Vosk model found` | 모델이 없습니다. `fetch_deps` 를 돌리거나, `KSTT_MODEL` 환경변수 또는 GUI 의 모델 칸에 경로를 넣으세요. |
| CMake 가 `GTK4 를 찾지 못해…` 경고 | GTK4 개발 패키지가 없습니다. GTK4 판이 필요 없다면 그냥 두거나 `--gui native` 로 빌드하세요. |
| 마이크를 열 수 없다는 오류 | 다른 프로그램이 장치를 독점했거나 권한이 없습니다. `--list-devices` 로 번호를 확인해 `--device N` 으로 지정해 보세요. |
| 한글이 콘솔에서 깨짐 | Windows 터미널의 글꼴·코드페이지 문제입니다. `kstt-cli` 는 스스로 UTF-8 로 맞추므로 Windows Terminal 에서는 정상입니다. |

---

## 6. 환경변수

| 변수 | 뜻 |
|---|---|
| `KSTT_MODEL` | 모델 디렉터리 (GUI 의 모델 칸 기본값으로도 쓰입니다) |
| `KSTT_VOSK_LIB` | `libvosk` 파일 또는 그 디렉터리 |
| `KSTT_SMOKE_WAV` | GUI 가 모델 적재 직후 이 WAV 를 자동 인식 (점검용) |
| `MSYS2_ROOT` | (Windows) MSYS2 설치 경로가 기본이 아닐 때 |
