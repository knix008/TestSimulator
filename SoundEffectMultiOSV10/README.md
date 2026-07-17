# Sound Effect Studio

Sound Effect Studio는 Electron 기반의 멀티 트랙 오디오 믹싱/편집 앱입니다.
웹(브라우저)과 데스크톱(Electron) 환경에서 동작하며, 트랙 단위 볼륨/팬/FX 조정, 프로젝트 저장/불러오기, 믹스다운(WAV) 내보내기를 지원합니다.

## 주요 기능

- 멀티 트랙 오디오 가져오기 (WAV, MP3, OGG, FLAC, AAC/M4A, AIFF, WebM 등)
- 트랙 믹싱: 볼륨, 팬, 뮤트/솔로, CUE
- 트랙 FX: EQ(3밴드), 컴프레서, 리버브
- 타임라인/클립 편집, 루프 인/아웃, 오토메이션
- 프로젝트 저장/불러오기 (`.json`, `.smixz`)
- 믹스다운 저장(WAV)
- 테마 전환 (Light/Dark)
- 언어 전환 (한국어/영어)
- 웨이브폼 컨텍스트 메뉴(아이콘 + 레이블 + 단축키 표시)

## 빠른 시작

## 1) 개발 환경 실행

```bash
npm install
npm run start
```

## 2) 웹 미리보기 실행

```bash
npm run web
```

기본 포트: `5173`

## 3) 패키징

```bash
npm run pack
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## 단축키

- `Space`: 재생/일시정지
- `Shift+Space`: 정지
- `I`: Loop In 설정
- `O`: Loop Out 설정
- `Ctrl+O`: 오디오 가져오기
- `Ctrl+S`: 믹스 저장

## 폴더 구조

- `electron/`: 메인 프로세스 (`main.js`, `preload.js`)
- `src/`: 렌더러(UI/오디오 처리)
- `src/audio/`: 오디오 처리 로직
- `src/styles/`: UI 스타일/테마
- `src/i18n/`: 다국어 리소스
- `samples/`: 샘플 프로젝트/템플릿
- `scripts/`: 유틸 스크립트

## 최근 반영된 추천 변경

- 라이트/다크 테마 전환 범위 확대 (주요 패널 + 내부 모듈)
- 언어 전환 시 동적 버튼 텍스트(스냅/크로스페이드/커브/밀도) 동기화
- 웨이브폼 상단 재생/정지 버튼 배치 및 컨텍스트 메뉴 단축키 표기

## 스크린샷

문서에 사용할 이미지는 다음 경로에 저장하는 것을 권장합니다.

- `docs/screenshots/overview-dark.png`
- `docs/screenshots/overview-light.png`
- `docs/screenshots/context-menu.png`

삽입 템플릿:

```md
![Overview Dark](docs/screenshots/overview-dark.png)
![Overview Light](docs/screenshots/overview-light.png)
![Wave Context Menu](docs/screenshots/context-menu.png)
```

## 라이선스

MIT
