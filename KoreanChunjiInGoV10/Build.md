# 빌드 · 시험 · 설치용 파일 만들기

## 한눈에

| 하고 싶은 것 | Windows | macOS · Linux |
|---|---|---|
| 빌드해서 바로 실행 | `.\build.ps1 -Run` | `./build.sh --run` |
| 시험 돌리기 | `.\test.ps1` | `./test.sh` |
| 설치용 파일 만들기 | `.\scripts\package.ps1` | `./scripts/package.sh` |
| 웹 판 만들고 띄우기 | `.\scripts\build-web.ps1 -Serve` | `./scripts/build-web.sh --serve` |

만들어진 것은 모두 저장소 루트에 놓입니다.

## 필요한 것

### 모두 공통

**Go 1.24 이상**

```sh
go version
```

없으면 <https://go.dev/dl/> 에서 받으세요.

### 데스크톱 판

화면을 그리는 Fyne 이 OpenGL 을 쓰므로 **C 컴파일러**가 필요합니다.
웹 판만 만들 거라면 아래 것들은 없어도 됩니다.

#### Windows — MSYS2 / MinGW-w64

```powershell
winget install MSYS2.MSYS2
```

설치한 뒤 MSYS2 창에서:

```sh
pacman -S mingw-w64-ucrt-x86_64-gcc
```

그리고 `C:\msys64\ucrt64\bin` 을 `PATH` 에 넣습니다.

```powershell
gcc --version      # 나오면 준비 끝
```

#### macOS — Xcode Command Line Tools

```sh
xcode-select --install
```

#### Linux

```sh
# 데비안 · 우분투
sudo apt install gcc libgl1-mesa-dev xorg-dev

# 페도라
sudo dnf install gcc libX11-devel libXcursor-devel libXrandr-devel \
                 libXinerama-devel mesa-libGL-devel libXi-devel libXxf86vm-devel

# 아치
sudo pacman -S gcc libx11 libxcursor libxrandr libxinerama mesa libxi
```

## 빌드

### 바로 실행할 실행 파일

```powershell
.\build.ps1               # chunjiin.exe 를 만든다
.\build.ps1 -Run          # 만들고 곧바로 실행한다
.\build.ps1 -Web          # 웹 판까지 함께 만든다
```

```sh
./build.sh                # chunjiin 을 만든다
./build.sh --run
./build.sh --web
```

Windows 판은 `-H windowsgui` 로 빌드합니다. 그래야 창을 띄울 때
검은 콘솔이 따라 뜨지 않습니다.

### 손으로 빌드하기

```sh
go build -o chunjiin ./cmd/chunjiin                       # Linux · macOS
go build -ldflags "-H windowsgui" -o chunjiin.exe ./cmd/chunjiin   # Windows
```

판 번호를 박으려면:

```sh
go build -ldflags "-X github.com/knix008/chunjiin/internal/ui.Version=1.1" ...
```

## 시험

```powershell
.\test.ps1                # 구역별 집계와 요약
.\test.ps1 -Detail        # 항목마다 무엇을 보는지까지
.\test.ps1 -Cover         # 덮은 정도까지
.\test.ps1 -Run 낱말      # 이름이 맞는 것만
```

```sh
./test.sh
./test.sh -v
./test.sh --cover
./test.sh --run 낱말
```

시험을 돌리면 구역마다 몇 개가 통과했는지와 전체 요약이 나옵니다.
C++ 판 `test_engine` 이 보여 주던 것과 같은 모양입니다.

```
 [ 조합 엔진 · C++ 원본에서 뽑아 온 자료 ]
   모음 전이표 전수               72/72    통과
   모음 백스페이스                23/23    통과
   ...
   소계  (구역 28 개)            431/431
────────────────────────────────────────────────────────
   전체 시험 항목    722 개   (구역 83 개)
   통과              722 개   (100%)
   실패                0 개
   결과    PASS    722개 항목 모두 통과
```

`-Detail`(`-v`) 을 주면 항목마다 **무엇을 눌러 무엇이 나와야 하는지**까지
한 줄씩 나옵니다. 이름만으로는 그 항목이 무엇을 보는지 알기 어렵기 때문입니다.

```
[편집·커서]
  [PASS] 띄어쓰기           확정  301_401 -> 가 나
  [PASS] 커서왼쪽           커서  301401[ -> 가나 @1
  [PASS] 확정반복           확정  301!!! -> 가
```

실패하면 어느 구역의 어느 항목이 왜 틀렸는지 따로 모아 보여 줍니다.

```
 실패한 항목
   TestCppSuite/겹받침 11자/ㄶ 갆
     cases_test.go:217: "301477" -> "간ㅎ", 기대: "갆"
```

정리해서 보여 주는 일은 `cmd/testreport` 가 합니다.
`go test` 를 그냥 쓰고 싶으면 그것도 됩니다.

```sh
go test ./...
go test -v ./test/                # 조합 규칙만 자세히
```

전부 722항목입니다.

| 묶음 | 어디 | 무엇을 보는가 |
|---|---|---|
| 뽑아 온 자료 431항목 | `test/cases_test.go` | 모음 전이표, 받침, 연음, 겹받침, 편집, 모드 … |
| Go 쪽 엔진 시험 157항목 | `test/engine_test.go` | 영문 26자 전수, 라벨-입력 일치, 원본 함수, 경계 |
| 화면 계층 93항목 | `internal/ui/ui_test.go` | 색표, 설정, 배치, 커서 변환, 언어, 글리프 |
| 창까지 만들어 보는 시험 25항목 | `internal/ui/app_smoke_test.go` | 키 배선, 단추, 모드·테마·언어, 딸린 창 |
| 보고기 자체 | `cmd/testreport/report_test.go` | 세는 방식, 묶는 방식, 글자 폭 |

화면 시험이 `test/` 가 아니라 `internal/ui/` 에 있는 것은 Go 의 규칙 때문이다.
패키지 안의 비공개 이름은 그 패키지의 시험만 볼 수 있다. 엔진은 공개 API
만으로 다 볼 수 있어서 `test/` 로 모았다.

### 시험 자료를 다시 뽑기

조합 규칙의 기대값은 C++ 판 `tests/test_engine.c` 에서 뽑아 옵니다.
원본이 고쳐졌으면 다시 뽑으세요.

```sh
go generate ./test/
```

또는 직접:

```sh
go run ./cmd/gen-testcases
go run ./cmd/gen-testcases -src ../KoreanChunJiInC++/tests/test_engine.c \
                           -out test/cases.tsv
```

뽑아낸 항목 수가 바뀌면 `test/cases_test.go` 의 `wantCount` 도 고칩니다.
그 값이 있어야 뽑개가 조용히 망가졌을 때(항목이 0개가 되었을 때)
시험이 통과해 버리는 일을 막을 수 있습니다.

## 설치용 파일 만들기

```powershell
.\scripts\package.ps1
.\scripts\package.ps1 -SkipTest        # 시험을 건너뛴다
.\scripts\package.ps1 -Version 1.1
```

```sh
./scripts/package.sh
./scripts/package.sh --skip-test
./scripts/package.sh --version=1.1
```

### 하는 일

1. 시험을 돌린다 (실패하면 거기서 멈춘다)
2. 앱을 빌드한다 → `chunjiin.exe` / `chunjiin`
3. 그 실행 파일을 `cmd/chunjiin-setup/payload/` 에 넣는다
4. 설치 프로그램을 빌드한다 → `chunjiin-setup.exe` / `chunjiin-setup`
5. `payload/` 를 비운다 (저장소에 큰 파일이 남지 않게)
6. Linux 는 `.tar.gz`, macOS 는 `.app` 과 `.dmg` 를 만든다

Inno Setup, NSIS, dpkg, rpm 같은 다른 도구는 필요 없습니다.
설치 프로그램 자체가 Go 로 짜인 GUI 프로그램이고, 앱 실행 파일을
`go:embed` 로 자기 안에 품습니다.

### 만들어지는 것

| 운영체제 | 파일 | 크기 |
|---|---|---|
| Windows | `chunjiin.exe` | 약 35 MB |
| Windows | `chunjiin-setup.exe` | 약 71 MB |
| Linux | `chunjiin`, `chunjiin-setup`, `chunjiin-1.0-linux-amd64.tar.gz` | |
| macOS | `Chunjiin.app`, `chunjiin-1.0-macos-arm64.dmg` | |

실행 파일이 큰 것은 한글 글꼴(Noto Sans KR 두 벌, 약 12 MB)과 Fyne 을
안에 품기 때문입니다. 그 대신 받는 쪽에서 따로 깔 것이 없습니다.

## 웹 판

```powershell
.\scripts\build-web.ps1           # web\chunjiin.wasm 을 만든다
.\scripts\build-web.ps1 -Serve    # 만들고 서버까지 띄운다
```

```sh
./scripts/build-web.sh
./scripts/build-web.sh --serve
```

### 하는 일

1. 엔진을 WASM 으로 빌드한다 → `web/chunjiin.wasm` (약 1.8 MB)
2. Go 가 함께 주는 `wasm_exec.js` 를 `web/` 에 복사한다
3. `web/` 전체를 품은 서버를 빌드한다 → `chunjiin-serve`

C 컴파일러가 필요 없습니다. `GOOS=js GOARCH=wasm` 빌드는 cgo 를 쓰지 않습니다.

### 띄우기

```sh
./chunjiin-serve                      # http://localhost:8080
./chunjiin-serve -addr 127.0.0.1:9000 # 다른 자리
./chunjiin-serve -addr :8080          # 같은 망의 다른 기기에도 연다
./chunjiin-serve -dir web             # 품은 것 대신 web/ 폴더를 쓴다 (개발용)
```

기본값은 이 컴퓨터에서만 열립니다. 그래야 Windows 방화벽이 실행할 때마다
허용 여부를 묻지 않습니다.

개발 중에는 `-dir web` 이 편합니다. HTML · CSS · JS 를 고치고 새로 고치기만
하면 됩니다(서버를 다시 빌드하지 않아도 됩니다).

### 정적 호스팅에 올리기

`web/` 폴더를 그대로 올리면 됩니다(GitHub Pages, S3, Netlify 등).
서버 쪽 코드는 필요 없습니다.

한 가지만 확인하세요. **`.wasm` 의 MIME 형식이 `application/wasm` 이어야**
브라우저가 스트리밍으로 받습니다. 그렇지 않아도 `app.js` 가 통째로 받아
쓰는 길로 물러나므로 동작은 하지만, 켜지는 데 시간이 더 걸립니다.

## 글꼴 다시 만들기

`assets/fonts/` 의 두 파일은 Noto Sans KR 가변 글꼴에서 뽑은 것입니다.
다시 만들 일이 있으면:

```sh
pip install fonttools
curl -L -o "NotoSansKR[wght].ttf" \
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"

python -m fontTools.varLib.instancer \
  -o assets/fonts/NotoSansKR-Regular.ttf "NotoSansKR[wght].ttf" wght=400
python -m fontTools.varLib.instancer \
  -o assets/fonts/NotoSansKR-Bold.ttf    "NotoSansKR[wght].ttf" wght=700
```

가변 글꼴을 그대로 넣으면 안 됩니다. `wght` 축의 **기본값이 100(Thin)** 이라
글자가 아주 가늘게, 흐릿하게 나옵니다.

## 다른 운영체제용으로 빌드하기

데스크톱 판은 cgo 를 쓰므로 **그 운영체제에서 빌드해야 합니다.**
Windows 에서 Linux 실행 파일을 바로 만들 수는 없습니다.
각 기기에서 `build.sh` / `package.sh` 를 돌리세요.

웹 판은 어디서 만들어도 같습니다.

## 자주 겪는 일

**`gcc: executable file not found`**
→ C 컴파일러가 `PATH` 에 없습니다. 위 "필요한 것" 을 보세요.

**Linux 에서 `GL/gl.h: No such file or directory`**
→ OpenGL 개발 파일이 없습니다. `libgl1-mesa-dev` 와 `xorg-dev` 를 까세요.

**`go: cannot find module`**
→ `go mod download` 를 한 번 돌리세요.

**실행 파일을 덮어쓸 수 없다고 나옴**
→ 그 프로그램이 돌고 있습니다. 먼저 닫으세요.

**설치 프로그램이 "설치할 실행 파일이 들어 있지 않습니다" 라고 함**
→ `go build ./cmd/chunjiin-setup` 을 직접 돌렸기 때문입니다.
   `scripts/package.*` 를 쓰세요. 그 스크립트가 앱을 먼저 빌드해
   `payload/` 에 넣습니다.

**웹 판이 "엔진을 불러오지 못했습니다" 라고 함**
→ `chunjiin.wasm` 이 `index.html` 과 같은 폴더에 있는지 보세요.
   `file://` 로 직접 열면 안 됩니다. 서버로 띄워야 합니다.
