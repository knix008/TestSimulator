import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { OBJLoader }      from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader }     from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { TransformControls }          from 'three/examples/jsm/controls/TransformControls.js';
import { buildArchitectureScene, disposeGroup } from '../core/buildGeometry';

const INITIAL_LIGHT = {
  ambientIntensity: 0.55,
  sunIntensity:     1.2,
  fillIntensity:    0.4,
  sunColor:         '#fff8e1',
  ambientColor:     '#ffffff',
  sunAzimuth: 45,
  sunPolar:   40,
  sunDist:    65,
};

function sphericalToCartesian(azDeg, polarDeg, dist) {
  const az    = azDeg    * Math.PI / 180;
  const polar = polarDeg * Math.PI / 180;
  return {
    x: dist * Math.sin(polar) * Math.sin(az),
    y: dist * Math.cos(polar),
    z: dist * Math.sin(polar) * Math.cos(az),
  };
}

function cartesianToSpherical(x, y, z) {
  const dist = Math.sqrt(x * x + y * y + z * z);
  if (dist < 0.001) return { azimuth: 45, polar: 40, dist: 65 };
  const polar = Math.acos(Math.max(-1, Math.min(1, y / dist))) * 180 / Math.PI;
  const az    = Math.atan2(x, z) * 180 / Math.PI;
  return { azimuth: ((az % 360) + 360) % 360, polar, dist };
}

export default function Viewer3D({
  walls, settings, imageSrc, modelData, lang, theme,
  onReady, onSelect,
  showAxes = true, showGrid = true, showLightControl = false,
  depthMapSrc = null,
  canRunInference = false, inferenceRunning = false, onRunInference,
  zoomRef: externalZoomRef = null,
}) {
  const mountRef       = useRef(null);
  const engineRef      = useRef(null);
  const zoomRef        = useRef(null);  // 캔버스 내 줌 오버레이 span
  const apiRef      = useRef(null);
  const lastFitRef      = useRef({ imageSrc: undefined, walls: undefined, modelData: undefined });
  const lastModelDataRef = useRef(null); // 마지막으로 로드한 modelData 참조 (OBJ 재로드 방지)
  // props를 ref로 유지: 비동기 콜백(loadModel)이 항상 최신값 사용
  const showAxesRef = useRef(showAxes);
  const showGridRef = useRef(showGrid);
  const showLightRef = useRef(showLightControl);
  const [contextMenu,   setContextMenu]   = useState(null); // { x, y }
  const [lightSettings, setLightSettings] = useState(INITIAL_LIGHT);
  const lightSetterRef = useRef(null);   // Three.js 이벤트 핸들러에서 state 업데이트용
  lightSetterRef.current = setLightSettings;
  const [showGizmo,     setShowGizmo]     = useState(true);
  const [panelPos,      setPanelPos]      = useState(null); // { x, y } — null = CSS 기본 위치
  const panelRef = useRef(null);

  useEffect(() => { showAxesRef.current = showAxes; }, [showAxes]);
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { showLightRef.current = showLightControl; }, [showLightControl]);

  // ── Three.js 초기화 (마운트 시 한 번만) ───────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x12121f);

    // 캔버스를 절대 위치로 컨테이너에 채우고, z-index를 오버레이 아래로 설정
    const canvas = renderer.domElement;
    canvas.style.display  = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top      = '0'; canvas.style.left = '0';
    canvas.style.width    = '100%'; canvas.style.height = '100%';
    canvas.style.zIndex   = '1';
    mount.appendChild(canvas);

    // CSS2DRenderer: 축 레이블을 HTML로 렌더링 (Sprite 깜빡임 방지)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    Object.assign(labelRenderer.domElement.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2',
    });
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x12121f, 0.006);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(20, 15, 20);
    camera.lookAt(0, 0, 0);

    // 조명
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff8e1, 1.2);
    sun.position.set(30, 50, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 300;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
    sun.shadow.camera.right = sun.shadow.camera.top  =  80;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.4);
    fill.position.set(-20, 10, -20);
    scene.add(fill);

    // ── 조명 위치 컨트롤 ──────────────────────────────────
    // 태양 기즈모: 노란 구체, 드래그하면 조명 방향 변경
    const sunGizmoGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const sunGizmoMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const sunGizmo = new THREE.Mesh(sunGizmoGeo, sunGizmoMat);
    sunGizmo.position.copy(sun.position);
    sunGizmo.visible = false;
    scene.add(sunGizmo);

    // 조명 방향선 (태양 → 원점)
    const lightLineGeo = new THREE.BufferGeometry().setFromPoints([
      sun.position.clone(), new THREE.Vector3(0, 0, 0),
    ]);
    const lightLineMat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.45 });
    const lightLine = new THREE.Line(lightLineGeo, lightLineMat);
    lightLine.visible = false;
    scene.add(lightLine);

    // 태양 리셋 함수
    const resetLight = () => {
      const { x, y, z } = sphericalToCartesian(45, 40, 65);
      sun.position.set(x, y, z);
      sunGizmo.position.set(x, y, z);
      const pos = lightLine.geometry.attributes.position;
      pos.setXYZ(0, x, y, z);
      pos.needsUpdate = true;
      lightSetterRef.current?.((s) => ({ ...s, sunAzimuth: 45, sunPolar: 40, sunDist: 65 }));
    };

    // TransformControls: 태양 기즈모 드래그
    const lightTransform = new TransformControls(camera, canvas);
    lightTransform.setMode('translate');
    lightTransform.setSize(0.8);
    lightTransform.attach(sunGizmo);
    lightTransform.visible = false;
    lightTransform.enabled = false;
    scene.add(lightTransform);

    lightTransform.addEventListener('objectChange', () => {
      if (sunGizmo.position.y < 0.5) sunGizmo.position.y = 0.5; // 바닥 아래 금지
      sun.position.copy(sunGizmo.position);
      const pos = lightLine.geometry.attributes.position;
      pos.setXYZ(0, sunGizmo.position.x, sunGizmo.position.y, sunGizmo.position.z);
      pos.needsUpdate = true;
    });
    // TransformControls 드래그 중 카메라 컨트롤 비활성화, 드래그 종료 시 슬라이더 동기화
    lightTransform.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value;
      if (!e.value) {
        const { x, y, z } = sunGizmo.position;
        const { azimuth, polar, dist } = cartesianToSpherical(x, y, z);
        lightSetterRef.current?.((s) => ({
          ...s,
          sunAzimuth: Math.round(azimuth),
          sunPolar:   Math.round(polar),
          sunDist:    Math.round(dist),
        }));
      }
    });

    // 그리드
    const grid = new THREE.GridHelper(200, 200, 0x2a2a3f, 0x222233);
    grid.position.y = -0.001;
    scene.add(grid);

    // X/Y/Z 축 — Z는 건물이 위치한 -Z 방향으로 표시
    const axes = makeCustomAxes(6);
    scene.add(axes);

    // 축 레이블 (CSS2DObject — HTML 오버레이, 깜빡임 없음)
    const makeAxisLabel = (text, color) => {
      const div = document.createElement('div');
      div.textContent = text;
      Object.assign(div.style, {
        color, fontWeight: 'bold', fontSize: '13px', fontFamily: 'Arial, sans-serif',
        textShadow: '0 0 4px rgba(0,0,0,.9)', userSelect: 'none', pointerEvents: 'none',
      });
      return new CSS2DObject(div);
    };
    const xLbl = makeAxisLabel('X', '#ff4444'); xLbl.position.set(7, 0, 0);  scene.add(xLbl);
    const yLbl = makeAxisLabel('Y', '#44ee44'); yLbl.position.set(0, 7, 0);  scene.add(yLbl);
    const zLbl = makeAxisLabel('Z', '#4488ff'); zLbl.position.set(0, 0,  7); scene.add(zLbl);

    // TrackballControls — 쿼터니언 기반, X/Y/Z 방향 모두 360° 완전 자유 회전
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed  = 3.0;
    controls.zoomSpeed    = 1.2;
    controls.panSpeed     = 0.8;
    controls.staticMoving = true; // 감쇠 없음
    controls.minDistance  = 0.5;
    controls.maxDistance  = 500;

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // 선택 하이라이트
    const highlightMat = new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: 0x442200 });
    let selectedMesh = null;

    // 클릭 선택
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    // 포인터 이동 거리 추적: 드래그(카메라 조작) 후 발생하는 click 이벤트 무시
    let clickStartX = 0, clickStartY = 0;
    const onPointerDown = (e) => { clickStartX = e.clientX; clickStartY = e.clientY; };
    const onClick = (e) => {
      // 4px 이상 이동 = 카메라 회전/이동 — 선택 처리 건너뜀
      const dx = e.clientX - clickStartX, dy = e.clientY - clickStartY;
      if (dx * dx + dy * dy > 16) return;

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(modelGroup.children, true);

      if (hits.length > 0) {
        const obj = hits[0].object;
        // 선택 가능: wall, model 타입만 (floor·ceiling 클릭 시 기존 선택 유지)
        if (obj.isMesh && obj.userData?.type && obj.userData.type !== 'floor') {
          if (selectedMesh) { selectedMesh.material = selectedMesh.userData._origMat; selectedMesh = null; }
          obj.userData._origMat = obj.material;
          obj.material = highlightMat;
          selectedMesh = obj;
          onSelect?.(obj.userData);
        }
      } else {
        // 빈 공간 클릭: 선택 해제
        if (selectedMesh) { selectedMesh.material = selectedMesh.userData._origMat; selectedMesh = null; }
        onSelect?.(null);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('click', onClick);

    // 우클릭 컨텍스트 메뉴 (TrackballControls 우클릭 팬과 구분: 드래그 거리 16px² 초과 시 억제)
    let rightDownX = 0, rightDownY = 0;
    const onRightDown = (e) => { if (e.button === 2) { rightDownX = e.clientX; rightDownY = e.clientY; } };
    const onCtxMenu = (e) => {
      e.preventDefault();
      const dx = e.clientX - rightDownX, dy = e.clientY - rightDownY;
      if (dx * dx + dy * dy > 16) return; // 드래그 후 컨텍스트 메뉴 억제
      const rect = mount.getBoundingClientRect();
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    canvas.addEventListener('pointerdown', onRightDown);
    canvas.addEventListener('contextmenu', onCtxMenu);

    // 애니메이션 루프
    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera); // CSS2D 축 레이블
      const d = camera.position.distanceTo(controls.target);
      const zoomTxt = `${d.toFixed(1)} m`;
      if (zoomRef.current) zoomRef.current.textContent = zoomTxt;
      if (externalZoomRef?.current) externalZoomRef.current.textContent = zoomTxt;
    };
    animate();

    // 리사이즈
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
    });
    ro.observe(mount);
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1, false);

    engineRef.current = {
      renderer, labelRenderer, scene, camera, controls, modelGroup,
      sun, ambient, fill,
      grid, axes, xLbl, yLbl, zLbl,
      sunGizmo, lightLine, lightTransform,
    };

    const zoomCamera = (factor) => {
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      const newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, dir.length() * factor));
      camera.position.copy(controls.target).addScaledVector(dir.normalize(), newDist);
      controls.update();
    };

    apiRef.current = {
      screenshot:  () => { renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
      setView:     (mode) => setViewMode(camera, controls, modelGroup, mode),
      resetCamera: () => setViewMode(camera, controls, modelGroup, 'perspective'),
      resetLight:  () => resetLight(),
      zoomIn:      () => zoomCamera(0.8),
      zoomOut:     () => zoomCamera(1.25),
    };
    onReady?.(apiRef.current);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerdown', onRightDown);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onCtxMenu);
      ro.disconnect();
      cancelAnimationFrame(raf);
      lightTransform.detach();
      lightTransform.dispose();
      sunGizmoGeo.dispose(); sunGizmoMat.dispose();
      lightLineGeo.dispose(); lightLineMat.dispose();
      renderer.dispose();
      if (mount.contains(canvas)) mount.removeChild(canvas);
      if (mount.contains(labelRenderer.domElement)) mount.removeChild(labelRenderer.domElement);
      // React Strict Mode에서 효과가 두 번 실행되므로 ref를 리셋해야
      // 두 번째 실행에서 모델이 누락되지 않음
      lastModelDataRef.current = null;
      lastFitRef.current = { imageSrc: undefined, walls: undefined, modelData: undefined };
      engineRef.current = null;
      apiRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 컨텍스트 메뉴 바깥 클릭 시 닫기 ─────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [contextMenu]);

  // ── 테마 변경 시 배경/그리드/안개 업데이트 ─────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const isLight = theme === 'light';
    const bg = isLight ? 0xf0f2f5 : 0x12121f;
    eng.renderer.setClearColor(bg);
    eng.scene.fog = new THREE.FogExp2(bg, 0.006);
    eng.scene.remove(eng.grid);
    const gc = isLight ? 0xaaaacc : 0x2a2a3f;
    const gl = isLight ? 0xccccdd : 0x222233;
    const newGrid = new THREE.GridHelper(200, 200, gc, gl);
    newGrid.position.y = -0.001;
    newGrid.visible = showGridRef.current;
    eng.scene.add(newGrid);
    eng.grid = newGrid;
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 축 표시 ON/OFF ────────────────────────────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.axes.visible = showAxes;
    eng.xLbl.visible = showAxes;
    eng.yLbl.visible = showAxes;
    eng.zLbl.visible = showAxes;
    // CSS2DRenderer DOM 숨기기/표시
    if (eng.labelRenderer) eng.labelRenderer.domElement.style.display = showAxes ? '' : 'none';
  }, [showAxes]);

  // ── 그리드 표시 ON/OFF ────────────────────────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.grid.visible = showGrid;
  }, [showGrid]);

  // ── 조명 컨트롤 / 기즈모 ON/OFF ─────────────────────────
  // showLightControl: 패널 표시 여부 (툴바 토글)
  // showGizmo: 태양 위치 기즈모 표시 여부 (패널 내 토글)
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const gizmoOn = showLightControl && showGizmo;
    eng.sunGizmo.visible       = gizmoOn;
    eng.lightLine.visible      = gizmoOn;
    eng.lightTransform.visible = gizmoOn;
    eng.lightTransform.enabled = gizmoOn;
    if (!gizmoOn) eng.controls.enabled = true;
  }, [showLightControl, showGizmo]);

  // ── 조명 패널 드래그 이동 ─────────────────────────────
  const onPanelDragStart = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const panel = panelRef.current;
    const mount = mountRef.current;
    if (!panel || !mount) return;
    const pr = panel.getBoundingClientRect();
    const mr = mount.getBoundingClientRect();
    const origX  = pr.left - mr.left;
    const origY  = pr.top  - mr.top;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev) => {
      setPanelPos({ x: origX + ev.clientX - startX, y: origY + ev.clientY - startY });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',  onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };

  // ── 조명 설정값 → Three.js 실시간 반영 ───────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.ambient.intensity = lightSettings.ambientIntensity;
    eng.ambient.color.set(lightSettings.ambientColor);
    eng.sun.intensity = lightSettings.sunIntensity;
    eng.sun.color.set(lightSettings.sunColor);
    eng.fill.intensity = lightSettings.fillIntensity;
  }, [lightSettings]);

  // 슬라이더로 방위각/수직각/거리 변경 시 Three.js 조명·기즈모 위치 동기화
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const { x, y, z } = sphericalToCartesian(
      lightSettings.sunAzimuth ?? 45,
      lightSettings.sunPolar   ?? 40,
      lightSettings.sunDist    ?? 65,
    );
    eng.sun.position.set(x, y, z);
    eng.sunGizmo.position.set(x, y, z);
    const pos = eng.lightLine.geometry.attributes.position;
    pos.setXYZ(0, x, y, z);
    pos.needsUpdate = true;
  }, [lightSettings.sunAzimuth, lightSettings.sunPolar, lightSettings.sunDist]);

  // ── AI 깊이 맵 → 3D 하이트맵 ──────────────────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const { scene, modelGroup } = eng;

    // 기존 하이트맵 제거
    const prev = scene.getObjectByName('ai_heightmap');
    if (prev) { prev.geometry.dispose(); prev.material.dispose(); scene.remove(prev); }

    if (!depthMapSrc) {
      // AI 해제 시 기존 씬 복원
      modelGroup.visible = true;
      return;
    }

    // AI 적용 시 기존 벽/모델 숨기기 (씬은 유지, 가시성만 끔)
    modelGroup.visible = false;

    const img = new window.Image();
    img.onload = () => {
      const SEG = 128;
      const c   = document.createElement('canvas');
      c.width = SEG; c.height = SEG;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, SEG, SEG);
      const pix = ctx.getImageData(0, 0, SEG, SEG).data;

      const aspect  = img.naturalWidth / img.naturalHeight;
      const geoW    = 10 * aspect;
      const geoH    = 10;
      const maxElev = 3.0; // 최대 높이 (m)

      const verts   = [];
      const uvs     = [];
      const indices = [];

      for (let row = 0; row <= SEG; row++) {
        for (let col = 0; col <= SEG; col++) {
          const pr  = Math.min(row, SEG - 1);
          const pc  = Math.min(col, SEG - 1);
          const d   = pix[(pr * SEG + pc) * 4] / 255;
          verts.push(
            (col / SEG - 0.5) * geoW,
            d * maxElev,
            (row / SEG - 0.5) * geoH,
          );
          uvs.push(col / SEG, 1 - row / SEG);
        }
      }
      const stride = SEG + 1;
      for (let row = 0; row < SEG; row++) {
        for (let col = 0; col < SEG; col++) {
          const a = row * stride + col;
          const b = a + 1;
          const c2 = a + stride;
          const d2 = c2 + 1;
          indices.push(a, c2, b, b, c2, d2);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const tex = new THREE.TextureLoader().load(depthMapSrc);
      const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'ai_heightmap';
      // 카메라가 현재 바라보는 지점(controls.target)에 하이트맵을 배치해 즉시 보이도록 함
      const t = eng.controls.target;
      mesh.position.set(t.x, t.y, t.z);
      scene.add(mesh);

      // 카메라를 하이트맵 위로 재배치
      const camDist = Math.max(geoW, geoH) * 1.2;
      eng.camera.position.set(t.x + camDist * 0.6, t.y + camDist * 0.8, t.z + camDist * 0.6);
      eng.camera.lookAt(t.x, t.y, t.z);
      eng.controls.update();
    };
    img.src = depthMapSrc;
  }, [depthMapSrc]);

  // ── 벽/이미지/모델 변경 시 씬 재빌드 ─────────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const { modelGroup, camera, controls, sun } = eng;

    const hasWalls = walls?.length > 0;
    if (!hasWalls && !imageSrc && !modelData) {
      disposeGroup(modelGroup);
      return;
    }

    // 축 크기 갱신 (modelData 분기보다 먼저 정의)
    const updateAxesSize = (maxDim) => {
      const e = engineRef.current;
      if (!e) return;
      const axisLen = Math.max(maxDim * 1.5, 8);
      e.scene.remove(e.axes);
      e.axes.geometry?.dispose();
      e.axes.material?.dispose();
      const newAxes = makeCustomAxes(axisLen);
      newAxes.visible = showAxesRef.current;
      e.scene.add(newAxes);
      e.axes = newAxes;
      const lp = axisLen + 1;
      e.xLbl.position.set(lp, 0, 0);
      e.yLbl.position.set(0, lp, 0);
      e.zLbl.position.set(0, 0,  lp); // +Z: 건물 방향
    };

    // 3D 모델 (OBJ / glTF / GLB)
    if (modelData) {
      if (lastModelDataRef.current !== modelData) {
        // 새 파일: 전체 재로드 + 카메라 재배치
        lastModelDataRef.current = modelData;
        disposeGroup(modelGroup);
        loadModel(modelData, modelGroup, camera, controls, sun, updateAxesSize, settings);
      } else {
        // 설정값만 변경: 기존 객체를 제자리에서 스케일만 업데이트 (카메라 고정)
        const rootObj = modelGroup.children[0];
        if (rootObj) rescaleModelObj(rootObj, settings);
      }
      return;
    }

    // 새 파일 로드 또는 최초 감지 시에만 카메라 피팅 (같은 이미지 재감지 시 유지)
    const lf = lastFitRef.current;
    const shouldFitCamera = lf.imageSrc !== imageSrc
      || lf.modelData !== modelData
      || (!lf.walls?.length && walls?.length > 0);

    const fitCamera = (bb) => {
      if (bb.isEmpty()) return;
      const center = bb.getCenter(new THREE.Vector3());
      const size   = bb.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      updateAxesSize(maxDim);
      if (!shouldFitCamera) return;
      lastFitRef.current = { imageSrc, walls, modelData };
      camera.position.set(center.x, center.y + maxDim * 0.7, center.z + maxDim * 1.2);
      camera.lookAt(center);
      controls.target.copy(center);
      controls.update();
      const s = maxDim * 1.5;
      sun.shadow.camera.left = sun.shadow.camera.bottom = -s;
      sun.shadow.camera.right = sun.shadow.camera.top  =  s;
      sun.shadow.camera.updateProjectionMatrix();
    };

    const rebuild = (floorTex, imageSize) => {
      disposeGroup(modelGroup);
      const { group, boundingBox } = buildArchitectureScene(walls ?? [], settings, floorTex, imageSize);
      modelGroup.add(group);
      fitCamera(boundingBox);
    };

    if (imageSrc) {
      loadImageTexture(imageSrc)
        .then((tex) => {
          const ppm  = settings?.pixelsPerMeter ?? 100;
          const imgW = tex.image.naturalWidth  / ppm;
          const imgH = tex.image.naturalHeight / ppm;
          // imageSize는 항상 전달 — 바닥 크기를 이미지 전체에 맞춰야 벽과 텍스처가 정렬됨
          rebuild(tex, { width: imgW, height: imgH });
        })
        .catch(() => rebuild(null, null));
    } else {
      rebuild(null, null);
    }
  }, [walls, settings, imageSrc, modelData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 와이어프레임 토글 ───────────────────────────────────
  useEffect(() => {
    engineRef.current?.modelGroup.traverse((obj) => {
      if (obj.isMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => { if (m) m.wireframe = settings?.wireframe ?? false; });
      }
    });
  }, [settings?.wireframe]);

  // ── 컨텍스트 메뉴 액션 ──────────────────────────────────
  const handleContextAction = (action) => {
    setContextMenu(null);
    if (action === 'resetLight') {
      apiRef.current?.resetLight?.();
    } else if (action === 'resetCamera') {
      apiRef.current?.resetCamera?.();
    } else if (action === 'screenshot') {
      const url = apiRef.current?.screenshot?.();
      if (!url) return;
      if (window.electronAPI?.isElectron) {
        window.electronAPI.saveScreenshot(url);
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = 'architecture-3d.png'; a.click();
      }
    } else if (action === 'deselect') {
      onSelect?.(null);
    } else if (action === 'aiInfer') {
      onRunInference?.();
    }
  };

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* 줌 오버레이 — z-index: 3, 캔버스(z-index: 1) 위 */}
      <div className="zoom-overlay">
        <span className="zoom-label">{lang === 'en' ? 'Zoom' : '줌'}</span>
        <span ref={zoomRef} className="zoom-value">-- m</span>
      </div>
      <div className="axis-legend">
        <span className="axis-x">X</span>
        <span className="axis-y">Y</span>
        <span className="axis-z">Z</span>
      </div>

      {/* 조명 설정 패널 */}
      {showLightControl && (
        <div
          className="light-control-panel"
          ref={panelRef}
          style={panelPos ? { top: panelPos.y, left: panelPos.x, right: 'auto' } : undefined}
        >
          <div className="lcp-header" onMouseDown={onPanelDragStart}>
            <span>{lang === 'ko' ? '조명 설정' : 'Lighting'}</span>
            <button className="lcp-reset" onClick={() => setLightSettings(INITIAL_LIGHT)}>
              {lang === 'ko' ? '초기화' : 'Reset'}
            </button>
          </div>
          <LightRow label={lang === 'ko' ? '환경광' : 'Ambient'} min={0} max={2} step={0.05}
            value={lightSettings.ambientIntensity}
            onChange={(v) => setLightSettings((s) => ({ ...s, ambientIntensity: v }))} />
          <LightRow label={lang === 'ko' ? '태양광' : 'Sun'} min={0} max={4} step={0.1}
            value={lightSettings.sunIntensity}
            onChange={(v) => setLightSettings((s) => ({ ...s, sunIntensity: v }))} />
          <LightRow label={lang === 'ko' ? '보조광' : 'Fill'} min={0} max={2} step={0.05}
            value={lightSettings.fillIntensity}
            onChange={(v) => setLightSettings((s) => ({ ...s, fillIntensity: v }))} />
          <div className="lcp-color-row">
            <span>{lang === 'ko' ? '태양 색상' : 'Sun Color'}</span>
            <input type="color" value={lightSettings.sunColor}
              onChange={(e) => setLightSettings((s) => ({ ...s, sunColor: e.target.value }))} />
          </div>
          <div className="lcp-color-row">
            <span>{lang === 'ko' ? '환경광 색상' : 'Ambient Color'}</span>
            <input type="color" value={lightSettings.ambientColor}
              onChange={(e) => setLightSettings((s) => ({ ...s, ambientColor: e.target.value }))} />
          </div>
          <div className="lcp-divider" />
          <div className="lcp-section-title">{lang === 'ko' ? '태양 위치' : 'Sun Position'}</div>
          <LightRow label={lang === 'ko' ? '방위각' : 'Azimuth'} min={0} max={360} step={1}
            value={lightSettings.sunAzimuth ?? 45}
            onChange={(v) => setLightSettings((s) => ({ ...s, sunAzimuth: v }))} />
          <LightRow label={lang === 'ko' ? '수직각' : 'Vertical'} min={0} max={180} step={1}
            value={lightSettings.sunPolar ?? 40}
            onChange={(v) => setLightSettings((s) => ({ ...s, sunPolar: v }))} />
          <LightRow label={lang === 'ko' ? '거리' : 'Distance'} min={10} max={200} step={1}
            value={lightSettings.sunDist ?? 65}
            onChange={(v) => setLightSettings((s) => ({ ...s, sunDist: v }))} />
          <div className="lcp-divider" />
          <div className="lcp-color-row">
            <span>{lang === 'ko' ? '위치 기즈모' : 'Gizmo'}</span>
            <button
              className={`lcp-toggle-btn ${showGizmo ? 'lcp-toggle-on' : ''}`}
              onClick={() => setShowGizmo((v) => !v)}
            >
              {showGizmo ? 'ON' : 'OFF'}
            </button>
          </div>
          {showGizmo && (
            <p className="lcp-hint">
              {lang === 'ko' ? '황금 구체를 드래그해 태양 위치 변경' : 'Drag the gold sphere to reposition sun'}
            </p>
          )}
        </div>
      )}

      {/* AI 추론 중 로딩 오버레이 */}
      {inferenceRunning && (
        <div className="inference-overlay">
          <div className="spinner" />
          <p>{lang === 'ko' ? 'AI 깊이 추론 중…' : 'Running AI depth inference…'}</p>
        </div>
      )}

      {contextMenu && (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => handleContextAction('resetCamera')}>
            {lang === 'ko' ? '카메라 초기화' : 'Reset Camera'}
          </button>
          <button onClick={() => handleContextAction('screenshot')}>
            {lang === 'ko' ? '스크린샷 저장' : 'Save Screenshot'}
          </button>
          {showLightControl && (
            <button onClick={() => handleContextAction('resetLight')}>
              {lang === 'ko' ? '조명 위치 초기화' : 'Reset Light'}
            </button>
          )}
          <div className="ctx-separator" />
          {canRunInference && (
            <button
              className="ctx-ai-btn"
              onClick={() => handleContextAction('aiInfer')}
              disabled={inferenceRunning}
            >
              {inferenceRunning
                ? (lang === 'ko' ? '추론 중…' : 'Inferring…')
                : (lang === 'ko' ? '▶ AI 깊이 추론' : '▶ AI Depth Inference')}
            </button>
          )}
          <button onClick={() => handleContextAction('deselect')}>
            {lang === 'ko' ? '선택 해제' : 'Deselect'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 커스텀 축 헬퍼: Z를 -Z(건물 방향)로 반전 ───────────────
// Three.js 기본 좌표계에서 건물은 -Z에 위치(이미지 Y↓ → 3D -Z 매핑).
// AxesHelper는 항상 +Z를 가리키므로 건물 방향과 반대가 됨.
// 커스텀 라인으로 X(+X), Y(+Y), Z(-Z)를 표시해 사용자에게 직관적으로 전달.
function makeCustomAxes(len) {
  const positions = new Float32Array([
    0, 0, 0,  len, 0, 0,    // +X
    0, 0, 0,  0, len, 0,    // +Y
    0, 0, 0,  0, 0,  len,   // +Z (건물 방향)
  ]);
  const colors = new Float32Array([
    1, 0.2, 0.2,  1, 0.2, 0.2,       // X: red
    0.2, 0.9, 0.2,  0.2, 0.9, 0.2,   // Y: green
    0.27, 0.53, 1,  0.27, 0.53, 1,   // Z: blue
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 999;
  return lines;
}

// ── 이미지를 <img>로 먼저 로드한 뒤 Three.js 텍스처 생성 ──
// 설정값 변경 시 기존 OBJ/glTF 객체의 높이만 갱신 (XZ 스케일은 변경하지 않음)
// naturalH는 첫 로드 때 userData에 저장된 값 — 재파싱 없이 정확한 비율 유지
// XZ 스케일(벽 두께)은 3D 모델 파일에는 적용하지 않음 — 개별 벽 방향 정보 없이
// 전체 XZ 스케일을 변경하면 평면도 크기가 왜곡되어 두께가 아닌 폭이 변함
function rescaleModelObj(root, settings) {
  const naturalH = root.userData.naturalH;
  if (naturalH === undefined) return;
  const targetH = settings.wallHeight ?? 2.8;
  root.scale.y = (naturalH > 0.001 && targetH > 0) ? targetH / naturalH : 1;
}

function LightRow({ label, min, max, step, value, onChange }) {
  const isInt = step >= 1;
  return (
    <div className="lcp-row">
      <span className="lcp-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="lcp-val">{isInt ? Math.round(value) : value.toFixed(2)}</span>
    </div>
  );
}

function loadImageTexture(src) {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.flipY = false; // 이미지 좌표계(Y↓)와 3D Z축 방향 일치
      resolve(tex);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

// ── OBJ / glTF / GLB 3D 모델 로드 ──────────────────────
function loadModel(modelData, modelGroup, camera, controls, sun, onFit, settings = {}) {
  const { type, content, url } = modelData;
  const targetH = settings.wallHeight ?? 2.8; // 목표 높이(m)

  const applyMaterial = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (!mesh.userData.type) mesh.userData.type = 'model';
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const fixed = mats.map((m) => {
      if (!m) return new THREE.MeshLambertMaterial({ color: 0x88aacc, side: THREE.DoubleSide });
      const c = m.clone();
      c.side = THREE.DoubleSide;
      return c;
    });
    mesh.material = fixed.length === 1 ? fixed[0] : fixed;
  };

  // wallHeight → Y 스케일 (모델 높이를 wallHeight에 맞춤)
  // wallThickness는 3D 모델에 적용하지 않음:
  //   벽 단면 두께만 독립적으로 제어하려면 벽 방향 데이터가 필요하나
  //   OBJ/glTF는 고정 지오메트리라 해당 정보를 알 수 없음
  const applyScale = (group) => {
    const bb = new THREE.Box3().setFromObject(group);
    const naturalH = bb.getSize(new THREE.Vector3()).y;
    group.userData.naturalH = naturalH;
    if (targetH > 0 && naturalH > 0.001) group.scale.y = targetH / naturalH;
  };

  const fitGroup = (group) => {
    const bb = new THREE.Box3().setFromObject(group);
    if (bb.isEmpty()) return;
    const center = bb.getCenter(new THREE.Vector3());
    const size   = bb.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    onFit?.(maxDim);
    camera.position.set(center.x, center.y + maxDim * 0.7, center.z + maxDim * 1.2);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
    const s = maxDim * 1.5;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -s;
    sun.shadow.camera.right = sun.shadow.camera.top  =  s;
    sun.shadow.camera.updateProjectionMatrix();
  };

  if (type === 'obj' && content) {
    try {
      const loader = new OBJLoader();
      const obj = loader.parse(content);
      obj.traverse((child) => { if (child.isMesh) applyMaterial(child); });
      applyScale(obj);
      modelGroup.add(obj);
      fitGroup(obj);
    } catch (err) {
      console.error('OBJ parse error:', err);
    }
    return;
  }

  if ((type === 'gltf' || type === 'glb') && (content || url)) {
    const loader = new GLTFLoader();
    const onLoad = (gltf) => {
      gltf.scene.traverse((child) => { if (child.isMesh) applyMaterial(child); });
      applyScale(gltf.scene);
      modelGroup.add(gltf.scene);
      fitGroup(gltf.scene);
    };
    if (content) {
      if (type === 'glb') {
        const bin = atob(content);
        const buf = new ArrayBuffer(bin.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
        loader.parse(buf, '', onLoad, (e) => console.error('GLB parse error:', e));
      } else {
        loader.parse(content, '', onLoad, (e) => console.error('GLTF parse error:', e));
      }
    } else if (url) {
      loader.load(url, onLoad, undefined, (e) => console.error('GLTF load error:', e));
    }
  }
}

function setViewMode(camera, controls, group, mode) {
  const box    = new THREE.Box3().setFromObject(group);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size   = box.isEmpty() ? new THREE.Vector3(20, 5, 20) : box.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.y, size.z, 1);
  const c = center;
  const positions = {
    perspective: [c.x,           c.y + d * 0.7, c.z + d * 1.2],
    top:         [c.x,           c.y + d * 2,    c.z + 0.001],
    front:       [c.x,           c.y + size.y / 2, c.z + d * 1.5],
    right:       [c.x + d * 1.5, c.y + size.y / 2, c.z],
  };
  const pos = positions[mode] ?? positions.perspective;
  camera.position.set(...pos);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}
