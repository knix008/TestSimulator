export const USAGE: Record<string, { ko: string[]; en: string[] }> = {
  partDesign: {
    ko: ['1. 사각형 또는 원 스케치를 만듭니다.', '2. 패드로 돌출하거나 포켓으로 파냅니다.', '3. 필렛, 구멍, 패턴으로 형상을 다듬습니다.', '4. 업데이트로 파라미터 변경을 다시 계산합니다.'],
    en: ['1. Create a rectangle or circle sketch.', '2. Pad to add material or Pocket to cut it.', '3. Finish with fillet, hole, and pattern.', '4. Update recomputes parameter changes.']
  },
  part: {
    ko: ['1. 박스, 원기둥, 구 같은 기본 솔리드를 넣습니다.', '2. 두 개를 선택한 뒤 합집합, 차집합, 교집합을 적용합니다.', '3. 단면으로 내부를 봅니다.'],
    en: ['1. Insert a box, cylinder, or sphere.', '2. Select two solids, then union, cut, or common.', '3. Section shows the interior.']
  },
  sketcher: {
    ko: ['1. 작업 평면에 스케치를 그립니다.', '2. 구속 풀기로 수평, 수직, 일치, 거리, 동일 길이를 맞춥니다.', '3. 파라미터로 너비 공식을 넣습니다.'],
    en: ['1. Draw a sketch on a work plane.', '2. Solve constraints for horizontal, vertical, coincident, distance, and equal.', '3. Add a width formula with Parameter.']
  },
  draft: {
    ko: ['1. 스케치나 솔리드를 선택합니다.', '2. 이동, 회전, 배율로 배치를 바꿉니다.', '3. 대칭과 패턴으로 반복합니다.'],
    en: ['1. Select a sketch or solid.', '2. Move, rotate, or scale it.', '3. Repeat it with mirror and pattern.']
  },
  techdraw: {
    ko: ['1. top, front, iso로 투영 방향을 고릅니다.', '2. SVG 또는 DXF로 도면을 내보냅니다.', '3. 인쇄로 미리보기 후 출력합니다.'],
    en: ['1. Choose top, front, or iso.', '2. Export the drawing as SVG or DXF.', '3. Print opens a preview, then output.']
  },
  mesh: {
    ko: ['1. STL 가져오기로 메쉬를 읽습니다.', '2. STL 또는 OBJ로 다시 내보냅니다.', '3. 거리 측정으로 크기를 확인합니다.'],
    en: ['1. Import STL to read a mesh.', '2. Export STL or OBJ.', '3. Measure checks the size.']
  },
  spreadsheet: {
    ko: ['1. 파라미터에 이름과 수식을 넣습니다.', '2. 업데이트를 눌러 스케치와 패드를 다시 계산합니다.'],
    en: ['1. Enter a name and formula in Parameter.', '2. Update rebuilds the sketch and pad.']
  },
  assembly: {
    ko: ['1. 솔리드 두 개를 선택합니다.', '2. 일치 또는 오프셋으로 붙입니다.', '3. 관성 측정으로 부피와 면적을 봅니다.'],
    en: ['1. Select two solids.', '2. Join them with coincidence or offset.', '3. Inertia reports volume and area.']
  },
  fem: {
    ko: ['1. 솔리드를 선택합니다.', '2. 막대 요소는 강성 EA/L로 응력과 변위를 계산합니다.', '3. CalculiX 볼륨 메시 해석은 포함하지 않습니다.'],
    en: ['1. Select a solid.', '2. The bar element uses stiffness EA/L for stress and displacement.', '3. A CalculiX volume-mesh solve is not included.']
  },
  cam: {
    ko: ['1. 사각형 스케치로 가공 윤곽을 만듭니다.', '2. 포켓 가공은 공구 반지름만큼 안쪽을 여러 깊이로 깎습니다.', '3. G코드 내보내기는 윤곽 한 바퀴입니다.'],
    en: ['1. Make a rectangle sketch as the profile.', '2. Pocket path cuts inside the tool radius at several depths.', '3. Export G-code saves one outline pass.']
  },
  bim: {
    ko: ['1. 스케치를 패드로 밀어 벽을 만듭니다.', '2. 구멍으로 개구부를 냅니다.', '3. IFC 내보내기는 벽을 IFC4 텍스트로 저장합니다.'],
    en: ['1. Pad a sketch to make a wall.', '2. Hole cuts an opening.', '3. Export IFC writes the walls as IFC4 text.']
  },
  points: {
    ko: ['1. 점 가져오기로 X Y Z 목록을 점 무리로 넣습니다.', '2. 거리 측정으로 점 사이 거리를 봅니다.'],
    en: ['1. Import points turns an X Y Z list into a point set.', '2. Measure reports the distance.']
  },
  surface: {
    ko: ['1. 스케치를 곡면으로 얇은 시트로 만듭니다.', '2. 로프트로 두 단면을 잇습니다.'],
    en: ['1. Surface makes a thin sheet from the sketch.', '2. Loft joins two profiles.']
  },
  robot: {
    ko: ['1. 로봇 자세는 링크 길이와 관절 각으로 끝점 좌표를 계산합니다.', '2. 끝점 위치에 마커가 생깁니다.'],
    en: ['1. Robot pose computes the tool point from link lengths and joint angles.', '2. A marker is placed at that point.']
  },
  openscad: {
    ko: ['1. cube, sphere, cylinder, translate, union, difference 문을 읽습니다.', '2. 결과 솔리드를 장면에 넣습니다.'],
    en: ['1. Reads cube, sphere, cylinder, translate, union, and difference.', '2. The resulting solid is added to the scene.']
  },
  inspection: {
    ko: ['1. 솔리드 두 개를 선택합니다.', '2. 검사는 부피 차와 중심 거리를 상태바에 보여 줍니다.'],
    en: ['1. Select two solids.', '2. Inspect shows the volume delta and the distance between centers.']
  },
  reverse: {
    ko: ['1. 점 가져오기로 스캔 점군을 불러옵니다.', '2. 평면 근사 또는 구 근사로 기본 형상을 찾습니다.', '3. 곡면 근사로 점군을 메쉬 곡면으로 만듭니다.'],
    en: ['1. Import a scanned point cloud.', '2. Fit a plane or a sphere to it.', '3. Approximate surface turns the cloud into a mesh.']
  },
  material: {
    ko: ['1. 솔리드를 선택하고 재질 지정을 누르면 재질이 순환합니다.', '2. 질량 특성으로 부피, 면적, 질량을 확인합니다.', '3. 재질 목록에서 밀도와 탄성계수를 봅니다.'],
    en: ['1. Select a solid and cycle its material card.', '2. Mass properties reports volume, area, and mass.', '3. Material library lists density and modulus.']
  },
  measureWb: {
    ko: ['1. 두 객체를 선택해 거리를 측정합니다.', '2. 각도, 면적, 부피를 각각 측정합니다.', '3. 바운딩 박스로 전체 크기를 확인합니다.'],
    en: ['1. Select two objects to measure the distance.', '2. Measure angle, area, and volume.', '3. Bounding box reports the overall size.']
  },
  macro: {
    ko: ['1. 매크로 실행으로 스크립트 명령을 해석합니다.', '2. 수식 계산으로 단위와 함수를 확인합니다.', '3. 시트 재계산으로 파라미터를 갱신합니다.'],
    en: ['1. Run macro parses the script commands.', '2. Evaluate expression checks units and functions.', '3. Recompute sheet refreshes the parameters.']
  },
  gsd: {
    ko: ['1. 와이어를 만들고 서피스 돌출이나 회전으로 면을 만듭니다.', '2. 스윕, 멀티섹션, 필, 블렌드로 곡면을 구성합니다.', '3. 조인, 분할, 힐링 검사로 스킨을 정리합니다.'],
    en: ['1. Create a wire, then extrude or revolve it into a surface.', '2. Build shapes with sweep, multi-section, fill, and blend.', '3. Join, split, and healing check clean the skin.']
  },
  sheetMetal: {
    ko: ['1. 시트메탈 월로 기준 판을 만듭니다.', '2. 플랜지와 헴을 추가해 굽힘을 정의합니다.', '3. 전개도로 전개 길이를 계산하고 DXF로 내보냅니다.'],
    en: ['1. Create the base wall.', '2. Add flanges and hems to define the bends.', '3. Unfold computes the developed length and exports DXF.']
  },
  kinematics: {
    ko: ['1. 두 부품을 선택해 회전 또는 직선 조인트를 만듭니다.', '2. 자유도 확인으로 구속 상태를 봅니다.', '3. 시뮬레이션과 간섭 검사로 동작을 확인합니다.'],
    en: ['1. Select two parts and add a revolute or prismatic joint.', '2. Check the remaining degrees of freedom.', '3. Simulate and run clash detection.']
  },
  knowledge: {
    ko: ['1. 수식 파라미터로 Height = Width/2 같은 관계를 만듭니다.', '2. 규칙과 체크로 설계 조건을 검증합니다.', '3. 디자인 테이블로 구성을 전환합니다.'],
    en: ['1. Add a formula parameter such as Height = Width/2.', '2. Validate the design with rules and checks.', '3. Switch configurations with a design table.']
  },
  drafting: {
    ko: ['1. 도면 페이지로 정면/평면/측면/아이소 투영을 만듭니다.', '2. 단면도와 상세도를 추가합니다.', '3. 치수와 부품표를 넣고 SVG 또는 DXF로 내보냅니다.'],
    en: ['1. Create a page with front, top, right, and iso views.', '2. Add section and detail views.', '3. Add dimensions and a BOM, then export SVG or DXF.']
  },
  sketchup: {
    ko: ['1. 사각형/원 도구로 면을 그립니다.', '2. 푸시/풀로 입체를 만들고 폴로미로 스윕합니다.', '3. 그룹, 컴포넌트, 태그, 장면으로 모델을 정리합니다.'],
    en: ['1. Draw a face with the rectangle or circle tool.', '2. Push/Pull it into a solid and sweep with Follow Me.', '3. Organise with groups, components, tags, and scenes.']
  },
  solidTools: {
    ko: ['1. 두 솔리드를 선택합니다.', '2. 합집합, 차집합, 트림, 교집합을 적용합니다.', '3. 아웃터 쉘로 외곽만 남깁니다.'],
    en: ['1. Select two solids.', '2. Apply union, subtract, trim, or intersect.', '3. Outer shell keeps only the outside.']
  },
  sandbox: {
    ko: ['1. 지형 생성으로 격자 지형을 만듭니다.', '2. 등고선 지형으로 컨투어를 삼각분할합니다.', '3. 스무브로 지형을 들어올립니다.'],
    en: ['1. Create a grid terrain from scratch.', '2. Triangulate contours into a terrain.', '3. Smoove raises the terrain.']
  },
  kernel: {
    ko: ['1. 솔리드를 선택하고 B-rep 정보로 위상을 확인합니다.', '2. B-rep 챔퍼/필렛은 반평면 절단과 구 민코프스키 합으로 정확히 계산합니다.', '3. NURBS 곡선·곡면으로 유리 곡선을 만듭니다.'],
    en: ['1. Select a solid and inspect its B-rep topology.', '2. B-rep chamfer and fillet are exact: half-space clipping and a rolling ball.', '3. Build rational curves and surfaces with the NURBS tools.']
  },
  addons: {
    ko: ['1. 애드온 목록에서 카탈로그를 확인합니다.', '2. 애드온 설치로 확장을 추가하고 사용 전환으로 켜고 끕니다.', '3. 애드온 명령 실행은 샌드박스 Python으로 동작합니다.'],
    en: ['1. List the addon catalogue.', '2. Install an addon and toggle it on or off.', '3. Addon commands run through the sandboxed Python interpreter.']
  }

}
