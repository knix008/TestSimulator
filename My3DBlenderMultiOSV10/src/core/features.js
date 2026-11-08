// The feature checklist: every functional area of a full 3D creation suite, with what this version really does.
//   done     usable, covered by tests
//   partial  usable, but a simplified version of the full feature (`missing` lists what it lacks, `note` what it does)
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
  f('ui.preferences', 'Interface', 'Preferences', '환경 설정', P, { note: 'Six pages: interface, 3D view, navigation, start, packages and system, with the keymap editor and add-on manager; no per-user startup file.', missing: ['a per-user startup file'] }),
  f('ui.keymap_edit', 'Interface', 'Keymap editor', '단축키 편집기', D, { module: 'keymap.lookupKey' }),
  f('ui.addons', 'Interface', 'Add-on system', '애드온 시스템', P, { module: 'addons.enableAddon', note: 'Python or JavaScript add-ons that add operators, with their own properties, and three built in; no custom panels or menus.', missing: ['custom panels and menus from add-ons'] }),
  f('ui.asset_browser', 'Interface', 'Asset Browser', '애셋 브라우저', P, { ops: ['asset.mark', 'asset.clear'], module: 'assets.applyAsset', note: 'Built-in, file and personal libraries with previews; used by double-click, not by dragging into the view.', missing: ['dragging assets into the 3D view'] }),
  f('ui.file_browser', 'Interface', 'File Browser editor', '파일 브라우저 에디터', P, { note: 'Uses the system file dialogs (or the browser\'s) rather than a built-in browser.', missing: ['a built-in file browser editor'] }),

  // ── Files
  f('io.native', 'Files', 'Save and open project files (.my3d)', '프로젝트 저장·열기 (.my3d)', D, { module: 'doc.serialize' }),
  f('io.obj', 'Files', 'OBJ import and export', 'OBJ 가져오기·내보내기', D, { module: 'io.exportOBJ' }),
  f('io.stl', 'Files', 'STL import and export', 'STL 가져오기·내보내기', D, { module: 'io.exportSTLBinary' }),
  f('io.ply', 'Files', 'PLY import and export', 'PLY 가져오기·내보내기', D, { module: 'io.exportPLY' }),
  f('io.gltf', 'Files', 'glTF 2.0 (GLB) import and export', 'glTF 2.0(GLB) 가져오기·내보내기', D, { module: 'io.exportGLB' }),
  f('io.svg', 'Files', 'SVG import', 'SVG 가져오기', D, { module: 'svg.importSVGScene', note: 'Blender\'s own importer, followed step by step: paths (all commands, arcs included), rectangles with rounded corners, circles, ellipses, lines, polylines, polygons, groups, use and symbol, every transform, units and view boxes; filled shapes become filled 2D curves with one SVGMat material per colour, in a collection named after the file. Checked against Blender 4.5: the same points and handles to 1e-7, the same fills, colours and filled areas.' }),
  f('io.blend', 'Files', 'Reading .blend files', '.blend 파일 읽기', P, { module: 'blendscene.importBlendScene', note: 'From Blender 2.48 to 5.x, compressed or not: objects and parents, meshes with weights and shape keys, modifiers, constraints, rigs with their animation, keyed objects, lights, cameras, Principled colours and packed pictures. Curves come as lines with their bevel. Other shader nodes, geometry-node trees, text and other object types stay behind, and an import says what it left out.', missing: ['shader node trees other than Principled', 'geometry-node trees', 'text and the other object types'] }),
  f('io.fbx', 'Files', 'FBX import and export', 'FBX 가져오기·내보내기', D, { module: 'fbxscene.exportFBXScene', note: 'Binary and ASCII to read, binary 7.4 to write: hierarchy, UVs, colours, embedded textures, skins, shape keys with their animation, cameras and lights (with Blender\'s quarter turns), and animation, all checked both ways with Blender 4.5.' }),
  f('io.usd', 'Files', 'USD import and export', 'USD 가져오기·내보내기', D, { module: 'usdscene.importUSDScene', note: 'As a scene, both ways, as text (.usda), binary (.usdc) and .usdz: hierarchy, transforms over time, meshes with UVs and per-face materials, UsdPreviewSurface materials with a base colour picture inside a .usdz, cameras, lights, skeletons (UsdSkel: joints, skinned meshes, joint animation), shape keys as blend shapes with their weights keyed, and meshes that change shape as points over time; references, payloads, inherits and the chosen variants are composed, other layers found inside a .usdz. All checked both ways with Blender 4.5. Variants are not read from binary files, and layers outside a .usdz are not opened.' }),
  f('io.abc', 'Files', 'Alembic import and export', 'Alembic 가져오기·내보내기', D, { module: 'abcscene.importABCScene', note: 'The Ogawa layout as a scene, both ways: the hierarchy of transforms with their motion on every frame, meshes with UVs whose points may change from frame to frame (as a point cache on import), cameras with Maya\'s quarter turn as Blender writes it, and curves (linear, Bézier, B-spline and NURBS read; lines written). Checked both ways against Blender 4.5 at frames 1, 6 and 11. Alembic has no lights or materials, so none travel; face sets and normals are left out.' }),
  f('io.collada', 'Files', 'Collada import and export', 'Collada 가져오기·내보내기', D, { module: 'daescene.importDAEScene', note: 'As a scene, both ways: hierarchy, meshes with UVs, diffuse materials, cameras, lights (with Blender\'s own extra for power and area lights), armatures with skins, and animation as sampled matrices, checked both ways with Blender 4.5. Pictures are named by file, not carried inside.' }),

  // ── Objects
  f('obj.primitives', 'Objects', 'Mesh primitives', '메시 프리미티브', D, { ops: ['mesh.primitive_plane_add', 'mesh.primitive_cube_add', 'mesh.primitive_circle_add', 'mesh.primitive_uv_sphere_add', 'mesh.primitive_ico_sphere_add', 'mesh.primitive_cylinder_add', 'mesh.primitive_cone_add', 'mesh.primitive_torus_add', 'mesh.primitive_grid_add'] }),
  f('obj.types', 'Objects', 'Lights, cameras, empties, curves, armatures, lattices', '조명·카메라·엠프티·커브·아마추어·래티스', D, { ops: ['object.light_add', 'object.camera_add', 'object.empty_add', 'object.curve_add', 'object.armature_add', 'object.lattice_add'] }),
  f('obj.text', 'Objects', 'Text objects', '텍스트 오브젝트', D, { ops: ['object.text_add'] }),
  f('obj.metaball', 'Objects', 'Metaballs', '메타볼', D, { ops: ['object.metaball_add'], module: 'metaball.metaballToMesh' }),
  f('obj.surfaces', 'Objects', 'NURBS surfaces', 'NURBS 서피스', P, { ops: ['mesh.primitive_nurbs_surface_add'], module: 'nurbs.surfaceToMesh', note: 'Rational surfaces with weights, orders, cyclic directions and four primitives; no trimming.', missing: ['trimming curves'] }),
  f('obj.volumes', 'Objects', 'Volume objects (OpenVDB)', '볼륨 오브젝트(OpenVDB)', P, { ops: ['object.volume_add'], module: 'simulation.volumeGrid', note: 'Constant, sphere and noise densities and simulation grids; .vdb files are not read.', missing: ['reading .vdb files'] }),
  f('obj.transform', 'Objects', 'Move, rotate, scale with axis constraints and typed values', '축 제한·수치 입력이 되는 이동·회전·크기', D, { ops: ['transform.translate', 'transform.rotate', 'transform.resize', 'transform.mirror'] }),
  f('obj.select', 'Objects', 'Click, box and all/invert selection', '클릭·박스·전체·반전 선택', D, { ops: ['object.select_all', 'object.select_set'] }),
  f('obj.manage', 'Objects', 'Duplicate, join, delete, hide, parent, origin, apply transform', '복제·합치기·삭제·숨기기·부모·원점·트랜스폼 적용', D, { ops: ['object.duplicate', 'object.join', 'object.delete', 'object.hide_set', 'object.parent_set', 'object.origin_set', 'object.transform_apply'] }),
  f('obj.collections', 'Objects', 'Collections and Outliner', '컬렉션과 아웃라이너', D, { ops: ['collection.create', 'collection.move_objects', 'collection.delete'] }),
  f('obj.constraints', 'Objects', 'Object constraints', '오브젝트 컨스트레인트', D, { ops: ['object.constraint_add'], note: 'All 26 of Blender\'s object constraints, in its four menu groups: Shrinkwrap, Transformation and Armature checked against Blender 4.5, Transform Cache reading Alembic transforms frame by frame (also checked), and Camera Solver, Object Solver and Follow Track from the motion tracking solve. Bones: IK (at an object or a bone) and 14 others with bone roll.' }),
  f('obj.instancing', 'Objects', 'Collection instances and vertex/face instancing', '컬렉션 인스턴스, 꼭짓점·면 인스턴싱', D, { ops: ['object.collection_instance_add', 'object.instancer_set', 'object.instances_make_real'], module: 'scenes.sceneInstances' }),
  f('obj.multi_scene', 'Objects', 'Multiple scenes in one file', '한 파일의 여러 장면', D, { ops: ['scene.new', 'scene.delete', 'scene.set', 'scene.rename'], module: 'scenes.switchScene' }),
  f('obj.linking', 'Objects', 'Link and append from other files', '다른 파일에서 링크·추가', P, { module: 'doc.appendDocument', note: 'Append copies objects from a .my3d or .blend file; live links are not done.', missing: ['live links that follow the source file'] }),

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
  f('mesh.custom_normals', 'Mesh modeling', 'Custom split normals', '사용자 분할 노멀', P, { ops: ['mesh.normals_custom_set', 'mesh.normals_point_cursor', 'mesh.normals_custom_clear', 'mesh.mark_sharp_angle'], note: 'Set from shading, point at the cursor, split at sharp edges; no per-corner editing or weighted-normal modifier.', missing: ['per-corner normal editing', 'the Weighted Normal modifier'] }),
  f('mesh.rip', 'Mesh modeling', 'Rip, slide, crease, sharp marks', '찢기·슬라이드·크리즈·샤프 표시', D, { ops: ['mesh.rip', 'mesh.edge_slide', 'mesh.crease', 'mesh.mark_sharp', 'mesh.mark_seam'] }),

  // ── Modifiers
  ...[['SUBSURF', 'Subdivision Surface', '서브디비전 표면'], ['MIRROR', 'Mirror', '미러'], ['ARRAY', 'Array', '배열'], ['SOLIDIFY', 'Solidify', '솔리디파이'], ['SCREW', 'Screw', '스크류'], ['WELD', 'Weld', '용접'], ['WIREFRAME', 'Wireframe', '와이어프레임'], ['TRIANGULATE', 'Triangulate', '삼각분할'], ['EDGE_SPLIT', 'Edge Split', '엣지 분할'], ['BUILD', 'Build', '빌드'], ['MASK', 'Mask', '마스크'], ['DISPLACE', 'Displace', '변위'], ['WAVE', 'Wave', '웨이브'], ['SMOOTH', 'Smooth', '스무스'], ['SIMPLE_DEFORM', 'Simple Deform', '간단 변형'], ['CAST', 'Cast', '캐스트'], ['LATTICE', 'Lattice', '래티스'], ['ARMATURE', 'Armature', '아마추어'], ['NODES', 'Geometry Nodes', '지오메트리 노드']]
    .map(([k, en, ko]) => f(`mod.${k.toLowerCase()}`, 'Modifiers', `${en} modifier`, `${ko} 모디파이어`, D, { modifier: k })),
  f('mod.bevel', 'Modifiers', 'Bevel modifier', '베벨 모디파이어', D, { modifier: 'BEVEL' }),
  f('mod.decimate', 'Modifiers', 'Decimate modifier', '디시메이트 모디파이어', D, { modifier: 'DECIMATE' }),
  f('mod.boolean', 'Modifiers', 'Boolean modifier', '불리언 모디파이어', P, { modifier: 'BOOLEAN', note: 'BSP based: exact on clean closed meshes, slow on dense ones.', missing: ['speed on dense meshes'] }),
  f('mod.shrinkwrap', 'Modifiers', 'Shrinkwrap modifier', '슈링크랩 모디파이어', D, { modifier: 'SHRINKWRAP' }),
  f('mod.remesh', 'Modifiers', 'Remesh modifier', '리메시 모디파이어', P, { modifier: 'REMESH', module: 'remesh.voxelRemesh', note: 'Voxel, blocks, smooth and sharp modes; quads in all but voxel. Sharp pulls vertices onto the surface rather than solving features exactly, and there is no QuadriFlow.', missing: ['QuadriFlow', 'exact sharp features'] }),
  f('mod.multires', 'Modifiers', 'Multiresolution modifier', '멀티레졸루션 모디파이어', P, { modifier: 'MULTIRES', ops: ['object.multires_subdivide'], module: 'remesh.multiresSculpt', note: 'Sculpts on the top level in object space; bakes displacement and normals from its detail into the base mesh UVs. No lower-level sculpting.', missing: ['sculpting on the lower levels'] }),
  f('mod.skin', 'Modifiers', 'Skin modifier', '스킨 모디파이어', P, { modifier: 'SKIN', ops: ['mesh.skin_radius'], module: 'remesh.skinMesh', note: 'Quads with hulls at branches, as in Blender, or a smooth implicit surface. Branch hulls can differ from Blender in their topology, and there are no root or loose-vertex settings.', missing: ['root and loose-vertex settings', 'Blender\'s exact branch topology'] }),
  f('mod.ocean', 'Modifiers', 'Ocean modifier', '오션 모디파이어', D, { modifier: 'OCEAN', module: 'remesh.oceanField', note: 'Tessendorf\'s FFT with Blender\'s four spectra (Phillips, Pierson–Moskowitz, JONSWAP with fetch and peak sharpening, and TMA for shallow water), choppiness, a foam map where the waves fold (as colours, a foam attribute and in renders) and a spray map, the direction the surface is squeezed (inverted on request), from a Jacobian taken in the spectrum as Blender does.' }),

  // ── Sculpt and paint
  f('sculpt.brushes', 'Sculpt & Paint', 'Sculpt brushes: draw, clay, crease, inflate, blob, smooth, flatten, pinch, grab, mask', '스컬프트 브러시 10종', D, { module: 'sculpt.sculptDab' }),
  f('sculpt.symmetry', 'Sculpt & Paint', 'Sculpt symmetry', '스컬프트 대칭', D),
  f('sculpt.dyntopo', 'Sculpt & Paint', 'Dynamic topology and voxel remesh', '다이나믹 토폴로지와 복셀 리메시', P, { ops: ['object.voxel_remesh'], module: 'remesh.dyntopoRefine', note: 'Splits long edges and collapses short ones around the brush; the whole mesh is rescanned per dab, so dense meshes slow down.', missing: ['updating only around the brush (the whole mesh is rescanned per dab)'] }),
  f('paint.vertex', 'Sculpt & Paint', 'Vertex paint', '꼭짓점 페인트', D, { module: 'sculpt.vertexPaintDab' }),
  f('paint.weight', 'Sculpt & Paint', 'Weight paint', '웨이트 페인트', D, { module: 'sculpt.weightPaintDab' }),
  f('paint.texture', 'Sculpt & Paint', 'Texture paint', '텍스처 페인트', P, { ops: ['paint.add_texture'], module: 'paint.texturePaintDab', note: 'Round brush on the base colour image, across UV islands; no stencils, clone or paint layers.', missing: ['stencils', 'clone', 'paint layers'] }),

  // ── UV and images
  f('uv.project', 'UV & Images', 'UV projections: smart, cube, cylinder, sphere', 'UV 투영: 스마트·큐브·원기둥·구', D, { ops: ['uv.smart_project', 'uv.cube_project', 'uv.cylinder_project', 'uv.sphere_project', 'uv.reset'] }),
  f('uv.editor', 'UV & Images', 'UV editor', 'UV 에디터', D, { note: 'Views and moves UVs; pin, weld, align, stitch, minimize stretch. No sculpting of UVs or live unwrap.' }),
  f('uv.unwrap', 'UV & Images', 'Angle-based / conformal unwrap with seams', '심 기반 각도·등각 언랩', D, { ops: ['uv.unwrap', 'mesh.mark_seam'], module: 'unwrap.unwrapSeams', note: 'Angle based (ABF, Gauss-Newton) or conformal (LSCM), with seams, pins and island packing.' }),
  f('image.editor', 'UV & Images', 'Image editor showing render results and loaded images', '렌더 결과·이미지를 보는 이미지 에디터', D),
  f('image.paint', 'UV & Images', 'Painting in the image editor', '이미지 에디터의 페인팅', P, { ops: ['image.new'], module: 'paint.paintDabImage', note: 'Round brush with blend modes; draw, soften, smear, clone and a mask from another image. No brush textures, layers or selection.', missing: ['brush textures', 'layers', 'selection masks'] }),

  // ── Shading
  f('shade.nodes_editor', 'Shading', 'Node editor (add, link, move, delete)', '노드 에디터(추가·연결·이동·삭제)', D),
  f('shade.principled', 'Shading', 'Principled material', '프린시펄드 재질', D, { node: 'BSDF_PRINCIPLED' }),
  f('shade.shader_nodes', 'Shading', 'Shader nodes: BSDFs, textures, colour, maths, converters', '셰이더 노드: BSDF·텍스처·색·수학·변환', P, { node: 'TEX_NOISE', note: 'About 50 nodes: BSDFs, input, texture (noise, Voronoi, wave, magic, brick, checker, gradient, image, environment, white noise), colour, vector with bump and normal maps, converters. Displacement, as moved geometry and as bump. Principled Volume, Volume Scatter and Absorption fill a mesh, with anisotropy; one colour per volume, from its first cell. Sheen, subsurface and translucent are approximated by the one surface model.', missing: ['separate sheen, subsurface and translucent models', 'volume colour per cell', 'the rest of Blender\'s shader nodes'] }),
  f('shade.world', 'Shading', 'World background and sky', '월드 배경과 하늘', D, { node: 'TEX_SKY' }),
  f('shade.viewport', 'Shading', 'Viewport shading: wireframe, solid, material, rendered', '뷰포트 셰이딩: 와이어·솔리드·재질·렌더', D),
  f('shade.node_groups', 'Shading', 'Node groups', '노드 그룹', D, { module: 'nodes.makeGroup', node: 'GROUP' }),
  f('shade.osl', 'Shading', 'Open Shading Language', 'Open Shading Language', P, { node: 'SCRIPT_OSL', module: 'osl.compileOSL', note: 'A script node: parameters become sockets, numbers and triples, control flow, about 40 functions; no closures or structs.', missing: ['closures', 'structs'] }),

  // ── Geometry nodes
  f('gn.core', 'Geometry Nodes', 'Geometry node modifier with primitives, transform, join, set position, boolean, instancing, fields', '지오메트리 노드: 프리미티브·변환·결합·위치 설정·불리언·인스턴싱·필드', P, { node: 'SET_POSITION', note: 'About 45 nodes, with named attributes, comparison and switch; instances are real geometry. Repeat and simulation zones hold one geometry: no extra zone values, no baking to disk.', missing: ['zone items beyond one geometry', 'baking to disk', 'the rest of Blender\'s geometry nodes'] }),

  // ── Rendering
  f('render.path', 'Rendering', 'Path tracer: BVH, global illumination, glass, metal, depth of field', '경로 추적 렌더러: BVH·GI·유리·금속·피사계 심도', D, { module: 'pathtracer.renderImage' }),
  f('render.denoise', 'Rendering', 'Denoiser', '디노이저', P, { module: 'pathtracer.denoiseImage', note: 'Edge-preserving filter; not OpenImageDenoise.', missing: ['OpenImageDenoise'] }),
  f('render.realtime', 'Rendering', 'Real-time renderer', '실시간 렌더러', P, { note: 'Rasterized with shadows and environment light; no screen-space reflections or light probes.', missing: ['screen-space reflections', 'light probes'] }),
  f('render.gpu', 'Rendering', 'GPU path tracing', 'GPU 경로 추적', P, { note: 'The same BVH and materials in a WebGL 2 shader, with a picture on Base Color. Other node trees count as one value; no volumes or depth passes.', missing: ['node trees beyond one value', 'volumes', 'render passes'] }),
  f('render.passes', 'Rendering', 'Render passes', '렌더 패스', P, { note: 'Depth, mist, normal, position, UV, albedo, emission, object and material index; the light split as Blender names it (diffuse, glossy and transmission, each direct, indirect and colour, volume direct and indirect, emission, environment, ambient occlusion); light groups as one Combined each; cryptomatte by object, material and asset with a Cryptomatte node. Colour × light adds up to the image. No vector (motion), shadow catcher or shader AOV passes, and the GPU engine gives only the image.', missing: ['vector (motion)', 'shadow catcher', 'shader AOV', 'passes from the GPU engine'] }),
  f('render.animation', 'Rendering', 'Render an animation to images or a video file', '애니메이션을 이미지나 영상 파일로 렌더', D, { note: 'PNG frames, MP4 (H.264 or VP9, through the browser engine encoder) or AVI with JPEG pictures, which needs no encoder. No audio track.' }),
  f('render.volumes', 'Rendering', 'Volumetrics', '볼륨 렌더링', P, { module: 'simulation.sceneVolumes', note: 'Delta tracking with single and multiple scattering, absorption, anisotropy and emission on the CPU engine, from objects, simulations and volume shader nodes. Shadow rays through coloured absorption keep only its brightness.', missing: ['coloured shadows through absorbing volumes'] }),
  f('render.compositor', 'Rendering', 'Compositor nodes', '컴포지터 노드', P, { node: 'CMP_GLARE', note: 'About 25 nodes: blur, glare, denoise, sharpen, defocus, lens distortion, colour balance, gamma, tonemap, alpha over, Z combine, flip, transform, crop, RGBA, mix, vignette. ', missing: ['the rest of Blender\'s compositor nodes (keying, matte, filters)'] }),
  f('render.freestyle', 'Rendering', 'Freestyle line rendering', 'Freestyle 선 렌더링', P, { module: 'freestyle.drawFreestyle', note: 'Silhouettes, creases and borders with visibility; one line style, no modifiers or chaining.', missing: ['line style modifiers', 'stroke chaining', 'more than one line style'] }),

  // ── Animation
  f('anim.keyframes', 'Animation', 'Keyframes on any numeric property', '모든 숫자 속성의 키프레임', D, { ops: ['anim.keyframe_insert', 'anim.keyframe_insert_path', 'anim.keyframe_delete', 'anim.keyframe_clear'] }),
  f('anim.interp', 'Animation', 'Interpolation: constant, linear, bezier and 10 easings', '보간: 상수·선형·베지어와 이징 10종', D, { ops: ['anim.interpolation_set'], module: 'anim.evalCurve' }),
  f('anim.timeline', 'Animation', 'Timeline with playback and markers', '재생·마커가 있는 타임라인', D, { ops: ['screen.frame_set', 'marker.add'] }),
  f('anim.dopesheet', 'Animation', 'Dope Sheet', '도프 시트', D),
  f('anim.graph', 'Animation', 'Graph Editor', '그래프 에디터', D),
  f('anim.nla', 'Animation', 'Nonlinear Animation', '비선형 애니메이션', D, { ops: ['nla.push_down', 'nla.transition_add', 'nla.split'], module: 'anim.addTransition' }),
  f('anim.actions', 'Animation', 'Action library and pose keys', '액션 라이브러리와 포즈 키', D, { ops: ['action.new', 'action.assign', 'action.strip_add', 'action.remove', 'pose.keyframe_insert'], module: 'anim.storeAction', note: 'Named actions kept in the file: saved from what is keyed, assigned, laid into the NLA, read by Action constraints; bones keyed in pose mode and found by name; actions read from .blend files for Action constraints.' }),
  f('anim.drivers', 'Animation', 'Drivers', '드라이버', D, { ops: ['object.driver_add'], module: 'anim.evalDriver' }),
  f('anim.shape_keys', 'Animation', 'Shape keys', '셰이프 키', D, { ops: ['object.shape_key_add'] }),
  f('anim.armature', 'Animation', 'Armatures: bones, pose, skinning, automatic weights', '아마추어: 본·포즈·스키닝·자동 가중치', D, { ops: ['armature.bone_add', 'pose.transforms_clear'], module: 'armature.deformByArmature' }),
  f('anim.ik', 'Animation', 'Inverse kinematics', '역운동학', D, { ops: ['pose.ik_solve', 'pose.ik_add'], module: 'armature.solvedArmature' }),
  f('anim.motion_paths', 'Animation', 'Motion paths and onion skinning', '모션 경로와 어니언 스킨', D, { ops: ['object.paths_calculate', 'object.paths_clear', 'object.onion_set'], module: 'scenes.calculateMotionPath' }),

  // ── Physics
  f('phys.rigid', 'Physics', 'Rigid bodies', '강체', D, { ops: ['rigidbody.object_add', 'ptcache.bake_all'], module: 'rigid.simulateRigid', note: 'Tumbling convex shapes: box, sphere, capsule, cylinder, cone, hull, and a passive mesh as a surface. Animated bodies; joints: fixed, point, hinge, slider, piston, generic, spring and motor, with limits and breaking. Bake to keyframes. No compound shapes or collision collections.' }),
  f('phys.cloth', 'Physics', 'Cloth', '천', D, { ops: ['object.cloth_toggle'], module: 'physics.bakeCloth', note: 'Position-based, with pins, real-shape colliders with friction, self collision between vertices and of vertices against the sheet\'s own faces, air pressure inside closed cloth (a balloon constraint), sewing threads from loose edges, and force fields.' }),
  f('phys.soft', 'Physics', 'Soft bodies', '소프트 바디', D, { ops: ['object.softbody_toggle'], module: 'physics.bakeSoftBody', note: 'Edges, a goal pull, pressure, aerodynamics (faces resist moving through the air), self collision, real-shape colliders and force fields.' }),
  f('phys.particles', 'Physics', 'Particles and hair', '파티클과 헤어', P, { ops: ['object.particle_system_add'], module: 'physics.bakeParticles', note: 'Emitters baked with fields and collisions (bounce, friction); children; instanced objects; static hair. No fluid, boids or keyed particle physics, and no hair dynamics.', missing: ['fluid, boids and keyed particle physics', 'hair dynamics'] }),
  f('phys.fields', 'Physics', 'Force fields', '역장', P, { ops: ['object.forcefield_add'], module: 'physics.fieldForce', note: 'Wind, force, vortex, drag, magnetic, harmonic, turbulence, charge (with a charge on particles), Lennard-Jones and curve guide. Fields act on rigid bodies, cloth, soft bodies, baked particles and smoke.', missing: ['texture, boid and fluid-flow fields', 'a curve guide that leads things along its path over their lifetime (here it is a force along and towards the curve)'] }),
  f('phys.fluid', 'Physics', 'Fluid simulation', '유체 시뮬레이션', P, { ops: ['object.fluid_domain_toggle', 'object.fluid_flow_toggle'], module: 'simulation.bakeLiquid', note: 'FLIP in a box; flows and obstacles of any mesh shape, moving ones included; viscosity; surface tension as a curvature force; foam, spray and bubbles as secondary particles drawn in a second material. No adaptive domain, guiding or particle export.', missing: ['adaptive domain', 'guiding', 'particle export'] }),
  f('phys.smoke', 'Physics', 'Smoke and fire', '연기와 불', P, { ops: ['object.smoke_domain_toggle', 'object.smoke_flow_toggle'], module: 'simulation.bakeSmoke', note: 'Stable fluids with buoyancy, vorticity and burning fuel; flows and obstacles of any mesh shape, moving ones re-read each frame but not pushing the air. No adaptive grid or noise upscaling.', missing: ['adaptive grid', 'noise upscaling', 'moving obstacles pushing the air'] }),
  f('phys.dynamic_paint', 'Physics', 'Dynamic Paint', '다이나믹 페인트', P, { ops: ['object.dynamicpaint_toggle'], module: 'simulation.bakeDynamicPaint', note: 'Per vertex: colour, fade, spread and dents, a wave surface the brushes press into, or a weight surface that writes a vertex group for the modifiers after it; paint and wet maps saved as image sequences over the UVs.', missing: ['brush sources other than proximity (volume, particles)', 'displacement and wave image sequences'] }),

  // ── Grease pencil
  f('gp.draw', 'Grease Pencil', 'Draw strokes in 3D, layers', '3D 스트로크 그리기·레이어', P, { ops: ['object.gpencil_add', 'gpencil.layer_add', 'gpencil.stroke_add', 'gpencil.clear', 'gpencil.stroke_smooth', 'gpencil.stroke_simplify', 'gpencil.erase', 'gpencil.convert'], module: 'gpencil.gpencilMeshes', note: 'Freehand strokes on the view plane, shown and rendered as ribbons with fills; layer colour, opacity and thickness; drawings held per frame; per-point thickness and strength; sculpt brushes (smooth, thickness, strength, grab, push, twist, pinch, randomize); interpolation between drawings; 11 modifiers (thickness, offset, noise, smooth, simplify, subdivide, array, mirror, build, tint, opacity). No fill tool, vertex or weight painting, and Blender has more modifiers.', missing: ['fill tool', 'vertex paint', 'weight paint', 'Blender\'s other stroke modifiers'] }),

  // ── Other editors
  f('ed.text', 'Editors', 'Text editor with script running', '스크립트 실행이 되는 텍스트 에디터', D, { module: 'script.runScript' }),
  f('ed.console', 'Editors', 'Scripting console', '스크립팅 콘솔', D, { module: 'python.createPythonConsole' }),
  f('ed.python', 'Editors', 'Python scripting (the real bpy)', 'Python 스크립팅(실제 bpy)', P, { module: 'python.runPython', note: 'An interpreter written here with a bpy module: classes, comprehensions, exceptions, f-strings, generators (yield, yield from, send, close), math, random, mathutils.', missing: ['C extensions and pip', 'all of Blender\'s bpy API (it covers operators and scene data)', 'yield inside a larger expression'] }),
  f('ed.info', 'Editors', 'Info log', '정보 로그', D),
  f('ed.spreadsheet', 'Editors', 'Spreadsheet', '스프레드시트', D),
  f('ed.outliner', 'Editors', 'Outliner', '아웃라이너', D),
  f('ed.properties', 'Editors', 'Properties editor with all tabs', '모든 탭이 있는 속성 에디터', D),
  f('ed.sequencer', 'Editors', 'Video Sequence Editor', '비디오 시퀀스 에디터', P, { module: 'sequencer.compositeFrame', note: 'Colour, text, image, scene and movie strips, cut, cross, wipe, opacity, blending, WebM export; sound plays but is not mixed into the export, no effects stack.', missing: ['sound mixed into the export', 'effect stacks'] }),
  f('ed.clip', 'Editors', 'Movie Clip Editor and motion tracking', '무비 클립 에디터와 모션 트래킹', P, { ops: ['clip.solve'], module: 'tracking.solveCamera', note: 'Markers followed by correlation, stabilization, and a camera solve for a far (orthographic) camera; no lens distortion, perspective solve or masks.', missing: ['lens distortion', 'perspective camera solve', 'masks'] }),
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
