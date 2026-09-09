# 천지인 한글 입력기 (Python)

12키 천지인 자판으로 한글을 조합하는 프로그램입니다.
**Windows · macOS · Linux · 웹** 네 곳에서 같은 조합 엔진으로 돕니다.

조합 규칙은 [KoreanChunJiInC++](../KoreanChunJiInC++) 의 `chunjiin.c` 와
`input.c` 를 그대로 옮긴 것입니다. 회귀 시험 기대값도 그 저장소의
`tests/test_engine.c` 에서 뽑아 온 것(`test/cases.tsv`)을 씁니다.
손으로 옮겨 적지 않으므로 원본이 고쳐지면 시험도 따라갑니다.

같은 규칙을 옮긴 [KoreanChunJiInRustV10](../KoreanChunJiInRustV10) 의
파이썬 판입니다. 자판 · 테마 · 언어 · 설정 파일 형식까지 그쪽과 같으므로,
두 판이 설정을 나눠 써도 됩니다.

![아이콘](assets/chunjiin.png)

## 무엇인가요

- 화면 위쪽은 편집 영역, 아래쪽은 천지인 12키 + 기능 버튼 한 줄
- 마우스·손가락으로 눌러도 되고, 물리 키보드 숫자열로 쳐도 됩니다
- 한글 / 영문 소문자 / 영문 대문자 / 숫자 / 기호 다섯 가지 입력 모드
- 조합 중인 낱자를 상태줄에 보여 주고, 아래아(`·`, `‥`) 중간 상태도 화면에 표시
- UTF-8 텍스트 파일로 열기 / 저장, 클립보드 복사 / 붙여넣기
- 툴바 · 메뉴 · 설정 창 · 테마 4종(라이트 · 다크 · 세피아 · 고대비)
- 화면 언어 **한국어 / English**
- 관리자 권한 없이 설치되는 설치 프로그램 포함

## 빠르게 써 보기

파이썬만 있으면 설치할 것 없이 바로 돕니다.

```sh
pip install PySide6

python -m chunjiin        # 데스크톱 앱
python -m chunjiin.web    # 웹 판 (http://localhost:8080)
```

엔진과 웹 판 서버는 표준 라이브러리만 씁니다. PySide6 은 데스크톱 창을
그리는 데만 필요합니다.

### Windows

```powershell
.\build.ps1 -Run                # 소스 그대로 실행 (가장 빠르다)
.\build.ps1                     # 실행 파일 만들기
.\test.ps1                      # 시험 784항목 (구역별 집계와 요약)
.\scripts\package.ps1           # 설치용 파일 만들기
```

### macOS · Linux

```sh
./build.sh --run                # 소스 그대로 실행 (가장 빠르다)
./build.sh                      # 실행 파일 만들어 루트에 두기
./test.sh                       # 시험 784항목 (구역별 집계와 요약)
./scripts/package.sh            # 설치용 파일 만들기
```

빌드가 끝나면 저장소 루트에 실행 파일과 설치용 파일이 놓입니다.

| 파일 | 무엇 |
|---|---|
| `chunjiin` / `chunjiin.exe` | 데스크톱 앱 |
| `chunjiin-setup` / `chunjiin-setup.exe` | 설치 프로그램 (GUI) |
| `chunjiin-serve` / `chunjiin-serve.exe` | 웹 판을 품은 서버 |
| `chunjiin-1.0-windows-x64.zip` | Windows 배포 묶음 |
| `chunjiin-1.0-linux-amd64.tar.gz` | 리눅스 배포 묶음 |
| `chunjiin-1.0-macos-arm64.dmg` | macOS 배포 이미지 |

실행 파일은 **한 파일 묶음**이라 그것 하나만 옮겨도 돕니다. 대신 처음
뜰 때 몇 초 걸립니다(자기를 임시 폴더에 풉니다). 날마다 쓰면서 그것이
거슬리면 `--onedir` / `-OneDir` 로 만들어 `dist/chunjiin/` 을 폴더째 쓰면
곧바로 뜹니다.

파이썬은 컴파일이 없으므로 `--run` / `-Run` 은 **언제나 방금 고친 코드를
그대로 돌립니다.** 반대로 `build` 로 만든 실행 파일은 그 순간의 코드를
굳힌 것이라, 고친 것을 보려면 다시 만들어야 합니다.

## 설치

설치 프로그램(`chunjiin-setup`)을 실행하면 **관리자 권한 없이** 사용자 영역에
설치됩니다. 같은 프로그램의 `제거` 단추로 되돌릴 수 있습니다.

| 운영체제 | 설치 자리 | 함께 만들어지는 것 |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Programs\Chunjiin` | 시작 메뉴 바로 가기, "설정 > 앱" 항목 |
| Linux | `~/.local/share/Chunjiin` | `~/.local/bin` 링크, `.desktop` 항목, 아이콘 |
| macOS | `~/Applications/Chunjiin.app` | 앱 묶음 |

## 웹 판

```sh
python -m chunjiin.web                       # http://localhost:8080
python -m chunjiin.web -addr :8080           # 같은 망의 다른 기기에도 연다
python -m chunjiin.web -dir web              # 다른 폴더의 화면을 쓴다(개발용)
```

기본값은 이 컴퓨터에서만 열립니다. 같은 망의 다른 기기에서도 열려면
`-addr :8080` 처럼 주소를 비워 줍니다.

Rust 판은 엔진을 WASM 으로 만들어 브라우저 안에 넣었습니다. 파이썬은
브라우저에서 돌지 않으므로 **엔진을 서버가 맡습니다.** 조합은 하나도
자바스크립트에서 하지 않으므로 데스크톱 판과 결과가 어긋날 수 없습니다.
자세한 것은 [Architecture.md](Architecture.md) 를 보세요.

## 자판

```
  ㅣ     ·      ㅡ          키 0  1  2
  ㄱㅋ   ㄴㄹ   ㄷㅌ         키 3  4  5
  ㅂㅍ   ㅅㅎ   ㅈㅊ         키 6  7  8
  . ,    ㅇㅁ   ? !          키 9  10 11
```

`모드` `←` `스페이스` `→` `줄바꿈` `지우기` 가 맨 아랫줄에 있습니다.

물리 키보드로는 한글 모드에서 숫자열이 대응합니다.

```
  1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
  4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
```

자세한 사용법은 [UsersGuide.md](UsersGuide.md) 를 보세요.

## 문서

| 문서 | 내용 |
|---|---|
| [UsersGuide.md](UsersGuide.md) | 자판, 모음 조합표, 단축키, 화면 설명 |
| [Build.md](Build.md) | 빌드 · 시험 · 설치용 파일 만들기 · 필요한 것들 |
| [Architecture.md](Architecture.md) | 파일 구성, 계층, C++ · Rust 판과의 관계, 시험 얼개 |

## 파일 구성

```
KoreanChunJiInPythonV10/
├─ chunjiin/
│  ├─ engine/               조합 엔진 (순수 파이썬, 표준 라이브러리만)
│  │  ├─ chunjiin.py        원본 chunjiin.c 이식 - 유니코드 조합, 겹받침
│  │  ├─ input.py           원본 input.c 이식 - 오토마타, 편집 API
│  │  └─ labels.py          라벨 · 모드 이름 · 상태줄
│  ├─ ui/                   데스크톱 화면 (PySide6)
│  │  ├─ app.py             창 조립 - 메뉴 · 툴바 · 키패드 · 딸린 창
│  │  ├─ dialogs.py         사용법 · 정보 · 설정 창
│  │  ├─ theme.py           테마 4종
│  │  ├─ lang.py, help.py   한국어 · 영어 글자표
│  │  ├─ widgets.py         직접 그리는 키패드 · 툴바 버튼
│  │  ├─ icons.py           선으로 그리는 그림 (순수 계산)
│  │  ├─ layout.py          키패드 배치 · 커서 변환 (순수 계산)
│  │  ├─ textgrid.py        글자를 칸 격자에 세우는 셈 (순수 계산)
│  │  ├─ settings.py        설정 저장 (JSON)
│  │  └─ font.py            내장 글꼴 등록
│  ├─ web/                  웹 판 서버 (표준 라이브러리만)
│  ├─ setup/                설치 프로그램 (GUI, 앱을 품는다)
│  └─ testkit.py            시험 도우미 (자료 읽기 · 결과 남기기)
├─ tests/
│  ├─ test_cases.py         C++ 원본에서 뽑아 온 430항목
│  ├─ test_engine.py        계산으로 만드는 엔진 시험
│  ├─ test_ui.py            색표 · 배치 · 언어 · 창 스모크
│  ├─ test_setup.py         설치 자리와 만들어 내는 글
│  ├─ test_web.py           서버와 상태 객체
│  ├─ test_report.py        보고기 자체 (칸 맞추기 · 색)
│  ├─ webui.mjs             웹 화면을 브라우저 없이 돌려 보기
│  └─ report.py             시험 실행기 겸 보고기 (pytest 불필요)
├─ test/
│  └─ cases.tsv             C++ 판에서 뽑아 온 430항목
├─ web/                     웹 판 화면 (HTML · CSS · JS)
├─ assets/                  아이콘, 내장 글꼴
├─ scripts/                 package · PyInstaller 스크립트
├─ build.ps1  / build.sh     실행 파일 만들기 · 바로 실행
└─ test.ps1   / test.sh      시험 실행
```

## 필요한 것

- **Python 3.10 이상**
- 데스크톱 창을 띄우려면 **PySide6** — `pip install PySide6`
- 실행 파일을 만들려면 **PyInstaller** — `pip install pyinstaller`
- Linux 는 Qt 가 X11/Wayland 라이브러리를 찾습니다.
  - 데비안/우분투: `sudo apt install libgl1 libxkbcommon-x11-0 libegl1`

엔진과 웹 판 서버는 표준 라이브러리 말고는 아무것도 쓰지 않습니다.
그래서 `python -m chunjiin.web` 은 PySide6 없이도 돕니다.

## 라이선스

프로그램 자체는 별도 명시가 없습니다. 사내/개인 용도로 자유롭게 쓰세요.

함께 넣은 글꼴 **Noto Sans KR** 은 SIL Open Font License 1.1 을 따릅니다
(`assets/fonts/OFL.txt`).
