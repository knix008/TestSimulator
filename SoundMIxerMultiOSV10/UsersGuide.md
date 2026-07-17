# Users Guide

이 문서는 Sound Effect Studio의 기본 사용법을 설명합니다.

## 1. 오디오 가져오기

1. 상단의 `오디오 가져오기` 버튼을 클릭합니다.
2. 여러 파일을 선택하면 트랙으로 추가됩니다.
3. 지원 포맷이 아닌 경우 자동으로 제외됩니다.

## 2. 트랙 믹싱

각 트랙에서 다음을 조정할 수 있습니다.

- 볼륨 (dB)
- 팬 (좌/우)
- 뮤트(M), 솔로(S), CUE(C)
- 프리셋(Flat, Vocal, Drums, Ambient)
- FX 파라미터(EQ/컴프레서/리버브)

트랙 카드는 드래그 앤 드롭으로 순서를 바꿀 수 있습니다.

## 3. 재생/정지/루프

웨이브폼 상단 버튼을 사용합니다.

- `재생`: 재생/일시정지
- `정지`: 재생 위치를 처음으로 이동
- `믹스 저장`: 현재 믹스를 WAV로 저장

루프 기능:

- `Loop In`: 현재 위치를 루프 시작점으로 저장
- `Loop Out`: 현재 위치를 루프 종료점으로 저장

## 4. 웨이브폼 컨텍스트 메뉴

웨이브폼 또는 클립 레인에서 우클릭하면 메뉴가 열립니다.

메뉴 항목:

- 재생/일시정지 (`Space`)
- 정지 (`Shift+Space`)
- Loop In 설정 (`I`)
- Loop Out 설정 (`O`)
- 믹스 저장 (`Ctrl+S`)
- 오디오 가져오기 (`Ctrl+O`)

## 5. 테마/언어 변경

상단 우측 설정에서 변경할 수 있습니다.

- Theme: `Dark` / `Light`
- Language: `한국어` / `English`

설정은 로컬 저장소에 저장되어 다음 실행 시 복원됩니다.

## 6. 프로젝트 저장/불러오기

- `프로젝트 저장`: 현재 상태를 프로젝트 파일로 저장
- `프로젝트 불러오기`: 저장된 프로젝트를 복원

형식:

- `.smixz` (압축)
- `.json` (비압축)

## 7. 문제 해결

- 파일이 안 열릴 때: 포맷 지원 여부 확인
- 소리가 안 날 때: 트랙 뮤트/솔로/CUE 상태 확인
- 라이트/다크가 부분 적용될 때: 테마를 다시 전환 후 확인
- UI 언어가 일부만 바뀔 때: 앱 재시작 후 확인

## 8. 스크린샷 가이드

아래 3장을 먼저 캡처하면 사용 가이드를 빠르게 완성할 수 있습니다.

1. 메인 화면 (Dark): 트랙/웨이브폼/인스펙터가 모두 보이게 캡처
2. 메인 화면 (Light): 동일 구도에서 테마 전환 후 캡처
3. 웨이브폼 컨텍스트 메뉴: 우클릭 메뉴와 단축키 배지가 보이게 캡처

권장 파일명:

- `docs/screenshots/guide-main-dark.png`
- `docs/screenshots/guide-main-light.png`
- `docs/screenshots/guide-context-menu.png`

삽입 예시:

```md
![Guide Main Dark](docs/screenshots/guide-main-dark.png)
![Guide Main Light](docs/screenshots/guide-main-light.png)
![Guide Context Menu](docs/screenshots/guide-context-menu.png)
```
