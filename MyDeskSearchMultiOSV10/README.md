# MyDeskSearch

Linux, macOS, Windows에서 동작하는 파일·폴더 이름 검색 위젯입니다. Rust로 작성되어 있으며, 검색 인덱스는 SQLite(FTS5 트라이그램)에 저장됩니다.

화면 위에 테두리 없는 검색창이 떠 있고, 작업 표시줄 대신 시스템 트레이에 상주합니다. 검색 대상은 **파일·폴더 이름**입니다. 전체 경로는 검색하지 않습니다.

## 기능

| 기능 | 설명 |
|------|------|
| 인덱싱 범위 | 설정에서 고른 드라이브·볼륨·폴더. 레거시 제외 폴더는 계속 건너뜀 |
| 인덱싱 중 검색 | 첫 인덱스는 구축 중인 DB를, 재인덱싱은 기존 `index.db`를 사용 |
| 이중 DB | 전체 인덱싱은 `index.building.db`에 기록하고, 모든 루트가 성공하면 `index.db`로 교체 |
| 멈춤·초기화 | 멈춤은 building DB를 남김. 인덱싱 버튼은 building을 지우고 처음부터 시작. 초기화는 DB 삭제 |
| 종료 후 재시작 | 끝나지 않은 building DB는 다음 실행에서 삭제되고, 중단되었다면 전체 재스캔 |
| 실패 재시도 | 루트 스캔 실패는 같은 패스에서 최대 3회. 그래도 실패하면 인덱스를 교체하지 않고 8초 후 전체 재시도 |
| 검색 문법 | 연속 포함, `*` AND, `+` OR, 와일드카드, 정규식. 공백으로만 이루어진 검색어는 무시 |
| 정렬 | 일치도, 이름, 경로, 폴더 먼저, 파일 먼저, 수정일 |
| 실시간 갱신 | 인덱싱이 끝난 live DB에 파일 생성·삭제·변경을 반영. 예약 재인덱싱(기본 8시간, 끄기 가능) |
| 다국어 | UI는 한국어/English. 파일 이름은 Unicode NFC로 비교 |
| 단일 인스턴스 | 이미 실행 중이면 기존 창을 다시 표시 |
| 로그인 시 실행 | Windows 레지스트리 Run, Linux autostart, macOS LaunchAgent |

## 빌드 및 테스트

요구 사항: Rust 1.89 이상.

저장소 루트에서 실행합니다.

```bash
# Windows
powershell -ExecutionPolicy Bypass -File .\test.ps1
powershell -ExecutionPolicy Bypass -File .\build.ps1
powershell -ExecutionPolicy Bypass -File .\clean.ps1

# Linux, macOS
./test.sh
./build.sh
./clean.sh
```

스크립트 파일은 `scripts\build.ps1`, `scripts\test.ps1`, `scripts\clean.ps1`과 같은 이름의 `.cmd`, `.sh`입니다. 루트의 `build.cmd`, `test.cmd`, `clean.cmd`도 같은 동작입니다. `clean`은 Cargo 빌드 결과, `dist/`, 루트로 복사된 설치 파일을 지웁니다. 테스트 결과는 항목마다 한 줄로 시간과 Pass/Fail을 보여 주고, 마지막에 전체 요약을 출력합니다. 설치 파일 없이 바로 실행하려면 `cargo run -p mydesksearch`를 사용합니다.

## 설치 파일

각 OS에서 해당 빌드 스크립트를 실행하면 설치 파일이 `dist/`에 만들어지고, 같은 파일이 저장소 루트에도 복사됩니다.

| OS | 빌드 | 설치 파일 |
|----|------|-----------|
| Windows | `.\build.ps1` 또는 `build.cmd` | `mydesksearch<version>_setup.exe`. 더블클릭하면 설치가 시작됩니다. 같은 내용의 zip도 만들어집니다. |
| Linux | `./build.sh` | `MyDeskSearch-<version>-linux-<arch>.tar.gz`. `dpkg-deb`가 있으면 `.deb` |
| macOS | `./build.sh` | `MyDeskSearch-<version>-macos-<arch>.tar.gz`. `pkgbuild`가 있으면 `.pkg` |

Windows에서는 `mydesksearch<version>_setup.exe`를 실행합니다. zip을 쓰는 경우에는 압축을 푼 뒤 `install.cmd`로 설치합니다. Linux·macOS tar는 압축을 푼 뒤 `./install.sh`를 실행합니다. `.deb`는 `sudo dpkg -i`, `.pkg`는 설치 프로그램으로 엽니다.

설치할 때 **한국어** 또는 **English**를 고릅니다. 같은 언어는 프로그램 설정의 **언어**에서도 바꿀 수 있습니다. 이미 설치되어 있으면 프로그램 파일을 지운 다음 새로 설치합니다. 설정과 검색 인덱스를 지울지는 따로 물어 보며, 유지하면 앱에 저장한 언어도 그대로 남습니다.

`.\test.ps1`(Linux·macOS는 `./test.sh`)는 검색 문법, 정렬, SQLite 검색(최대 2,000건), 이중 DB 교체, 스캔 재시도, 설정 마이그레이션, 포함 범위, 다국어 키, 단일 인스턴스, 자동 실행 파일 내용, 설치 스크립트를 검증합니다.

## 데이터 위치

| OS | 설정·인덱스 |
|----|-------------|
| Windows | `%APPDATA%\MyDeskSearch` |
| macOS | `~/Library/Application Support/MyDeskSearch` |
| Linux | `$XDG_CONFIG_HOME/MyDeskSearch` 또는 `~/.config/MyDeskSearch` |

`DESKSEARCH_CONFIG_DIR`를 지정하면 그 아래 `MyDeskSearch` 폴더를 사용합니다.

| 파일 | 용도 |
|------|------|
| `settings.json` | 창, 색, 언어, 검색 옵션, 인덱싱 범위. 기존 Windows 설정의 PascalCase JSON을 읽음 |
| `index.db` | 완료된 검색 인덱스 |
| `index.building.db` | 진행 중인 전체 인덱싱 |

## 검색 문법

연산자 `*`와 `+`는 **앞뒤에 공백**이 있을 때만 AND/OR입니다. `foo+bar`는 일반 문자입니다.

| 검색어 | 의미 |
|--------|------|
| `report` | 이름에 `report`가 연속으로 포함 |
| `budget * 2024` | `budget`과 `2024`를 모두 포함 |
| `doc + pdf` | `doc` 또는 `pdf` |
| `budget * 2024 + draft` | (`budget` AND `2024`) OR `draft` |
| `*.pdf` | 이름이 `.pdf`로 끝남 (정규식 끔) |
| `file?.txt` | `file` + 한 글자 + `.txt` |
| `\.pdf$` | 정규식을 켠 경우, 이름이 `.pdf`로 끝남 |

탐색기에서 복사한 경로는, 와일드카드가 없으면 마지막 이름만 검색합니다. 잘못된 정규식은 결과 없음으로 처리합니다.

정렬 기본값은 **일치도**입니다. 완전 일치 100, 접두어 80, 포함 60이고, 같으면 이름순입니다.

## 프로젝트

```
Cargo.toml
crates/desksearch-core/    검색·인덱스·설정·플랫폼 (테스트 포함)
crates/desksearch/         MyDeskSearch 창, 설정, 트레이 (`mydesksearch`)
```

자세한 구조는 [Architecture.md](Architecture.md), 사용 방법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.
