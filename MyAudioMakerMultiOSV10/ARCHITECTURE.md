# MyAudioMaker 구조

개발자를 위한 문서입니다. 무엇이 어디에 있고, 곡 데이터가 어떻게 흐르고, AI·작곡기·소리 엔진이 어떻게 나뉘는지 설명합니다. 사용법은 [doc/UsersGuide.md](doc/UsersGuide.md)를 보세요.

## 1. 전체 그림

```text
                         index.html  (하나의 번들이 모든 창을 맡음: src/main.js)
                               │
        ┌──────────────────────┼──────────────────────────────┐
        │ 주 창 (src/app.js)    │ 팝업 (src/popup.js)           │ 문서 창 (src/viewer.js)
        │                      │  + popups-music.js            │  사용 설명서 · 튜토리얼 문서 · 동영상
        ▼                      ▼                               ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ app.js: 상태 · Doc/History · 명령 표(commands) · MENUS · TOOLBAR · 단축키   │
 │         화면 4개(편곡·피아노 롤·가사·리드 시트) · AI 작곡 · 재생 · 파일 · 인쇄 │
 └──────┬──────────────┬───────────────┬──────────────┬─────────────────────┘
        │              │               │              │
        ▼              ▼               ▼              ▼
  music/ai.js     music/composer.js  audio/engine.js  ui/arrangement.js · pianoroll.js
  (Claude·Ollama   (계획 → 음표:       (Player, 믹서,    ui/panels.js · startpage.js
   ·내장 계획)       코드·멜로디·반주)   renderSong)       print/ (인쇄 장 SVG)
        │              │               │
        ▼              ▼               ▼
  music/lyrics.js  music/theory.js   audio/voices.js (악기 합성)
  lyrics-bank.js   genres.js          audio/vocal.js  (포먼트 가이드 보컬)
  syllables.js     instruments.js
                   song.js (normalizeSong, 구간 범위, 조옮김)
        │
        ▼
 io/fileformat.js (.mam = ZIP{song.json}) · io/midi.js · io/wav.js
 platform/native.js ── 데스크톱: Tauri invoke (src-tauri/src/*.rs) / 웹: 브라우저 API
 platform/popups.js ── 데스크톱: OS 창 "popup-<kind>" / 웹·튜토리얼: 페이지 안 프레임
```

화면 코드는 vanilla JavaScript(프레임워크 없음)입니다. 패널은 HTML 문자열을 만들고 `data-*` 속성으로 이벤트를 받으며, 편곡 화면과 피아노 롤은 캔버스로 그립니다. 창·설정·시작 화면·인쇄 창의 틀은 MySketchBook과 같은 코드를 씁니다.

## 2. 진입점과 창

| 창 | 조건 | 모듈 |
|---|---|---|
| 주 창 | 데스크톱 창 `main`, 웹의 기본 페이지 | `src/app.js` |
| 팝업 | 데스크톱 창 `popup-<kind>`, 웹·튜토리얼에서는 `index.html?popup=<kind>` 프레임 | `src/popup.js` (+ `src/popups-music.js`) |
| 문서 창 | 데스크톱 창 `doc-<kind>`, 웹에서는 `index.html?viewer=<kind>` 탭 | `src/viewer.js` |

main.js는 첫 그리기 전에 설정을 읽어 언어·테마·글꼴을 적용합니다. 팝업 종류는 `platform/popups.js`의 `POPUPS`(크기 포함)와 Rust의 `POPUP_KINDS`가 같아야 합니다 (`test/static/package.test.js`가 검사).

## 3. 모듈

### 3.1 음악 — `src/music/`

| 파일 | 맡은 일 |
|---|---|
| `theory.js` | 음 이름·조·선법, 코드 기호 읽기(`parseChordSymbol`), 로마 숫자 → 코드, 성부 진행(`voiceChord`), 마디:박 표시 |
| `instruments.js` | 악기 44종·10분류, 드럼 레인, 트랙 역할(`TRACK_ROLES`) |
| `genres.js` | 장르 18종(빠르기·진행·반주/베이스/드럼 패턴·악기), 분위기 10종, 곡 형식 8종, 구간 기본값 |
| `syllables.js` | 음절 나누기(한글 한 글자 = 한 음절, 영어는 모음 묶음), 조사, 운(`rhymeKey`), 모음 |
| `lyrics-bank.js` · `lyrics.js` | 12개 주제의 표현 묶음, 내장 작사기 `writeLyrics`, 주제 찾기, 가사 텍스트 읽기 |
| `composer.js` | `compose(spec)` 계획 → 곡, `writeSection`(부분별 다시 쓰기), `fitMelody`(가사 음절에 멜로디), `lyricFit` |
| `ai.js` | 제공자(builtin·claude·ollama), `PLAN_SCHEMA`, 프롬프트, `requestPlan`/`requestLyrics`, `cleanPlan`, `testProvider` |
| `song.js` | `normalizeSong`(모든 입력의 관문), 구간 시작 박, 코드 줄 텍스트, 음표 이동·자르기, 통계 |
| `checks.js` | 문제 검사(오류·경고·정보) |
| `samples.js` | 템플릿 15종, 예제 곡 24곡(씨앗과 사양으로 다시 만듦) |
| `notation.js` | 리드 시트 SVG(오선·조표·임시표·코드·가사) |
| `random.js` | 씨앗 난수(mulberry32) — 같은 씨앗이면 같은 곡 |

### 3.2 AI의 역할

AI(Claude·Ollama·내장)는 **계획**만 만듭니다: 제목, 구간 목록(종류·마디 수), 구간별 가사 줄, 마디별 코드. 계획은 `cleanPlan`으로 고쳐지고(모르는 구간 종류, 읽을 수 없는 코드, 64마디 초과, 너무 긴 줄), 그다음 `composer.compose`가 음표를 씁니다. 그래서 AI가 무엇을 답하든 곡은 항상 재생할 수 있는 상태입니다.

- **Claude** — `@anthropic-ai/sdk`의 `client.messages.parse` + `jsonSchemaOutputFormat(PLAN_SCHEMA)`. 브라우저(웹뷰)에서 직접 부르므로 `dangerouslyAllowBrowser: true`. 거절(`refusal`)·`max_tokens` 중단·인증/요금/과부하 오류는 사용자에게 보이는 메시지로 바뀝니다.
- **Ollama** — `fetch(<url>/api/chat)`에 `format: PLAN_SCHEMA`.
- **API 키** — 설정 JSON에 넣지 않고 localStorage 키 `myaudiomaker.aiKey.v1`에 따로 보관합니다(`domain/settings.js`의 `loadAiKey`/`storeAiKey`). 설정 초기화로 지워지지 않고, 설치 프로그램의 사용자 데이터 삭제로만 지워집니다.

### 3.3 소리 — `src/audio/`

- `voices.js` — 악기마다 발진기·필터·엔벨로프 조합(`playNote`), 드럼은 잡음과 스윕 사인(`playDrum`), 드럼 키트 7종.
- `vocal.js` — 포먼트 필터 세 개로 모음(a·e·i·o·u)을 노래하는 가이드 보컬, 비브라토, 자음 잡음.
- `engine.js` — `Player`(재생·반복·메트로놈·미리 듣기·레벨), `buildMixer`(트랙 → 팬 → 리버브 송신 → 마스터 → 컴프레서), `eventsOf`, `renderSong`(OfflineAudioContext, `suspend()` 조각마다 진행률·취소). 스윙은 `swingBeat`가 재생·WAV·MIDI에 똑같이 적용합니다.

### 3.4 입출력 — `src/io/`

- `fileformat.js` — `.mam` = fflate ZIP 안의 `song.json`(+ 미리 보기). 가사 TXT·LRC, 코드 차트.
- `midi.js` — SMF 타입 1 쓰기(템포·박자·조표·구간 마커·가사 메타 이벤트, 드럼은 10채널), 읽기(가사 이벤트가 있는 트랙은 보컬이 됨, 8마디 구간으로 나눔).
- `wav.js` — 16/24비트 PCM·32비트 float WAV.

### 3.5 화면 — `src/app.js`, `src/ui/`

- `app.js` — 상태, `Doc`(곡 + 선택) 과 `History`(스냅숏 실행 취소 100단계), 명령 표(약 94개: 메뉴·툴바·단축키가 모두 이 표를 씀), 화면 전환, AI 작곡·가사·다시 만들기, 재생, 파일·가져오기·내보내기, 인쇄 호스트, 팝업, 시작 화면, 튜토리얼. 시험용 훅 `window.__myaudiomaker`.
- `arrangement.js` · `pianoroll.js` — 캔버스 화면(`canvasview.js` 공통: 확대·스크롤·장치 픽셀).
- `panels.js` — 왼쪽(AI 작곡·악기·구간), 오른쪽(개요·곡·구간·트랙·음표·믹스), 가사 화면 HTML.
- `startpage.js` · `startboard.js` · `background.js` — 시작 화면 카드, 움직이는 배경 20종.
- `tutorial.js` — 8개 장 26단계(`CHAPTERS`·`STEPS`).

### 3.6 인쇄 — `src/print/`

`layout.js`(용지·여백·장 종류: leadsheet·lyrics·chords·arrangement·summary), `sheet.js`(장 SVG 만들기), `host.js`(주 창 쪽), `popup.js`(인쇄 창: 미리 보기·프린터·PDF), `pdf.js`.

## 4. 데이터 모델

```js
song = {
  format, version, title, artist, genre, mood, theme, topic, language: 'ko' | 'en', seed,
  key: { tonic: 0..11, mode: 'major' | 'minor' | 'dorian' | 'mixolydian' },
  bpm, timeSignature: [4, 4], swing: 0..0.5,
  sections: [{ id, type, label, bars, energy, repeatOf, chords: [{ at, len, symbol }], lyrics: ['줄', …] }],
  tracks: [{ id, role, instrument, name, volume, pan, reverb, mute, solo, color,
             notes: [{ t, d, p, v, syl? }] }],   // t·d 는 곡 처음부터의 박, p 는 MIDI 음 높이
  mix: { master, reverb, compressor }, loop: { on, start, end }, ai: { provider, prompt, model },
  created, modified,
}
```

- 시간 단위는 **박**(4분음표 = 1)입니다. 구간 안의 코드 `at`은 구간 시작에서의 박, 음표 `t`는 곡 처음부터의 박입니다. 구간 시작은 `sectionSpans(song)`이 계산합니다.
- `repeatOf`가 있는 구간(두 번째 후렴 등)은 원래 구간의 가사와 멜로디를 따라갑니다.
- 파일·MIDI·AI·붙여넣기 등 바깥에서 들어오는 모든 곡은 `normalizeSong`을 지납니다.

## 5. 플랫폼 차이 — `src/platform/`, `src-tauri/`

| | 데스크톱 (Tauri) | 웹 |
|---|---|---|
| 파일 열기/저장 | Rust `files.rs` (대화상자, 진행률) | File System Access API, 없으면 다운로드 |
| 팝업 | OS 창 | 페이지 안 프레임 |
| 인쇄 | 프린터 목록·PDF (`printing.rs`) | 브라우저 인쇄, PDF는 장 그림으로 |
| 파일 연결 | `.mam` (NSIS·Info.plist·shared-mime-info) | — |

## 6. 문서와 튜토리얼 산출물

- `scripts/build-docs.mjs` — `doc/UsersGuide*.md` → HTML, `src/ui/tutorial.js` + i18n → `doc/Tutorial*.html`, `public/doc/`에 복사.
- `scripts/tutorial-capture.mjs` — 웹 빌드를 헤드리스 Edge로 띄워 튜토리얼 단계마다 캡처(`doc/tutorial/images/`, `en/`), `video`는 녹화.

## 7. 테스트

| 범주 | 위치 | 내용 |
|---|---|---|
| js | `test/unit/` | 이론·작곡기·가사·입출력·배경·진행률 아이콘 |
| package | `test/static/` | 아이콘·파일 형식 등록·리소스·팝업 종류·문서(장 구성·단축키 표·링크·튜토리얼 수) |
| rust | `src-tauri` | `cargo test --lib` |
| web | `test/e2e/web.suite.mjs` | 헤드리스 Edge로 실제 앱 조작 + 명령 표 전체 실행 |
| tutorial | `scripts/test.mjs` | 튜토리얼 모든 단계 |
| desktop | `test/e2e/desktop.suite.mjs` | 디버그 exe + WebView2 CDP (`--desktop`) |
| installer | `test/installer/` | NSIS 설치 파일 검사 (`--installer`) |

## 8. 새 기능을 더할 때

1. 명령은 `app.js`의 명령 표에 넣고 메뉴·툴바·단축키는 그 id를 참조합니다. 단축키를 더하면 `popup.js`의 `SHORTCUT_LIST`와 두 설명서의 단축키 표(12장)도 고칩니다 — 문서 검사가 확인합니다.
2. 문구는 `src/i18n/music.js`에 `[한국어, English]` 쌍으로 넣습니다 (`node scripts/check-i18n.mjs`).
3. 곡 데이터에 필드를 더하면 `normalizeSong`에 기본값을 두어 옛 파일도 열리게 합니다.
4. 장르를 더하면 `genres.js` 한 곳에 진행·패턴·악기·빠르기를 적고, 작곡기 단위 테스트(모든 장르 × 분위기)가 자동으로 포함합니다.
