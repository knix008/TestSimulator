# 빌드 · 시험 · 배포

## 준비물

- **JDK 17 이상** (`java -version` 으로 확인)
- 그 밖에는 없습니다. 내려받을 의존성이 하나도 없습니다.

없으면 이렇게 깝니다.

| 운영체제 | |
|---|---|
| Windows | `winget install EclipseAdoptium.Temurin.21.JDK` |
| macOS | `brew install --cask temurin` |
| Ubuntu · Debian | `sudo apt install openjdk-21-jdk` |
| Fedora · RHEL | `sudo dnf install java-21-openjdk-devel` |
| 그 밖 | <https://adoptium.net> |

`PATH` 에 없어도 됩니다. 스크립트가 `JAVA_HOME` 과 흔한 설치 자리를 차례로 찾아봅니다.
찾지 못하면 이렇게 알려 주세요.

```bash
JAVA_HOME=/path/to/jdk ./build.sh
```

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"; .\build.ps1
```

## 스크립트

같은 일을 하는 것이 둘씩 있습니다. `.sh` 는 Linux · macOS 용이고 Windows 의
Git Bash · WSL 에서도 돕니다. `.ps1` 은 Windows PowerShell 용입니다.

| Linux · macOS | Windows | 하는 일 |
|---|---|---|
| `./build.sh` | `.\build.ps1` | `out/classes` 에 컴파일하고 `dist/Chunjiin.jar` 를 만든다 |
| `./run.sh` | `.\run.ps1` | 빌드하고 창을 띄운다 |
| `./run.sh --no-build` | `.\run.ps1 -NoBuild` | 이미 만들어 둔 JAR 을 그대로 띄운다 |
| `./test.sh` | `.\test.ps1` | 엔진 회귀 시험 584항목 |
| `./test.sh -q` | `.\test.ps1 -q` | 실패한 항목과 요약만 |
| `./test.sh --app` | `.\test.ps1 -App` | 엔진 시험 뒤에 화면 시험 26항목 |
| `./test.sh --only-app` | `.\test.ps1 -OnlyApp` | 화면 시험만 |
| `./test.sh --shots` | `.\test.ps1 -Shots` | `docs/images` 에 테마 4종 그림을 다시 찍는다 |
| `./package.sh` | `.\package.ps1` | 설치 파일을 만들어 `release/` 와 루트에 둔다 |
| `./package.sh --portable` | `.\package.ps1 -Portable` | 설치 없이 풀어 쓰는 압축본 |
| `./package.sh --no-wix` | `.\package.ps1 -NoWix` | WiX 가 없어도 받아 오지 않는다 (그냥 멈춘다) |
| `./clean.sh` | `.\clean.ps1` | `out/` 과 `dist/` 를 지운다 |

`run` 은 **언제나 먼저 다시 빌드합니다.** 고친 코드가 반영되지 않은 예전 JAR 이
도는 일이 없어야 하기 때문입니다.

## 손으로 빌드하기

스크립트를 쓰지 않아도 됩니다.

```bash
javac -encoding UTF-8 -d out/classes $(find src/main/java -name '*.java')
cp -r src/main/resources/. out/classes/
java -cp out/classes com.shkwon.chunjiin.Main
```

시험만 따로:

```bash
javac -encoding UTF-8 -d out/test-classes $(find src/main/java src/test/java -name '*.java')
java -cp out/test-classes com.shkwon.chunjiin.EngineTest
```

## 배포판 만들기

```bash
./package.sh                # 운영체제 기본 (Linux: deb, macOS: dmg, Windows: exe)
./package.sh --type rpm     # 종류를 직접 고른다
./package.sh --portable     # 설치 없이 풀어 쓰는 압축본
```

```powershell
.\package.ps1               # Chunjiin-1.0.0.exe
.\package.ps1 -Type msi     # Chunjiin-1.0.0.msi
.\package.ps1 -Portable     # Chunjiin-1.0.0-win-portable.zip
```

만들어진 것은 `release/` 에 놓이고, 손 닿는 자리에 두려고 **프로젝트 루트로도 복사**합니다.
루트 사본은 `.gitignore` 가 걸러 내므로 저장소에는 들어가지 않습니다.

### 받는 쪽에 자바가 없어도 됩니다

`package` 스크립트는 세 단계로 만듭니다.

1. `jdeps` 로 이 프로그램이 실제로 쓰는 모듈을 알아냅니다
   (지금은 `java.base,java.desktop,java.prefs`)
2. `jlink` 가 그 모듈만 담은 45MB 남짓한 런타임을 만듭니다
3. `jpackage` 가 그 런타임을 **설치 파일 안에** 넣습니다

설치 중에 무엇을 더 내려받지 않고, 이미 깔린 자바가 있어도 건드리지 않습니다.
버전이 서로 어긋날 일이 없습니다.

만들어진 크기는 이 정도입니다.

| 무엇 | 크기 |
|---|---|
| `dist/Chunjiin.jar` (런타임 없음) | 약 100 KB |
| `out/runtime` (jlink 런타임) | 약 46 MB |
| `Chunjiin-1.0.0.exe` (설치 프로그램) | 약 33 MB |
| `Chunjiin-1.0.0-win-portable.zip` | 약 32 MB |

### 운영체제별로 더 필요한 것

`jpackage` 는 운영체제의 패키징 도구를 부릅니다.

| 만들 것 | 더 필요한 것 |
|---|---|
| Windows `exe` · `msi` | **WiX Toolset 3.14** — 없으면 스크립트가 알아서 받습니다 |
| Windows `app-image` | 없음 |
| macOS `dmg` · `pkg` | 없음 (서명하려면 개발자 인증서) |
| Linux `deb` | `fakeroot`, `binutils` — `sudo apt install fakeroot binutils` |
| Linux `rpm` | `rpm-build` — `sudo dnf install rpm-build` |
| Linux `app-image` | 없음 |

#### WiX 는 없으면 알아서 받습니다

Windows 에서 `exe`/`msi` 를 만들 때 WiX 가 없으면, 스크립트가 공식 바이너리 묶음
(`wix314-binaries.zip`, 약 40MB)을 받아 `tools/wix314` 에 풀고 **그대로 이어서 빌드**합니다.
관리자 권한도, .NET Framework 3.5 도 필요 없습니다. 시스템에는 아무것도 깔지 않고
그 폴더 안의 것만 씁니다.

```powershell
.\package.ps1            # WiX 가 없으면 받아서 이어 간다
.\package.ps1 -NoWix     # 받아 오지 않는다 (없으면 멈춘다)
```

```bash
./package.sh             # 같다
./package.sh --no-wix
```

이미 시스템에 깔린 WiX 가 있으면 그것을 먼저 씁니다
(`PATH`, `%ProgramFiles(x86)%\WiX Toolset v3.14`, `%WIX%` 순으로 찾습니다).

인터넷에 닿지 않는 자리라면 다른 기계에서
<https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip>
를 받아 `tools/wix314` 에 풀어 놓으면 그대로 씁니다.
`tools/` 는 `.gitignore` 가 걸러 내므로 저장소에는 들어가지 않습니다.

시스템에 깔고 싶으면 `winget install --id WiXToolset.WiXToolset` 을 쓰되,
그 쪽은 관리자 권한과 .NET Framework 3.5 를 요구합니다.

`jpackage` 는 **자기 운영체제용만** 만듭니다.
Windows 배포판은 Windows 에서, macOS 배포판은 macOS 에서 만드세요.

## 자주 걸리는 것

**`JDK 를 찾지 못했습니다`**
JDK 가 아니라 JRE 만 깔려 있으면 `javac` 가 없습니다. JDK 를 까세요.

**PowerShell 에서 한글이 깨진다**
`.ps1` 파일에 UTF-8 BOM 이 있어야 PowerShell 5.1 이 한글을 제대로 읽습니다.
이 저장소의 `.ps1` 은 모두 BOM 을 달고 있습니다. 편집기가 BOM 을 떼지 않게 하세요.

**`javac: error: Invalid filename: ?C:\...`**
`@목록파일` 맨 앞에 BOM 이 붙은 것입니다. PowerShell 의 `Out-File -Encoding utf8` 은
BOM 을 붙이므로, 이 저장소의 스크립트는 BOM 없이 직접 씁니다.

**WiX 를 받지 못한다**
사내망 프록시나 오프라인 자리에서 납니다. 다른 기계에서
`wix314-binaries.zip` 을 받아 `tools/wix314` 에 풀어 놓으면 그대로 씁니다.
설치 프로그램이 꼭 필요하지 않다면 `--portable` 로 압축본만 만들어도 됩니다.

**`light.exe ... exited with 311`**
MSI 문자열에 한글이 들어갔을 때 납니다. 설치 프로그램이 쓰는 이름
(`--description`, `--win-menu-group`)은 ASCII 여야 합니다. 창 제목과 화면은 그대로 한글입니다.

**압축할 때 `being used by another process`**
방금 만든 런타임을 바이러스 검사기가 아직 붙잡고 있는 것입니다.
`package.ps1` 이 세 번까지 다시 해 봅니다.

**시험을 파일로 넘기면 색이 안 나온다**
일부러 그렇습니다. 콘솔일 때만 색을 씁니다. `--color` 로 억지로 켤 수 있고,
`--no-color` 나 `NO_COLOR` 환경 변수로 끌 수 있습니다.
