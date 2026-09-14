# 빌드 · 시험 · 설치용 파일 만들기

## 필요한 것

### 모든 운영체제

**Rust 1.85 이상.** [rustup](https://rustup.rs) 으로 넣습니다.

`build` · `test` · `package` · `run` 스크립트가 rustc 가 없거나
1.85 보다 낮으면 **물어보지 않고** rustup 으로 넣거나 올립니다.
수동으로 넣을 때는 아래와 같습니다.

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Linux · macOS
winget install Rustlang.Rustup                                    # Windows
```

Go 판과 달리 **C 컴파일러(cgo)가 필요 없습니다.** 화면을 그리는 egui 가
순수 Rust 이기 때문입니다.

### Windows

- MSVC 링커가 필요합니다. Visual Studio Build Tools 의
  "C++를 사용한 데스크톱 개발" 을 넣으면 됩니다.
  (rustup 이 없으면 알려 주고 넣는 길을 안내합니다)

### Linux

창을 띄우고 클립보드를 쓰는 데 개발 파일이 필요합니다.

```sh
# 데비안 · 우분투
sudo apt install libx11-dev libxcursor-dev libxrandr-dev libxi-dev \
                 libgl1-mesa-dev libxkbcommon-dev

# 페도라
sudo dnf install libX11-devel libXcursor-devel libXrandr-devel \
                 libXi-devel mesa-libGL-devel libxkbcommon-devel
```

파일 고르기 창은 GTK 를 씁니다. 데스크톱 환경이 있으면 대개 이미 있습니다.

### macOS

- Xcode Command Line Tools (`xcode-select --install`)

### 웹 판

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
```

`scripts/build-web.*` 가 rustc · wasm32 대상 · wasm-bindgen 이 있는지
먼저 보고, 없으면 스스로 넣습니다.

## 빌드

### Windows

```powershell
.\run.ps1                # 바로 실행 (없으면 먼저 빌드한다)
.\run.bat                # 탐색기에서 더블클릭해도 된다
.\build.ps1              # 앱 · 서버 · 설치 프로그램을 만들어 루트에 둔다
.\build.ps1 -Run         # 만들고 바로 실행
.\build.ps1 -Web         # 웹 판까지 함께
.\build.ps1 -Dev         # 디버그 빌드 (빠르게 만들고 느리게 돈다)
```

### macOS · Linux

```sh
./run.sh
./build.sh
./build.sh --run
./build.sh --web
./build.sh --debug
```

### cargo 로 직접

```sh
cargo build --release -p chunjiin-app       # 데스크톱 앱
cargo run -p chunjiin-app                   # 만들고 바로 실행
cargo build --release -p chunjiin-serve     # 웹 판 서버
```

## 시험

```powershell
.\test.ps1              # 구역별 집계와 요약
.\test.ps1 -Detail      # 항목마다 한 줄씩
.\test.ps1 -Run 모음    # 이름이 맞는 것만
.\test.ps1 -Plain       # cargo test 를 그대로
.\test.bat              # 같은 시험 (cmd.exe)
.\test.bat detail
.\test.bat run 모음
```

```sh
./test.sh
./test.sh --detail
./test.sh --run 모음
./test.sh --plain
```

`cargo test --workspace` 로도 돌아갑니다. 정리해서 보여 주는 일만
`crates/testreport` 가 더 합니다.

```
════════════════════════════════════════════════════════════════
  Summary
────────────────────────────────────────────────────────────────
    전체 시험 항목    1100+ 개    (구역 N 개 · 묶음 M 개)
    통과              1100+ 개    (100%)
    실패                 0 개
    결과             PASS    모두 통과
════════════════════════════════════════════════════════════════
```

같은 내용이 저장소 루트 `test-summary.txt` 에도 남습니다. Windows 콘솔이
긴 출력을 자르더라도 전체 요약을 거기서 볼 수 있습니다.

### 시험 자료 다시 뽑기

조합 규칙의 기대값은 C++ 판에서 뽑아 옵니다. 원본이 고쳐졌으면 다시 뽑고
`crates/engine/tests/cases.rs` 의 `WANT_COUNT` 를 새 개수로 고칩니다.

```sh
cargo run -p gen-testcases
# ../KoreanChunJiInC++/tests/test_engine.c
#   -> test/cases.tsv
#   27 구역 430 항목
```

C++ 판이 없어도 시험은 그대로 돕니다. 뽑아낸 `test/cases.tsv` 를 저장소에
함께 두기 때문입니다.

## 웹 판

```powershell
.\scripts\build-web.ps1          # web\ 에 chunjiin_wasm 을 만든다
.\scripts\build-web.ps1 -Serve   # 만든 뒤 서버까지 띄운다
```

```sh
./scripts/build-web.sh
./scripts/build-web.sh --serve
```

만들어지는 것은 두 개입니다.

| 파일 | 무엇 |
|---|---|
| `web/chunjiin_wasm_bg.wasm` | 조합 엔진 (약 44 KB) |
| `web/chunjiin_wasm.js` | 자바스크립트 이음새 (wasm-bindgen 이 만든다) |

`web/` 의 나머지(`index.html` · `style.css` · `app.js` · `chunjiin.png`)는
저장소에 그대로 있습니다.

### 띄우기

```sh
./chunjiin-serve                       # http://localhost:8080
./chunjiin-serve -addr :8080           # 같은 망의 다른 기기에도 연다
./chunjiin-serve -addr 127.0.0.1:9000  # 다른 자리에서
./chunjiin-serve -dir web              # 품고 있는 것 대신 그 폴더를 쓴다
```

`chunjiin-serve` 는 `web/` 전체를 품고 있으므로 그 파일 하나만 옮겨도 됩니다.
정적 호스팅(GitHub Pages 등)에 `web/` 을 그대로 올려도 됩니다. 그때는
`.wasm` 의 MIME 형식이 `application/wasm` 인지만 확인하세요.

## 설치용 파일 만들기

```powershell
.\package.bat                      # 시험 -> 웹 -> 앱 -> 설치 프로그램 -> 묶음
.\package.bat -skiptest
.\package.bat -skipweb
.\scripts\package.ps1              # 같은 일 (PowerShell)
.\scripts\package.ps1 -SkipTest
.\scripts\package.ps1 -SkipWeb
```

```sh
./scripts/package.sh
./scripts/package.sh --skip-test
./scripts/package.sh --skip-web
```

만들어지는 것은 저장소 루트에 놓입니다.

| 운영체제 | 만들어지는 것 |
|---|---|
| Windows | `chunjiin.exe` · `chunjiin-setup.exe` · `chunjiin-serve.exe` · `chunjiin-1.0-windows-x64.zip` |
| Linux | `chunjiin` · `chunjiin-setup` · `chunjiin-serve` · `chunjiin-1.0-linux-amd64.tar.gz` |
| macOS | `chunjiin` · `chunjiin-setup` · `chunjiin-serve` · `Chunjiin.app` · `chunjiin-1.0-macos-arm64.dmg` |

Inno Setup, NSIS, dpkg 같은 다른 도구는 필요 없습니다. 설치 프로그램 자체가
Rust 로 짜여 있고, 빌드할 때 앱 실행 파일을 자기 안에 품습니다.

Windows 탐색기·작업 표시줄 아이콘은 `assets/chunjiin.ico` 를 빌드할 때
실행 파일 리소스에 넣습니다. 창 아이콘(PNG)과는 별개입니다.

### 품는 절차

```
1. cargo build --release -p chunjiin-app
2. chunjiin(.exe)  ->  crates/setup/payload/
3. cargo build --release -p chunjiin-setup     (build.rs 가 payload 를 품는다)
4. crates/setup/payload/ 를 다시 비운다
```

그래서 저장소에 실행 파일이 남지 않습니다. 4번은 실패해도 반드시 돕니다
(PowerShell 은 `finally`, sh 는 `trap`).

## 다른 운영체제용으로 만들기

각 운영체제에서 만드는 것이 가장 확실합니다. 화면 라이브러리가 그 운영체제의
창 시스템과 이어져야 하기 때문입니다.

다만 **코드가 그 운영체제에서 컴파일되는지**는 여기서도 볼 수 있습니다.
`cargo check` 는 이어 붙이기(링크)를 하지 않으므로 다른 대상의 코드 경로를
훑어 볼 수 있습니다.

```sh
rustup target add x86_64-unknown-linux-gnu aarch64-apple-darwin
cargo check --target x86_64-unknown-linux-gnu -p chunjiin-app -p chunjiin-setup
cargo check --target aarch64-apple-darwin     -p chunjiin-app -p chunjiin-setup
```

설치 프로그램은 운영체제마다 코드가 갈리므로(`install.rs`), 이 두 줄이
Windows 에서 개발하는 동안 Linux · macOS 쪽이 망가지지 않았는지 지켜 줍니다.

## 빌드 결과의 크기

| 파일 | 크기 | 왜 |
|---|---|---|
| `chunjiin.exe` | 약 17 MB | 내장 글꼴 두 벌이 12 MB 다 |
| `chunjiin-setup.exe` | 약 34 MB | 위의 앱을 통째로 품는다 |
| `chunjiin-serve.exe` | 약 0.3 MB | 웹 판(약 100 KB)을 품는다 |
| `chunjiin_wasm_bg.wasm` | 약 44 KB | 조합 엔진만 들어 있다 |

글꼴을 빼면 앱이 5 MB 남짓입니다. 그래도 넣는 까닭은, 넣지 않으면 한글이
없는 시스템에서 글자가 네모로 나오기 때문입니다. 웹 판은 시스템 글꼴을
쓰므로 글꼴을 내려받지 않습니다.

## 자주 겪는 일

**`FontFamily::Name("chunjiin-bold") is not bound to any fonts`**
글꼴을 등록하기 전에 화면을 그렸습니다. 앱은 반드시 `App::new_in(ctx)` 로
만드세요. 그 안에서 글꼴을 등록합니다.

**웹 판이 "엔진을 불러오지 못했습니다" 라고 합니다**
`scripts/build-web` 을 아직 돌리지 않았거나, `.wasm` 이 `web/` 에 없습니다.
서버가 `.wasm` 을 `application/wasm` 으로 주는지도 보세요.

**`chunjiin-serve` 가 "품고 있는 웹 판이 없습니다" 라고 합니다**
웹 판을 만들기 **전에** 서버를 빌드했습니다. `scripts/build-web` 을 먼저
돌리고 서버를 다시 빌드하거나, `-dir web` 으로 폴더에서 띄우세요.

**PowerShell 스크립트가 한글에서 깨집니다**
`.ps1` 파일은 반드시 BOM 이 있는 UTF-8 이어야 합니다. Windows PowerShell 5.1
은 BOM 이 없으면 ANSI 로 읽어서 한글이 깨지고 파서까지 무너집니다.
이 저장소의 `.ps1` 은 모두 BOM 을 달고 있습니다.

**Linux 에서 링크가 실패합니다**
위의 개발 파일을 넣으세요. `libxkbcommon-dev` 를 빠뜨리는 일이 잦습니다.
