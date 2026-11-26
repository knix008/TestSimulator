// The tutorial — building the six-axis robot (the start page's "tutorial" samples, src/cad/samples/tutorial.js) — as
// one plan: every lesson's steps with their text (Korean / English) and what each step adds to the model. The
// documents (scripts/make-tutorial-doc.mjs → doc/Tutorial.md, Tutorial.en.md) print the text; the video
// (scripts/make-tutorial-video.mjs) replays the steps on the finished robot's data, so the video, the documents and
// the lesson samples are the same robot.
//
// A step's `do`: { newPart: i } (part i of the robot, in build order), { part: i, from, to } (its features from..to,
// sketches drawn and features made in their own PropertyManagers), { newAssembly: 'grip' | 'robot' },
// { components: 'grip' | 'robot', items: [..] }, { mates: …, items }, { motors: …, items, play: s }, { explode: true },
// { drawing: true }, { view: 'iso' | 'front' … }.
const L = (ko, en) => ({ ko, en });

export const PARTS = ['로봇 베이스 / Robot base', '선회 몸체 (J1) / Waist (J1)', '상완 (J2) / Upper arm (J2)', '전완 (J3) / Forearm (J3)', '손목 요크 (J4) / Wrist yoke (J4)', '손목 피치 (J5) / Wrist pitch (J5)', '툴 플랜지 (J6) / Tool flange (J6)', '그리퍼 몸체 / Gripper body', '그리퍼 핑거 / Gripper finger'];

export const INTRO = L(
  '이 튜토리얼은 6축 다관절 로봇을 처음부터 끝까지 만듭니다. 부품 9개(베이스, 선회 몸체 J1, 상완 J2, 전완 J3, 손목 요크 J4, 손목 피치 J5, 툴 플랜지 J6, 그리퍼 몸체, 그리퍼 핑거)를 스케치와 피처로 만들고, 그리퍼 서브 어셈블리와 로봇 어셈블리를 메이트로 조립해 관절마다 모터를 달아 움직인 뒤, 분해도와 부품표가 있는 조립 도면으로 마칩니다. 단위는 mm입니다. 각 과의 결과는 시작 화면 › 예제 › **튜토리얼 — 6축 로봇**에 들어 있어, 아무 과에서나 이어서 할 수 있습니다.',
  'This tutorial builds a six-axis articulated robot from start to finish. You model nine parts (base, waist J1, upper arm J2, forearm J3, wrist yoke J4, wrist pitch J5, tool flange J6, gripper body, gripper finger) from sketches and features, assemble a gripper sub-assembly and the robot with mates, give every joint a motor and watch it move, and finish with an exploded view and an assembly drawing with a bill of materials. Units are millimetres. Each lesson\'s result is on the start page under Samples › **Tutorial — six-axis robot**, so you can pick up at any lesson.',
);

/** Plane names as the app shows them. */
export const LESSONS = [
  {
    id: 'tut01', title: L('베이스 — 회전 몸체', 'Base — the revolved body'), sub: L('단면 하나를 돌려 받침 몸체를 만듭니다.', 'Turn one section round to make the base body.'),
    steps: [
      { say: L('시작 화면에서 새 부품을 만들고, 작업 창에서 이름 "로봇 베이스", 재질 회주철, 부품 번호 RB-100을 넣습니다.', 'On the start page make a new part; in the task pane name it "Robot base", material cast iron, part number RB-100.'), do: { newPart: 0 } },
      { say: L('정면에 스케치하고 몸체의 반단면을 닫힌 선으로 그립니다: (0, 0) → (110, 0) → (110, 18) → (78, 18) → (72, 140) → (0, 140). 원점을 지나는 세로 중심선도 넣습니다.', 'Sketch on the Front plane and draw half the body\'s section as a closed outline: (0, 0) → (110, 0) → (110, 18) → (78, 18) → (72, 140) → (0, 140). Add a vertical centreline through the origin.'), do: { part: 0, from: 0, to: 0 } },
      { say: L('회전 보스를 누릅니다. 중심선이 축으로 잡히고 360° 돌아 지름 220의 플랜지와 원뿔 기둥이 생깁니다. ✔를 누릅니다.', 'Press Revolved Boss: the centreline becomes the axis and the section turns 360°, giving a Ø220 flange and a tapered column. Press ✔.'), do: { part: 0, from: 1, to: 1 }, view: 'iso' },
    ],
  },
  {
    id: 'tut02', title: L('베이스 — 리브와 원형 패턴', 'Base — ribs and a circular pattern'), sub: L('리브 하나를 그려 둘레에 여섯 개로 늘립니다.', 'Draw one rib and repeat it six times round.'),
    steps: [
      { say: L('정면에 리브 단면을 삼각형으로 그립니다: (76, 18), (106, 18), (73, 90).', 'On the Front plane draw the rib\'s section as a triangle: (76, 18), (106, 18), (73, 90).'), do: { part: 0, from: 2, to: 2 } },
      { say: L('돌출 보스에서 끝 조건을 "중간 평면", 두께 10으로 합니다. 리브가 스케치 양쪽으로 5씩 나옵니다.', 'Extruded Boss with end condition Mid Plane, thickness 10: the rib grows 5 to each side of the sketch.'), do: { part: 0, from: 3, to: 3 } },
      { say: L('원형 패턴: 방금 만든 리브를 시드로, 축은 Z(세로 축), 개수 6. 리브 여섯 개가 60°마다 놓입니다.', 'Circular Pattern: the rib as the seed, the Z axis (vertical), 6 instances — six ribs, 60° apart.'), do: { part: 0, from: 4, to: 4 } },
    ],
  },
  {
    id: 'tut03', title: L('베이스 — 구멍과 베어링 자리', 'Base — holes and the bearing seat'), sub: L('오프셋 평면에 구멍을 내고 위쪽에 J1 베어링 자리를 팝니다.', 'Holes on offset planes, and the J1 bearing seat cut in the top.'),
    steps: [
      { say: L('참조 평면: 윗면에서 18 위(플랜지 윗면 높이). 그 평면에 점 하나를 (82.3, 47.5) — 반지름 95, 30° — 에 찍습니다.', 'Reference plane: 18 above the Top plane (the flange\'s top). On it put a point at (82.3, 47.5) — radius 95, at 30°.'), do: { part: 0, from: 5, to: 6 } },
      { say: L('구멍 가공 마법사: 카운터보어, 지름 13, 카운터보어 지름 20 깊이 4, 관통. 원형 패턴(축 Z, 6개)으로 앵커 구멍 여섯 개를 만듭니다.', 'Hole Wizard: counterbore, Ø13, counterbore Ø20 × 4 deep, through all. A Circular Pattern (Z axis, 6) gives six anchor holes.'), do: { part: 0, from: 7, to: 8 } },
      { say: L('윗면에서 140 위에 평면을 만들고 지름 60 원을 그려 깊이 32로 잘라냅니다: J1 축이 들어갈 베어링 자리입니다.', 'A plane 140 above Top, a Ø60 circle on it, cut 32 deep: the bearing seat for the J1 shaft.'), do: { part: 0, from: 9, to: 11 } },
      { say: L('정면에서 80 떨어진 평면에 점(0, 60)을 찍고, 지름 30 깊이 40 구멍으로 케이블 입구를 냅니다. 플랜지와 기둥 윗가장자리를 2 모따기합니다.', 'On a plane 80 from Front put a point at (0, 60) and make a Ø30 × 40 hole for the cable entry. Chamfer the flange and the column top edges by 2.'), do: { part: 0, from: 12, to: 15 } },
    ],
  },
  {
    id: 'tut04', title: L('선회 몸체 (J1) — 턴테이블과 기둥', 'Waist (J1) — turntable and column'), sub: L('위아래로 돌출하고 사각 기둥을 세웁니다.', 'Extrude up and down, then raise a square column.'),
    steps: [
      { say: L('새 부품 "선회 몸체 (J1)", 알루미늄 6061, RB-110.', 'New part "Waist (J1)", aluminium 6061, RB-110.'), do: { newPart: 1 } },
      { say: L('윗면에 지름 160 원 → 25 돌출(턴테이블). 다시 윗면에 지름 60 원 → 반대 방향으로 30 돌출(J1 축).', 'On Top a Ø160 circle → extrude 25 (the turntable). On Top again a Ø60 circle → extrude 30 the other way (the J1 shaft).'), do: { part: 1, from: 0, to: 3 } },
      { say: L('25 위 평면에 중심 사각형 110 × 100 → 205 돌출해 기둥을 세우고, 세로 모서리 네 개를 반지름 20으로 필렛합니다.', 'On a plane 25 up draw a centre rectangle 110 × 100 → extrude 205 for the column; fillet its four vertical edges with radius 20.'), do: { part: 1, from: 4, to: 7 } },
    ],
  },
  {
    id: 'tut05', title: L('선회 몸체 (J1) — J2 하우징과 구멍', 'Waist (J1) — J2 housing and holes'), sub: L('어깨 관절 J2의 하우징과 베어링 구멍을 만듭니다.', 'The housing and bearing bore of the shoulder joint J2.'),
    steps: [
      { say: L('정면에서 50 떨어진 평면(기둥 옆면)에 (0, 180)을 중심으로 지름 120 원 → 12 돌출: J2 하우징.', 'On a plane 50 from Front (the column\'s side) a Ø120 circle centred at (0, 180) → extrude 12: the J2 housing.'), do: { part: 1, from: 8, to: 10 } },
      { say: L('하우징 바깥면(62)에 지름 50 깊이 45 구멍(J2 베어링), 반지름 48 위치에 지름 6.8 깊이 12 나사 구멍을 내고 베어링 축 둘레로 8개 원형 패턴합니다.', 'On the housing\'s face (62) a Ø50 × 45 hole (the J2 bearing), then a Ø6.8 × 12 screw hole at radius 48, patterned 8 times round the bearing axis.'), do: { part: 1, from: 11, to: 17 } },
      { say: L('우측면에 (0, 100) 지름 36 원을 그려 양방향 관통 잘라내기(케이블 통로). 턴테이블 윗면에 카운터보어 구멍 지름 9/15 × 5를 (72, 0)에 내고 4개 원형 패턴.', 'On the Right plane a Ø36 circle at (0, 100), cut through both ways (the cable passage). On the turntable\'s top a counterbored hole Ø9 / Ø15 × 5 at (72, 0), patterned 4 times.'), do: { part: 1, from: 18, to: 22 } },
    ],
  },
  {
    id: 'tut06', title: L('상완 (J2)', 'Upper arm (J2)'), sub: L('두 관절 사이의 팔: 웨브, 허브, 가벼운 포켓.', 'The arm between two joints: web, hubs, lightening pockets.'),
    steps: [
      { say: L('새 부품 "상완 (J2)", 알루미늄 7075, RB-120. 정면에 지름 50 원 → 반대로 40 돌출(J2 축).', 'New part "Upper arm (J2)", aluminium 7075, RB-120. On Front a Ø50 circle → extrude 40 backwards (the J2 shaft).'), do: { newPart: 2, then: { part: 2, from: 0, to: 1 } } },
      { say: L('정면에 사각형 (-40, 0)–(40, 400) → 40 돌출(웨브), 원 두 개 — (0, 0) 지름 120, (0, 400) 지름 100 — → 40 돌출(관절 허브).', 'On Front a rectangle (-40, 0)–(40, 400) → extrude 40 (the web); two circles — Ø120 at (0, 0), Ø100 at (0, 400) — → extrude 40 (the joint hubs).'), do: { part: 2, from: 2, to: 5 } },
      { say: L('웨브 윗면(40)에 슬롯 두 개 (x = ±17, y 90–310, 반지름 12) → 깊이 25 잘라내기: 가운데 리브가 남는 포켓.', 'On the web\'s face (40) two slots (x = ±17, y 90–310, radius 12) → cut 25 deep: pockets that leave a centre rib.'), do: { part: 2, from: 6, to: 8 } },
      { say: L('(0, 400)에 지름 90 × 10 J3 하우징, 지름 40 깊이 45 베어링 구멍, 반지름 36의 지름 5 나사 구멍 6개 원형 패턴, 우측면 지름 16 케이블 구멍, 하우징 가장자리 1.5 모따기.', 'At (0, 400) a Ø90 × 10 J3 housing, a Ø40 × 45 bearing bore, six Ø5 screw holes at radius 36 (circular pattern), a Ø16 cable hole from the Right plane, a 1.5 chamfer on the housing\'s rim.'), do: { part: 2, from: 9, to: 19 } },
    ],
  },
  {
    id: 'tut07', title: L('전완 (J3)', 'Forearm (J3)'), sub: L('관절 허브에서 손목까지 뻗는 튜브와 모터 하우징.', 'A tube from the joint hub to the wrist, and the motor housing.'),
    steps: [
      { say: L('새 부품 "전완 (J3)", 알루미늄 7075, RB-130. 정면에 지름 40 → 반대로 40(J3 축), 지름 100 → 80(허브).', 'New part "Forearm (J3)", aluminium 7075, RB-130. On Front Ø40 → 40 backwards (the J3 shaft), Ø100 → 80 (the hub).'), do: { newPart: 3, then: { part: 3, from: 0, to: 3 } } },
      { say: L('우측면에 지름 70 원을 허브 가운데 높이(40)에 그려 300 돌출: 팔 튜브.', 'On the Right plane a Ø70 circle at the hub\'s mid-height (40) → extrude 300: the arm tube.'), do: { part: 3, from: 4, to: 5 } },
      { say: L('정면에서 10 떨어진 평면에 사각형 (-35, 30)–(35, 75) → 60 돌출(손목 모터 하우징), 윗모서리 네 개 반지름 6 필렛.', 'On a plane 10 from Front a rectangle (-35, 30)–(35, 75) → extrude 60 (the wrist motor housing); fillet its four top edges, radius 6.'), do: { part: 3, from: 6, to: 9 } },
      { say: L('튜브 끝(우측면에서 300)에 지름 40 깊이 30 J4 베어링 구멍, 지름 4.2 나사 구멍 6개 원형 패턴, 모터 하우징 윗면에 지름 16 케이블 구멍.', 'At the tube\'s end (300 from Right) a Ø40 × 30 J4 bearing bore and six Ø4.2 screw holes (circular pattern); a Ø16 cable hole in the housing\'s top.'), do: { part: 3, from: 10, to: 17 } },
    ],
  },
  {
    id: 'tut08', title: L('손목 요크 (J4)', 'Wrist yoke (J4)'), sub: L('선과 호로 요크 판을 그리고 대칭 복사합니다.', 'Draw the yoke plate with lines and an arc, then mirror it.'),
    steps: [
      { say: L('새 부품 "손목 요크 (J4)", 알루미늄 7075, RB-140. 우측면에 지름 40 → 반대로 30(J4 축), 지름 70 → 40(롤 하우징).', 'New part "Wrist yoke (J4)", aluminium 7075, RB-140. On Right Ø40 → 30 backwards (the J4 shaft), Ø70 → 40 (the roll housing).'), do: { newPart: 4, then: { part: 4, from: 0, to: 3 } } },
      { say: L('정면에서 20 떨어진 평면에 요크 판: 선 (80, 30)→(30, 30)→(0, 0)→(30, -30)→(80, -30), 끝을 중심 (80, 0) 반지름 30 호로 닫습니다. 12 돌출.', 'On a plane 20 from Front the yoke plate: lines (80, 30)→(30, 30)→(0, 0)→(30, -30)→(80, -30), closed by an arc centred at (80, 0), radius 30. Extrude 12.'), do: { part: 4, from: 4, to: 6 } },
      { say: L('대칭 복사: 판을 정면 평면에 대해 복사해 두 갈래를 만들고, 정면에 (80, 0) 지름 20 원 → 양방향 관통 잘라내기(J5 구멍), 축 끝 1.5 모따기.', 'Mirror: copy the plate about the Front plane for the second prong; on Front a Ø20 circle at (80, 0) → cut through both ways (the J5 bore); chamfer the shaft end by 1.5.'), do: { part: 4, from: 7, to: 10 } },
    ],
  },
  {
    id: 'tut09', title: L('손목 피치 (J5)와 툴 플랜지 (J6)', 'Wrist pitch (J5) and tool flange (J6)'), sub: L('중간 평면 돌출과 ISO 9409 플랜지 구멍.', 'Mid-plane extrudes and the ISO 9409 flange holes.'),
    steps: [
      { say: L('새 부품 "손목 피치 (J5)", 강 4340, RB-150. 정면에 지름 56 → 중간 평면 40(허브), 지름 20 → 중간 평면 64(J5 트러니언).', 'New part "Wrist pitch (J5)", steel 4340, RB-150. On Front Ø56 → mid plane 40 (the hub), Ø20 → mid plane 64 (the J5 trunnion).'), do: { newPart: 5, then: { part: 5, from: 0, to: 3 } } },
      { say: L('우측면에 지름 36 → 70 돌출(노즈), 끝면에 지름 25 깊이 25 J6 베어링 구멍, 트러니언 가장자리 1 모따기.', 'On Right Ø36 → extrude 70 (the nose); in its end a Ø25 × 25 J6 bearing bore; a 1 chamfer on the trunnion rims.'), do: { part: 5, from: 4, to: 9 } },
      { say: L('새 부품 "툴 플랜지 (J6)", 강 4340, RB-160. 우측면에 지름 25 → 반대로 20(J6 축), 지름 63 → 12(플랜지).', 'New part "Tool flange (J6)", steel 4340, RB-160. On Right Ø25 → 20 backwards (the J6 shaft), Ø63 → 12 (the flange).'), do: { newPart: 6, then: { part: 6, from: 0, to: 3 } } },
      { say: L('플랜지 면에 지름 31.5 깊이 6 위치 결정 구멍, (0, 25)에 지름 6.6 관통 구멍을 내고 X축 둘레 4개 원형 패턴(ISO 9409-1-50-4-M6), 1 모따기.', 'On the flange face a Ø31.5 × 6 locating bore, a Ø6.6 through hole at (0, 25) patterned 4 times round X (ISO 9409-1-50-4-M6), a 1 chamfer.'), do: { part: 6, from: 4, to: 11 } },
    ],
  },
  {
    id: 'tut10', title: L('그리퍼 몸체와 핑거', 'Gripper body and finger'), sub: L('그리퍼의 두 부품을 만듭니다.', 'The gripper\'s two parts.'),
    steps: [
      { say: L('새 부품 "그리퍼 몸체", 알루미늄 6061, RB-210. 우측면에 지름 31.5 → 반대로 6(스피곳), 지름 63 → 8(장착판).', 'New part "Gripper body", aluminium 6061, RB-210. On Right Ø31.5 → 6 backwards (the spigot), Ø63 → 8 (the mount plate).'), do: { newPart: 7, then: { part: 7, from: 0, to: 3 } } },
      { say: L('8 떨어진 평면에 중심 사각형 40 × 76 → 50 돌출(액추에이터 몸체), 긴 모서리 네 개 반지름 4 필렛, 끝면(58)에 (-8, -34)–(8, 34) 사각형 → 깊이 6 잘라내기(핑거 홈).', 'On a plane 8 out a centre rectangle 40 × 76 → extrude 50 (the actuator body); fillet the four long edges, radius 4; on the end face (58) a rectangle (-8, -34)–(8, 34) → cut 6 deep (the finger slot).'), do: { part: 7, from: 4, to: 10 } },
      { say: L('장착판에 지름 6.6 깊이 8 나사 구멍 4개(원형 패턴), 윗면에서 38 위 평면에 지름 5 깊이 12 공기 구멍 두 개.', 'Four Ø6.6 × 8 screw holes in the mount plate (circular pattern); two Ø5 × 12 air ports on a plane 38 above Top.'), do: { part: 7, from: 11, to: 17 } },
      { say: L('새 부품 "그리퍼 핑거", 강 4340, RB-220. 정면에 (0, 0)–(6, 12) → 중간 평면 16(슬라이드), (6, 0)–(70, 8) → 중간 평면 20(핑거), V 홈 삼각형 양방향 잘라내기, 끝 1.5 모따기.', 'New part "Gripper finger", steel 4340, RB-220. On Front (0, 0)–(6, 12) → mid plane 16 (the slide), (6, 0)–(70, 8) → mid plane 20 (the finger), a V-jaw triangle cut through both ways, a 1.5 chamfer on the tip.'), do: { newPart: 8, then: { part: 8, from: 0, to: 6 } } },
    ],
  },
  {
    id: 'tut11', title: L('그리퍼 서브 어셈블리', 'Gripper sub-assembly'), sub: L('핑거 두 개가 가운데를 중심으로 함께 열리고 닫힙니다.', 'Two fingers that open and close together about the centre.'),
    steps: [
      { say: L('새 어셈블리 "2지 그리퍼"를 만들고 그리퍼 몸체(원점 고정)와 핑거 두 개를 넣습니다. 두 번째 핑거는 X축으로 180° 돌려 넣습니다.', 'Make a new assembly "Two-finger gripper"; insert the gripper body (fixed at the origin) and two fingers, the second turned 180° about X.'), do: { newAssembly: 'grip', then: { components: 'grip', items: [0, 1, 2] } } },
      { say: L('각 핑거: 슬라이드 끝면을 몸체 끝면(52)에 일치, 핑거 양옆을 홈 양옆과 폭 메이트로 가운데에 맞춥니다.', 'For each finger: its slide\'s end face coincident with the body\'s end face (52), and a width mate centring its sides between the slot\'s sides.'), do: { mates: 'grip', items: [0, 1, 2, 3] } },
      { say: L('두 핑거의 바깥면을 몸체 위아래 면에 폭 메이트로 묶어 함께 움직이게 하고, 핑거 안쪽 면 사이 거리를 12–50으로 제한합니다.', 'A width mate between the fingers\' outer faces and the body\'s upper and lower faces makes them move together; limit the distance between their inner faces to 12–50.'), do: { mates: 'grip', items: [4, 5] } },
      { say: L('모션 스터디: 첫 번째 핑거에 직선 모터(진폭 6, 주기 2초)를 달고 재생합니다. 다른 핑거가 폭 메이트로 따라 움직입니다.', 'Motion study: a linear motor on the first finger (amplitude 6, period 2 s); play it — the other finger follows through the width mate.'), do: { motors: 'grip', items: [0], play: 5 } },
    ],
  },
  {
    id: 'tut12', title: L('로봇 어셈블리 — J1', 'Robot assembly — J1'), sub: L('베이스를 고정하고 선회 몸체를 힌지로 돌립니다.', 'Fix the base and turn the waist on a hinge.'),
    steps: [
      { say: L('새 어셈블리 "6축 다관절 로봇"에 베이스(원점 고정)와 선회 몸체를 넣습니다.', 'In a new assembly "Six-axis articulated robot" insert the base (fixed at the origin) and the waist.'), do: { newAssembly: 'robot', then: { components: 'robot', items: [0, 1] } } },
      { say: L('힌지 메이트: 베이스의 베어링 자리 원통면과 선회 몸체의 J1 축 원통면, 베이스 윗면과 턴테이블 아랫면. 남은 자유도는 J1 회전 하나입니다.', 'Hinge mate: the base\'s seat and the waist\'s J1 shaft (cylinders), the base\'s top and the turntable\'s underside (faces). One freedom is left: turning about J1.'), do: { mates: 'robot', items: [0] } },
      { say: L('J1 축에 회전 모터(진폭 45°, 주기 6초)를 달고 재생합니다.', 'Put a rotary motor on the J1 shaft (amplitude 45°, period 6 s) and play.'), do: { motors: 'robot', items: [0], play: 5 } },
    ],
  },
  {
    id: 'tut13', title: L('로봇 어셈블리 — J2·J3', 'Robot assembly — J2 and J3'), sub: L('팔을 올리고 각도 제한으로 움직임 범위를 정합니다.', 'Raise the arm and set its range with limit angles.'),
    steps: [
      { say: L('상완과 전완을 넣습니다.', 'Insert the upper arm and the forearm.'), do: { components: 'robot', items: [2, 3] } },
      { say: L('J2: 선회 몸체 베어링 구멍과 상완 축에 힌지, 기둥 윗면과 상완 웨브 사이 각도를 30–150°로 제한. J3: 상완 끝 베어링과 전완 축에 힌지, 각도 20–160°.', 'J2: a hinge between the waist\'s bearing bore and the upper arm\'s shaft, the angle between the column\'s top and the arm\'s web limited to 30–150°. J3: a hinge at the upper arm\'s end bearing and the forearm\'s shaft, angle 20–160°.'), do: { mates: 'robot', items: [1, 2, 3, 4] } },
      { say: L('J2(진폭 20°, 6초)와 J3(25°, 3초)에 모터를 답니다. 각 모터는 그 아래 관절의 부품(선회 몸체, 상완)에 달려 있어, 아래 관절이 움직인 자리에서 돕니다.', 'Motors on J2 (20°, 6 s) and J3 (25°, 3 s). Each is mounted on the link below it (the waist, the upper arm), so it turns wherever the joints below have taken it.'), do: { motors: 'robot', items: [1, 2], play: 6 } },
    ],
  },
  {
    id: 'tut14', title: L('로봇 어셈블리 — 손목 J4·J5·J6', 'Robot assembly — wrist J4, J5, J6'), sub: L('손목 세 축을 잇습니다.', 'Join the wrist\'s three axes.'),
    steps: [
      { say: L('손목 요크, 손목 피치, 툴 플랜지를 넣습니다.', 'Insert the wrist yoke, the wrist pitch and the tool flange.'), do: { components: 'robot', items: [4, 5, 6] } },
      { say: L('J4: 전완 끝 베어링과 요크 축에 힌지. J5: 요크 구멍과 피치 트러니언에 힌지, 각도 0–110°. J6: 피치 노즈 베어링과 플랜지 축에 힌지.', 'J4: a hinge at the forearm\'s end bearing and the yoke\'s shaft. J5: a hinge at the yoke\'s bore and the pitch trunnion, angle 0–110°. J6: a hinge at the nose bearing and the flange\'s shaft.'), do: { mates: 'robot', items: [5, 6, 7, 8] } },
      { say: L('J4(60°, 4초), J5(30°, 3초) 진동 모터와 J6 연속 회전 모터(20 rpm)를 답니다.', 'Swinging motors on J4 (60°, 4 s) and J5 (30°, 3 s), and a motor turning J6 round at 20 rpm.'), do: { motors: 'robot', items: [3, 4, 5], play: 6 } },
    ],
  },
  {
    id: 'tut15', title: L('그리퍼 장착과 전체 모션', 'The gripper on, and the whole motion'), sub: L('서브 어셈블리를 부품 하나처럼 넣습니다.', 'Insert the sub-assembly like one component.'),
    steps: [
      { say: L('부품 삽입에서 "2지 그리퍼" 서브 어셈블리를 넣습니다.', 'Insert Component: the "Two-finger gripper" sub-assembly.'), do: { components: 'robot', items: [7] } },
      { say: L('그리퍼 장착판 뒷면을 플랜지 면에 일치, 스피곳과 위치 결정 구멍을 동심, 나사 구멍 하나끼리 동심으로 묶습니다.', 'The gripper\'s mount plate coincident with the flange face, the spigot concentric with the locating bore, and one screw hole concentric with one of the flange\'s.'), do: { mates: 'robot', items: [9, 10, 11] } },
      { say: L('모션 스터디를 재생합니다. 여섯 관절이 함께 움직이고, 그리퍼는 자기 모션(핑거 열고 닫기)을 함께 재생합니다.', 'Play the motion study: all six joints move together, and the gripper plays its own motion (the fingers opening and closing).'), do: { motors: 'robot', items: [], play: 8 }, view: 'iso' },
    ],
  },
  {
    id: 'tut16', title: L('분해도', 'Exploded view'), sub: L('조립 순서대로 부품을 벌립니다.', 'Spread the parts out in assembly order.'),
    steps: [
      { say: L('분해도 편집기에서 단계 7개를 만듭니다: 그리퍼 → 플랜지 → 피치 → 요크 (+X 방향), 전완 → 상완 (앞쪽), 마지막으로 J1 위 전체를 위로.', 'In the explode editor make seven steps: gripper → flange → pitch → yoke (towards +X), forearm → upper arm (forwards), then everything above J1 upwards.'), do: { explode: true } },
      { say: L('분해 애니메이션으로 단계가 차례로 벌어지고 다시 모이는 것을 봅니다.', 'Explode Animation plays the steps out one after the other, and back.'), do: { explodeAnimate: true } },
    ],
  },
  {
    id: 'tut17', title: L('조립 도면', 'Assembly drawing'), sub: L('부품표와 풍선이 있는 조립도를 만듭니다.', 'An assembly drawing with a bill of materials and balloons.'),
    steps: [
      { say: L('어셈블리에서 도면 만들기: A2 시트에 정면도와 등각 보기를 놓습니다.', 'Make Drawing from the assembly: a front view and an isometric view on an A2 sheet.'), do: { drawing: true } },
      { say: L('부품표(BOM)를 켜고 등각 보기 둘레에 품번 풍선을 놓은 뒤, 주기(감속기, 툴 플랜지 규격, 케이블 경로)를 씁니다. DXF·DWG·PDF로 내보내거나 인쇄합니다.', 'Turn the bill of materials on, place item balloons round the isometric view and write the notes (reducers, tool flange standard, cable routing). Export DXF, DWG or PDF, or print.'), do: { drawingDone: true } },
    ],
  },
];

export const OUTRO = L(
  '완성입니다. 로봇의 부품을 하나 열어 치수를 바꾸면 어셈블리와 도면이 함께 바뀝니다. 모션 스터디의 모터 진폭·주기를 바꾸거나, 간섭 검사(어셈블리 메뉴)로 관절이 움직이는 동안 부딪히는 곳이 없는지 확인해 보세요.',
  'Done. Open one of the robot\'s parts and change a dimension: the assembly and the drawing follow. Try other amplitudes and periods in the motion study, or run Interference Detection (Assembly menu) to check that nothing collides as the joints move.',
);
