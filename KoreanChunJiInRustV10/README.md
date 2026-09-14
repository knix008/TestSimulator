# 천지인 한글 입력기 (Rust)

12키 천지인 자판으로 한글을 조합하는 프로그램입니다.
**Windows · macOS · Linux · 웹** 네 곳에서 같은 조합 엔진으로 돕니다.

조합 규칙은 [KoreanChunJiInC++](../KoreanChunJiInC++) 의 `chunjiin.c` 와
`input.c` 를 그대로 옮긴 것입니다. 회귀 시험 기대값도 그 저장소의
`tests/test_engine.c` 에서 **직접 뽑아 와서** 씁니다. 손으로 옮겨 적지 않으므로
원본이 고쳐지면 시험도 따라갑니다.

같은 규칙을 옮긴 [KoreanChunjiInGoV10](../KoreanChunjiInGoV10) 의 Rust 판입니다.
자판 · 테마 · 언어 · 설정 파일 형식까지 그쪽과 같으므로, 두 판이 설정을
나눠 써도 됩니다.

![아이콘](assets/chunjiin.png)

## 무엇인가요

- 화면 위쪽은 편집 영역, 아래쪽은 천지인 12키 + 기능 버튼 한 줄
- 마우스·손가락으로 눌러도 되고, 물리 키보드 숫자열로 쳐도 됩니다
- 한글 / 영문 소문자 / 영문 대문자 / 숫자 / 기호 다섯 가지 입력 모드
- 조합 중인 낱자를 상태줄에 보여 주고, 아래아(`·`, `‥`) 중간 상태도 화면에 표시
- UTF-8 텍스트 파일로 열기 / 저장, 클립보드 복사 / 붙여넣기
- 툴바 · 메뉴 · 설정 창 · 테마 4종(라이트 · 다크 · 세피아 · 고대비)
- 화면 언어 **한국어 / English**
- **컴팩트 모드** — 툴바에서 정보 단추를 빼고 창을 좁힌다. 정보는 편집칸
  오른쪽 단추 메뉴(컨텍스트 메뉴)와 `도움말 > 정보` 에 있다
- 관리자 권한 없이 설치되는 설치 프로그램 포함
  (이미 있으면 지울지 먼저 묻는다)

## 빠르게 써 보기

### Windows

```powershell
.\run.ps1                       # 바로 실행 (없으면 빌드한다)
.\run.bat                       # 탐색기에서 더블클릭해도 된다
.\build.ps1 -Run                # 빌드하고 바로 실행
.\test.ps1                      # 시험 (구역별 집계와 Summary, 루트 test-summary.txt)
.\test.bat                      # 같은 시험 (cmd.exe)
.\package.bat                   # 설치용 파일 만들기 (루트에 복사)
.\scripts\package.ps1           # 같은 일 (PowerShell)
.\scripts\build-web.ps1 -Serve  # 웹 판 빌드 + 서버 띄우기
```

### macOS · Linux

```sh
./run.sh                        # 바로 실행 (없으면 빌드한다)
./build.sh --run                # 빌드하고 바로 실행
./test.sh                       # 시험 (구역별 집계와 Summary, 루트 test-summary.txt)
./scripts/package.sh            # 설치용 파일 만들기
./scripts/build-web.sh --serve  # 웹 판 빌드 + 서버 띄우기
```

빌드가 끝나면 저장소 루트에 실행 파일과 설치용 파일이 놓입니다.

| 파일 | 무엇 |
|---|---|
| `chunjiin.exe` / `chunjiin` | 데스크톱 앱 |
| `chunjiin-setup.exe` / `chunjiin-setup` | 설치 프로그램 (GUI) |
| `chunjiin-serve.exe` / `chunjiin-serve` | 웹 판을 품은 서버 |
| `chunjiin-1.0-windows-x64.zip` | Windows 배포 묶음 |
| `chunjiin-1.0-linux-amd64.tar.gz` | 리눅스 배포 묶음 |
| `chunjiin-1.0-macos-arm64.dmg` | macOS 배포 이미지 |

## 설치

설치 프로그램(`chunjiin-setup`)을 실행하면 **관리자 권한 없이** 사용자 영역에
설치됩니다. 시작 메뉴와 바탕화면 바로 가기는 설치 창에서 고릅니다.
이미 설치된 프로그램이 있으면 `설치` 또는 `제거` 를 눌렀을 때 지울지 묻습니다.
같은 프로그램의 `제거` 단추로 되돌릴 수 있습니다.

| 운영체제 | 설치 자리 | 함께 만들어지는 것 |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Programs\Chunjiin` | 시작 메뉴·바탕화면 바로 가기(선택), "설정 > 앱" 항목 |
| Linux | `~/.local/share/Chunjiin` | `~/.local/bin` 링크, 프로그램 목록·바탕화면 바로 가기(선택), 아이콘 |
| macOS | `~/Applications/Chunjiin.app` | 앱 묶음 |

Inno Setup, NSIS, dpkg 같은 다른 도구는 필요 없습니다.
설치 프로그램 자체가 Rust 로 짜여 있고 실행 파일을 자기 안에 품습니다.
Windows 탐색기·작업 표시줄 아이콘은 빌드할 때 `assets/chunjiin.ico` 를
실행 파일에 넣습니다. 창 아이콘은 `assets/chunjiin.png` 입니다.

## 웹 판

```sh
./scripts/build-web.sh      # web/ 에 chunjiin_wasm 을 만든다
./chunjiin-serve            # http://localhost:8080
```

`chunjiin-serve` 는 `web/` 전체를 품고 있으므로 그 파일 하나만 옮겨도 됩니다.
`web/` 폴더를 GitHub Pages 같은 정적 호스팅에 그대로 올려도 됩니다.
그때는 `.wasm` 의 MIME 형식이 `application/wasm` 인지만 확인하세요.

기본값은 이 컴퓨터에서만 열립니다. 같은 망의 다른 기기에서도 열려면
`chunjiin-serve -addr :8080` 처럼 주소를 비워 줍니다.

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
| [Architecture.md](Architecture.md) | 파일 구성, 계층, C++ · Go 판과의 관계, 시험 얼개 |

## 파일 구성

```
KoreanChunJiInRustV10/
├─ crates/
│  ├─ engine/               조합 엔진 (순수 Rust, 의존성 0)
│  │  └─ src/
│  │     ├─ chunjiin.rs     원본 chunjiin.c 이식 - 유니코드 조합, 겹받침
│  │     ├─ input.rs        원본 input.c 이식 - 오토마타, 편집 API
│  │     └─ labels.rs       라벨 · 모드 이름 · 상태줄
│  ├─ ui/                   데스크톱 화면 (egui / eframe)
│  │  └─ src/
│  │     ├─ app.rs          창 조립 - 메뉴 · 툴바 · 키패드 · 딸린 창
│  │     ├─ theme.rs        테마 4종
│  │     ├─ lang.rs, help.rs  한국어 · 영어 글자표
│  │     ├─ widgets.rs      직접 그리는 키패드 · 툴바 버튼
│  │     ├─ icons.rs        선으로 그리는 그림
│  │     ├─ layout.rs       키패드 배치 · 커서 변환 (순수 계산)
│  │     ├─ settings.rs     설정 저장 (JSON)
│  │     └─ font.rs         내장 글꼴 등록
│  ├─ app/                  데스크톱 앱 (실행 파일 chunjiin, 탐색기 아이콘)
│  ├─ setup/                설치 프로그램 (GUI, 앱을 품는다)
│  ├─ serve/                웹 판 서버 (web/ 를 품는다)
│  ├─ wasm/                 웹 판이 쓰는 엔진 (wasm-bindgen)
│  ├─ gen-testcases/        C++ 시험 자료 뽑개
│  ├─ testkit/              시험 도우미 (자료 읽기 · 결과 남기기)
│  └─ testreport/           시험 결과를 구역별로 정리해 보여 준다
├─ test/
│  └─ cases.tsv             C++ 판에서 뽑아 온 430항목
├─ web/                     웹 판 화면 (HTML · CSS · JS · chunjiin.png)
├─ assets/                  chunjiin.png · chunjiin.ico · 내장 글꼴
├─ scripts/                 package · build-web · prereq · cargo-out · windows_icon.rs · make_icon.py
├─ package.bat              설치용 파일 만들기 (cmd.exe)
├─ run.bat / run.ps1 / run.ps / run.sh  바로 실행 (없으면 빌드)
├─ build.ps1  / build.sh     앱 · 서버 · 설치 프로그램을 루트에 둔다
└─ test.bat / test.ps1 / test.sh  시험 실행 (루트에 test-summary.txt)
```

`.gitignore` 는 빌드·배포 결과만 무시합니다.
`crates/` · `scripts/` · `test/` · `web/` 원본 · `assets/`(PNG · ICO · 글꼴) ·
`Cargo.toml` · `Cargo.lock` · 루트 스크립트와 문서는 저장소에 둡니다.
루트의 실행 파일 · 배포 묶음 · `test-summary.txt` 와 `web/chunjiin_wasm*` 은
빌드가 다시 만듭니다.

## 필요한 것

- **Rust 1.85 이상** (없으면 `build` · `test` · `package` · `run` 이 rustup 으로 넣습니다)
- Windows 는 MSVC 링커가 필요합니다 (Visual Studio Build Tools).
- Linux 는 창을 띄우는 데 X11/Wayland 개발 파일이 필요합니다.
  - 데비안/우분투: `sudo apt install libx11-dev libxcursor-dev libxrandr-dev libxi-dev libgl1-mesa-dev libxkbcommon-dev`
- 웹 판은 `wasm32-unknown-unknown` 대상과 `wasm-bindgen-cli` 가 필요합니다.

Go 판과 달리 C 컴파일러(cgo)가 필요 없습니다.
자세한 것은 [Build.md](Build.md) 를 보세요.

## 라이선스

프로그램 자체는 별도 명시가 없습니다. 사내/개인 용도로 자유롭게 쓰세요.

내장한 글꼴 **Noto Sans KR** 은 SIL Open Font License 1.1 을 따릅니다
(`assets/fonts/OFL.txt`).
