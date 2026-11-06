# MyZipMaster 구조

```
core/          Rust 엔진 (zipmaster-core). 화면도 OS도 모릅니다.
  src/vfs.rs        저장소 추상화: OsFs(실제 디스크), MemFs(메모리)
  src/volumes.rs    분할: SplitWriter, ConcatReader, 조각 찾기(discover)
  src/detect.rs     내용으로 형식 판별
  src/ops.rs        list / extract / test / create / modify / convert / repair
  src/tools.rs      체크섬, 파일 분할·합치기, 벤치마크
  src/formats/      zip(직접 구현), sevenz, rar, tarfmt, readonly(cab, iso)
  src/bin/sfx.rs    자동 풀림 파일 앞에 붙는 프로그램
wasm-engine/   엔진 + MemFs를 브라우저로 (wasm-bindgen)
src-tauri/     데스크톱 셸: 작업 스레드, 폴더 읽기, 창
src/           React 화면 (데스크톱과 웹 공용)
  lib/host.js       두 실행 환경의 차이를 여기서 흡수
  lib/format.js     형식 표와 규칙 (React 없음, 단위 시험 대상)
  lib/tree.js       평평한 항목 목록 → 폴더 트리
scripts/       빌드 도구
test/          시험
```

## 한 엔진, 두 저장소

데스크톱과 웹은 같은 Rust 코드를 실행합니다. 차이는 `Vfs` 구현 하나입니다. 모든 코덱이 순수 Rust여야 wasm32로 컴파일되므로 C 라이브러리를 쓰지 않습니다(Zstandard는 `ruzstd`라서 빠른 수준만 있습니다).

두 프런트엔드 모두 `dispatch_envelope(ctx, "연산", json)`로 들어옵니다. 결과는 `{ok, result}` 또는 `{ok:false, code, detail}`이고, 화면은 `code`로 언어별 문구를 고릅니다.

디코더가 악성 파일에 패닉해도 `catch_unwind`가 그 작업의 오류로 바꿉니다(그래서 릴리스 프로필에 `panic = "abort"`를 쓰지 않습니다). 웹에서는 worker가 죽고 다음 작업에서 다시 만들어집니다.

## 분할

`SplitWriter`는 여러 파일을 하나의 `Write + Seek`으로 보입니다. 앞 조각도 고칠 수 있어, 크기를 나중에 채우는 ZIP과 시작 헤더를 마지막에 쓰는 7z가 분할을 몰라도 됩니다.

- `.001` 방식(7z, tar, 단일 스트림, ZIP의 7-Zip 방식): 단순 바이트 조각. 모든 조각이 정확히 그 크기입니다(마지막 제외).
- `.z01 … .zip`(WinZip 방식): 디스크 번호를 기록하고, 헤더가 조각 경계에 걸리지 않게 일찍 넘어갑니다. 그래서 조각이 지정 크기보다 조금 작을 수 있습니다. 첫머리에 `PK\x07\x08` 표식이 있습니다.
- `.partN.rar`: `rars`의 볼륨 크기는 파일 데이터만 세므로, 헤더 몫을 빼고 시작해 실제 파일 크기를 재서 넘으면 데이터 몫을 비례해 줄여 다시 씁니다. 복구 레코드는 조각 단위로 커지므로 미리 계산할 수 없습니다.

`discover`는 어느 조각에서 시작해도 전체를 찾습니다.

## 고치기와 변환

압축 파일을 임시 폴더(`이름.zmwork`)에 풀고, 변경을 적용해 다시 만든 뒤 원본과 바꿉니다. 출력은 `.zmtmp`로 썼다가 끝난 뒤에 이름을 바꾸므로 실패·취소해도 원본은 그대로입니다. ZIP의 설명만 바꿀 때는 끝부분만 다시 씁니다.

분할 집합, 자동 풀림 파일, 단일 스트림, CAB, ISO는 읽기 전용입니다.

## 안전

- 압축 파일 안의 경로는 `safe_relative`를 거칩니다. `..`는 건너뛰어 보고하고, 절대 경로와 드라이브 문자는 목적지 안으로 넣으며, Windows 예약 이름과 금지 문자, NTFS 스트림(`:`)을 무력화합니다.
- 심볼릭 링크는 만들지 않고 보고합니다.
- gzip 헤더의 파일 이름은 마지막 구성 요소만 씁니다.
- 잘못된 비밀번호로 생긴 쓰레기 파일과 손상된 파일은 지웁니다(요청 시 보관).

## 데스크톱

제목 표시줄이 없고 툴바가 창의 윗변입니다: 왼쪽 끝에 아이콘·이름·버전, 오른쪽 끝에 창 단추가 있고, 단추는 아이콘만 두고 설명은 툴팁으로 보입니다. 메뉴는 툴바의 `overflow: hidden`에 잘리지 않도록 `document.body`로 포털합니다. Windows는 CSS `app-region`으로 끌고, macOS·Linux는 `start_dragging`을 부릅니다. 툴바는 절대 잘리지 않습니다: 화면이 툴바를 재서 `set_min_window_size`로 보내고, Snap처럼 최소 크기를 무시하는 경로로 줄어들면 `Resized`에서 되돌립니다.

오래 걸리는 작업은 자기 스레드에서 돌고 `job-progress` / `job-done` 이벤트로 알립니다. 설정 창과 정보 창은 별도 창이며 창 만들기는 async 명령에서 합니다(동기 명령은 메인 스레드에서 돌아 자기를 기다리다 멈춥니다). 설정은 localStorage에 두고 디스크에 복사합니다.

시험용 환경 변수: `MYZIPMASTER_CONFIG_DIR`(설정 위치), `MYZIPMASTER_TEST`(파일 탐색기 열기를 막고 시험 훅을 켬), `WEBVIEW2_*`.

설정·정보·설명서 창은 Tauri API로 닫습니다(`closeThisWindow`). 페이지의 `window.close()`는 페이지만 없애고 Tauri에는 창이 남아, 다시 열 때 죽은 창에 초점만 줍니다.

시작 화면 배경(`src/lib/background.js`)은 캔버스 하나에 초당 30프레임으로 그리고, 창이 숨겨지면 멈춥니다.

오른쪽 클릭 메뉴는 `src-tauri/src/shell_menu.rs` 한 곳에서 만듭니다. Windows는 HKCU 키(설치 프로그램이 `--register-shell-menu`로 호출), Linux·macOS는 홈 폴더의 파일입니다. 탐색기는 선택한 파일마다 프로세스를 하나씩 띄우므로, 첫 프로세스가 `shell-inbox`에서 나머지 경로를 모읍니다. 설치된 WinRAR로 압축하는 코드는 `rar_tool.rs`입니다.

Zstandard 압축은 데스크톱에서 공식 라이브러리(`zstd`), 웹에서 `ruzstd`를 씁니다. 풀기는 양쪽 모두 `ruzstd`입니다.

## 웹

`host.js`가 `File`들을 worker로 한 번만 보냅니다. 엔진이 고친 내용을 원본으로 덮어쓰지 않으려면 한 번만이어야 합니다. 취소는 worker를 종료하는 것이고 메모리도 함께 사라지므로, 다음 작업에서 다시 보냅니다. `__WEB_BUILD__` 상수와 `webWorker.js` 분리 덕분에 데스크톱 번들에는 worker와 wasm이 들어가지 않습니다.

## 아이콘

`assets/icon.svg`(앱)와 `scripts/generate-file-icons.mjs`(형식별 문서 아이콘)가 원본입니다. 글자는 글꼴에 기대지 않도록 선으로 그립니다. 화면의 작은 아이콘(`Icons.jsx`)은 각자 색을 가지며, 어두운 테마와 밝은 테마 모두에서 대비를 시험합니다.

## 시험의 원칙

자기 코드로 쓰고 자기 코드로 읽는 왕복만으로는 형식을 지키는지 알 수 없습니다. 그래서 7-Zip이 우리 결과를 읽고, 우리가 7-Zip과 WinRAR의 결과를 읽습니다. GUI 시험은 `el.click()`이 아니라 실제 입력 이벤트를 보내며, 다른 요소에 가려진 단추는 실패합니다.
