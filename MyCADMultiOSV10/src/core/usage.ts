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
  }
}
