# Command Center (CommandCenterMultiOSV10)

Windows · macOS · Linux · **웹** 용 듀얼 패널 파일 관리자.
[CommandCenterGTKv10](../CommandCenterGTKv10) (GTK3, Linux/macOS) 를 참고하여 Electron 31 + React 18 + Vite 5 로
다시 만들었으며, 같은 코어(`core/`)가 데스크톱 앱과 웹 서버 양쪽에서 동작합니다.

- 사용 방법: [UsersGuide.md](UsersGuide.md)
- 기능 목록·단축키 전체 표: [Features.md](Features.md)
- 내부 구조: [Architecture.md](Architecture.md)

![app icon](assets/icon.svg)

## 주요 기능

| 영역 | 내용 |
|---|---|
| 패널 | 좌/우 듀얼 패널(활성 패널 테두리 표시), 분할선 드래그(더블클릭 = 50:50), **화면 분할 버튼**(좌우 ↔ 상하 배치), 창 우측 하단 **크기 변경 마커**, **드라이브 메뉴**(시스템의 모든 드라이브/볼륨 — 이름·여유/전체 용량), 경로 빵부스러기(breadcrumb), 홈 버튼, 트리 패널 버튼(아이콘) → 목록 옆 폴더 트리 패널(홈 · 드라이브/루트 · /tmp · 마운트, 패널별 열고 닫기) |
| 목록 | 이름 · 권한 · 수정일 · 종류 · 크기, 열 머리글 클릭 정렬(폴더 우선, `..` 고정), 다중 선택(Ctrl/Shift), 숨김 파일 표시, 폴더 변경 자동 새로고침 |
| 파일 작업 | 패널 간 복사(F5)/이동(F6), 새 폴더(F7)/새 파일(Shift+F4), 이름 바꾸기(F2), **다중 이름 바꾸기**(Ctrl+M — `[N]` `[E]` `[C]` 마스크·찾기/바꾸기·카운터·대소문자, 미리보기, 2단계 이름 변경), 삭제(F8), 휴지통, 클립보드 복사/붙여넣기(URI 목록), 열기(텍스트 파일은 설정에 따라 기본 앱 / 내장 뷰어 / 내장 편집기 / 지정 프로그램), 속성(Alt+Enter) |
| 실행 취소 | **Ctrl+Z / Ctrl+Y** — 새 폴더·새 파일·이름 바꾸기·다중 이름 바꾸기·복사·이동·압축·압축 해제를 최근 50개까지 되돌리기/다시 실행. 툴팁과 상태줄에 되돌릴 작업 표시 |
| 보기·편집 | **F3 내장 뷰어**(텍스트 — 인코딩 자동 감지·줄 바꿈·16진수, 이미지, 이진 파일 16진수 덤프), **F4 내장 편집기**(Ctrl+S 저장, UTF-8) |
| 미리 보기 창 | 목록에서 **아무 파일이나 클릭**: 이미지 · 동영상/오디오 재생 · **PDF**(호스트의 PDF 뷰어 — 쪽 이동·확대·인쇄) · **텍스트는 뷰어 + 편집 버튼(같은 창이 간단한 편집기로, Ctrl+S)** · 그 밖의 파일은 **16진수 덤프** |
| 동영상 · 오디오 | 목록에서 **동영상·오디오 파일을 클릭**하면 미리 보기 창에서 바로 **재생**(F3 뷰어도 같음): mp4·m4v·webm·mkv·mov·ogv·avi·mpg·3gp·ts·wmv / mp3·wav·flac·ogg·opus·m4a·aac·weba·wma·aiff·midi — 파일을 읽어 들이지 않고 호스트가 **스트리밍**(Range 지원, 탐색 가능; 데스크톱 `cc-media://`, 웹 `/api/media`), 브라우저 컨트롤(재생·탐색·음량·전체 화면), Space/←/→/M 키, 길이·크기·해상도 표시. 코덱은 호스트(Chromium)가 지원하는 것 |
| 이미지 | **이미지 미리 보기·뷰어**: 목록에서 이미지를 클릭하면 **미리 보기 창**(포커스를 빼앗지 않는 별도 창, 다음 이미지를 클릭하면 갱신) — png·jpg·gif·webp·bmp·svg·ico·avif·apng 에 더해 **HEIC/HEIF**(libheif WASM)·**DICOM(.dcm)**(모든 표준 전송 구문: 비압축 LE/BE·RLE·JPEG baseline/12비트·JPEG 무손실·JPEG-LS·JPEG 2000/HTJ2K; 다중 프레임 탐색 + **▶ 연속 재생**(파일의 프레임 속도, 반복) + **⊞ 모든 프레임 한눈에**(격자, 클릭으로 선택); 윈도우/레벨 프리셋·입력·Ctrl+드래그·반전)·**TIFF**(LZW·PackBits·Deflate 등, 다중 페이지). 확대/축소(Ctrl+휠·+/−·0 맞춤·1 실제 크기·더블클릭), 드래그 이동, 회전(R), 인쇄, 클립보드 복사, **PNG/JPEG/WebP/BMP 로 저장(변환)**, 우클릭 컨텍스트 메뉴 |
| 파일 정보 | **Alt+Enter · 우클릭 메뉴 › 파일 정보 보기 · 툴바 ⓘ** — 일반(위치·종류·MIME·크기·디스크 사용)·시간(만든/수정/접근)·권한/속성·**내용**(이미지 크기·형식·EXIF(카메라·노출·촬영 일시·GPS)·DICOM 태그·TIFF 태그, 텍스트 인코딩·줄 수·줄 끝, 압축 파일 여부, 이진 시그니처)·**해시**(MD5/SHA-1/SHA-256, 버튼으로 계산). 창은 내용에 맞춰 크기가 정해져 스크롤 바가 없음 |
| 인쇄 | **Ctrl+P · 툴바 🖨 · 파일 메뉴 · 우클릭 메뉴** — 텍스트·이미지는 **앱의 인쇄 창**(미리보기 + 프린터·용지·방향·여백·배율·글꼴·머리글·흑백·매수·페이지 범위; 데스크톱은 PDF 미리보기 그대로 프린터로, 웹은 브라우저 대화상자로), 뷰어·편집기에도 인쇄 버튼(편집 중인 내용 그대로). PDF·오피스 문서 등은 확인 후 **연결 프로그램으로 인쇄**(데스크톱) |
| Total Commander 방식 | **패널 탭**(Ctrl+T 새 탭 · Ctrl+W 닫기 · Ctrl+Tab 순환, 세션 복원), 펑션 키 바(F3~F8·Alt+F4), Insert/Space 선택(Space 는 폴더 크기 계산), Num+/Num−/Num* 패턴 선택·반전, Alt+Num+ 같은 확장자, Shift+F2 폴더 비교, Ctrl+U 패널 바꾸기, Ctrl+←/→ 대상=원본, Alt+↓ 폴더 기록, Ctrl+D 즐겨찾는 폴더, Alt+F1/F2 드라이브, 글자 입력 빠른 검색 |
| 별도 창 | 뷰어·편집기·**미리 보기·파일 정보**·다중 이름 바꾸기·검색·설정은 **독립된 창**(위치·크기 자유, 종류별 기억, **도구마다 창 하나** — 다시 누르면 앞으로 오고 새 파일/폴더를 받음, 앱 종료 시 함께 닫힘; 미리 보기 창은 포커스를 빼앗지 않고 메인 창 위에 머묾). 크기 조절이 되는 창마다 **우측 하단 크기 변경 마커**. 설정 창은 크기 고정(920×990, 스크롤 없음)이며 각 도구 창은 제목줄에 자기 아이콘을 씁니다. 설정에서 앱 내 대화상자로 전환 가능 |
| 충돌·진행 | 같은 이름이 있으면 덮어쓰기/건너뛰기/취소 + "이후 항목에도 동일하게 적용", 모든 긴 작업은 진행률 창(취소 가능) |
| 압축 | `.tar.gz` `.tar.bz2` `.zip` 생성/해제, **분할 압축**(zip → `.zip`+`.z01`…, tar → `.tgz`+`.001`…; GTK 판과 호환), 분할 파일 더블클릭 시 자동 결합 해제, `.tar` `.gz` `.bz2` 해제, ZIP 한글 파일명(EUC-KR) 복원 |
| 검색 | **별도 검색 창**(툴바 검색 / F9, 제목줄로 끌어 옮김, 열어 둔 채 패널 사용 가능): 활성 패널의 폴더와 그 아래 모든 폴더에서 폴더·파일을 이름 패턴(`*.txt`)으로, 파일은 내용으로도 검색. 결과에서 Enter/더블클릭 — **폴더는 왼쪽 패널에 열고, 파일은 시스템 기본 프로그램으로 실행**. 결과를 여러 개 선택해 Ctrl+C 로 복사한 뒤 패널에 Ctrl+V 로 붙여넣거나, 버튼/우클릭 메뉴로 왼쪽·오른쪽 패널 폴더에 바로 복사 |
| UI | 메뉴바(파일·편집·선택·보기·압축, 모든 항목에 아이콘과 단축키), **아이콘 전용 툴바**(툴팁으로 설명, 선택 상태에 따라 활성/비활성), **30가지 테마 + 사용자 정의 테마**(툴바 우측 분할 버튼: 클릭=다음 테마, ▾=목록; 설정 › 테마 탭의 카드에서 클릭 즉시 적용, 15가지 색을 직접 정한 테마 만들기), 한국어/영어(국기 아이콘 토글), **설정 4개 탭**(일반[패널·창·터미널] · 테마 · 파일 열기·편집 · 프롬프트) — **바꾸는 즉시 적용**, 취소 시 복원, 프로그램 정보 버튼, 상태 표시줄 |
| 하단 패널 | 파일 목록 아래의 탭 패널(``Ctrl+` ``; 툴바에 로그·빠른 검색·터미널 버튼). **빠른 검색** 탭: 선택한 패널 폴더에서 바로 검색. **로그** 탭: 모든 상태 메시지와 오류가 시각과 함께 쌓임(복사/지우기). **터미널** 탭: 원하는 만큼 열 수 있고(Windows: PowerShell · Command Prompt · PowerShell 7 · Git Bash, macOS/Linux: 로그인 셸 · bash · zsh · sh) 활성 패널 폴더 또는 설정한 시작 디렉터리에서 시작. MyEditor 와 같은 콘솔 — **oh-my-posh 호환 프롬프트 테마**(설정 › 프롬프트: 세그먼트 · 파워라인/일반/다이아몬드 · 색·템플릿 · 프리셋 16종 · **oh-my-posh JSON 가져오기/내보내기** · 실시간 미리보기; 기본은 `[📁 경로]▶[⎇ main ↑ + ~ ?]▶` 에 저장소 상태 색 — 진홍 충돌 · 노랑 add 됨 / 커밋됨 · 빨강 수정됨 · 파랑 pull 필요 · 밝은 녹색 변경 없음; 종료 코드·실행 시간 세그먼트도 제공), 출력의 ANSI 색 표시 바로 뒤에서 입력(한글 IME 포함), **Tab 자동 완성**(명령·파일), ↑↓ 기록, 실행 중인 프로그램에 답 입력 가능 |
| 오류 | 모든 오류는 팝업으로 — 메시지 + 자세한 내용(코드·경로·발생 프로세스의 스택) + **자세한 내용 복사** 버튼 |
| 세션 | 마지막 좌/우 경로와 패널 탭, 활성 패널, 분할 위치·방향, 정렬, 모든 설정 값(사용자 테마·프롬프트 포함), 창 위치, 도구 창별 위치/크기, 하단 패널 표시/높이, 즐겨찾는 폴더 — **마지막 종료 시점 그대로 복원** |

## 실행

```bash
npm install
npm start          # Vite 개발 서버 + Electron (UI 는 핫 리로드, core/·electron/ 이 바뀌면 Electron 자동 재시작)
npm run web        # 빌드 후 웹 버전: http://127.0.0.1:5186 (브라우저가 열립니다)
```

`CC_USER_DATA=<폴더>` 환경 변수를 주면 개발 실행이 별도 프로필(세션·창 상태·단일 인스턴스 잠금)을 사용합니다.

### 웹 버전

`server/server.js` 가 `dist/` 와 `/api/*` 를 함께 제공하므로, 서버가 실행되는 컴퓨터의 파일 시스템을 브라우저에서 관리합니다.

```bash
node server/server.js --port 8080 --host 0.0.0.0 --token 비밀값   # 다른 PC 에서 접속 (토큰 필수 권장)
node server/server.js --host 0.0.0.0 --token 비밀값 --allow-open      # + 더블클릭으로 서버의 기본 앱 실행 허용
```

기본은 루프백(127.0.0.1)만 바인딩합니다. API 는 파일 전체에 대한 읽기/쓰기 권한이므로, 다른 인터페이스에 열 때는 `--token`
(요청의 `Authorization: Bearer …` 또는 `?token=`)을 함께 쓰세요. 터미널 탭은 **서버 컴퓨터**의 셸이므로 더욱 그렇습니다. 웹 버전에서는 "기본 앱으로 열기"가 `--allow-open` 일 때만 켜지고, 휴지통은 Linux/macOS 에서만 동작합니다.

## 빌드 / 설치 파일

```bash
npm run build:win     # release/Command Center Setup 1.0.0.exe (NSIS) — 프로젝트 루트에도 복사
npm run build:mac     # release/Command Center-1.0.0.dmg          (macOS 에서 실행)
npm run build:linux   # release/*.AppImage, *.deb                  (Linux 에서 실행)
```

아이콘(입체 슬랩 위의 명령 프롬프트 글리프 `>_` — 사방의 노드가 가운데로 모여 "모든 명령이 한곳에" — 파란 계열, 위에서 비추는 조명·그림자·바닥 그림자로 3D)은 `assets/icon.svg` 하나에서 `npm run generate:icons` 로 `build/icons/` 의 ico · icns · png 세트가 생성되며,
앱 실행 아이콘 · 설치 파일 · 언인스톨러 · 바탕화면/시작 메뉴 바로가기 · macOS DMG · 웹 파비콘이 모두 같은 아이콘을 씁니다.
도구 창(뷰어·편집기·미리 보기·파일 정보·다중 이름 바꾸기·검색·설정)의 제목줄 아이콘은 `node scripts/generate-tool-icons.mjs` 가 UI 아이콘에서 만들어 `assets/tool-icons/` 에 커밋해 둡니다.

### 설치 동작

- **Windows (NSIS)** — 설치 폴더 선택, 바탕화면/시작 메뉴 바로가기 선택(한국어/영어). 이미 설치된 버전은 완전히 삭제한 뒤 설치하고, 남아 있는 이전 데이터(세션·설정)는 삭제 여부를 묻습니다(무인 설치는 유지).
- **Linux (.deb / AppImage)** — `dpkg -i` 로 설치하면 애플리케이션 메뉴에 등록됩니다. 데이터는 `~/.config/Command Center`.
- **macOS (.dmg)** — 앱을 Applications 로 끌어 넣습니다. 데이터는 `~/Library/Application Support/Command Center`.

```bash
npm run clean         # dist/ release/ build/icons/ .smoke/ 와 루트의 설치 파일 삭제
npm run clean:all     # 위 항목 + node_modules/
```

## 테스트

```bash
npm test                            # 단위 테스트: tar/zip/bz2 왕복, 분할 압축, 복사 충돌, 다중 이름 바꾸기, 파일 읽기/쓰기, 검색, API, 터미널, 프롬프트, 인쇄 문서, samples/(형식 분류·DICOM 프레임·이미지 디코딩·/api/media Range)
npm run build && npm run smoke      # 실제 앱을 띄워 스크린샷(.smoke/main.png) + 웹 서버 API/UI 확인
npm run smoke -- --scenario all     # 컨텍스트 메뉴·압축·검색·정보·삭제·테마·오류·터미널·로그·설정·뷰어·다중 이름 바꾸기·폴더 비교·실행 취소·미리 보기·파일 정보 화면을 각각 캡처
npm run smoke -- --scenario preview --left D:\Pictures   # 그 폴더의 첫 이미지를 미리 보기 창에 (HEIC·DICOM·TIFF 도)
npm run smoke -- --scenario samples # samples/ 의 모든 파일(PNG·JPEG·GIF·WebP·BMP·SVG·ICO·AVIF·TIFF·HEIC·DICOM 5종·PDF·MP4·WebM·WAV)을 뷰어로 열어 디코딩/재생 결과를 파일별로 출력
npm run smoke -- --scenario print   # 인쇄 창(미리보기 + 페이지 설정)
node scripts/generate-samples.mjs   # samples/ 다시 생성 (sharp + 자체 GIF/BMP/ICO/WAV 인코더 + Electron MediaRecorder 로 WebM; HEIC·MP4·DCM 은 커밋된 파일)
npm run smoke -- --scenario compress --web   # 같은 시나리오를 웹 모드로
npm run smoke -- --script my.js --name x --left C:\folder --tool-script tool.js --probe probe.js
#   --script      : 파일에 든 임의 시나리오를 메인 창에서 실행
#   --tool-script : 시나리오가 연 별도 창(뷰어·설정 …) 안에서 실행 — 창은 <name>-<kind>.png 로 캡처
#   --probe       : 마지막에 메인 창에서 평가해 결과를 출력(검증용)
```

smoke 테스트는 별도 프로필(`.smoke/profile`)로 실행되므로 실행 중인 앱과 충돌하지 않습니다.

## 단축키

| 키 | 동작 |
|----|------|
| F2 · Shift+F6 | 이름 바꾸기 |
| F3 / F4 | 내장 뷰어 / 내장 편집기 |
| Ctrl+P | 인쇄 (뷰어·편집기 안에서도) |
| Alt+Enter | 파일 정보 |
| 이미지: Ctrl+휠 · + / − · 0 · 1 · R · 더블클릭 | 확대/축소 · 창에 맞춤 · 실제 크기 · 회전 · 맞춤⇄실제 |
| DICOM: ← → · Home/End · I · W · Ctrl+드래그 | 프레임 · 첫/끝 프레임 · 반전 · 윈도우 초기화 · 윈도우 조절(좌우 폭, 상하 중심) |
| F5 / F6 | 반대 패널로 복사 / 이동 |
| F7 / Shift+F4 | 새 폴더 / 새 파일 |
| F8 · Delete | 삭제 |
| F9 | 검색 창 |
| Alt+F5 / Alt+F9 | 압축 / 압축 해제 |
| Ctrl+M | 다중 이름 바꾸기 |
| Ctrl+Z / Ctrl+Y | 실행 취소 / 다시 실행 |
| Insert · Space · Num+ · Num− · Num* | 선택 토글 · 토글(+폴더 크기) · 패턴 선택 · 패턴 해제 · 반전 |
| Shift+F2 | 폴더 비교 |
| Ctrl+T / Ctrl+W / Ctrl+Tab | 새 탭 / 탭 닫기 / 다음 탭 |
| Tab | 활성 패널 전환 |
| Enter / Backspace / Ctrl+PgUp / Ctrl+\ | 열기 / 상위 폴더 / 상위 폴더 / 루트 |
| Ctrl+U · Ctrl+← → · Alt+↓ · Ctrl+D · Alt+F1/F2 | 패널 바꾸기 · 대상=원본 · 폴더 기록 · 즐겨찾기 · 드라이브 |
| Ctrl+A / Ctrl+C / Ctrl+V | 모두 선택 / 클립보드 복사 / 붙여넣기 |
| Ctrl+R / Ctrl+H / Alt+Enter | 새로고침 / 숨김 파일 / 속성 |
| Ctrl+` | 하단 패널(로그·터미널) 표시/숨김 |
| Ctrl+Shift+` | 새 터미널 |
| 터미널 안: Tab / ↑ ↓ / Ctrl+L / Esc | 자동 완성 / 이전·다음 명령 / 화면 지우기 / 입력 취소 |

전체 표는 [Features.md](Features.md) 13장에 있습니다.

## 구조 (요약)

```
core/       api.js fsops.js archive.js tar.js bzip2-worker.js jobs.js session.js terminal.js   ← 플랫폼 무관 (Node)
electron/   main.js ipc.js preload.js                                             ← 데스크톱 호스트
server/     server.js                                                             ← 웹 호스트 (http 모듈만 사용)
src/        App.jsx ToolWindow.jsx(별도 창 페이지: viewer·editor·preview·info·multiRename·search·settings·about) themes.js styles.css main.jsx
  lib/      backend.js(전송 + 창 열기/메시지 버스/창 크기/저장 대화상자) i18n.js format.js ansi.jsx history.js(실행 취소) settings.js(설정 기본값) prompt.js(프롬프트 테마 · oh-my-posh 호환)
            media.js(동영상·오디오 확장자·스트리밍 URL) print.js(인쇄 경로: 미리보기 PDF·프린터 목록·인쇄) printdoc.js(인쇄 문서·페이지 설정·페이지 범위, 순수 함수) images.js(이미지 형식·HEIC/TIFF 디코딩·회전·PNG/JPEG/WebP/BMP 인코딩) dicom.js(DICOM 태그·전송 구문별 코덱·프레임·윈도우) exif.js(JPEG EXIF) fileinfo.js(파일 정보 "내용" 행)
  themes.js(내장 30 + 사용자 정의 테마)
  dialogs/    PrintDialog.jsx(인쇄 창: 페이지 설정 + 미리보기)
  components/ FilePanel.jsx FolderTree.jsx(패널 옆 폴더 트리) MediaView.jsx(동영상·오디오 플레이어) Chrome.jsx(메뉴·툴바·펑션 키 바) ContextMenu.jsx Icons.jsx BottomDock.jsx Prompt.jsx ImageView.jsx(그림 창: 확대·회전·인쇄·저장·DICOM 막대) ResizeGrip.jsx(크기 변경 마커)
  dialogs/  Dialogs.jsx SearchDialog.jsx SettingsDialog.jsx PromptEditor.jsx ToolDialogs.jsx(뷰어·편집기·다중 이름 바꾸기) InfoDialog.jsx(파일 정보)
assets/     icon.svg
build/      installer.nsh linux/{after-install.sh, after-remove.sh}
scripts/    generate-icons.mjs generate-tool-icons.mjs ico.mjs generate-build-info.mjs sync-public-svgs.mjs start-electron.mjs copy-installer.js free-port.mjs smoke.mjs clean.mjs
test/       archive.test.mjs fsops.test.mjs terminal.test.mjs prompt.test.mjs
```

이미지 디코딩은 렌더러에서 합니다(데스크톱·웹 동일): `libheif-js`(HEIC/HEIF, WebAssembly) · `utif`(TIFF) · `dicom-parser` + `@cornerstonejs/codec-openjpeg`(JPEG 2000) · `@cornerstonejs/codec-charls`(JPEG-LS) · `@cornerstonejs/codec-libjpeg-turbo-8bit`/`-12bit`(JPEG) · `jpeg-lossless-decoder-js`(무손실 JPEG). 모두 첫 사용 때만 로드되는 별도 청크입니다.

자세한 설명은 [Architecture.md](Architecture.md) 를 보세요.

## 라이선스

MIT License — 제작자: SHKWON (knix008@naver.com)
