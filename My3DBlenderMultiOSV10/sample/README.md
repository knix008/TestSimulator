# 샘플 프로젝트 / Sample projects

시작 화면이나 파일 › 샘플에서 열 수 있습니다. `npm run samples`로 다시 만듭니다.

Open them from the start screen or File › Samples. `npm run samples` makes them again.

## 초급 (17)

| 샘플 | 다루는 것 | 내용 |
|---|---|---|
| [첫 번째 큐브](beginner/first-cube.my3d) | objects, material | 큐브, 조명, 카메라. 모든 작업의 출발점입니다. |
| [모든 기본 도형](beginner/primitives.my3d) | objects, add menu | 추가 메뉴의 모든 도형을 한 줄로 놓았습니다. |
| [눈사람](beginner/snowman.my3d) | objects, smooth shading | 구 세 개와 원뿔, 약간의 크기 조절로 인물을 만듭니다. |
| [블록 탑](beginner/block-tower.my3d) | objects, materials | 색 블록을 손으로 쌓습니다. Shift+D와 G면 충분합니다. |
| [탁자와 의자](beginner/table-chair.my3d) | objects, scale, parent | 늘린 큐브로 만든 가구입니다. 크기 조절만으로 충분합니다. |
| [알록달록 공](beginner/color-balls.my3d) | materials | 거친 것부터 매끈한 것까지 재질 12종을 나란히 비교합니다. |
| [3점 조명](beginner/three-point.my3d) | lights | 키, 필, 림 조명. 대상을 비추는 고전적인 방법입니다. |
| [글자 만들기](beginner/hello-text.my3d) | text | 두께가 있는 텍스트 오브젝트입니다. 오브젝트 데이터 탭에서 글자를 바꿀 수 있습니다. |
| [반쪽 모델링](beginner/mirror-shape.my3d) | modifier, mirror | 한쪽만 모델링하면 미러 모디파이어가 반대쪽을 만듭니다. |
| [긴 울타리](beginner/array-fence.my3d) | modifier, array | 기둥 하나와 배열 모디파이어로 원하는 만큼 늘립니다. |
| [튀는 공](beginner/bouncing-ball.my3d) | animation, keyframes | 높이에 키프레임을 넣고 타이밍으로 튕김을 만듭니다. 스페이스를 누르세요. |
| [턴테이블](beginner/turntable.my3d) | animation, camera, parent | 회전하는 엠프티의 자식이 된 카메라가 대상을 돕니다. |
| [피사계 심도](beginner/depth-of-field.my3d) | camera, render | 초점 밖의 앞뒤가 흐려집니다. |
| [유리와 금속](beginner/glass-metal.my3d) | materials, render | 경로 추적 렌더러의 진가, 반사와 굴절입니다. |
| [작은 태양계](beginner/solar-parent.my3d) | parent, animation | 달은 지구를, 지구는 태양을 따릅니다. 부모 관계면 간단합니다. |
| [두꺼운 커브](beginner/curve-ribbon.my3d) | curve | 커브는 베벨 깊이를 주기 전까지 선일 뿐입니다. |
| [계단](beginner/duplicate-stairs.my3d) | duplicate, array | 계단 하나를 세 방향으로 띄워 쌓습니다. |

## 중급 (17)

| 샘플 | 다루는 것 | 내용 |
|---|---|---|
| [머그잔](intermediate/subsurf-mug.my3d) | edit mode, subdivision | 원기둥에 인셋과 돌출, 서브디비전 표면을 더합니다. |
| [가로등](intermediate/street-lamp.my3d) | lights, parent | 기둥과 팔, 해질녘의 따뜻한 점광원입니다. |
| [용수철](intermediate/screw-spring.my3d) | modifier, screw | 작은 원을 스크류 모디파이어로 쓸어 올립니다. |
| [구멍 뚫린 치즈](intermediate/boolean-cheese.my3d) | modifier, boolean | 불리언 모디파이어로 구를 빼서 구멍을 냅니다. |
| [대리석](intermediate/noise-material.my3d) | shader nodes | 노이즈 텍스처를 컬러 램프로 거쳐 기본 색에 연결합니다. |
| [하늘 월드](intermediate/sky-world.my3d) | world nodes | 하늘 전체가 노드 트리에서 나오고, 그것만으로 장면을 비춥니다. |
| [로봇 팔](intermediate/robot-arm.my3d) | armature, skinning | 자동 가중치로 뼈 세 개에 묶인 관을 키 포즈로 구부립니다. |
| [깃발](intermediate/cloth-flag.my3d) | cloth, wind | 한쪽 가장자리를 고정한 천이 바람에 날립니다. |
| [떨어지는 상자들](intermediate/dominoes.my3d) | rigid body | 쌓인 강체 상자들을 바닥에 떨어뜨립니다. |
| [분수](intermediate/fountain.my3d) | particles | 원판에서 위로 쏜 입자가 중력으로 떨어집니다. |
| [모양 바꾸기](intermediate/shape-keys.my3d) | shape keys, animation | 셰이프 키 하나와 키프레임 둘로 큐브가 구로 바뀝니다. |
| [공을 쫓는 눈](intermediate/track-to.my3d) | constraints | 따라보기 컨스트레인트로 조명과 카메라가 움직이는 공을 놓치지 않습니다. |
| [래티스로 구부리기](intermediate/lattice-bend.my3d) | lattice, deform | 바깥 틀의 모서리를 옮기면 안의 모양이 따라옵니다. |
| [인스턴스 도시](intermediate/collection-city.my3d) | collections, instancing | 건물 한 블록을 여러 번 반복합니다. 비용은 한 블록치입니다. |
| [돌기 달린 구](intermediate/studs-faces.my3d) | instancing | 자식 오브젝트를 모든 면에, 면의 방향으로 돌려 반복합니다. |
| [합성 글로우](intermediate/glare-compositor.my3d) | compositor | 렌더 뒤에 밝은 조명에 글레어와 비네트를 더합니다. |
| [라바 램프](intermediate/metaballs.my3d) | metaballs, animation | 메타볼이 오르내리며 서로 녹아듭니다. |

## 고급 (21)

| 샘플 | 다루는 것 | 내용 |
|---|---|---|
| [지오메트리 노드: 숲](advanced/geo-scatter.my3d) | geometry nodes | 노드 프로그램이 울퉁불퉁한 땅에 원뿔을 뿌리고 크기를 무작위로 정합니다. |
| [연기 기둥](advanced/smoke-plume.my3d) | smoke, volume | 뜨거운 연기가 도메인 안에서 소용돌이치며 오릅니다. 열 때 베이크합니다. |
| [모닥불](advanced/campfire.my3d) | fire, volume | 장작 사이에서 연료가 불꽃과 연기로 탑니다. |
| [수조의 물](advanced/water-tank.my3d) | liquid, FLIP | 물 덩어리가 무너져 상자 주위를 출렁입니다. 열 때 베이크합니다. |
| [노을 바다](advanced/ocean-sunset.my3d) | ocean, world | 오션 모디파이어로 움직이는 바다를 만들고 하늘이 비춥니다. |
| [페인트 자국](advanced/dynamic-paint.my3d) | dynamic paint, animation | 움직이는 공이 바닥에 자국을 남깁니다. 바닥은 패이고 천천히 마릅니다. |
| [Python: 꼬인 탑](advanced/python-tower.my3d) | python, scripting | 이 탑의 모든 층은 텍스트 에디터의 Python 스크립트가 놓았습니다. |
| [Python: 사인 들판](advanced/python-grid.my3d) | python, classes | 클래스와 컴프리헨션으로 수식에 따라 기둥 들판을 만듭니다. |
| [애드온: 기어](advanced/addon-gears.my3d) | add-on, python | Add Gear 애드온으로 만든 기어들이 맞물려 비율대로 돕니다. |
| [공유 노드 그룹](advanced/node-group-shared.my3d) | node groups, shader nodes | 재질 세 개가 "Banded" 그룹을 공유하고 각자 다른 색을 넣습니다. |
| [OSL 스크립트 셰이더](advanced/osl-shader.my3d) | OSL, shader nodes | 몇 줄의 Open Shading Language로 쓴 체커입니다. 매개변수가 소켓이 됩니다. |
| [장면 둘, 영상 하나](advanced/story-scenes.my3d) | scenes, sequencer | 한 파일의 두 장면을 비디오 시퀀서에서 크로스 전환과 제목으로 잇습니다. |
| [타이틀 시퀀스](advanced/title-card.my3d) | sequencer, titles | 색 스트립, 와이프, 글자만으로 만든 영상입니다. |
| [모션 트래킹](advanced/camera-solve.my3d) | tracking, clip editor | 돌아가는 카메라로 찍은 점들의 짧은 클립입니다. 트랙은 이미 있으니 풀어 보세요. |
| [NURBS 꽃병](advanced/nurbs-vase.my3d) | NURBS, surfaces | 유리 곡면입니다. 편집 모드에서 조정점을 옮겨도 곡선이 매끄럽게 유지됩니다. |
| [텍스처 페인팅](advanced/texture-painted.my3d) | texture paint, UV | 심과 언랩, 칠한 그림입니다. 페인트가 UV 섬을 넘어 끊김 없이 이어집니다. |
| [만화 선](advanced/freestyle-toon.my3d) | freestyle, render | 평평한 색과 실제 엣지에서 그린 Freestyle 윤곽선입니다. |
| [조각한 머리](advanced/multires-sculpt.my3d) | sculpt, multiresolution | 멀티레졸루션 단계 위에 브러시로 밀어 만든 형태입니다. 원본은 꼭짓점 8개 그대로입니다. |
| [스킨: 나무](advanced/skin-tree.my3d) | skin, remesh | 반지름을 준 엣지 몇 개가 하나의 면으로 이어지고, 리메시로 고르게 합니다. |
| [빛줄기](advanced/god-rays.my3d) | volume, lights | 틈이 있는 방의 안개 속에서 빛이 눈에 보이는 줄기가 됩니다. |
| [모션 경로](advanced/motion-paths.my3d) | animation, graph editor, onion skin | 던진 공의 전체 경로와 현재 프레임 주변의 잔상을 함께 보여 줍니다. |

---

## Beginner (17)

| Sample | Topics | What it shows |
|---|---|---|
| [First Cube](beginner/first-cube.my3d) | objects, material | A cube, a light and a camera: where everything starts. |
| [Every Primitive](beginner/primitives.my3d) | objects, add menu | All the shapes of the Add menu, in a row. |
| [Snowman](beginner/snowman.my3d) | objects, smooth shading | Three spheres, a cone and a little scaling make a figure. |
| [Block Tower](beginner/block-tower.my3d) | objects, materials | Coloured blocks stacked by hand: Shift+D and G are all it takes. |
| [Table and Chair](beginner/table-chair.my3d) | objects, scale, parent | Furniture from stretched cubes: scale is all it takes. |
| [Colourful Balls](beginner/color-balls.my3d) | materials | Twelve materials from dull to shiny, to compare side by side. |
| [Three-Point Lighting](beginner/three-point.my3d) | lights | Key, fill and rim: the classic way to light a subject. |
| [Hello Text](beginner/hello-text.my3d) | text | A text object with depth. Change the words in the Object Data tab. |
| [Half a Shape, Mirrored](beginner/mirror-shape.my3d) | modifier, mirror | Model one side; the Mirror modifier makes the other. |
| [A Long Fence](beginner/array-fence.my3d) | modifier, array | One post and the Array modifier: as many as you like. |
| [Bouncing Ball](beginner/bouncing-ball.my3d) | animation, keyframes | Keyframes on height, with a bounce in the timing. Press Space. |
| [Turntable](beginner/turntable.my3d) | animation, camera, parent | The camera circles the subject by being a child of a turning empty. |
| [Depth of Field](beginner/depth-of-field.my3d) | camera, render | Near and far blur away from the one in focus. |
| [Glass and Metal](beginner/glass-metal.my3d) | materials, render | What a path tracer is for: reflections and refraction. |
| [A Little Solar System](beginner/solar-parent.my3d) | parent, animation | Moon follows Earth follows Sun: parenting makes it effortless. |
| [A Thick Curve](beginner/curve-ribbon.my3d) | curve | A curve is a line until it has a Bevel Depth. |
| [Stairs](beginner/duplicate-stairs.my3d) | duplicate, array | One step and an offset in three directions. |

## Intermediate (17)

| Sample | Topics | What it shows |
|---|---|---|
| [Mug](intermediate/subsurf-mug.my3d) | edit mode, subdivision | A cylinder, an inset, an extrude and Subdivision Surface. |
| [Street Lamp](intermediate/street-lamp.my3d) | lights, parent | A pole, an arm and a warm point light in the dusk. |
| [Spring](intermediate/screw-spring.my3d) | modifier, screw | A small circle swept up by the Screw modifier. |
| [Cheese](intermediate/boolean-cheese.my3d) | modifier, boolean | A block with holes: spheres cut by Boolean modifiers. |
| [Marble](intermediate/noise-material.my3d) | shader nodes | A noise texture through a colour ramp into Base Color. |
| [Sky World](intermediate/sky-world.my3d) | world nodes | The whole sky comes from a node tree; nothing lights the scene but it. |
| [Robot Arm](intermediate/robot-arm.my3d) | armature, skinning | A tube bent by three bones, with automatic weights and a keyed pose. |
| [Flag](intermediate/cloth-flag.my3d) | cloth, wind | A cloth pinned along one edge, in the wind. |
| [Falling Boxes](intermediate/dominoes.my3d) | rigid body | A stack of rigid boxes dropped on the floor. |
| [Fountain](intermediate/fountain.my3d) | particles | Particles thrown up from a disc, falling back under gravity. |
| [Morphing Shape](intermediate/shape-keys.my3d) | shape keys, animation | A cube turns into a sphere with one shape key and two keyframes. |
| [Eyes on the Ball](intermediate/track-to.my3d) | constraints | Track To keeps the spotlight and the camera on a moving ball. |
| [Bending with a Lattice](intermediate/lattice-bend.my3d) | lattice, deform | Move the corners of a cage and the shape inside follows. |
| [Instanced City](intermediate/collection-city.my3d) | collections, instancing | One small block of buildings repeated many times, for the price of one. |
| [Studded Sphere](intermediate/studs-faces.my3d) | instancing | A child object repeated on every face, turned to its normal. |
| [Glow in the Compositor](intermediate/glare-compositor.my3d) | compositor | Bright lamps get a glare and a vignette after the render. |
| [Lava Lamp](intermediate/metaballs.my3d) | metaballs, animation | Metaballs melt into each other as they rise and sink. |

## Advanced (21)

| Sample | Topics | What it shows |
|---|---|---|
| [Geometry Nodes: Forest](advanced/geo-scatter.my3d) | geometry nodes | A node program scatters cones on a bumpy ground and sizes them at random. |
| [Smoke Plume](advanced/smoke-plume.my3d) | smoke, volume | Hot smoke rises and curls in a domain. It is baked when it opens. |
| [Campfire](advanced/campfire.my3d) | fire, volume | Fuel burns into flame and smoke among some logs. |
| [Water in a Tank](advanced/water-tank.my3d) | liquid, FLIP | A block of water collapses and sloshes round a box. It is baked when it opens. |
| [Ocean at Sunset](advanced/ocean-sunset.my3d) | ocean, world | The Ocean modifier makes a moving sea; the sky lights it. |
| [Paint Trail](advanced/dynamic-paint.my3d) | dynamic paint, animation | A moving ball leaves paint behind on a floor that dents and slowly dries. |
| [Python: Twisted Tower](advanced/python-tower.my3d) | python, scripting | Every floor of this tower was placed by the Python script in the Text Editor. |
| [Python: Sine Field](advanced/python-grid.my3d) | python, classes | A class and a comprehension lay out a field of columns from a formula. |
| [Add-on: Gears](advanced/addon-gears.my3d) | add-on, python | Gears made by the Add Gear add-on, meshing and turning at their proper ratio. |
| [Shared Node Group](advanced/node-group-shared.my3d) | node groups, shader nodes | Three materials share one "Banded" group; each feeds it a different colour. |
| [OSL Script Shader](advanced/osl-shader.my3d) | OSL, shader nodes | A checker written as a few lines of Open Shading Language. Its parameters are sockets. |
| [Two Scenes, One Film](advanced/story-scenes.my3d) | scenes, sequencer | Two scenes in one file, cut together with a cross and a title in the Video Sequencer. |
| [Title Sequence](advanced/title-card.my3d) | sequencer, titles | Colour strips, wipes and text, with no 3D at all. |
| [Motion Tracking](advanced/camera-solve.my3d) | tracking, clip editor | A short clip of dots seen by a turning camera. The tracks are already made: solve them. |
| [NURBS Vase](advanced/nurbs-vase.my3d) | NURBS, surfaces | A rational surface: move the control points in Edit Mode and the curve stays smooth. |
| [Texture Painting](advanced/texture-painted.my3d) | texture paint, UV | Seams, an unwrap and a painted picture: paint crosses islands without a break. |
| [Cartoon Lines](advanced/freestyle-toon.my3d) | freestyle, render | Flat colours and Freestyle outlines, drawn from the real edges. |
| [Sculpted Head](advanced/multires-sculpt.my3d) | sculpt, multiresolution | A form pushed by brushes on Multiresolution levels; the base mesh stays eight corners. |
| [Skin: A Tree](advanced/skin-tree.my3d) | skin, remesh | A few edges with radii become one flowing surface, then a Remesh evens it out. |
| [Light Shafts](advanced/god-rays.my3d) | volume, lights | Fog in a room with a slit: a spot of light becomes a shaft you can see. |
| [Motion Paths](advanced/motion-paths.my3d) | animation, graph editor, onion skin | A throw shown with its whole path and its ghosts around the current frame. |
