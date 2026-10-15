# MyCAD V1.0

기계 설계용 2D 도면 + 3D 솔리드 CAD (버전 1.0, 화면에는 `V1.0`). JavaScript(Vite) + Tauri 2 로 Windows · macOS · Linux 데스크톱 앱과 웹 버전을 함께 만듭니다.
FreeCAD(https://www.freecad.org)의 Part · Part Design · Sketcher · TechDraw · Draft · Mesh · **BIM** 워크벤치와 Fasteners/Gears 애드온 기능을 참고했고,
**FreeCAD 문서(.FCStd)와 IFC · STEP · BREP · OpenSCAD · STL · OBJ · PLY · OFF · 3MF · VRML · COLLADA(DAE) 를 읽고 쓰며, 실제 FreeCAD 로 왕복 검증**합니다.

## 주요 기능

| 분야 | 기능 |
| --- | --- |
| 2D 제도 | 선 · 폴리선 · 사각형 · 원 · 호 · 타원 · 정다각형 · 문자 · 중심선, 치수 5종, 풍선 · 기하 공차(GD&T) · 데이텀, 이동/복사/회전/대칭/크기/간격 띄우기, 자르기 · 연장 · 모깎기 · 모따기, 배열, 클론(원본을 따르는 복사본), 작업 평면, **스케치 구속(일치 · 수평 · 수직 · 평행 · 직각 · 같게 · 접선 · 동심 · 대칭 · 고정 · 거리 · 가로/세로 거리 · 반지름 · 지름 · 각도 — 풀이기, 자유도 표시)** · 보조선, 분해, 레이어, 스냅 · 격자(확대해도 5×5) · 직교 · 눈금자 · 점선 십자선 · 축척 막대(끌어 옮기기·끝선으로 길이 조절), 길이 단위 mm/cm/m/in/ft (입력 자동 변환) |
| 부품 라이브러리 | 6분류 36종 (ISO 볼트·나사·너트·와셔·구멍, 핀·키·멈춤링·O-링, 기어·랙·스프로킷·풀리·웜, 베어링·부시·축·플랜지, 스프링 3종, 형강·알루미늄 프로파일·파이프) |
| 3D 솔리드 | 상자 · 원기둥 · 구 · 원뿔 · 토러스 · 튜브 · 쐐기 · 각기둥 · 타원체 · 나선, 돌출(Pad, 구배 각도) · 회전(Revolve) · 로프트(여러 단면, 직선 · 매끄럽게) · 스윕(원형 또는 아무 닫힌 단면) · 포켓 · 그루브 · 구멍(자리파기 · 접시머리 · 드릴 끝), 불리언(합치기 · 빼기 · 교차, 트리 유지), 3D 모깎기 · 모따기 · 두께 · 오프셋, 형상 검사 · 메시 수리 · 단순화, **FEM 골조 해석(보 요소: 지지 · 하중 · 단면 → 변위 · 모멘트 · 응력)**, 단면, 투상도(숨은선 점선), 위치 X·Y·Z + 회전 X·Y·Z |
| 건축 (BIM) | FreeCAD BIM 처럼 **하나의 3D 모델에서 평면도와 3D 가 함께**: **대지 › 건물 › 층** 트리(층별 평면도·보이기·표고), **재료**(색·해칭)와 **다층 벽**, 벽(경로·두께·높이·정렬, 모서리 맞춤) + 창(나눔 칸)·문·양개문·미닫이·개구부·**스케치로 만드는 창**(벽이 뚫림), 커튼월, 기둥 · 보(사각·원·H·ㄷ·ㄱ·T·각관·원형관, **IPE · HEA · UPN · RHS · CHS 규격**) · 슬래브, 계단(일자 · ㄱ자 · ㄷ자 · 나선), 지붕(**아무 평면, 변마다 경사 — 직선 골격**), 공간(실 이름·면적), 난간(난간 살 · 유리), 가구·설비 12종, 통심선(격자 · 방사형), **철근**(기둥·보·슬래브 자동 배근, 선을 따른 모양 철근, 무게), **트러스**(프랫·하우·워렌), **패널**(평판·골판, **판 재단**), **배관**(엘보 · 전선 · 덕트). 2D 화면은 바닥 1 m 단면 평면도(벽 해칭 · 문 열림 · 창 · 계단 끊김선 · 실 이름/면적), 물량표(CSV), **IFC 4 내보내기/가져오기**(FreeCAD NativeIFC 로 검증) |
| 3D 보기 | 회전 · 확대 · 시점 4종, 좌표축 눈금(도형에 가려짐), 바닥 격자 5×5, 마우스로 옮기는 조명(해) · 켜기/끄기 · 속성, **보기 스타일 10종**(기본 · 음영 · 조명 없음 · 점토 · 숨은선 제거 · X-Ray · 스케치 · 와이어프레임 · 메시 · 점), 축 눈금은 크기에 맞는 단위(건물은 m, 부품은 mm)와 축 이름에 단위, 해는 원점 기준, 솔리드별 색 · 선택 강조 · 클릭으로 선택 |
| 파일 | .mcad(자체) · **2D: DXF(R12–2018 · 바이너리 · ANSI 코드 페이지) · SVG · IGES · HP-GL/2 읽기/쓰기, Gerber · Excellon 읽기, DXF 2000 · PNG 쓰기** · **3D: FCStd · IFC · STEP · BREP · OpenSCAD(.scad/.csg) · STL/OBJ/PLY/OFF/AMF/3MF/VRML/DAE 읽기/쓰기** · **CAM: G 코드(윤곽 · 포켓 · 드릴 · 각인)** · **스크립트 콘솔 · 매크로(JavaScript `cad` 객체, 기록 · 저장 · 실행)** · 인쇄(미리보기 · 쪽 설정 · 범위) |
| 배우기 | **시작 페이지**(메뉴 줄 맨 왼쪽 집 버튼 · 탭 줄 집 탭, 맞물려 도는 3D 기어 배경, 할 수 있는 일 12가지(건축 도면 포함) ↔ 레슨 · 샘플, 샘플 33개 썸네일, 최근 파일, 오늘의 팁) · **따라 하는 튜토리얼**(21레슨 95단계, 보기/직접 하기, 패널은 별도 창) · [doc/Tutorial.md](doc/Tutorial.md)(그림 포함) · 튜토리얼 동영상 `MyCAD-Tutorial.mp4` |
| 화면 | 메뉴/팝업은 독립 창, 툴바 1줄/2줄(FreeCAD 식 Part 툴바), 왼쪽 패널 묶음 접기, 고정 크기 설정 창, 컨트롤 높이 · 열 정렬 통일, 테마 40종 + 사용자, 한국어/English, 최근 파일, 배경 이미지, 상태 표시줄 |

FreeCAD 와 기능별 대응은 앱의 **도움말 › 기능표** 에서, 읽고 쓰는 파일 형식은 **도움말 › 프로그램 정보 › 지원 파일 형식** 에서 볼 수 있습니다 (지원 / 부분 지원 / 미지원).
모깎기 · 모따기 · 구속 조건 풀이 · FEM · CAM · Python 매크로는 아직 지원하지 않습니다 — 대응표에 그대로 적혀 있습니다.

## 실행 · 빌드

```bash
npm install
npm start                 # 데스크톱 앱 (개발 모드)
npm run dev               # 웹 버전 (http://localhost:1450)
npm run build:web         # 웹 빌드 → dist/
npm run build:win         # Windows 설치 파일 (NSIS, 한국어/English)
npm run build:mac         # macOS .dmg
npm run build:linux       # .deb / .rpm / .AppImage
npm run build:samples     # samples/ 다시 만들기 (+ samples/exports/ 3D 형식)
npm run build:samples:freecad   # samples/freecad/ · samples/drawings/ — FreeCAD 가 직접 만든 파일 (FreeCAD 필요)
npm run build:docs        # doc/ — 실제 앱으로 튜토리얼 단계마다 그림을 찍고 Tutorial.md/.html 생성 (한국어·English)
npm run record:tutorial   # MyCAD-Tutorial.mp4 — 튜토리얼 전체를 보기 모드로 재생하며 녹화 (ffmpeg 필요, FFMPEG=…)
```

- 버전은 `package.json`(과 `src-tauri/Cargo.toml`) 하나에서 옵니다. 제목 표시줄 · 프로그램 정보 · 시작 페이지는 주.부 번호만 `V1.0` 으로 보여 줍니다.
- `MyCAD-Tutorial.mp4`(튜토리얼 동영상, 약 6분)는 저장소에 함께 둡니다. `doc/images/` 의 그림과 `doc/Tutorial*.md/.html` 은 `npm run build:docs` 가 다시 만듭니다 — 레슨을 고쳤다면 직접 고치지 말고 다시 만드세요. 루트의 `Tutorial*.md/.html` 은 그 사본(그림 경로만 `doc/images/`)입니다.

## 테스트

```bash
npm test                  # 전체 (분류별 결과 + Summary 표)
npm test -- --quick       # js · freecad · package · rust
npm run test:freecad      # 실제 FreeCAD 왕복 검증
MYCAD_E2E_GROUPS="3D solids" npm test -- --only desktop   # 바뀐 GUI 그룹만
```

| 분류 | 내용 |
| --- | --- |
| js | 단위 테스트 129개: 도면 검사(문제 패널), 기하, 객체, 부품 36종, 단위 변환, 솔리드 · 불리언 · 단면 · 투상(숨은선), 3D 파일(ZIP · deflate · XML · STEP · FCStd), 2D 파일(DXF 텍스트·바이너리·cp949, SVG, IGES, HP-GL, Gerber, Excellon — FreeCAD · ezdxf 가 만든 파일 포함), 시작 페이지 샘플 목록 · 튜토리얼 레슨 · doc/ 그림 일치, 대응표, 번역, 아이콘 |
| freecad | FreeCADCmd 로 MyCAD 가 쓴 FCStd · STEP · BREP · OpenSCAD CSG · STL · OBJ · PLY · OFF · 3MF · DAE 와 samples/exports 를 열어 물체별 부피 · 위치 비교, 2D IGES 는 곡선 길이, SVG · DXF 2000 은 FreeCAD 의 Draft 로 열어 비교 (`FREECAD_CMD` 또는 설치된 FreeCAD, 없으면 건너뜀) |
| package · rust | 아이콘 · 설치 프로그램 설정 · 파일 형식 등록 · Rust 백엔드 |
| web · desktop | 웹 빌드(헤드리스 Edge)와 실제 앱(WebView2 CDP)을 자동 조작하는 GUI 테스트 — 시작 페이지, 튜토리얼 83단계(보기 · 직접 하기), 단위 · 축척 막대, 2D CAD 형식 열기 포함 |

## 폴더

```
src/domain/   플랫폼 무관 핵심 (도면 · 부품 · 솔리드 · CSG · 파일 형식)
src/view/     캔버스 렌더러 · 도구 · 3D 보기(three.js) · 시작 페이지(startpage.js · 기어 배경 startbg.js)
src/app.js    주 창,  src/popup.js  팝업 창들
src-tauri/    Rust 백엔드 (파일 입출력 · 팝업 창 · 글꼴 · 클립보드)
scripts/      빌드 · 테스트 실행 · 샘플 · FreeCAD 스크립트(scripts/freecad)
samples/      예제 도면 + index.json(시작 페이지), exports/(2D·3D 형식), freecad/ · drawings/ · dxf/(다른 프로그램이 만든 파일)
src/tutorial/ 따라 하는 튜토리얼 (player.js 패널 · lessons.js 16레슨)
doc/          Tutorial.md / Tutorial.en.md (+ .html) 와 그림 images/<언어>/
test/         unit · freecad · static · e2e
```

처음이라면 [doc/Tutorial.md](doc/Tutorial.md)(그림이 들어간 레슨별 설명)나 앱의 **도움말 › 따라 하는 튜토리얼**부터 보세요.
자세한 구조는 [Architecture.md](Architecture.md), 사용법은 [UsersGuide.md](UsersGuide.md) 를 보세요.

만든 사람: SHKWON (knix008@naver.com)
