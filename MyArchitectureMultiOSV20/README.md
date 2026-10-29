# MyArchitecture 10.0

건축 평면도를 그리고, 그 자리에서 3D 로 보고, BIM 정보와 공사비까지 다루는 건축 설계 프로그램입니다.
인테리어(방마다 벽 마감, 포인트 벽, 걸레받이, 108가지 재질)와 강재 부재로 만드는 **격자 철탑·교량**(10가지 형식)도 다룹니다.
SketchUp 식 매스 모델링(밀기/끌기, 페인트 통, 줄자, 장면)과 CAD·BIM 파일 교환(DXF, IFC 4 / 4.3 / 2x3, OBJ, GLB …)을 함께 지원합니다.
같은 코드가 **웹 브라우저**와 **Windows / macOS / Linux 데스크톱 앱(Tauri 2)** 에서 그대로 돌아갑니다.
번들러 없이 순수 브라우저 JavaScript ES 모듈로 작성되어 있습니다 (three.js r186 은 `src/vendor` 에 포함).

> **English summary** — MyArchitecture draws architectural floor plans (walls, rooms, doors, windows, furniture,
> stairs, columns, roofs, levels, dimensions, grids), shows them in 3D (walk-through, sections, sun study, styles),
> manages BIM data (wall types with layers, phases, classification, properties, schedules, cost estimates,
> model checks) and offers SketchUp-style massing (push/pull, paint bucket, tape measure, scenes). Interiors get a
> wall finish per room or per wall face, skirting boards and a library of 108 materials; structural members build
> parametric lattice towers and ten kinds of bridge (girder, truss, tied arch, suspension, cable-stayed, deck arch,
> haunched girder, single-pylon harp, extradosed, stress ribbon). Repeated meshes are drawn as GPU instances, so even
> large models orbit smoothly. Every dialog is a window of its own. It imports and
> exports DXF, SVG, IFC 4 / 4.3 (IfcBridge) / 2x3, OBJ, STL, PLY, GLB / glTF, FBX, DAE, 3MF, 3DS, WRL, AMF and images, and prints
> scaled PDF sheets. Plain browser ES modules, no bundler; the same files run as a web page and as a Tauri 2 desktop app
> (a small Rust host, the system webview). `npm start` runs the desktop app, `npm run serve` serves it at <http://localhost:8642>, `npm test` runs the unit
> tests, `npm run smoke` the GUI tests (`npm run smoke:windows` the dialog windows), and `npm run build:win` /
> `build:mac` / `build:linux` build installers, which need neither Node.js nor Rust on the user's machine. The tutorial is in [docs/Tutorial.md](docs/Tutorial.md) and as a video,
> `MyArchitecture-Tutorial.mp4`.

![2층 주택 예제의 평면도](docs/images/ko/overview-plan.webp)

![같은 주택의 3D 보기](docs/images/ko/overview-3d.webp)

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/Tutorial.md](docs/Tutorial.md) | 처음 쓰는 사람을 위한 따라 하기. 모든 기능을 단계별로, 스크린샷과 함께 (21개 레슨 + 부록) |
| [UsersGuide.md](UsersGuide.md) | 사용 설명서. 메뉴·도구·단축키·설정·형식을 빠짐없이 정리한 참고서 |
| [Architecture.md](Architecture.md) | 개발자용 구조 설명. 모듈, 데이터 모델, 3D, 파일 형식, 테스트, 빌드 |
| [docs/USERSGUIDE.ko.html](docs/USERSGUIDE.ko.html) · [en](docs/USERSGUIDE.en.html) | 앱 안의 설명서(도움말 → 사용 설명서, `F1`) |
| `MyArchitecture-Tutorial.mp4` | 사용 방법 동영상: 대화형 튜토리얼(레슨 1 ~ 19, 101단계)을 보기 모드로 녹화 |

## 주요 기능

- **평면 그리기**: 벽(`W`, 클릭할 때마다 이어 그리기, 숫자로 길이 입력 `4500` · `3.6m` · `3600<90`, 모서리·T 자·십자
  이음 자동 정리), 방(`A`, 벽으로 둘러싸인 곳을 클릭 → 이름과 면적), 문(`D`)·창(`N`)(`X` 여는 방향, `H` 경첩),
  가구 115종(`F` 이름으로 찾기, 라이브러리에서 끌어 놓기), 계단(`S`), 기둥(`C`), 지붕(`O`, 박공·모임·외쪽·평지붕),
  층(아래층을 흐리게 겹쳐 보기), 치수(`K`, 자동 치수), 글자(`T`), 선(`L`), 측정(`M`), 구조 그리드(`G`)
- **편집**: 선택·상자 선택(Shift+끌기, 왼→오른쪽은 완전히 포함, 오른→왼쪽은 걸친 것), 이동(이어진 벽이 따라 늘어남),
  벽 끝 끌기, 복사·붙여넣기·복제, 회전(`R`)·대칭·배율·간격 띄우기, 그룹, 비슷한 것 선택, 찾기, 되돌리기 기록,
  더블클릭 속성 창, 오른쪽 클릭 메뉴(맨 위에 되돌리기/다시 실행)
- **3D**: 회전·이동·확대, 걷기(`V`, W/A/S/D), 보기 방향 7가지, 평행 투영, 스타일(사실적·흰색 모형·선 그림·X-레이),
  단면(`X`), 문 열기, 안개, 층·가구·지붕 표시, 2D 와 같은 **5×5 그리드**(확대해도 같은 간격으로 보이도록 칸 크기가 ×5 로 바뀜),
  대지 위치·날짜·시각으로 계산한 **태양 분석**과 그림자, 3D 에서 고른 요소를 평면에서도 선택
- **인테리어와 재질**: 방의 **벽 마감**(그 방을 바라보는 모든 벽 면), 벽 한쪽 면만 바꾸는 **포인트 벽**(오른쪽/왼쪽 면 마감),
  **걸레받이**(문에서 끊김), 평면의 마감 색 띠, 커튼·벽 그림·거울·상부장·레인지 후드·벽난로·샹들리에 등 인테리어 소품,
  가구 색 추천 견본. 재질 108가지를 14개 분류로 묶고 거칠기·금속성·패턴 요철을 3D 에 반영하며, 재질 칸은 견본 그림·
  분류·검색·최근 사용이 있는 **재질 선택 창**입니다.
- **구조 부재·철탑·교량**: 단면(사각, 원형 봉강·강관, 각관, I, H, T, L, C, 케이블)과 역할을 가진 3D **구조 부재**(평면에서 그리기,
  길이·중량, 톤당 공사비), 매개변수로 만드는 **격자 철탑**(높이, 테이퍼, 패널, 3·4·6면, X·K·단일 가새, 통로, 마스트)과
  **교량** 10가지(거더, 트러스, 타이드 아치, 현수, 사장, 상로 아치, 변단면 거더, 단주탑 하프형 사장, 엑스트라도즈드,
  스트레스 리본 — 평면 곡선, 종단 경사, 볼록 곡선). **교량 편집…** 으로 값을 바꾸면 부재를 다시 만들고, 옮기거나 돌려도
  값이 따라갑니다. IFC 로는 IfcMember·IfcBeam·IfcColumn·IfcPlate, IFC4.3 에서는 교량이 **IfcBridge** 로 나갑니다.
- **3D 성능**: 같은 지오메트리·재질의 메시를 GPU 인스턴스로 묶어 그립니다(사무용 타워 예제: draw call 29,380 → 964,
  프레임 82.6 → 10 ms). 편집한 층만 다시 만들고, 카메라를 돌릴 때는 그림자를 다시 그리지 않습니다.
- **SketchUp 식 매스 모델링**: 상자(`B`)·원기둥(`U`)·다각형 매스와 테이퍼, **밀기/끌기**, **페인트 통**(재료 팔레트),
  **줄자**, **장면**(시점 저장·이동·애니메이션 재생), 그룹
- **BIM**: 재료 층으로 두께를 정하는 **벽 타입**, 공사 단계(기존·철거·신축)와 단계별 보기, 분류 코드, IFC 클래스와
  GlobalId, 사용자 속성(내화 등급 등), 실 번호·부서, **일람표**(방, 문과 창, 벽 타입, 층)와 CSV, 단가 기반 **공사비**,
  **모델 검사**(겹친 벽, 막힌 문, 가구·계단·기둥 간섭 등; 그리는 동안 실행), 프로젝트·대지 속성
- **파일**: `.myarch` 프로젝트(자동 저장, 최근 파일 10개 · 하나씩 지우기 · 목록 비우기)
  - 가져오기: DXF(레이어 유지), SVG, IFC 4 / 2x3, OBJ(+MTL), STL, PLY, GLB / glTF, FBX, DAE, 3MF, 3DS, WRL, AMF,
    이미지(따라 그리기 밑그림)
  - 내보내기: DXF(AutoCAD 표준 레이어, 층마다 한 파일), IFC 4 / 2x3, GLB, glTF, OBJ+MTL(zip), STL, PLY, DAE, 3MF, USDZ,
    평면 SVG / PNG, 축척과 표제란이 있는 인쇄 / PDF / SVG 도면, 일람표 CSV
  - DWG(AutoCAD R13 ~ 2025), Sweet Home 3D(.sh3d), gbXML(Revit·ArchiCAD 내보내기), IFC ZIP 은 직접 가져옵니다.
  - Rhino 3DM(openNURBS)은 3D 모델(가구)로, 또는 위에서 본 모습을 CAD 레이어로 직접 가져옵니다.
  - SKP · RVT · PLN 은 공개되지 않은 형식이라 직접 열지 않고, 원래 프로그램에서 DXF · DAE · IFC 로 내보내는
    방법을 안내합니다.
- **편의**: 제목 표시줄 안의 보기 탭(시작 · 평면도 · 3D 보기), 제목 표시줄 오른쪽(최소화 단추 왼쪽)의 검색 돋보기·테마·언어·설정·정보 버튼(창을 가장 작게 해도 가려지지 않음; 검색은 `Ctrl+K` — 명령·방·층·가구 검색;
  제목 표시줄의 메뉴·탭·버튼은 창을 줄여도 가려지지 않음), 도구 모음의
  되돌리기/다시 실행, 페이지마다 다른 정보를 보여 주는 상태 표시줄과 오른쪽 아래 **창 크기 조절 표시**, 40가지 테마
  (다크 20 + 라이트 20) + 사용자 테마, 한국어/영어, 접으면 아이콘과 제목이 남는 좌우 패널(스크롤바 자리를 늘 비워 두어
  스크롤이 생겨도 내용이 잘리지 않음), 38개의 예제
- **대화상자는 독립 창**: 메인 창 밖으로 옮길 수 있고, 창마다 제목 표시줄에 그 창의 아이콘과 이름이 있습니다.
  단축키 창(`Ctrl+/`)은 탭과 검색으로 찾습니다.
- **시작 페이지**: 움직이는 배경(청사진, 스카이라인, 타워 크레인, 매스, 목조 골조, 3D 모델 등 21가지, 섞기·속도·투명도) 위의 카드 보드.
  카드는 손잡이로 끌어 옮기고 모서리로 크기를 바꾸며, 움직임은 모두 부드럽게 미끄러집니다. 배치는 저장되고 **자동 정렬**로 되돌립니다.
- **대화형 튜토리얼**: 도움말 → 대화형 튜토리얼. 21개 레슨 · 135단계(마지막 두 레슨은 빈 도면에서 3층 근린생활시설과, 아트리움·커튼월·45° 날개가 있는 3층 업무 시설을 설계하는 실전 과제), **보기**(프로그램이 직접 실행) / **따라 하기**
  (할 곳을 표시하고 결과를 자동 확인). 튜토리얼 동안에는 정해진 그리기 설정을 쓰고, 닫으면 내 설정으로 돌아갑니다.
- 도구 모음은 **늘 한 줄**이고 버튼이 숨겨지지 않습니다. 자주 쓰지 않는 도구는 ▾ 분할 버튼에 묶여 있습니다.
  창의 최소 폭은 제목 표시줄, 가장 넓은 도구 모음 한 줄, 양쪽 패널 최소 폭 + 가운데 작업 영역 중 가장 큰 값입니다.
  화면 자체가 도구 모음보다 좁을 때만 두 줄로 나뉩니다.

## 예제 (`sample/`)

| 파일 | 내용 |
| --- | --- |
| `01-studio.myarch` | 원룸: 주방 라인과 샤워실, 가구 배치, 평지붕 |
| `02-two-bedroom.myarch` | 방 두 개 아파트: 침실 2, 거실·식당·주방, 욕실, 현관 |
| `03-two-storey-house.myarch` | 2층 주택: 계단으로 연결된 2개 층, 박공지붕, 나무와 자동차가 있는 마당 |
| `04-small-office.myarch` | 소규모 사무실: 오픈 오피스, 유리 회의실, 기둥, 로비 |
| `05-wooden-cabin.myarch` | 목조 오두막: 목재 외장과 외쪽지붕 |
| `06-renovation-bim.myarch` | 리모델링: 기존·철거·신축 단계, 다층 벽 타입, 그리드, 실 번호, 속성, 공사비 |
| `07-massing-study.myarch` | 매스 스터디: 포디움·타워·원형 건물·테이퍼 지붕, 그룹, 장면 애니메이션 |
| `08-apartment-block.myarch` | 3층 공동주택: 계단실 중심 2세대 × 3개 층, 구조 그리드 위 기둥, 실 번호 |
| `09-cad-tracing.myarch` | DXF 도면 따라 그리기: CAD 레이어로 가져온 AutoCAD 도면을 벽으로 따라 그림 |
| `10-office-tower.myarch` | 업무용 빌딩: 8개 층, 코어(계단·엘리베이터·화장실), 커튼월, 기둥 그리드, 가구 600여 개 |
| `11-mixed-use.myarch` | 주상복합: 1층 상가(슈퍼마켓·카페·옷가게) + 아파트 4개 층 |
| `12-hospital.myarch` | 지역 병원: 진료실·영상실·약국·병실·간호사실, 중복도 2개 층 |
| `13-school.myarch` | 초등학교: 교실 2개 층, 도서관, 급식실, 체육관 |
| `14-courtyard-house.myarch` | 중정형 주택: 수영장·퍼걸러가 있는 ㄷ자 평면, 동마다 모임지붕 |
| `15-sketchup-complex.myarch` | 문화 단지(스케치업 스타일): 그룹으로 묶은 대형 매스 모델과 장면 9개 |
| `16-modern-villa.myarch` | 모던 빌라: 커튼월, 캔틸레버 2층, 평지붕, 수영장 |
| `17-townhouse.myarch` | 타운하우스: 좁은 3층 연립주택 + 옥상 테라스 |
| `18-modern-farmhouse.myarch` | 모던 팜하우스: 어두운 목재 외장, 박공 금속 지붕 |
| `19-duplex.myarch` | 듀플렉스: 경계벽을 공유하는 대칭 2층 주택 두 채 |
| `20-compact-house.myarch` | 콤팩트 하우스: 45 m² 단층, 외쪽지붕 |
| `21-interior-design.myarch` | 인테리어 디자인 아파트: 방마다 벽 마감, 포인트 벽, 걸레받이, 커튼·벽 그림·샹들리에, 방마다 눈높이 장면 |
| `22-lattice-towers.myarch` | 격자 철탑: 72 m 4각 X 가새 철탑과 36 m 3각 K 가새 중계탑, 장비실 |
| `23-bridges.myarch` | 강 위의 교량들: 거더·트러스·타이드 아치·사장·현수교와 곡선 고가교, 방문자 파빌리온 |
| `24-deck-arch-bridge.myarch` | 상로 아치교: 180 m 협곡, 45 m 높이 상판을 받치는 콘크리트 아치 |
| `25-haunched-girder-bridge.myarch` | 변단면 거더교: 교각 위에서 깊어지는 3경간 연속 박스 거더 |
| `26-harp-cable-stayed-bridge.myarch` | 단주탑 하프형 사장교: 주탑 하나와 평행한 케이블, 항구 입구 |
| `27-extradosed-bridge.myarch` | 엑스트라도즈드교: 낮은 마스트와 중앙 한 면의 케이블 |
| `28-stress-ribbon-footbridge.myarch` | 스트레스 리본 보도교: 지점 사이에 처진 얇은 콘크리트 리본 |
| `29-hotel.myarch` | 도심 호텔 (9개 층): 유리 포디움의 로비·레스토랑·연회장·라운지 바, 회의실·컨퍼런스 홀, 욕실이 딸린 객실 133개, 승강로, 수영장이 있는 옥상 테라스 |
| `30-university-library.myarch` | 대학 도서관 (4개 층): 4개 층을 관통하는 아트리움, 열람실·서가·그룹 스터디·세미나실, 보이드를 내려다보는 갤러리, 아트리움 위가 뚫린 슬래브 |
| `31-sports-centre.myarch` | 생활 체육관 (2개 층): 2개 층 높이 체육관과 농구 코트·관람석·장스팬 철골 보, 탈의실, 헬스장·댄스 스튜디오, 실내 창이 있는 관람 갤러리 |
| `32-residential-complex.myarch` | 주거 단지 (12층 + 8층): 상가·주차층 포디움 위 아파트 타워 두 동, 동마다 주민 로비와 코어, 64세대, 조경 옥상 테라스 |
| `33-atrium-office.myarch` | 아트리움 업무 시설 (6개 층): 건물 길이만큼 뚫린 아트리움, 층마다 보이드를 건너는 브리지 두 개, 커튼월, 반대쪽 모서리의 코어 두 곳 |
| `34-general-hospital.myarch` | 종합 병원 (6개 층): 응급·영상·검사·수술실이 있는 2층 포디움과 직각으로 뻗은 병동 두 동, 연결 로비, 동마다 코어 |
| `35-courtyard-school.myarch` | 중정형 학교 (3개 층): 중정을 둘러싼 네 동, 중복도 교실, 과학실·음악실·미술실, 연결 로비, 중정 위가 뚫린 슬래브 |
| `36-terraced-office.myarch` | 계단식 테라스 사무소 (5개 층): 층마다 4 m 씩 물러나는 평면, 층마다 유리 난간·화단이 있는 옥상 테라스 |
| `37-u-shaped-apartments.myarch` | ㄷ자형 아파트 (7개 층): 정원을 둘러싼 본동과 양 날개, 94세대(거실·침실·욕실), 세 끝의 코어 |
| `38-museum.myarch` | 사선 전시동이 있는 박물관 (2개 층): 기둥 위 곡선 캐노피, 전시실 여덟 곳, 약 37° 로 꺾인 단층 전시동 |

`npm run build:samples` 가 `scripts/create-samples.mjs` 로 예제를 다시 만들고, 각 예제가 모델 검사 오류·경고 0 개이며
DXF·IFC 로 내보낼 수 있는지 확인합니다. `npm run build:samples -- --only 21 22` 는 그 번호의 예제만 다시 씁니다
(id 가 무작위라 전체를 다시 만들면 모든 파일이 바뀝니다).

## 요구 사항

**설치해서 쓰는 사람**에게는 아무것도 필요 없습니다. 설치 파일 하나에 프로그램(Rust 로 컴파일된 실행 파일)과 화면(HTML·JS)이
모두 들어 있어 Node.js 나 Rust 를 따로 설치하지 않습니다. 화면은 운영체제의 웹뷰로 그립니다 — Windows 10/11 에는
WebView2 가 이미 들어 있고, 없으면 설치 프로그램이 함께 설치합니다(설치 파일에 WebView2 부트스트래퍼 포함).
macOS 는 WKWebView, Linux 는 WebKitGTK(`libwebkit2gtk-4.1`, deb 가 의존성으로 설치)를 씁니다.

**개발·빌드하는 사람**에게만:

- Node.js 22 이상, `npm install` (Tauri CLI, three.js, 아이콘 생성용 pngjs / png-to-ico, 테스트용 @xmldom/xmldom)
- Rust (stable, <https://rustup.rs>) — Windows 는 MSVC 빌드 도구, Linux 는 `libwebkit2gtk-4.1-dev` 등 [Tauri 준비물](https://tauri.app/start/prerequisites/)
- 튜토리얼 동영상을 만들 때만: ffmpeg (`choco install ffmpeg`, 또는 환경 변수 `FFMPEG` 에 경로)
- 아이콘을 다시 그릴 때만: Edge 또는 Chrome (`MYARCH_BROWSER` 로 경로 지정 가능)

## 실행

| 명령 | 설명 |
| --- | --- |
| `npm start` (= `npm run dev`) | 데스크톱 앱 개발 실행: `tauri dev` 가 프로젝트 폴더를 <http://localhost:5236> 으로 서비스하고(`scripts/dev-server.mjs`) `src-tauri` 를 디버그로 빌드해 띄움. 페이지 수정은 Ctrl+R 로 바로 보이고, `src-tauri` 수정은 다시 빌드해 재시작. `npm start -- C:\plans\house.myarch` 처럼 파일을 넘길 수 있음 |
| `npm run serve` | 프로젝트 폴더를 <http://localhost:8642> 로 서비스 → 브라우저에서 바로 사용 |
| `npm run serve -- dist/web` | 웹 빌드 결과물을 서비스 |
| `PORT=9000 npm run serve` | 다른 포트 사용 |

웹 버전은 ES 모듈을 쓰므로 `file://` 로 `index.html` 을 직접 열면 동작하지 않습니다. 반드시 HTTP 서버로 여세요.

## 테스트

```bash
npm test                  # test/unit/*.test.mjs (약 1,450개)를 분류별로 실행한 뒤 src-tauri 의 Rust 테스트(cargo test)까지
npm test -- ifc dxf       # 이름에 ifc 또는 dxf 가 들어간 파일만 (npm test -- rust: Rust 테스트만)
npm run test:rust         # cargo test 의 출력 그대로
npm run smoke             # 실제 데스크톱 앱(Tauri 디버그 빌드)을 CDP 로 조작하는 GUI 검사
npm run smoke -- --only "drawing,3d view"   # 일부 영역만 (--keep: 내보낸 파일 보존, --shots 폴더: 실패 화면 저장)
npm run smoke:windows     # 대화상자가 독립 창으로 열리는지: 아이콘·제목, 메인 창 밖 이동, 닫기·Esc·Enter, 중첩 창
npm run bench:3d          # 예제마다 3D 빌드·편집 시간, 메시·지오메트리·draw call 수 (Node)
npm run bench:3d:gui      # 실제 앱에서 GPU 까지 끝난 프레임 시간, 궤도 회전 FPS, 편집 반영 시간
npm run i18n:check        # 한국어 사전에 없는 t("…") 키 보고 (현재 1,900여 개 모두 번역됨)
```

`npm test` 는 테스트를 분류별(핵심 모델·기하, 평면 편집, 검사·일람표, 3D 모델, CAD 교환(DXF·SVG), BIM 교환(IFC),
3D 교환, 예제, 지역화, 데스크톱 셸(Rust))로 묶어 각 테스트의 시간과 함께 보여 주고 마지막에 색깔 있는 요약을 출력합니다.

`npm run smoke` 와 문서·녹화 스크립트는 `src-tauri/target/debug/MyArchitecture.exe`(페이지를 품은 디버그 빌드,
`npm run build:debug`)를 띄웁니다. 그 파일이 없거나 소스보다 오래되었으면 먼저 다시 빌드합니다(`test/smoke/launch.mjs`).
실행마다 임시 폴더를 `MYARCH_CONFIG_DIR` 로 넘겨 설정·웹뷰 프로필을 따로 쓰므로 사용자가 띄워 둔 MyArchitecture 와
설정은 건드리지 않고, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…` 로 CDP 를 엽니다(Windows 전용).
임시 프로필로 실제 창을 띄워(뷰포트 흉내가 아니라 **실제 창 크기**를 바꿔 가며) 마우스·키보드로
모든 메뉴·명령·예제, 벽·방·문·가구 그리기, 편집과 되돌리기, BIM 창, 3D 도구·장면·태양·그리드, 상태 표시줄과 창 크기
조절, 모든 내보내기(실제로 파일을 쓰고 다시 가져와 확인), 최근 파일, 설정·테마·언어, 좁은 화면의 도구 모음,
튜토리얼 전체(영어·한국어 보기 모드와 따라 하기 확인)를 검사합니다. 파일 대화 상자는 `MYARCH_FAKE_DIALOGS`
(임시 폴더에 저장, 여는 파일은 `MYARCH_OPEN_FILE`)로 바뀌고, 인쇄는 프린터 대신 그 폴더에 PDF 와 작업 내용을 쓰므로
아무 창도 실행을 막지 않습니다. 렌더러에서 잡히지 않은 오류가 나면 그 단계가 실패합니다.
GUI 검사는 대화상자를 메인 창 안에 그리도록(`MYARCH_INLINE_DIALOGS=1`, 드라이버 기본값) 실행하고, 독립 창 동작은
`npm run smoke:windows` 가 따로 검사합니다. 다른 무거운 작업과 동시에 돌리면 마우스 타이밍 단계가 흔들릴 수 있으니
단독으로 실행하세요.

## 문서용 자료 만들기

| 명령 | 결과 |
| --- | --- |
| `npm run build:docs` | `scripts/docs-shots.mjs` 가 앱을 띄워 기능마다 스크린샷을 찍어 `docs/images/ko/*.webp`, `docs/images/en/*.webp` 와 캡션 목록 `shots.json` 을 만듦 (`--lang ko`, `--only 이름`) |
| `npm run record:tutorial` | `scripts/record-tutorial.mjs` 가 대화형 튜토리얼을 보기 모드로 처음부터 끝까지 실행하며 녹화해 루트에 `MyArchitecture-Tutorial.mp4`(1600×900, 25fps, H.264)를 만듦 (`--lang en`, `--speed 1.5`, `--lessons 1-3`, `--out 파일`; ffmpeg 는 PATH 또는 `FFMPEG`) |
| `node scripts/build-manual.mjs` | `UsersGuide.md` 로 앱 안의 설명서 `docs/USERSGUIDE.ko.html` 을, `docs/UsersGuide.en.md` 로 `docs/USERSGUIDE.en.html` 을 만듦 |

## 빌드

| 명령 | 결과 |
| --- | --- |
| `npm run build:art` (= `build:icons`) | `scripts/render-art.mjs` 가 헤드리스 Edge/Chrome 에서 `scripts/art/art.js` (3D 로 그린 집을 올린 입체 정사각형 타일)를 그려 `assets/` 의 앱/문서 아이콘, `assets/art/hero.png`, NSIS 사이드바/헤더 BMP 를 만듦 |
| `npm run vendor` | `node_modules/three` 에서 필요한 three.js 파일과 addon 을 `src/vendor/three` 로 복사 |
| `node scripts/build-info.mjs` | 버전·커밋·브랜치·빌드 날짜를 `src/buildinfo.js` 에 기록(정보 창에 표시). `npm start` 와 모든 빌드가 자동 실행 |
| `npm run build:web` | `dist/web/` 에 웹 버전 (index.html, style, src, assets, sample, docs 복사). 데스크톱 빌드도 이 폴더를 실행 파일에 넣음 |
| `npm run build:debug` | 테스트용 `src-tauri/target/debug/MyArchitecture.exe` (페이지 포함, 설치 파일 없음) |
| `npm run build:win` | **Windows 설치 파일** — NSIS 설치 프로그램 (x64) → `MyArchitecture_10.0.0_x64-setup.exe` |
| `npm run build:mac` | **macOS 설치 파일** — `MyArchitecture.app` + dmg (서명 없음), macOS 에서 실행 |
| `npm run build:linux` | **Linux 설치 파일** — AppImage + deb, Linux 에서 실행 |
| `npm run build:all` | 지금 OS 에서 만들 수 있는 설치 파일 전부 |

설치 파일은 위의 `npm run build:win` 같은 명령으로 만듭니다(`scripts/build.mjs`). 각 명령은 `tauri build` 를 실행해
빌드 정보를 쓰고(`src/buildinfo.js`), 페이지를 `dist/web` 에 복사해 실행 파일 안에 넣은 뒤(`tauri.conf.json` 의
`beforeBuildCommand`), 그 OS 의 설치 파일을 묶습니다. Tauri 는 실행 중인 OS 의 설치 파일만 만들므로 macOS·Linux 용은
그 OS(또는 CI)에서 만듭니다. 결과는 `src-tauri/target/release/bundle/<nsis|dmg|appimage|deb>/` 에 생기고, 찾기 쉽도록
프로젝트 루트에도 복사됩니다(이전 버전의 설치 파일은 지움).

### Windows 설치 프로그램

- 설치하는 컴퓨터에 Node.js·Rust 가 필요 없습니다. 실행 파일 하나와 예제·아이콘만 설치되고, WebView2 가 없으면 함께 설치합니다.
- 시작할 때마다 **한국어 / English** 설치 언어를 고르는 창이 뜹니다(이전 설치에서 고른 언어가 기억되어 있어도 다시 물음).
- 사용자 계정에 설치(`%LOCALAPPDATA%\MyArchitecture`, 관리자 권한 필요 없음), 바탕화면/시작 메뉴 바로 가기.
- 이미 설치된 MyArchitecture(이전 Electron 판 또는 Tauri 판)가 있으면 알린 뒤 완전히 제거하고 설치합니다(사용자 데이터는 유지).
- 그다음 이전 데이터(`%APPDATA%\MyArchitecture` 의 설정, `%LOCALAPPDATA%\com.shkwon.myarchitecture` 의 자동 저장)가
  있으면 삭제할지 따로 묻습니다. `/S` 조용한 설치는 두 질문을 건너뛰고 데이터를 남깁니다(`src-tauri/windows/hooks.nsh`).
- `.myarch` 파일을 MyArchitecture 에 연결하고 문서 아이콘을 붙입니다.

## 데이터 위치

| OS | 설정 (`settings.json`) |
| --- | --- |
| Windows | `%APPDATA%\MyArchitecture` |
| macOS | `~/Library/Application Support/MyArchitecture` |
| Linux | `~/.config/MyArchitecture` |

Electron 판과 같은 폴더라 설정은 그대로 이어집니다. 자동 저장은 웹뷰의 `localStorage` 에 있습니다(Windows:
`%LOCALAPPDATA%\com.shkwon.myarchitecture`). 웹 버전은 설정·자동 저장 모두 브라우저 `localStorage` 에 저장합니다.

## 프로젝트 구조

```text
index.html            앱 진입점 (웹·데스크톱 공용)
style/app.css         스타일 (테마는 CSS 변수만 바꿈)
src/
  core/               데이터 모델(project.js), 기하(geom.js), 벽 이음(walls.js), 방 찾기(rooms.js), 지붕(roof.js),
                      모델 검사(check.js), 일람표·공사비(schedule.js), 태양 위치(sun.js),
                      구조 부재(members.js), 철탑·교량 생성기(structures.js)
  plan/               평면 편집기(editor.js), 렌더러(render.js), 선택·스냅·변형(ops.js)
  view3d/             3D 모델 생성(build.js: 층 재사용, 인테리어 마감, 걸레받이), 뷰어(viewer.js: 탐색·걷기·단면·스타일·
                      태양·그리드·도구·내보내기), 인스턴스 배칭(batch.js), 구조 부재 3D(members.js)
  io/                 DXF, SVG, IFC, 3D 모델, OBJ/MTL, Collada, 3MF, ZIP
  lib/                가구 카탈로그(115종), 재질 라이브러리(108종, 분류·물성·패턴)
  ui/                 앱 셸(app.js: 창 단추 포함), desktop-bridge.js (Tauri 명령 → window.myarch), 패널, 대화 상자(widgets.js: 데스크톱에서 독립 창), 재질 선택 창(matpicker.js),
                      철탑·교량 대화상자(structures.js), 내보내기, 3D 탭, 시작 페이지(start.js: 끌어 옮기고 크기를 바꾸는 카드 보드, startlayout.js: 배치 규칙, startbg.js: 움직이는 배경 21가지), 튜토리얼, 테마, 한국어 사전,
                      platform.js (데스크톱/웹 차이를 감춤)
  vendor/three/       three.js r186 과 addon (npm run vendor)
sample/               예제 프로젝트 (index.json + *.myarch)
assets/               아이콘·그림 (npm run build:art 로 생성)
docs/                 튜토리얼(Tutorial.md), 앱 안의 설명서 HTML (ko/en) 과 스크린샷 (docs/images/ko, docs/images/en)
src-tauri/             데스크톱 셸 (Tauri 2, Rust)
  src/lib.rs          창(프레임 없는 메인 창, 대화상자 창, 설명서 창), 명령(파일·설정·예제·인쇄·창 크기), 단일 인스턴스
  src/files.rs        파일 읽기/쓰기, 명령줄로 받은 파일, 예제 이름 검사
  src/print.rs        WebView2 인쇄: 프린터 목록, 고른 프린터로 바로 인쇄, PDF 로 저장
  src/window_icon.rs  작업 표시줄·Alt+Tab 의 큰 아이콘
  tauri.conf.json     번들(아이콘, 파일 연결, NSIS 한/영), capabilities/, windows/hooks.nsh (설치 훅)
build/                NSIS 사이드바/헤더 그림
scripts/              실행·빌드·테스트·문서 스크립트
test/unit/            단위 테스트 (node --test)
test/smoke/           GUI 스모크 테스트 (CDP), 대화상자 창 검사(windows-smoke.mjs), 최소 폭 확인, 드라이버
MyArchitecture-Tutorial.mp4   사용 방법 동영상 (npm run record:tutorial)
```

## 데스크톱 API (`window.myarch`)

`src/ui/desktop-bridge.js`(모듈보다 먼저 실행되는 일반 스크립트)가 Tauri 명령(`src-tauri/src/lib.rs`)과 호스트가 넣어 주는
`window.__MYARCH_BOOT__`(버전·OS·대화상자 모드)로 만들고 `src/ui/platform.js` 가 감쌉니다. 웹에서는 `window.myarch` 가
없으므로 platform.js 가 브라우저 대체 동작(파일 선택/다운로드, `window.print()`, `localStorage`)을 씁니다.

`getVersion`, `loadSettings`, `saveSettings`, `openFile`, `readPath`, `saveFile`, `writeFile`, `print`, `printToPDF` (Windows),
`listPrinters` / `printSheets` (인쇄 창의 프린터 목록과 바로 인쇄; macOS·Linux 는 시스템 인쇄 창), `openExternal`, `openManual`,
`setZoom`, `onOpenPath`, `onRequestClose` / `confirmClose` / `closeWindow`, `setMinSize`,
`windowSize` / `resizeWindow` / `onWindowState` (상태 표시줄의 창 크기 조절), `setTitleBar`, `listSamples`, `readSample`,
`minimize` / `toggleMaximize` / `isMaximized` / `startDragging` (페이지가 그리는 창 단추와 제목 표시줄), `closeDialog` / `moveDialog` (대화상자 창 닫기·옮기기),
`inlineDialogs` (GUI 테스트에서 대화상자를 창 안에 그림).

메인 창은 Windows·Linux 에서 운영체제 제목 표시줄이 없고(최소화·최대화·닫기 단추는 페이지가 그림), macOS 에서는 신호등
단추가 페이지 위에 놓입니다. Windows 에서는 CSS `-webkit-app-region: drag` 로 창을 끌고(WebView2 비클라이언트 영역),
macOS·Linux 에서는 제목 표시줄을 누르면 `startDragging` 을 부릅니다.

대화상자 창은 렌더러가 `window.open("about:blank#dialog-<깊이>-<id>")` 로 열고, 호스트의 `on_new_window` 가 그 창을
프레임 없는 자식 창(메인 창 또는 한 단계 아래 대화상자 소유)으로 만들며 열려 있는 동안 소유 창을 비활성화합니다(모달).
같은 출처라 렌더러가 대화상자를 그 문서로 옮기고, 닫을 때는 `closeDialog(label)` 로 호스트가 창을 없앱니다.

웹뷰에 끌어다 놓은 파일은 경로를 알 수 없어 내용으로 엽니다(저장할 때 위치를 물음). 파일 탐색기에서 두 번 클릭하거나
명령줄로 넘긴 파일은 경로째 열립니다.
