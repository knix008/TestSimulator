// The feature checklist: every functional area of a full 3D creation suite, with what this version really does.
//   done     usable, covered by tests
//   partial  usable, but a simplified version of the full feature (`note` says what is missing)
//   planned  not implemented yet: nothing in the program pretends otherwise
// `ops` / `module` tie an entry to code; test/unit/features.test.js checks they exist, so a "done" cannot be left dangling.
// Help › Feature Coverage shows this table and `npm run coverage` prints it.

const f = (id, area, en, ko, status, extra = {}) => ({ id, area, en, ko, status, ...extra });
const D = 'done';
const P = 'partial';
const N = 'planned';

export const FEATURES = [
  // ── Interface
  f('ui.areas', 'Interface', 'Splittable editor areas', '분할 가능한 에디터 영역', D),
  f('ui.editor_types', 'Interface', 'Editor type switching in any area', '영역별 에디터 종류 전환', D),
  f('ui.workspaces', 'Interface', 'Workspaces (Layout, Modeling, Sculpting, UV, Paint, Shading, Animation, Rendering, Compositing, Geometry Nodes, Scripting)', '워크스페이스 11종', D),
  f('ui.search', 'Interface', 'Operator search (F3)', '연산자 검색 (F3)', D),
  f('ui.adjust_last', 'Interface', 'Adjust Last Operation panel', '마지막 작업 조정 패널', D, { ops: ['mesh.extrude_region'] }),
  f('ui.undo', 'Interface', 'Undo, redo, undo history', '실행 취소·다시 실행·기록', D),
  f('ui.themes', 'Interface', 'Themes', '테마', D),
  f('ui.i18n', 'Interface', 'Korean and English interface', '한국어·영어 화면', D),
  f('ui.preferences', 'Interface', 'Preferences', '환경 설정', P, { note: 'Six pages: interface, 3D view, navigation, start, packages and system, with the keymap editor and add-on manager; no per-user startup file.' }),
  f('ui.keymap_edit', 'Interface', 'Keymap editor', '단축키 편집기', D, { module: 'keymap.lookupKey' }),
  f('ui.addons', 'Interface', 'Add-on system', '애드온 시스템', P, { module: 'addons.enableAddon', note: 'Python or JavaScript add-ons that add operators, with their own properties, and three built in; no custom panels or menus.' }),
  f('ui.asset_browser', 'Interface', 'Asset Browser', '애셋 브라우저', P, { ops: ['asset.mark', 'asset.clear'], module: 'assets.applyAsset', note: 'Built-in, file and personal libraries with previews; used by double-click, not by dragging into the view.' }),
  f('ui.file_browser', 'Interface', 'File Browser editor', '파일 브라우저 에디터', P, { note: 'Uses the system file dialogs (or the browser\'s) rather than a built-in browser.' }),

  // ── Files
  f('io.native', 'Files', 'Save and open project files (.my3d)', '프로젝트 저장·열기 (.my3d)', D, { module: 'doc.serialize' }),
  f('io.obj', 'Files', 'OBJ import and export', 'OBJ 가져오기·내보내기', D, { module: 'io.exportOBJ' }),
  f('io.stl', 'Files', 'STL import and export', 'STL 가져오기·내보내기', D, { module: 'io.exportSTLBinary' }),
  f('io.ply', 'Files', 'PLY import and export', 'PLY 가져오기·내보내기', P, { module: 'io.exportPLY', note: 'ASCII PLY only.' }),
  f('io.gltf', 'Files', 'glTF 2.0 (GLB) import and export', 'glTF 2.0(GLB) 가져오기·내보내기', P, { module: 'io.exportGLB', note: 'Meshes and base materials; no textures, skins or animation.' }),
  f('io.svg', 'Files', 'SVG import', 'SVG 가져오기', P, { module: 'io.importSVG', note: 'Path outlines as curves.' }),
  f('io.blend', 'Files', 'Reading .blend files', '.blend 파일 읽기', P, { module: 'blendfile.importBlend', note: 'Meshes, object transforms, UVs and viewport colours from Blender 2.48 to 5.x; no shader nodes, rigs, animation or modifiers. Compressed files (gzip, Zstandard) are read.' }),
  f('io.fbx', 'Files', 'FBX import and export', 'FBX 가져오기·내보내기', P, { module: 'formats.exportFBX', note: 'Binary and ASCII to read, binary 7.4 to write: meshes, hierarchy, UVs, base colours; no skins or animation.' }),
  f('io.usd', 'Files', 'USD import and export', 'USD 가져오기·내보내기', P, { module: 'formats.exportUSDA', note: 'USD text (.usda) only: no binary .usdc, .usdz, references or materials beyond a display colour.' }),
  f('io.abc', 'Files', 'Alembic import and export', 'Alembic 가져오기·내보내기', P, { note: 'The Ogawa layout: meshes, UVs and transforms at one moment in time, checked in both directions against Blender; no curves, cameras or animated export.' }),
  f('io.collada', 'Files', 'Collada import and export', 'Collada 가져오기·내보내기', P, { module: 'formats.exportDAE', note: 'Meshes, node transforms, UVs, diffuse colours; no skins or animation.' }),

  // ── Objects
  f('obj.primitives', 'Objects', 'Mesh primitives', '메시 프리미티브', D, { ops: ['mesh.primitive_plane_add', 'mesh.primitive_cube_add', 'mesh.primitive_circle_add', 'mesh.primitive_uv_sphere_add', 'mesh.primitive_ico_sphere_add', 'mesh.primitive_cylinder_add', 'mesh.primitive_cone_add', 'mesh.primitive_torus_add', 'mesh.primitive_grid_add'] }),
  f('obj.types', 'Objects', 'Lights, cameras, empties, curves, armatures, lattices', '조명·카메라·엠프티·커브·아마추어·래티스', D, { ops: ['object.light_add', 'object.camera_add', 'object.empty_add', 'object.curve_add', 'object.armature_add', 'object.lattice_add'] }),
  f('obj.text', 'Objects', 'Text objects', '텍스트 오브젝트', D, { ops: ['object.text_add'] }),
  f('obj.metaball', 'Objects', 'Metaballs', '메타볼', D, { ops: ['object.metaball_add'], module: 'metaball.metaballToMesh' }),
  f('obj.surfaces', 'Objects', 'NURBS surfaces', 'NURBS 서피스', P, { ops: ['mesh.primitive_nurbs_surface_add'], module: 'nurbs.surfaceToMesh', note: 'Rational surfaces with weights, orders, cyclic directions and four primitives; no trimming.' }),
  f('obj.volumes', 'Objects', 'Volume objects (OpenVDB)', '볼륨 오브젝트(OpenVDB)', P, { ops: ['object.volume_add'], module: 'simulation.volumeGrid', note: 'Constant, sphere and noise densities and simulation grids; .vdb files are not read.' }),
  f('obj.transform', 'Objects', 'Move, rotate, scale with axis constraints and typed values', '축 제한·수치 입력이 되는 이동·회전·크기', D, { ops: ['transform.translate', 'transform.rotate', 'transform.resize', 'transform.mirror'] }),
  f('obj.select', 'Objects', 'Click, box and all/invert selection', '클릭·박스·전체·반전 선택', D, { ops: ['object.select_all', 'object.select_set'] }),
  f('obj.manage', 'Objects', 'Duplicate, join, delete, hide, parent, origin, apply transform', '복제·합치기·삭제·숨기기·부모·원점·트랜스폼 적용', D, { ops: ['object.duplicate', 'object.join', 'object.delete', 'object.hide_set', 'object.parent_set', 'object.origin_set', 'object.transform_apply'] }),
  f('obj.collections', 'Objects', 'Collections and Outliner', '컬렉션과 아웃라이너', D, { ops: ['collection.create', 'collection.move_objects', 'collection.delete'] }),
  f('obj.constraints', 'Objects', 'Object constraints', '오브젝트 컨스트레인트', P, { ops: ['object.constraint_add'], note: '10 common types of the full set.' }),
  f('obj.instancing', 'Objects', 'Collection instances and vertex/face instancing', '컬렉션 인스턴스, 꼭짓점·면 인스턴싱', D, { ops: ['object.collection_instance_add', 'object.instancer_set', 'object.instances_make_real'], module: 'scenes.sceneInstances' }),
  f('obj.multi_scene', 'Objects', 'Multiple scenes in one file', '한 파일의 여러 장면', D, { ops: ['scene.new', 'scene.delete', 'scene.set', 'scene.rename'], module: 'scenes.switchScene' }),
  f('obj.linking', 'Objects', 'Link and append from other files', '다른 파일에서 링크·추가', P, { module: 'doc.appendDocument', note: 'Append copies objects from a .my3d or .blend file; live links are not done.' }),

  // ── Mesh modeling
  f('mesh.modes', 'Mesh modeling', 'Vertex, edge and face selection', '꼭짓점·엣지·면 선택', D, { ops: ['mesh.select_mode'] }),
  f('mesh.select', 'Mesh modeling', 'Linked, more/less, random, non-manifold, edge loop selection', '연결·확장·임의·비다양체·엣지 루프 선택', D, { ops: ['mesh.select_linked', 'mesh.select_more', 'mesh.select_less', 'mesh.select_random', 'mesh.select_non_manifold'], module: 'meshops.selectEdgeLoop' }),
  f('mesh.extrude', 'Mesh modeling', 'Extrude (region, individual, edges, vertices)', '돌출(영역·개별·엣지·꼭짓점)', D, { ops: ['mesh.extrude_region', 'mesh.extrude_individual'] }),
  f('mesh.inset', 'Mesh modeling', 'Inset faces', '면 인셋', D, { ops: ['mesh.inset'] }),
  f('mesh.bevel', 'Mesh modeling', 'Edge bevel', '엣지 베벨', D, { ops: ['mesh.bevel'] }),
  f('mesh.loopcut', 'Mesh modeling', 'Loop cut and slide', '루프 컷과 슬라이드', D, { ops: ['mesh.loopcut'] }),
  f('mesh.knife', 'Mesh modeling', 'Knife and bisect', '나이프와 이등분', D, { ops: ['mesh.bisect'] }),
  f('mesh.subdivide', 'Mesh modeling', 'Subdivide', '세분화', D, { ops: ['mesh.subdivide'] }),
  f('mesh.delete', 'Mesh modeling', 'Delete and dissolve', '삭제와 용해', D, { ops: ['mesh.delete', 'mesh.dissolve_verts', 'mesh.dissolve_edges', 'mesh.dissolve_faces'] }),
  f('mesh.merge', 'Mesh modeling', 'Merge, merge by distance', '병합, 거리로 병합', D, { ops: ['mesh.merge', 'mesh.remove_doubles'] }),
  f('mesh.fill', 'Mesh modeling', 'Make edge/face, bridge edge loops', '엣지/면 만들기, 엣지 루프 연결', D, { ops: ['mesh.edge_face_add', 'mesh.bridge_edge_loops'] }),
  f('mesh.normals', 'Mesh modeling', 'Flip and recalculate normals', '노멀 뒤집기·다시 계산', D, { ops: ['mesh.flip_normals', 'mesh.normals_make_consistent'] }),
  f('mesh.deform_tools', 'Mesh modeling', 'Shrink/fatten, smooth, randomize, to sphere', '축소/팽창·스무스·무작위·구로 변형', D, { ops: ['mesh.shrink_fatten', 'mesh.vertices_smooth', 'mesh.vertices_randomize', 'mesh.to_sphere'] }),
  f('mesh.topology_tools', 'Mesh modeling', 'Poke, triangulate, tris to quads, spin, separate', '찌르기·삼각분할·사각형화·회전 돌출·분리', D, { ops: ['mesh.poke', 'mesh.triangulate', 'mesh.tris_to_quads', 'mesh.spin', 'mesh.separate'] }),
  f('mesh.proportional', 'Mesh modeling', 'Proportional editing', '비례 편집', D, { ops: ['wm.proportional_set'], module: 'meshops.proportionalWeights' }),
  f('mesh.snapping', 'Mesh modeling', 'Snapping to grid and geometry', '격자·지오메트리 스냅', D),
  f('mesh.custom_normals', 'Mesh modeling', 'Custom split normals', '사용자 분할 노멀', P, { ops: ['mesh.normals_custom_set', 'mesh.normals_point_cursor', 'mesh.normals_custom_clear', 'mesh.mark_sharp_angle'], note: 'Set from shading, point at the cursor, split at sharp edges; no per-corner editing or weighted-normal modifier.' }),
  f('mesh.rip', 'Mesh modeling', 'Rip, slide, crease, sharp marks', '찢기·슬라이드·크리즈·샤프 표시', D, { ops: ['mesh.rip', 'mesh.edge_slide', 'mesh.crease', 'mesh.mark_sharp', 'mesh.mark_seam'] }),

  // ── Modifiers
  ...[['SUBSURF', 'Subdivision Surface', '서브디비전 표면'], ['MIRROR', 'Mirror', '미러'], ['ARRAY', 'Array', '배열'], ['SOLIDIFY', 'Solidify', '솔리디파이'], ['SCREW', 'Screw', '스크류'], ['WELD', 'Weld', '용접'], ['WIREFRAME', 'Wireframe', '와이어프레임'], ['TRIANGULATE', 'Triangulate', '삼각분할'], ['EDGE_SPLIT', 'Edge Split', '엣지 분할'], ['BUILD', 'Build', '빌드'], ['MASK', 'Mask', '마스크'], ['DISPLACE', 'Displace', '변위'], ['WAVE', 'Wave', '웨이브'], ['SMOOTH', 'Smooth', '스무스'], ['SIMPLE_DEFORM', 'Simple Deform', '간단 변형'], ['CAST', 'Cast', '캐스트'], ['LATTICE', 'Lattice', '래티스'], ['ARMATURE', 'Armature', '아마추어'], ['NODES', 'Geometry Nodes', '지오메트리 노드']]
    .map(([k, en, ko]) => f(`mod.${k.toLowerCase()}`, 'Modifiers', `${en} modifier`, `${ko} 모디파이어`, D, { modifier: k })),
  f('mod.bevel', 'Modifiers', 'Bevel modifier', '베벨 모디파이어', D, { modifier: 'BEVEL' }),
  f('mod.decimate', 'Modifiers', 'Decimate modifier', '디시메이트 모디파이어', D, { modifier: 'DECIMATE' }),
  f('mod.boolean', 'Modifiers', 'Boolean modifier', '불리언 모디파이어', P, { modifier: 'BOOLEAN', note: 'BSP based: exact on clean closed meshes, slow on dense ones.' }),
  f('mod.shrinkwrap', 'Modifiers', 'Shrinkwrap modifier', '슈링크랩 모디파이어', D, { modifier: 'SHRINKWRAP' }),
  f('mod.remesh', 'Modifiers', 'Remesh modifier', '리메시 모디파이어', P, { modifier: 'REMESH', module: 'remesh.voxelRemesh', note: 'Voxel mode, triangles; no quad, sharp or block modes.' }),
  f('mod.multires', 'Modifiers', 'Multiresolution modifier', '멀티레졸루션 모디파이어', P, { modifier: 'MULTIRES', ops: ['object.multires_subdivide'], module: 'remesh.multiresSculpt', note: 'Sculpts on the top level in object space; no baking or lower-level sculpting.' }),
  f('mod.skin', 'Modifiers', 'Skin modifier', '스킨 모디파이어', P, { modifier: 'SKIN', ops: ['mesh.skin_radius'], module: 'remesh.skinMesh', note: 'A smooth implicit surface around the edges; not the quad hull meant for subdivision.' }),
  f('mod.ocean', 'Modifiers', 'Ocean modifier', '오션 모디파이어', P, { modifier: 'OCEAN', module: 'remesh.oceanField', note: 'Phillips spectrum through an FFT, with choppiness; no foam or spray maps.' }),

  // ── Sculpt and paint
  f('sculpt.brushes', 'Sculpt & Paint', 'Sculpt brushes: draw, clay, crease, inflate, blob, smooth, flatten, pinch, grab, mask', '스컬프트 브러시 10종', D, { module: 'sculpt.sculptDab' }),
  f('sculpt.symmetry', 'Sculpt & Paint', 'Sculpt symmetry', '스컬프트 대칭', D),
  f('sculpt.dyntopo', 'Sculpt & Paint', 'Dynamic topology and voxel remesh', '다이나믹 토폴로지와 복셀 리메시', P, { ops: ['object.voxel_remesh'], module: 'remesh.dyntopoRefine', note: 'Splits long edges and collapses short ones around the brush; the whole mesh is rescanned per dab, so dense meshes slow down.' }),
  f('paint.vertex', 'Sculpt & Paint', 'Vertex paint', '꼭짓점 페인트', D, { module: 'sculpt.vertexPaintDab' }),
  f('paint.weight', 'Sculpt & Paint', 'Weight paint', '웨이트 페인트', D, { module: 'sculpt.weightPaintDab' }),
  f('paint.texture', 'Sculpt & Paint', 'Texture paint', '텍스처 페인트', P, { ops: ['paint.add_texture'], module: 'paint.texturePaintDab', note: 'Round brush on the base colour image, across UV islands; no stencils, clone or paint layers.' }),

  // ── UV and images
  f('uv.project', 'UV & Images', 'UV projections: smart, cube, cylinder, sphere', 'UV 투영: 스마트·큐브·원기둥·구', D, { ops: ['uv.smart_project', 'uv.cube_project', 'uv.cylinder_project', 'uv.sphere_project', 'uv.reset'] }),
  f('uv.editor', 'UV & Images', 'UV editor', 'UV 에디터', P, { note: 'Views and moves UVs; no pinning or stitching.' }),
  f('uv.unwrap', 'UV & Images', 'Angle-based / conformal unwrap with seams', '심 기반 각도·등각 언랩', P, { ops: ['uv.unwrap', 'mesh.mark_seam'], module: 'unwrap.unwrapSeams', note: 'Conformal (LSCM) with seams and island packing; no angle-based ABF++ solver.' }),
  f('image.editor', 'UV & Images', 'Image editor showing render results and loaded images', '렌더 결과·이미지를 보는 이미지 에디터', D),
  f('image.paint', 'UV & Images', 'Painting in the image editor', '이미지 에디터의 페인팅', P, { ops: ['image.new'], module: 'paint.paintDabImage', note: 'Round brush with blend modes; no clone, smear or masks.' }),

  // ── Shading
  f('shade.nodes_editor', 'Shading', 'Node editor (add, link, move, delete)', '노드 에디터(추가·연결·이동·삭제)', D),
  f('shade.principled', 'Shading', 'Principled material', '프린시펄드 재질', D, { node: 'BSDF_PRINCIPLED' }),
  f('shade.shader_nodes', 'Shading', 'Shader nodes: BSDFs, textures, colour, maths, converters', '셰이더 노드: BSDF·텍스처·색·수학·변환', P, { node: 'TEX_NOISE', note: 'A core set of about 30 nodes, of well over 100.' }),
  f('shade.world', 'Shading', 'World background and sky', '월드 배경과 하늘', D, { node: 'TEX_SKY' }),
  f('shade.viewport', 'Shading', 'Viewport shading: wireframe, solid, material, rendered', '뷰포트 셰이딩: 와이어·솔리드·재질·렌더', D),
  f('shade.node_groups', 'Shading', 'Node groups', '노드 그룹', D, { module: 'nodes.makeGroup', node: 'GROUP' }),
  f('shade.osl', 'Shading', 'Open Shading Language', 'Open Shading Language', P, { node: 'SCRIPT_OSL', module: 'osl.compileOSL', note: 'A script node: parameters become sockets, numbers and triples, control flow, about 40 functions; no closures or structs.' }),

  // ── Geometry nodes
  f('gn.core', 'Geometry Nodes', 'Geometry node modifier with primitives, transform, join, set position, boolean, instancing, fields', '지오메트리 노드: 프리미티브·변환·결합·위치 설정·불리언·인스턴싱·필드', P, { node: 'SET_POSITION', note: 'A core set of about 25 nodes; no simulation zones or attributes UI.' }),

  // ── Rendering
  f('render.path', 'Rendering', 'Path tracer: BVH, global illumination, glass, metal, depth of field', '경로 추적 렌더러: BVH·GI·유리·금속·피사계 심도', D, { module: 'pathtracer.renderImage' }),
  f('render.denoise', 'Rendering', 'Denoiser', '디노이저', P, { module: 'pathtracer.denoiseImage', note: 'Edge-preserving filter; not OpenImageDenoise.' }),
  f('render.realtime', 'Rendering', 'Real-time renderer', '실시간 렌더러', P, { note: 'Rasterized with shadows and environment light; no screen-space reflections or light probes.' }),
  f('render.gpu', 'Rendering', 'GPU path tracing', 'GPU 경로 추적', P, { note: 'The same BVH and materials in a WebGL 2 shader; node trees count as one value, no textures, volumes or depth passes.' }),
  f('render.passes', 'Rendering', 'Render passes (depth, normal)', '렌더 패스(깊이·노멀)', P, { note: 'Depth and normal; no cryptomatte or light groups.' }),
  f('render.animation', 'Rendering', 'Render an animation to an image sequence', '애니메이션을 이미지 시퀀스로 렌더', P, { note: 'PNG frames; video files are not written.' }),
  f('render.volumes', 'Rendering', 'Volumetrics', '볼륨 렌더링', P, { module: 'simulation.sceneVolumes', note: 'Delta tracking with single and multiple scattering and emission on the CPU engine; isotropic only, no volume shader nodes.' }),
  f('render.compositor', 'Rendering', 'Compositor nodes', '컴포지터 노드', P, { node: 'CMP_GLARE', note: 'Blur, glare, colour, mix, vignette; about 10 nodes.' }),
  f('render.freestyle', 'Rendering', 'Freestyle line rendering', 'Freestyle 선 렌더링', P, { module: 'freestyle.drawFreestyle', note: 'Silhouettes, creases and borders with visibility; one line style, no modifiers or chaining.' }),

  // ── Animation
  f('anim.keyframes', 'Animation', 'Keyframes on any numeric property', '모든 숫자 속성의 키프레임', D, { ops: ['anim.keyframe_insert', 'anim.keyframe_insert_path', 'anim.keyframe_delete', 'anim.keyframe_clear'] }),
  f('anim.interp', 'Animation', 'Interpolation: constant, linear, bezier and 10 easings', '보간: 상수·선형·베지어와 이징 10종', D, { ops: ['anim.interpolation_set'], module: 'anim.evalCurve' }),
  f('anim.timeline', 'Animation', 'Timeline with playback and markers', '재생·마커가 있는 타임라인', D, { ops: ['screen.frame_set', 'marker.add'] }),
  f('anim.dopesheet', 'Animation', 'Dope Sheet', '도프 시트', D),
  f('anim.graph', 'Animation', 'Graph Editor', '그래프 에디터', D),
  f('anim.nla', 'Animation', 'Nonlinear Animation', '비선형 애니메이션', D, { ops: ['nla.push_down', 'nla.transition_add', 'nla.split'], module: 'anim.addTransition' }),
  f('anim.drivers', 'Animation', 'Drivers', '드라이버', D, { ops: ['object.driver_add'], module: 'anim.evalDriver' }),
  f('anim.shape_keys', 'Animation', 'Shape keys', '셰이프 키', D, { ops: ['object.shape_key_add'] }),
  f('anim.armature', 'Animation', 'Armatures: bones, pose, skinning, automatic weights', '아마추어: 본·포즈·스키닝·자동 가중치', D, { ops: ['armature.bone_add', 'pose.transforms_clear'], module: 'armature.deformByArmature' }),
  f('anim.ik', 'Animation', 'Inverse kinematics', '역운동학', D, { ops: ['pose.ik_solve', 'pose.ik_add'], module: 'armature.solvedArmature' }),
  f('anim.motion_paths', 'Animation', 'Motion paths and onion skinning', '모션 경로와 어니언 스킨', D, { ops: ['object.paths_calculate', 'object.paths_clear', 'object.onion_set'], module: 'scenes.calculateMotionPath' }),

  // ── Physics
  f('phys.rigid', 'Physics', 'Rigid bodies', '강체', P, { ops: ['rigidbody.object_add', 'ptcache.bake_all'], module: 'physics.bakeRigidBodies', note: 'Boxes and spheres; no constraints or tumbling box contacts.' }),
  f('phys.cloth', 'Physics', 'Cloth', '천', P, { ops: ['object.cloth_toggle'], module: 'physics.bakeCloth', note: 'Position-based, with pins and box colliders; no self-collision.' }),
  f('phys.soft', 'Physics', 'Soft bodies', '소프트 바디', P, { ops: ['object.softbody_toggle'], module: 'physics.bakeSoftBody' }),
  f('phys.particles', 'Physics', 'Particles and hair', '파티클과 헤어', P, { ops: ['object.particle_system_add'], module: 'physics.particlesAt', note: 'Ballistic emitter and static hair; no collisions, children or instancing.' }),
  f('phys.fields', 'Physics', 'Force fields', '역장', P, { ops: ['object.forcefield_add'], module: 'physics.fieldForce', note: 'Wind, force, vortex, drag.' }),
  f('phys.fluid', 'Physics', 'Fluid simulation', '유체 시뮬레이션', P, { ops: ['object.fluid_domain_toggle', 'object.fluid_flow_toggle'], module: 'simulation.bakeLiquid', note: 'FLIP in a box with box obstacles and inflow; no viscosity, surface tension or foam.' }),
  f('phys.smoke', 'Physics', 'Smoke and fire', '연기와 불', P, { ops: ['object.smoke_domain_toggle', 'object.smoke_flow_toggle'], module: 'simulation.bakeSmoke', note: 'Stable fluids with buoyancy, vorticity and burning fuel; box-shaped flows, no collisions.' }),
  f('phys.dynamic_paint', 'Physics', 'Dynamic Paint', '다이나믹 페인트', P, { ops: ['object.dynamicpaint_toggle'], module: 'simulation.bakeDynamicPaint', note: 'Per vertex: colour, fade, spread and dents; no image sequences or waves.' }),

  // ── Grease pencil
  f('gp.draw', 'Grease Pencil', 'Draw strokes in 3D, layers', '3D 스트로크 그리기·레이어', P, { ops: ['object.gpencil_add', 'gpencil.layer_add', 'gpencil.stroke_add', 'gpencil.clear'], note: 'Freehand strokes on the view plane; no fills, materials or stroke editing.' }),

  // ── Other editors
  f('ed.text', 'Editors', 'Text editor with script running', '스크립트 실행이 되는 텍스트 에디터', D, { module: 'script.runScript' }),
  f('ed.console', 'Editors', 'Scripting console', '스크립팅 콘솔', D, { module: 'python.createPythonConsole' }),
  f('ed.python', 'Editors', 'Python scripting (the real bpy)', 'Python 스크립팅(실제 bpy)', P, { module: 'python.runPython', note: 'An interpreter written here with a bpy module: classes, comprehensions, exceptions, f-strings, math, random, mathutils. No generators, no C extensions or pip, and bpy covers operators and scene data, not all of Blender\'s API.' }),
  f('ed.info', 'Editors', 'Info log', '정보 로그', D),
  f('ed.spreadsheet', 'Editors', 'Spreadsheet', '스프레드시트', D),
  f('ed.outliner', 'Editors', 'Outliner', '아웃라이너', D),
  f('ed.properties', 'Editors', 'Properties editor with all tabs', '모든 탭이 있는 속성 에디터', D),
  f('ed.sequencer', 'Editors', 'Video Sequence Editor', '비디오 시퀀스 에디터', P, { module: 'sequencer.compositeFrame', note: 'Colour, text, image, scene and movie strips, cut, cross, wipe, opacity, blending, WebM export; sound plays but is not mixed into the export, no effects stack.' }),
  f('ed.clip', 'Editors', 'Movie Clip Editor and motion tracking', '무비 클립 에디터와 모션 트래킹', P, { ops: ['clip.solve'], module: 'tracking.solveCamera', note: 'Markers followed by correlation, stabilization, and a camera solve for a far (orthographic) camera; no lens distortion, perspective solve or masks.' }),
];

export const STATUS_WEIGHT = { done: 1, partial: 0.5, planned: 0 };

export function coverage(list = FEATURES) {
  const areas = new Map();
  let score = 0;
  const counts = { done: 0, partial: 0, planned: 0 };
  for (const feature of list) {
    counts[feature.status]++;
    score += STATUS_WEIGHT[feature.status];
    if (!areas.has(feature.area)) areas.set(feature.area, { area: feature.area, done: 0, partial: 0, planned: 0, total: 0 });
    const a = areas.get(feature.area);
    a[feature.status]++;
    a.total++;
  }
  return { ...counts, total: list.length, percent: Math.round((score / list.length) * 100), areas: [...areas.values()] };
}
