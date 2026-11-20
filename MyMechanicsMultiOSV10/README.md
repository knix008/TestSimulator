# MyMechanics

SolidWorks 스타일의 파라메트릭 3D 기계 설계 프로그램입니다. Windows · macOS · Linux 데스크톱(Tauri 2)과 웹 브라우저에서 같은 기능으로 실행됩니다. 형상은 **OpenCASCADE B-rep 커널**(WebAssembly, [replicad](https://replicad.xyz))로 계산하고, 화면은 three.js로 그립니다. 시작 화면·메인 화면·팝업 창·설정·프로그램 정보의 스타일은 MySketchBook과 같습니다.

## 기능

| 영역 | 기능 |
|---|---|
| 스케치 | 선·중심선·코너/중심 사각형·원·3점/중심점 호·다각형·직선 홈·점, 끝점 맞춤(일치)·선 위 맞춤·중간점 맞춤, 그릴 때 수평/수직 자동 구속, 구속 조건 14종, 지능형 치수(거리·수평/수직 거리·반지름·지름·각도), Levenberg–Marquardt 구속 솔버, 완전/불완전/과잉 정의 색 표시(검정/파랑/빨강)와 자유도, 끌어서 움직이기, 참조 치수, 보조선 |
| 부품 피처 | 돌출 보스/컷(블라인드·관통·관통 양쪽·중간 평면·방향 2), 회전 보스/컷, 필렛, 모따기, 쉘, 구멍 가공 마법사(단순·카운터보어·카운터싱크, M3–M20), 선형 패턴(2방향), 원형 패턴, 대칭 복사, 참조 평면, STEP/STL 가져온 바디 |
| FeatureManager | 만든 순서의 트리, 피처 아래 스케치, 실패 표시와 고치는 방법, `(-)` 불완전 정의, 억제, 롤백 바, 피처 편집·삭제(의존 피처 포함), 면·모서리 참조의 기하 기반 재탐색 |
| 어셈블리 | 부품 삽입(프로젝트·예제·STEP), 고정/해제, 메이트(일치·동심·거리·평행·직각·각도, 정렬/반대 정렬), 전체 메이트 동시 풀이, 정의 상태, 간섭 검사 |
| 도면 | 정면·평면·우측·좌측·배면·저면·등각·이등각 뷰(은선 제거 HLR), 제3각/제1각 배치, 자동 표준 척도, 은선, 외곽 치수, 표제란, A4–A0·Letter·Tabloid, 뷰 끌기, DXF·SVG 내보내기, 인쇄 |
| 평가 | 질량 특성(재질 16종 밀도), 측정(길이·면적·지름·최소 거리·각도), 단면도 |
| 보기 | 표준 보기·면에 수직·원근/직교, 표시 스타일 5종, 미리 강조(주황)·선택(파랑), 방향 축 표시 |
| 파일 | `.mymech` 프로젝트(부품·어셈블리·도면 한 파일), STEP 가져오기/내보내기, STL, DXF, SVG, PNG |
| 셸 | 시작 화면 카드 보드와 움직이는 배경, 팝업 창 메뉴·설정·프로그램 정보·진행률, 테마 40여 종과 사용자 테마, 한국어/English, 사용 설명서 창, 예제 18개 |

## 실행

```bash
npm install
npm start            # 데스크톱 (tauri dev, Vite 5494 포트)
npm run dev          # 웹 (http://127.0.0.1:5494)
```

## 빌드

```bash
npm run build:web    # 웹 (dist/)
npm run build:win    # Windows 설치 파일 (NSIS)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (deb · rpm · AppImage)
```

설치 파일은 `release/`와 프로젝트 루트에 복사됩니다.

## 테스트

```bash
npm test                 # JS 단위 · 패키징/문서/번역 · 웹 E2E (헤드리스 Edge, 실제 마우스 입력)
npm test -- --quick      # 브라우저 없이
npm test -- --rust       # Rust 단위 테스트까지
npm run i18n:check       # 모든 UI 문구의 한국어·영어
```

## 문서

* [사용 설명서](doc/UsersGuide.md) · [User's Guide](doc/UsersGuide.en.md) — `npm run build:docs`로 앱의 도움말 창용 HTML을 만듭니다.
* [구조](ARCHITECTURE.md) — 모듈, 데이터 흐름, 커널 사용법.

© SHKWON (knix008@naver.com). 제3자 라이선스는 `licenses/` (OpenCASCADE는 LGPL-2.1, 별도 WebAssembly 파일로 교체할 수 있습니다).
