# MyClock (Multi-OS)

가로형 탁상시계 스타일의 데스크톱 시계 애플리케이션 — **Windows · Linux · macOS** 공통.

WPF/.NET 8 판([MyClockWinV10](../MyClockWinV10))을 JavaScript + Electron 으로 옮긴 것입니다.
원본 소스는 참고용으로 [`legacy-wpf/`](legacy-wpf/)에 보관되어 있습니다.

## 기능

| 기능 | 설명 |
|------|------|
| 디지털 / 아날로그 전환 | 시계 위 토글 버튼, 설정 패널, 우클릭 메뉴 어디서나 전환 |
| 디지털 스타일 10종 | 7세그먼트 · LCD · 미니멀 · 레트로 · 네온 · 도트 · 한글 · 매트릭스 · 빈티지 · 씬 |
| 아날로그 스타일 11종 | 클래식 · 미니멀 · 로마 숫자 · 인덱스 · 철도 · 바우하우스 · 도트 · 파일럿 · 항해 · 모던 · 스팀펑크 |
| 12 / 24시간 모드 | 설정 패널에서 전환 |
| 18가지 테마 | 디지털 표시 색까지 함께 바뀜 — 다크·라이트·미드나이트·오션·루비·에메랄드·퍼플·앰버·로즈·모노·선셋·민트·사이버·포레스트·사쿠라·골드·슬레이트·라벤더 |
| 밝기 / 색상 | 디지털 표시 밝기 (슬라이더 + 시계 위 마우스 휠), 숫자 색상·오전/오후 색상 선택기 |
| 세계 시간 | 286개 도시 자동완성, 미니 아날로그 시계, 드래그로 순서 변경 |
| 알람 | 복수 알람, 요일별 반복, 팝업 + 알람음 |
| 타이머 | 복수 타이머, 시·분·초 설정, 완료 시 팝업 |
| 스톱워치 | 랩 기록 |
| 캘린더 | 월간 보기, 일정 추가·편집, 반복 일정, 미리 알림 |
| 알람음 32종 | 실행 시 합성 (Web Audio) — 음원 파일 없음 |
| 전체 화면 시계 | Windows 전용 화면 보호기(.scr)를 대신하는 크로스플랫폼 모드 |
| 시스템 트레이 | 매초 갱신되는 미니 아날로그 시계 아이콘 |
| 작업 표시줄 | 실행 중에는 앱 아이콘이 작업 표시줄에 표시 (트레이로 숨기면 사라짐) |
| 투명 창 | 평소에는 시계만 보이고, 마우스를 올리면 배경·날짜·조작 버튼이 나타남 |
| 자동 실행 | Windows/macOS 로그인 항목, Linux `~/.config/autostart` |

## 실행

```bash
npm install
npm start
```

**요구사항:** Node.js 18 이상

## 설치 패키지 만들기

```bash
npm run build          # 현재 OS용
npm run build:win      # Windows — NSIS 설치 파일 (.exe)
npm run build:linux    # Linux — AppImage, deb
npm run build:mac      # macOS — dmg, zip
```

결과물은 `dist/` 에 생성되고, 설치 파일은 프로젝트 루트로 복사됩니다.

Windows 설치 관리자(`MyClock-Setup-1.0.0.exe`)는 설치 도중 **바탕화면 / 시작 메뉴
바로가기를 만들지 사용자가 고르는 페이지**를 보여줍니다(`build/installer.nsh`).
체크한 바로가기만 만들어지고, 프로그램을 제거하면 함께 지워집니다.

앱 아이콘은 `asset/icon.svg` 한 장에서 파생됩니다. 아이콘을 바꿨다면:

```bash
npm run icons
```

## 설정 저장 위치

| OS | 경로 |
|----|------|
| Windows | `%AppData%\MyClockMultiOS\` |
| Linux | `~/.config/MyClockMultiOS/` |
| macOS | `~/Library/Application Support/MyClockMultiOS/` |

`settings.json`(설정·알람·타이머·세계 도시)과 `calendar_events.json`(일정)이 저장됩니다.

WPF 판을 쓰던 컴퓨터에서 처음 실행하면 `%AppData%\MyClock\` 의 설정과 일정을
자동으로 한 번 가져옵니다. 원본은 수정하지 않으므로 WPF 판도 계속 쓸 수 있습니다.

## 프로젝트 구조

```
MyClockMultiOSV10/
├── electron/
│   ├── main.js            — 창·트레이·IPC·자동 실행
│   ├── preload.js         — 렌더러에 노출되는 API (contextBridge)
│   ├── store.js           — 설정/일정 저장 및 WPF 판 가져오기
│   └── win-timezones.js   — Windows 시간대 ID → IANA (가져오기 전용)
├── src/
│   ├── index.html         — 시계 창
│   ├── panel.html         — 설정 사이드 패널
│   ├── alarm.html         — 알람/타이머 팝업
│   ├── menu.html          — 우클릭 메뉴 (창 밖으로 넘칠 수 있도록 별도 창)
│   ├── fullscreen.html    — 전체 화면 시계
│   ├── styles/            — 창별 스타일시트
│   └── js/
│       ├── clock.js          — 시계 창 컨트롤러 (앱 상태의 주인)
│       ├── panel.js          — 설정 패널 컨트롤러
│       ├── analog-clock.js   — 아날로그 시계 11종 캔버스 렌더러
│       ├── digital-display.js— 7세그먼트 · 도트 매트릭스 렌더러
│       ├── tones.js          — 알람음 32종 합성 (Web Audio)
│       ├── timers.js         — 타이머 · 스톱워치
│       ├── korean.js         — 한글 시각 표기
│       └── data/             — 테마 18종, 도시 286개, 스타일 카탈로그
├── scripts/               — 아이콘 생성, 설치 파일 복사, 변환 스크립트
└── legacy-wpf/            — 원본 WPF 소스 (빌드에 포함되지 않음)
```

자세한 설계는 [Architecture.md](Architecture.md), 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.
