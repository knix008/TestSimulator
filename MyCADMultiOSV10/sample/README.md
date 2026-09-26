# sample

MyCAD 기능 테스트용 샘플 파일입니다. `npm run build:samples` 로 다시 만들 수 있고,
`tests/samples.test.ts` 가 앱과 동일한 파서로 모든 파일을 읽어 검증합니다.

| 파일 | 설명 |
| --- | --- |
| `box.mycad` | 기본 박스 한 개 (파일 열기/저장 확인) |
| `primitives.mycad` | 박스·구·원기둥·원뿔·토러스·평면 6종 |
| `sketch-pad.mycad` | 스케치 4개(3개 평면) + 패드/보스/포켓/홀/필렛 + 파라미터 수식 |
| `assembly.mycad` | 베어링 스탠드 11개 부품 + 구속 6개 + 파라미터 (어셈블리/BOM/관성) |
| `patterns.mycad` | 4×3 선형 격자 12개 + 원형 패턴 핀 8개 |
| `mesh-pyramid.mycad` | 닫힌 메쉬 3개: 계단 피라미드·기어·구멍 플레이트 |
| `bim-house.mycad` | BIM 요소·층 정보가 든 건물 (수량 산출/IFC 내보내기) |
| `sketchup-scene.mycad` | 그룹·태그·장면·단면 평면이 든 SketchUp 스타일 모델 |
| `spreadsheet.mycad` | 별칭과 수식이 든 스프레드시트 |
| `sheetmetal-bracket.mycad` | 시트메탈 월/플랜지 (전개도·성형성 검사) |
| `fem-beam.mycad` | FEM 해석 컨테이너와 구속/하중이 든 외팔보 |
| `kinematics-crank.mycad` | 회전·직선 조인트가 든 크랭크 슬라이더 |
| `cube.stl` | ASCII STL 큐브 (STL 가져오기) |
| `cube.step` | STEP AP214 큐브 (왕복 검증용 최소 예제) |
| `bracket.step` | STEP L-브래킷: 리브 + 보스 2개 (면 1,500개 규모) |
| `plate.ply` | PLY 마운트 플레이트: 90×60×8, 관통 구멍 Ø24 |
| `gear.off` | OFF 스퍼 기어: 이 18개 + 보어 |
| `gear.stl` | STL 스퍼 기어 (메쉬 감축·법선 정리 테스트) |
| `wedge.off` | OFF 피라미드 (최소 예제) |
| `profile.igs` | IGES 와이어프레임: 외곽 + 슬롯 + 볼트 원 4개 |
| `assembly.dae` | Collada 3개 형상(하우징·샤프트·커버)이 든 어셈블리 |
| `pyramid.stl` | ASCII STL 계단식 피라미드 5단 (면 88개, 닫힌 솔리드) |
| `plate.obj` | OBJ 그룹 3개(플레이트·보스·리브) + 법선 + v//vn 면 |
| `profile.svg` | SVG 가스켓 도면: 외곽·창·슬롯 + 볼트 원 6개 |
| `profile.dxf` | DXF 가스켓 도면: 레이어 5개, LINE 18 + CIRCLE 6 |
| `bracket.scad` | OpenSCAD 소스: 4개 형상 union + 보어 2개 difference |
| `scan-points.asc` | 기울어진 평면 위 점군 169개 (평면/구/곡면 근사) |
| `scan-points.xyz` | 같은 점군의 XYZ 형식 (헤더 없음) |
| `building.ifc` | IFC4 건물: 4개 층, 요소 41개 (IFC 가져오기) |
| `pocket.nc` | G코드 포켓 가공: 4패스 + 펙 드릴링, 공구 2개 |
| `profile.gcode` | 윤곽 가공 .gcode: G2/G3 원호 3패스 |
| `parameters.csv` | 파라미터 표 5구성 (CSV 읽기) |
| `design-table.csv` | CATIA 디자인 테이블 6구성 |
| `spreadsheet.csv` | 수식 5개가 든 CSV 시트 (면적·부피·질량·원가) |
| `macro.mycadmacro` | 매크로 스크립트 샘플 |
| `macro.py` | Python 매크로 (Part API, 불리언, 반복문) |
| `addon-manifest.json` | 애드온 매니페스트 (설치/실행 테스트) |
| `hex-nuts.mycadaddon` | 설치용 애드온 패키지 (.mycadaddon 연결 테스트) |

## 사용법

- `.mycad`: 파일 > 열기 로 불러옵니다.
- `.stl`: 파일 > STL 가져오기.
- `.asc`: 점 워크벤치 > 점 가져오기 후 역설계 근사 명령.
- `.scad`: OpenSCAD 워크벤치 > OpenSCAD 가져오기.
- `.ifc`: 건축 메뉴 > IFC 관련 명령으로 확인.
- `.csv`: 스프레드시트 / 지식공학(디자인 테이블).
- `.nc`, `.svg`, `.dxf`, `.obj`: 내보내기 결과 비교용 기준 파일.
