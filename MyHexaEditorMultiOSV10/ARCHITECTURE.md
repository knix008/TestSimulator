# MyHexaMaster 구조 (Architecture)

개발자를 위한 문서입니다. 사용법은 [doc/UsersGuide.md](doc/UsersGuide.md)를 보세요.

## 1. 한눈에

**화면은 JavaScript(Vite, 프레임워크 없음), 핵심은 Rust**입니다. 셸은 MyMarkdownMaster에서 가져왔습니다.

| 층 | 위치 | 하는 일 |
| --- | --- | --- |
| 셸 | `src/app.js`, `src/popup.js`, `src/ui/*`, `src/themes.js`, `src/*.css` | 메뉴 막대(제목 표시줄 겸용), 접히는 툴바, 좌(탐색기)·우(속성)·아래(로그·정보) 패널, 상태 표시줄, 카드 보드 시작 화면, OS 창 팝업, 테마, 한/영, 튜토리얼 |
| 문서·탭 | `src/hex/editor.js`, `src/hex/document.js` | 열기(파일·디스크·프로세스·웹 파일)·저장·닫기, 편집은 모두 코어로, 4 KiB 페이지 캐시, 클립보드 형식, 책갈피, 파일별 기억 |
| 헥사 보기 | `src/hex/hexview.js`, `src/hex/charsets.js`, `src/hex/hex.css` | 보이는 줄만 그리는 가상 스크롤(행 수가 브라우저 한계를 넘어도 됨), 헥사·글자 칸, 커서·니블·선택, 입력(덮어쓰기/끼워 넣기, 입력기), 표시(바이트 종류·바뀐 바이트·책갈피·템플릿·검색·차이) |
| 속성 패널 | `src/panels/props.js` | 데이터 검사기, 구조 나무, 파일 정보, 체크섬, 통계(히스토그램·엔트로피 캔버스), 책갈피 |
| 탐색기 | `src/panels/explorer.js` | 즐겨찾기·홈·드라이브(`explorer_places`/`explorer_list`), 열린 문서 |
| 도구 창 | `src/tools/toolwin.js` ↔ `src/tools/host.js` | 찾기·이동·문자열·디스어셈블러·계산기·복구·디스크/메모리·비교·템플릿 편집기·편집 기록·파일 도구·일반 양식(`form`). 창은 문서를 직접 만지지 않고 주 창에 요청(`action('tool')` → `tool-reply`) — 웹에서는 팝업이 다른 페이지라 코어가 주 창에만 있기 때문 |
| 다리 | `src/core/core.js` | 데스크톱 `invoke('core_call')` / 웹 WebAssembly(JSON ABI + 원시 바이트 전달) |
| **Rust 코어** | `crates/hexcore` | 아래 2장 |
| 웹용 Rust | `crates/hexwasm` → `public/hexcore.wasm` | `hx_alloc/hx_free/hx_call/hx_result_len` + `hx_open`(파일 바이트로 문서) · `hx_bytes`(저장용 원시 바이트) |
| **데스크톱 백엔드** | `src-tauri` | 아래 3장 |

## 2. Rust 코어 — `crates/hexcore`

`engine::Engine::call(method, args)` 하나의 JSON API. 오프셋·길이는 숫자, 바이트는 base64.

| 모듈 | 내용 |
| --- | --- |
| `source.rs` | `Source` 트레이트(len, read_at, holes, kind, resizable, path, write_back) · `MemSource` |
| `doc.rs` | `Document`: 조각 표. 모든 편집은 `splice` 하나로, 단계별 실행 취소(입력은 한 단계로 묶음), 바뀐 범위(add 버퍼 조각), 구멍, `patches`(제자리 저장 가능 여부), `write_to`, `rebase` |
| `search.rs` | 16진수(`??`, 니블)·텍스트(인코딩·대소문자)·정규식(바이트)·정수·실수, 앞/뒤로, 청크 경계 겹침, 모두 찾기, 모두 바꾸기(한 단계) |
| `hash.rs` | 36가지 체크섬·CRC·해시를 한 번 읽어 동시에 |
| `inspect.rs` | 데이터 검사기 34가지 해석과 값 → 바이트 |
| `ops.rs` | 바이트 연산 19가지, 변환 21가지(암호화·압축·인코딩) |
| `stats.rs` | 히스토그램, 엔트로피(전체·블록), ent 통계 |
| `strings.rs` | ASCII·UTF-8·UTF-16 LE/BE 문자열(청크 경계 상태 유지) |
| `compare.rs` | 같은 위치 비교, Myers 차이(끼워 넣기·삭제) |
| `magic.rs` | 70가지 형식 감지(세부 정보·템플릿 연결), 26가지 카빙 |
| `pattern/` | 템플릿 언어(lexer·parser·eval)와 내장 템플릿 18가지(`builtin/*.hexpat`) |
| `disasm.rs` | iced-x86(Intel·NASM·MASM·GAS), yaxpeax-arm(A32·Thumb·AArch64) |
| `export.rs` | 26가지 내보내기, 가져오기(체크섬 확인) |
| `calc.rs`, `codec.rs`, `util.rs`, `engine.rs` | 계산기, 인코딩, 공통 도구, 디스패치(`run_readonly`는 스냅숏에서) |

## 3. 데스크톱 — `src-tauri`

- `hexcmd.rs` — `CoreState`(Engine 하나). `core_call`: 읽기 전용 작업(찾기·해시·템플릿 …)은 문서 스냅숏으로 잠금 밖에서 돌며 `io-progress`를 보내고 `core_cancel`로 멈춤. `hex_open`/`hex_open_disk`/`hex_open_process`/`hex_reload`, `hex_save`(제자리 패치 또는 임시 파일 후 교체, 프로세스는 `write_back`), `hex_save_range`, `hex_split`/`hex_concat`/`hex_wipe`, `hex_list_disks`/`hex_list_processes`.
- `sources.rs` — `FileSource`(위치 지정 읽기), `DiskSource`(섹터 단위 읽기, 읽기 전용), `ProcessSource`(영역 지도, 읽을 수 없는 곳은 구멍).
- `devices.rs` — Windows(GetLogicalDrives·DeviceIoControl·Toolhelp·VirtualQueryEx·Read/WriteProcessMemory), Linux(/sys/block·/proc), macOS(/dev/disk·ps; 프로세스 메모리는 지원하지 않음).
- `lib.rs` — 창(프레임 없는 주 창, 팝업 OS 창 `POPUP_KINDS`, 문서 창, 인쇄용 렌더 창), 글꼴, 클립보드, 배경, 창 끌기, 여러 실행. `printing.rs`, `window_state.rs`, `instance.rs`, `explorer.rs`.

## 4. 웹

- 파일은 File System Access(Chrome·Edge, 같은 파일에 다시 저장) 또는 `<input>`·끌어 놓기로 읽어 `hx_open`으로 코어에 넣고, 저장은 `hx_bytes`로 꺼내 핸들에 쓰거나 내려받기.
- 팝업은 같은 페이지의 iframe 창(`src/platform/popups.js` PopupHost).

## 5. 테스트 — `npm test`

| 범주 | 내용 |
| --- | --- |
| unit | `test/unit/*.test.js` — 실제 코어(wasm)를 Node에서: 문서·편집·실행 취소, 검색, 해시, 검사기, 연산·변환 왕복, 내보내기·가져오기 왕복, 모든 예제의 형식 감지와 템플릿, 문자열·카빙·엔트로피·디스어셈블러, 비교, 계산기; 문자 집합·숫자 형식·설정 |
| i18n | 쓰는 키가 한/영 모두 있는지 |
| rust | `crates/hexcore` + `src-tauri --lib` |
| web | 헤드리스 Edge + 자체 Vite: 시작 화면, 입력·끼워 넣기·실행 취소, 대용량 문서, 보기 설정, 클립보드, 속성 패널, 모든 도구 창, 비교, 템플릿 편집기, 연산·변환·가져오기, 설정 창, 패널 배치, 영어 + **모든 명령 한 번씩** |
| tutorial | 튜토리얼 모든 단계 |
| desktop | `--desktop`: 디버그 exe + WebView2 CDP, 임시 폴더의 파일로 열기·제자리 저장·재작성 저장·새 파일 저장·200 MB 파일·나누기/합치기/완전 삭제, 디스크·프로세스 목록과 자기 프로세스 메모리 읽기 |

출력은 열이 맞는 컬러 진행 줄, 범주별 표, 통과율 막대가 있는 요약표이며 모두 영어입니다.

## 6. 새 기능을 더할 때

- **명령**: `src/app.js`의 `commands`에 `{ icon, label, key, enabled, checked, run }`, 메뉴(`MENUS`/`SUBMENUS`), 툴바(`TOOLBAR` — 도구는 툴바에), 단축키(`SHORTCUTS`, popup.js `SHORTCUT_LIST`), 텍스트는 `src/i18n/app-texts.js`, 아이콘은 `src/icons-hex.js`. 웹 E2E의 "모든 명령" 사례가 자동으로 실행해 봅니다.
- **바이트를 이해하는 일**은 `crates/hexcore`에 넣고 `engine.rs`에 메서드를 엽니다 — 데스크톱과 웹이 함께 얻습니다.
- **도구 창**: `TOOL_SIZES`(toolwin.js)와 lib.rs `POPUP_KINDS`에 종류를 더하고, 창은 `call(op)`로, 주 창은 `host.js`의 `ops`로.
