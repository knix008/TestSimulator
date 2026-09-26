# sample

MyCAD 기능 테스트용 샘플 파일입니다. `npm run build:samples` 로 다시 만들 수 있고,
`tests/samples.test.ts` 가 앱과 동일한 파서로 모든 파일을 읽어 검증합니다.

| 파일 | 설명 |
| --- | --- |
| `box.mycad` | 기본 박스 한 개 (파일 열기/저장 확인) |
| `primitives.mycad` | 박스·구·원기둥·원뿔·토러스·평면 6종 |
| `sketch-pad.mycad` | 스케치 + 패드 피처 + 파라미터 수식 |
| `assembly.mycad` | 3개 부품 + 구속(mate) + 파라미터 (어셈블리/BOM/관성) |
| `patterns.mycad` | 선형/원형 패턴 결과 |
| `mesh-pyramid.mycad` | 메쉬 솔리드 (메쉬 평가·감축·세분 테스트) |
| `bim-house.mycad` | BIM 요소·층 정보가 든 건물 (수량 산출/IFC 내보내기) |
| `sketchup-scene.mycad` | 그룹·태그·장면·단면 평면이 든 SketchUp 스타일 모델 |
| `spreadsheet.mycad` | 별칭과 수식이 든 스프레드시트 |
| `sheetmetal-bracket.mycad` | 시트메탈 월/플랜지 (전개도·성형성 검사) |
| `fem-beam.mycad` | FEM 해석 컨테이너와 구속/하중이 든 외팔보 |
| `kinematics-crank.mycad` | 회전·직선 조인트가 든 크랭크 슬라이더 |
| `cube.stl` | ASCII STL 큐브 (STL 가져오기) |
| `pyramid.stl` | ASCII STL 사각뿔 |
| `plate.obj` | OBJ 메쉬 |
| `profile.svg` | SVG 프로파일 도면 |
| `profile.dxf` | DXF 프로파일 도면 (LINE + CIRCLE) |
| `bracket.scad` | OpenSCAD 소스 (importOpenScad) |
| `scan-points.asc` | 기울어진 평면 위 점군 49개 (평면/구/곡면 근사) |
| `scan-points.xyz` | 같은 점군의 XYZ 형식 (헤더 없음) |
| `building.ifc` | IFC4 건물 (IFC 가져오기) |
| `pocket.nc` | G코드 포켓 가공 (3패스) |
| `profile.gcode` | 같은 포켓 가공 경로의 .gcode 형식 |
| `parameters.csv` | 파라미터 표 (CSV 읽기) |
| `design-table.csv` | CATIA 디자인 테이블 3구성 |
| `spreadsheet.csv` | 수식이 든 CSV 시트 |
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
