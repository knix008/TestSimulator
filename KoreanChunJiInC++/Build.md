# 빌드 안내

## 준비물

| 도구 | 용도 | 확인 |
|---|---|---|
| MinGW-w64 gcc (MSYS2 UCRT64 권장) | 컴파일 · 링크 | `gcc --version` |
| windres | 아이콘 · 매니페스트 리소스 | `windres --version` |
| CMake 3.16+ (선택) | 대체 빌드 | `cmake --version` |
| Python + Pillow (선택) | 아이콘 다시 만들기 | `python -c "import PIL"` |

아이콘(`assets/chunjiin.ico`)은 저장소에 들어 있으므로 Python 은 없어도 됩니다.

## MSYS2 / MinGW-w64 설치

이미 `gcc --version` 이 동작하면 이 절은 건너뛰어도 됩니다.

### 1. MSYS2 설치

winget 이 있으면 한 줄입니다.

```bat
winget install -e --id MSYS2.MSYS2
```

없으면 <https://www.msys2.org> 에서 `msys2-x86_64-*.exe` 를 받아 설치합니다.
기본 설치 위치는 `C:\msys64` 입니다.

### 2. 툴체인 설치

시작 메뉴에서 **MSYS2 UCRT64** 터미널을 열고(파란 아이콘, `MSYS2 MSYS` 아님)
다음을 실행합니다.

```bash
pacman -Syu                       # 처음 한 번은 창이 닫힐 수 있습니다. 다시 열고
pacman -Su                        # 한 번 더
pacman -S --needed \
    mingw-w64-ucrt-x86_64-gcc \
    mingw-w64-ucrt-x86_64-cmake \
    mingw-w64-ucrt-x86_64-make
```

`gcc` 를 설치하면 `windres` 는 binutils 로 함께 들어옵니다.

> **UCRT64 를 쓰는 이유**
> MSYS2 에는 여러 환경이 있습니다. `MSYS` 는 POSIX 에뮬레이션 층이라
> Win32 GUI 프로그램을 만들 수 없고, `MINGW64` 는 옛 MSVCRT 를 씁니다.
> 이 프로젝트는 UTF-8 · 와이드 문자를 많이 쓰므로 최신 런타임인
> **UCRT64** 를 씁니다. `MINGW64` 로도 빌드는 되지만 권장하지 않습니다.

### 3. PATH 등록

`cmd.exe` 나 PowerShell 에서 `build.bat` / `test.bat` 을 쓰려면
`C:\msys64\ucrt64\bin` 이 PATH 에 있어야 합니다.

한 번만 쓸 때 (현재 창에만 적용):

```bat
set PATH=C:\msys64\ucrt64\bin;%PATH%
```

```powershell
$env:PATH = "C:\msys64\ucrt64\bin;$env:PATH"
```

계속 쓰려면 사용자 환경 변수에 넣습니다(PowerShell, 한 번만 실행).

```powershell
[Environment]::SetEnvironmentVariable(
    "PATH",
    "C:\msys64\ucrt64\bin;" + [Environment]::GetEnvironmentVariable("PATH", "User"),
    "User")
```

설정한 뒤에는 터미널을 새로 열어야 반영됩니다.
`설정 > 시스템 > 정보 > 고급 시스템 설정 > 환경 변수` 로 넣어도 됩니다.

### 4. 확인

```bat
gcc --version
windres --version
```

두 명령이 버전을 찍으면 준비가 끝난 것입니다. 바로 `build.bat` 을 실행하세요.

### 설치 위치가 다를 때

MSYS2 를 다른 곳에 깔았다면 `C:\msys64` 대신 그 경로의 `ucrt64\bin` 을 씁니다.
설치 위치는 이렇게 찾을 수 있습니다.

```powershell
Get-ChildItem C:\, D:\ -Filter ucrt64 -Directory -Depth 2 -ErrorAction SilentlyContinue
```

## build.bat

```bat
build.bat            :: 앱 + 테스트 + 설치 프로그램
build.bat test       :: 빌드한 뒤 자소 조합 테스트 실행
build.bat verbose    :: 컴파일러 명령줄까지 그대로 출력
build.bat clean      :: 빌드 산출물 삭제 (build\ 와 루트의 설치 파일)
```

빌드하면 쓰는 컴파일러와 플래그, 단계마다 어떤 파일을 컴파일하는지,
마지막에 산출물과 크기가 나옵니다.

```
============================================================
 Chunjiin Hangul Input - build
============================================================
  compiler   : gcc 15.1.0  (x86_64-w64-mingw32)
  location   : C:\msys64\ucrt64\bin\gcc.exe
  flags      : -std=gnu11 -Wall -Wextra -O2 -Iinclude
  source dir : C:\...\KoreanChunJiInC++
  output dir : C:\...\KoreanChunJiInC++\build
------------------------------------------------------------
[1/6] resource : src\app.rc  (icon, manifest, version)
[2/6] compile  : application objects
       cc  src\chunjiin.c
       cc  src\input.c
       cc  src\main.c
[3/6] link     : build\chunjiin.exe
[4/6] compile  : engine tests
       cc  tests\test_engine.c
[5/6] resource : installer\setup.rc  (embeds build\chunjiin.exe)
[6/6] compile  : installer
       cc  installer\setup.c
------------------------------------------------------------
 Artifacts
------------------------------------------------------------
  chunjiin.exe              210 KB
  chunjiin-setup.exe        1057 KB
  build\chunjiin.exe        210 KB
  build\test_engine.exe     185 KB
  build\app.res             25 KB
  build\setup.res           235 KB
------------------------------------------------------------
 BUILD OK
============================================================
```

`build.bat verbose` 를 쓰면 각 단계 아래에 실제 `gcc` / `windres` 명령줄이
한 줄씩 더 붙습니다.

```
[2/6] compile  : application objects
       cc  src\chunjiin.c
           gcc -std=gnu11 -Wall -Wextra -O2 -Iinclude -c src\chunjiin.c -o build\chunjiin.o
```

산출물

```
chunjiin.exe                응용 프로그램   (바로 실행)
chunjiin-setup.exe          설치 프로그램   (실행하면 설치)
build\chunjiin.exe          위와 같은 파일
build\chunjiin-setup.exe    위와 같은 파일
build\test_engine.exe       자소 조합 검증
```

실행 파일과 설치 파일은 찾기 쉽도록 빌드가 끝나면 저장소 루트로도 복사됩니다.
`build.bat clean` 이 그 복사본까지 지웁니다.

`build.bat` 은 반드시 ASCII 로만 씁니다. cmd.exe 는 배치 파일을 ANSI 코드
페이지로 읽기 때문에, UTF-8 한글 주석이 들어가면 파싱이 깨집니다.

## 수동 빌드

```bat
windres -Isrc -Iinclude src\app.rc -O coff -o build\app.res

gcc -std=gnu11 -Wall -Wextra -O2 -Iinclude ^
    -o build\chunjiin.exe ^
    src\chunjiin.c src\input.c src\main.c build\app.res ^
    -mwindows -lcomdlg32 -lcomctl32 -lgdi32
```

### `-Iinclude` 가 필요한 이유

`src/chunjiin.c` 는 원본 그대로이므로 헤더를 이렇게 참조합니다.

```c
#include "../include/chunjiin.h"
#include "../include/input.h"
```

`src/` 기준으로 `../include/` 는 저장소 루트의 `include/` 를 정확히 가리키므로
그대로 해석됩니다. `-Iinclude` 는 다른 소스(`src/input.c`, `src/main.c`)가
`#include "chunjiin.h"` 로 짧게 쓸 수 있게 해 줍니다.

## CMake

```bat
cmake -S . -B out -G "MinGW Makefiles"
cmake --build out
ctest --test-dir out --output-on-failure
```

`chunjiin` 을 빌드하면 `build\chunjiin.exe` 로도 복사됩니다.
설치 프로그램(`chunjiin_setup`)이 그 파일을 리소스로 품기 때문입니다.

## 테스트

### 실행

전용 실행기를 쓰세요. 빌드 · 콘솔 코드 페이지 전환 · 실행 · 종료 코드까지 한 번에 처리합니다.

```bat
test.bat            :: 빌드 후 실행. 항목마다 PASS/FAIL + 마지막에 요약
test.bat -q         :: 실패한 항목과 요약만
test.bat -b         :: 빌드만
test.bat -h         :: 도움말
```

시험 프로그램에 직접 줄 수 있는 옵션도 있습니다.

```bat
build	est_engine.exe --color      :: 파이프로 보낼 때도 색을 켠다
build	est_engine.exe --no-color   :: 색을 끈다 (NO_COLOR 환경 변수도 같은 효과)
```

MSYS2 / Git Bash 에서는 `./test.sh` 를 쓰면 됩니다. 옵션은 같습니다.

종료 코드는 전부 통과하면 `0`, 하나라도 실패하면 `1` 이라서 CI 에 그대로 걸 수 있습니다.
테스트는 `-Werror` 로 컴파일하므로 경고 하나만 생겨도 실패합니다.

기본 출력은 항목마다 한 줄입니다. 어떤 시험이 무엇을 냈는지 그대로 보입니다.

```
[홑받침 16자]
  [PASS] 각                3013                    -> 각
  [PASS] 갂                301333                  -> 갂
  [FAIL] 간                3014                    -> 간   기대: 갇
```

`PASS` 는 초록, `FAIL` 은 빨강으로 나옵니다. 콘솔이 ANSI 색을 받지 못하거나
파일로 리다이렉트하면 저절로 꺼지므로 로그가 지저분해지지 않습니다.

그리고 마지막에 구역별 집계와 전체 결과가 나옵니다.

```
========================================================
 시험 요약
--------------------------------------------------------
  모음 21자                   21/21    PASS
  모음 전이표 전수            72/72    PASS
  ...
  낱말·문장                   28/28    PASS
--------------------------------------------------------
  전체 시험 항목    585 개   (구역 34 개)
  통과              585 개   (100%)
  실패                0 개
--------------------------------------------------------
  결과    PASS    585개 항목 모두 통과
========================================================
```

항목이 많아 스크롤이 부담스러우면 `-q` 로 실패한 것만 볼 수 있습니다.

### 시험 항목 쓰는 법

`tests/test_engine.c` 는 키 시퀀스를 문자열로 적고 결과와 비교합니다.

| 글자 | 뜻 | 글자 | 뜻 |
|---|---|---|---|
| `0`~`9` | 키 0~9 | `!` | 조합 확정 |
| `a` | 키 10 (ㅇㅁ) | `~` | 전체 지우기 |
| `b` | 키 11 (? !) | `/` | 줄바꿈 |
| `_` | 스페이스 | `[` `]` | 커서 왼쪽 / 오른쪽 |
| `<` | 백스페이스 | `{` `}` | 맨 앞 / 맨 뒤 |
| `\|` | 연타 순환 끊기 | `H E U N S` | 모드: 한글 / 영소 / 영대 / 숫자 / 기호 |
| 공백 | 무시 (읽기 좋으라고) | `M` | 모드 순환 |

비교 함수는 다섯 가지입니다.

```c
expect       ("안녕",   "a014|4110a",  L"안녕");      /* 확정 후 버퍼 */
expect_live  ("ㄱ점1",  "31",          L"ㄱ·");       /* 확정 없이, 조합 중 모습 */
expect_cursor("커서왼쪽","301401[",     L"가나", 1);   /* 버퍼 + 커서 위치 */
expect_comp  ("겹받침", "30167",       L"ㄱ + ㅏ + ㅂㅅ"); /* 상태줄 조합 표시 */
expect_mode  ("영소",   "E",           L"영문 abc");  /* 모드 이름 */
```

`check_labels()` 는 다섯 모드 × 12키를 돌면서
**버튼에 적힌 글자의 첫 자와 실제로 들어가는 글자가 같은지** 확인합니다.
배열을 바꾸고 라벨을 안 고치는 실수를 막는 장치입니다.

### 덮고 있는 범위 (34구역 585항목)

**낱자 전수**

| 구역 | 항목 | 내용 |
|---|---|---|
| 모음 21자 | 21 | 21개 모음 전부 |
| 모음 전이표 전수 | 72 | 24개 모음 상태 × ㅣ · ㅡ 세 키. 이어지지 않는 조합까지 |
| 모음 백스페이스 | 23 | 모음마다 한 단계 되돌린 결과 |
| ㄱ + 모음 21자 | 21 | 가 갸 거 겨 고 교 구 규 그 기 개 걔 게 계 과 괘 괴 궈 궤 귀 긔 |
| 초성 19자 | 19 | 19개 초성 전부 |
| 홑받침 16자 | 16 | 받침 가능한 자음 전부 |
| 겹받침 11자 | 11 | ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ |

**규칙**

| 구역 | 항목 | 내용 |
|---|---|---|
| 모음 순환·경계 | 14 | ㅏ↔ㅑ 순환, 아래아 중간 상태 |
| 자음 순환 | 10 | 키별 순환, 한 바퀴 복귀, 순환 끊기 |
| 받침 제한 | 7 | ㄸ ㅃ ㅉ 받침 불가, 초성 없이 자음 |
| 연음 | 6 | 대표적인 연음 |
| 홑받침 연음 전수 | 16 | 받침 16개가 모두 다음 글자로 넘어가는지 |
| 겹받침 연음 전수 | 11 | 겹받침에서 둘째 자음만 넘어가는지 |
| 백스페이스 | 13 | 낱자 단위 되돌리기 전 단계 |
| 겹받침 백스페이스 | 11 | 겹받침 11개가 홑받침으로 돌아오는지 |
| 겹받침 병합 규칙 | 14 | 되돌려 붙이기가 살아 있는 조건과 꺼지는 조건 |
| 아래아 표시 | 8 | `·` `‥` `ㄱ·` 화면 표시 |
| 문장부호 | 11 | `. ,` `? !` 순환 |

**편집·모드**

| 구역 | 항목 | 내용 |
|---|---|---|
| 편집·커서 | 12 | 띄어쓰기 · 줄바꿈 · 중간 삽입 · 커서 한계 |
| 편집 심화 | 13 | 중간 백스페이스, 조합 중 커서 이동, 커서 위치 |
| 모드 전환 | 8 | 다섯 모드와 순환 |
| 모드 전환 심화 | 12 | 모드를 오가며 이어 쓰기, 모드별 백스페이스 |
| 영문 26자 전수 | 52 | 소문자·대문자 26자를 모두 눌러 본다 |
| 영문 입력 | 18 | 멀티탭, 순환 복귀, 두 글자짜리 키, 낱말 |
| 영문 기호 3키 | 13 | `.,?` `!'"` `-:@` 순환 |
| 숫자·기호 입력 | 7 | 12키 전체 매핑 |
| 라벨-입력 일치 | 60 | 5모드 × 12키. 버튼 글자 == 실제 입력 |
| 조합 상태 표시 | 9 | 상태줄 문자열 |

**원본 함수와 경계**

| 구역 | 항목 | 내용 |
|---|---|---|
| 표시 API 경계 | 6 | 범위 밖 라벨, 짧은 버퍼, NULL |
| check_double 원본 | 17 | 겹받침 11쌍 + 안 붙는 6쌍 |
| wchar_to_utf8 원본 | 7 | 빈 문자열, 한글, 길이 제한, 섞임 |
| get_unicode 원본 | 9 | 초성만 / 중성만 / 아래아 / 완성 음절 |
| 경계·예외 | 4 | 범위 밖 키, 버퍼 한계, 빈 상태 조작, reset |
| 낱말·문장 | 28 | 많다 · 삶 · 핥 · 읊다 · 읽다 · 반갑습니다 · 감사합니다 등 |

## 아이콘 다시 만들기

```bat
python scripts\make_icon.py
```

`assets\chunjiin.ico` (16~256px 8종)와 `assets\chunjiin.png` 를 새로 만듭니다.
아이콘을 바꾼 뒤에는 리소스를 다시 컴파일해야 반영됩니다(`build.bat`).

## 설치 프로그램

`installer/setup.rc` 가 `../build/chunjiin.exe` 를 `RCDATA` 로 품기 때문에,
**앱을 먼저 빌드한 뒤** 설치 프로그램을 빌드해야 합니다. `build.bat` 은 그 순서를 지킵니다.

```bat
build\chunjiin-setup.exe              설치 창
build\chunjiin-setup.exe /S           조용히 기본 위치에 설치
<설치폴더>\uninstall.exe /uninstall   제거
<설치폴더>\uninstall.exe /uninstall /S  묻지 않고 제거
```

설치 위치는 `%LOCALAPPDATA%\Programs\Chunjiin` 이고 관리자 권한이 필요 없습니다.
시작 메뉴 바로 가기와 `HKCU\...\Uninstall\ChunjiinHangulInput` 등록 정보를 만들어서
Windows 설정의 "앱 및 기능" 에도 나타납니다.

## 자주 만나는 문제

**`ld returned 1 exit status` 만 나오고 이유가 없다**
`chunjiin.exe` 가 실행 중이면 덮어쓸 수 없습니다. 프로그램을 닫고 다시 빌드하세요.

**배치 파일에서 `'빌드'는 내부 또는 외부 명령이 아닙니다`**
`.bat` 파일에 UTF-8 한글이 들어간 경우입니다. ASCII 로만 쓰세요.

**설치 프로그램이 "프로그램 파일을 복사하지 못했습니다" 라고 한다**
설치 폴더의 `chunjiin.exe` 가 실행 중입니다. 먼저 닫으세요.
