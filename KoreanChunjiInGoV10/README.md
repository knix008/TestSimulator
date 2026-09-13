# 천지인 한글 입력기 (Go)

12키 천지인 자판으로 한글을 조합하는 프로그램입니다.
**Windows · macOS · Linux · 웹** 네 곳에서 같은 조합 엔진으로 돕니다.

조합 규칙은 [KoreanChunJiInC++](../KoreanChunJiInC++) 의 `chunjiin.c` 와
`input.c` 를 그대로 옮긴 것입니다. 회귀 시험 기대값도 그 저장소의
`tests/test_engine.c` 에서 **직접 뽑아 와서** 씁니다. 손으로 옮겨 적지 않으므로
원본이 고쳐지면 시험도 따라갑니다.

![아이콘](assets/chunjiin.png)

## 무엇인가요

- 화면 위쪽은 편집 영역, 아래쪽은 천지인 12키 + 기능 버튼 한 줄
- 마우스·손가락으로 눌러도 되고, 물리 키보드 숫자열로 쳐도 됩니다
- 한글 / 영문 소문자 / 영문 대문자 / 숫자 / 기호 다섯 가지 입력 모드
- 조합 중인 낱자를 상태줄에 보여 주고, 아래아(`ㆍ`, `ᆢ`) 중간 상태도 화면에 표시
- UTF-8 텍스트 파일로 열기 / 저장, 클립보드 복사 / 붙여넣기
- 툴바 · 메뉴 · 설정 창 · 테마 4종(라이트 · 다크 · 세피아 · 고대비)
- 화면 언어 **한국어 / English**
- 관리자 권한 없이 설치되는 설치 프로그램 포함

## 빠르게 써 보기

### Windows

```powershell
.\run.ps1                     # 바로 실행 (없으면 빌드한다)
.\run.bat                     # 탐색기에서 더블클릭해도 된다
.\build.ps1 -Run              # 빌드하고 바로 실행
.\test.ps1                    # 시험 722항목 (구역별 집계와 요약)
.\scripts\package.ps1         # 설치용 파일 만들기
.\scripts\build-web.ps1 -Serve  # 웹 판 빌드 + 서버 띄우기
```

### macOS · Linux

```sh
./run.sh                      # 바로 실행 (없으면 빌드한다)
./build.sh --run              # 빌드하고 바로 실행
./test.sh                     # 시험 722항목 (구역별 집계와 요약)
./scripts/package.sh          # 설치용 파일 만들기
./scripts/build-web.sh --serve  # 웹 판 빌드 + 서버 띄우기
```

빌드가 끝나면 저장소 루트에 실행 파일과 설치용 파일이 놓입니다.

| 파일 | 무엇 |
|---|---|
| `chunjiin.exe` / `chunjiin` | 데스크톱 앱 |
| `chunjiin-setup.exe` / `chunjiin-setup` | 설치 프로그램 (GUI) |
| `chunjiin-serve.exe` / `chunjiin-serve` | 웹 판을 품은 서버 |
| `chunjiin-1.0-linux-amd64.tar.gz` | 리눅스 배포 묶음 |
| `chunjiin-1.0-macos-arm64.dmg` | macOS 배포 이미지 |

## 설치

설치 프로그램(`chunjiin-setup`)을 실행하면 **관리자 권한 없이** 사용자 영역에
설치됩니다. 같은 프로그램의 `제거` 단추로 되돌릴 수 있습니다.

| 운영체제 | 설치 자리 | 함께 만들어지는 것 |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Programs\Chunjiin` | 시작 메뉴 바로 가기, "설정 > 앱" 항목, `uninstall.bat` |
| Linux | `~/.local/share/Chunjiin` | `~/.local/bin` 링크, `.desktop` 항목, 아이콘 |
| macOS | `~/Applications/Chunjiin.app` | 앱 묶음 |

Inno Setup, NSIS, dpkg 같은 다른 도구는 필요 없습니다.
설치 프로그램 자체가 Go 로 짜여 있고 실행 파일을 자기 안에 품습니다.
Windows 탐색기·작업 표시줄 아이콘은 빌드할 때 `assets/chunjiin.ico` 를
실행 파일에 박습니다.

## 웹 판

```sh
./scripts/build-web.sh      # web/ 에 chunjiin.wasm 을 만든다
./chunjiin-serve            # http://localhost:8080
```

`chunjiin-serve` 는 `web/` 전체를 품고 있으므로 그 파일 하나만 옮겨도 됩니다.
`web/` 폴더를 GitHub Pages 같은 정적 호스팅에 그대로 올려도 됩니다.
그때는 `.wasm` 의 MIME 형식이 `application/wasm` 인지만 확인하세요.

기본값은 이 컴퓨터에서만 열립니다. 같은 망의 다른 기기에서도 열려면
`chunjiin-serve -addr :8080` 처럼 주소를 비워 줍니다.

## 자판

```
  ㅣ     ㆍ      ㅡ          키 0  1  2
  ㄱㅋ   ㄴㄹ   ㄷㅌ         키 3  4  5
  ㅂㅍ   ㅅㅎ   ㅈㅊ         키 6  7  8
  . ,    ㅇㅁ   ? !          키 9  10 11
```

`모드` `←` `스페이스` `→` `줄바꿈` `지우기` 가 맨 아랫줄에 있습니다.

물리 키보드로는 한글 모드에서 숫자열이 대응합니다.

```
  1 2 3  =  ㅣ ㆍ ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
  4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
```

자세한 사용법은 [UsersGuide.md](UsersGuide.md) 를 보세요.

## 문서

| 문서 | 내용 |
|---|---|
| [UsersGuide.md](UsersGuide.md) | 자판, 모음 조합표, 단축키, 화면 설명 |
| [Build.md](Build.md) | 빌드 · 시험 · 설치용 파일 만들기 · 필요한 것들 |
| [Architecture.md](Architecture.md) | 파일 구성, 계층, C++ 판과의 관계, 시험 얼개 |

## 파일 구성

```
KoreanChunjiInGoV10/
├─ internal/engine/          조합 엔진 (순수 Go, 의존성 없음)
│  ├─ chunjiin.go            원본 chunjiin.c 이식 - 유니코드 조합, 겹받침
│  ├─ input.go               원본 input.c 이식 - 오토마타, 편집 API
│  └─ labels.go              라벨 · 모드 이름 · 상태줄
├─ test/                     엔진 시험과 시험 자료
│  ├─ cases.tsv              C++ 판에서 뽑아 온 430항목
│  ├─ cases_test.go          그 자료를 읽어 돌린다
│  └─ engine_test.go         자료로 뽑을 수 없는 시험
├─ internal/ui/              데스크톱 화면 (Fyne)
│  ├─ app.go                 창 조립 - 메뉴 · 툴바 · 키패드
│  ├─ theme.go               테마 4종
│  ├─ lang.go, help.go       한국어 · 영어 글자표
│  ├─ keybutton.go           직접 그리는 키패드 버튼
│  ├─ iconbutton.go          툴바 버튼 + 툴팁
│  ├─ editor.go              편집 영역 (엔진에 매인 입력칸, 아래아 화면 변환)
│  ├─ settings.go            설정 저장 (JSON)
│  ├─ layout.go              키패드 배치
│  ├─ ui_test.go             색표 · 설정 · 배치 · 커서 · 언어 시험
│  └─ app_smoke_test.go      창까지 만들어 보는 시험
├─ cmd/
│  ├─ chunjiin/              데스크톱 앱
│  ├─ chunjiin-setup/        설치 프로그램 (GUI)
│  ├─ chunjiin-wasm/         웹 판이 쓰는 엔진
│  ├─ chunjiin-serve/        웹 판 서버
│  ├─ gen-testcases/         C++ 시험 자료 뽑개
│  └─ testreport/            시험 결과를 구역별로 정리해 보여 준다
├─ web/                      웹 판 화면 (HTML · CSS · JS)
├─ assets/                   창 아이콘 (chunjiin.png · .ico)
│  └─ fonts/                 Noto Sans KR (데스크톱 앱만 품는다)
├─ scripts/                  package · build-web · embed-win-icon
├─ run.ps1 / run.bat / run.sh  바로 실행 (없으면 빌드한다)
├─ build.ps1  / build.sh     바로 실행할 실행 파일 만들기
└─ test.ps1   / test.sh      시험 실행
```

## 필요한 것

- **Go 1.24 이상**
- 데스크톱 판은 Fyne 이 OpenGL 을 쓰므로 C 컴파일러가 필요합니다.
  - Windows: MSYS2 / MinGW-w64 gcc
  - macOS: Xcode Command Line Tools
  - Linux: `gcc`, `libgl1-mesa-dev`, `xorg-dev`
- 웹 판은 C 컴파일러 없이 빌드됩니다.

자세한 것은 [Build.md](Build.md) 를 보세요.

## 라이선스

프로그램 자체는 별도 명시가 없습니다. 사내/개인 용도로 자유롭게 쓰세요.

내장한 글꼴 **Noto Sans KR** 은 SIL Open Font License 1.1 을 따릅니다
(`assets/fonts/OFL.txt`).
