import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { SceneObject, ShadingMode, StudioMode, TransformTool } from '../../types';
import { createSdfRaymarchingMaterial } from '../../core/sdfEngine';
import { create5x5GridWithRulers } from './GridAndRuler';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Move,
  RotateCw,
  Scale,
  Compass,
  Play,
  Pause,
} from 'lucide-react';

interface Viewport3DProps {
  objects: SceneObject[];
  selectedId: string | null;
  onSelectObject: (id: string | null) => void;
  onUpdateTransform?: (
    id: string,
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number]
  ) => void;
  mode: StudioMode;
  tool: TransformTool;
  onChangeTool?: (tool: TransformTool) => void;
  shading: ShadingMode;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  objects,
  selectedId,
  onSelectObject,
  onUpdateTransform,
  mode,
  tool,
  onChangeTool,
  shading,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const objectMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const sdfMeshRef = useRef<THREE.Mesh | null>(null);

  // Auto-rotation / shape animation state
  const [isAutoAnimating, setIsAutoAnimating] = useState(false);

  // Camera Orbit & Pan state
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isGizmoDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const cameraSphericalRef = useRef({ radius: 14, theta: Math.PI / 4, phi: Math.PI / 3.2 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 1.0, 0));

  // Initialize Viewport Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    let width = container.clientWidth || 800;
    let height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d14);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Renderer with high-performance WebGL
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.error('WebGL init error, falling back:', e);
      renderer = new THREE.WebGLRenderer({ antialias: false });
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
    dirLight.position.set(8, 14, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    const blueFill = new THREE.DirectionalLight(0x60a5fa, 0.5);
    blueFill.position.set(-8, 6, -8);
    scene.add(blueFill);

    // 5. 5x5 Grid and Calibrated Axis Rulers with Tick Marks
    try {
      const gridAndRulers = create5x5GridWithRulers();
      scene.add(gridAndRulers);
    } catch (e) {
      console.warn('Grid init error:', e);
      const fallbackGrid = new THREE.GridHelper(10, 5, 0x3b82f6, 0x334155);
      scene.add(fallbackGrid);
    }

    // 6. Interactive TransformControls Gizmo (Move / Rotate / Scale)
    try {
      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.size = 0.85;
      transformControls.space = 'world';

      transformControls.addEventListener('dragging-changed', (event: any) => {
        isGizmoDraggingRef.current = Boolean(event.value);
      });

      transformControls.addEventListener('objectChange', () => {
        const targetObj = transformControls.object;
        if (targetObj && targetObj.userData.id && onUpdateTransform) {
          const id = targetObj.userData.id;
          const p: [number, number, number] = [targetObj.position.x, targetObj.position.y, targetObj.position.z];
          const r: [number, number, number] = [targetObj.rotation.x, targetObj.rotation.y, targetObj.rotation.z];
          const s: [number, number, number] = [targetObj.scale.x, targetObj.scale.y, targetObj.scale.z];
          onUpdateTransform(id, p, r, s);
        }
      });

      scene.add(transformControls.getHelper());
      transformControlsRef.current = transformControls;
    } catch (e) {
      console.warn('TransformControls error:', e);
    }

    // 7. Raymarching SDF mesh for Womp mode
    try {
      const sdfBoxGeom = new THREE.BoxGeometry(5, 5, 5);
      const sdfMaterial = createSdfRaymarchingMaterial([]);
      const sdfMesh = new THREE.Mesh(sdfBoxGeom, sdfMaterial);
      sdfMesh.position.set(0, 1.0, 0);
      sdfMeshRef.current = sdfMesh;
    } catch (e) {
      console.warn('SDF Material error:', e);
    }

    // 8. Animation & Render Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // If auto-animation is toggled, smoothly rotate and float shapes
      if (isAutoAnimating) {
        let i = 0;
        for (const mesh of objectMeshesRef.current.values()) {
          mesh.rotation.y += delta * 0.8;
          mesh.position.y = 1.0 + Math.sin(elapsed * 2.0 + i * 1.5) * 0.25;
          i++;
        }
      }

      // Update SDF shader uniform
      const sdfMesh = sdfMeshRef.current;
      if (sdfMesh && sdfMesh.material) {
        const mat = sdfMesh.material as THREE.ShaderMaterial;
        if (mat.uniforms && mat.uniforms.uCameraPos) {
          mat.uniforms.uCameraPos.value.copy(camera.position);
        }
        if (mat.uniforms && mat.uniforms.uTime) {
          mat.uniforms.uTime.value = elapsed;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize Handling via ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          camera.aspect = cr.width / cr.height;
          camera.updateProjectionMatrix();
          renderer.setSize(cr.width, cr.height);
        }
      }
    });
    resizeObserver.observe(container);

    const handleWindowResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (transformControlsRef.current) {
        transformControlsRef.current.dispose();
      }
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  function updateCameraPosition() {
    if (!cameraRef.current) return;
    const { radius, theta, phi } = cameraSphericalRef.current;
    const target = cameraTargetRef.current;
    const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(target);
  }

  // Update TransformControls Tool (translate / rotate / scale)
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;

    if (tool === 'translate') {
      tc.setMode('translate');
      tc.enabled = true;
    } else if (tool === 'rotate') {
      tc.setMode('rotate');
      tc.enabled = true;
    } else if (tool === 'scale') {
      tc.setMode('scale');
      tc.enabled = true;
    } else {
      tc.enabled = false;
      tc.detach();
    }
  }, [tool]);

  // Handle SDF mode display
  useEffect(() => {
    const scene = sceneRef.current;
    const sdfMesh = sdfMeshRef.current;
    if (!scene || !sdfMesh) return;

    if (mode === 'sdf') {
      if (!scene.children.includes(sdfMesh)) {
        scene.add(sdfMesh);
      }
    } else {
      if (scene.children.includes(sdfMesh)) {
        scene.remove(sdfMesh);
      }
    }
  }, [mode]);

  // Sync objects into Three.js scene
  useEffect(() => {
    const scene = sceneRef.current;
    const tc = transformControlsRef.current;
    if (!scene) return;

    const existingMap = objectMeshesRef.current;
    const currentIds = new Set(objects.map((o) => o.id));

    // Remove deleted meshes
    for (const [id, mesh] of existingMap.entries()) {
      if (!currentIds.has(id)) {
        if (tc && tc.object === mesh) {
          tc.detach();
        }
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
        existingMap.delete(id);
      }
    }

    // Add or update meshes
    for (const obj of objects) {
      let mesh = existingMap.get(obj.id);

      if (!mesh) {
        let geom: THREE.BufferGeometry;
        switch (obj.type) {
          case 'sphere':
            geom = new THREE.SphereGeometry(obj.scale[0] * 0.5, 32, 24);
            break;
          case 'cylinder':
            geom = new THREE.CylinderGeometry(obj.scale[0] * 0.5, obj.scale[0] * 0.5, obj.scale[1], 32);
            break;
          case 'torus':
            geom = new THREE.TorusGeometry(obj.scale[0] * 0.5, obj.scale[0] * 0.2, 24, 48);
            break;
          case 'cube':
          default:
            geom = new THREE.BoxGeometry(obj.scale[0], obj.scale[1], obj.scale[2]);
            break;
        }

        const isWireframe = shading === 'wireframe';
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(obj.color),
          roughness: obj.roughness,
          metalness: obj.metalness,
          wireframe: isWireframe,
        });

        mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { id: obj.id };
        scene.add(mesh);
        existingMap.set(obj.id, mesh);
      }

      // Update position, rotation, scale only if not actively dragging
      if (!isGizmoDraggingRef.current) {
        mesh.position.set(...obj.position);
        mesh.rotation.set(...obj.rotation);
        mesh.visible = obj.visible && mode !== 'sdf';
      }

      // Selection highlighting
      const isSelected = selectedId === obj.id;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.wireframe = shading === 'wireframe';
        if (isSelected) {
          mat.emissive = new THREE.Color(0x3b82f6);
          mat.emissiveIntensity = 0.35;
        } else {
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
        }
      }

      // Attach TransformControls to selected mesh
      if (isSelected && tc && tool !== 'select') {
        if (tc.object !== mesh) {
          tc.attach(mesh);
        }
      }
    }

    if (!selectedId && tc) {
      tc.detach();
    }
  }, [objects, selectedId, shading, mode, tool]);

  // Zoom Controls
  const handleZoom = (delta: number) => {
    const spherical = cameraSphericalRef.current;
    spherical.radius = Math.max(2.0, Math.min(80.0, spherical.radius + delta));
    updateCameraPosition();
  };

  const handleResetCamera = () => {
    cameraSphericalRef.current = { radius: 14, theta: Math.PI / 4, phi: Math.PI / 3.2 };
    cameraTargetRef.current.set(0, 1.0, 0);
    updateCameraPosition();
  };

  const handleFocusSelected = () => {
    if (!selectedId) return;
    const mesh = objectMeshesRef.current.get(selectedId);
    if (!mesh) return;

    cameraTargetRef.current.copy(mesh.position);
    cameraSphericalRef.current.radius = Math.max(5.0, mesh.scale.length() * 3.0);
    updateCameraPosition();
  };

  // Mouse camera navigation
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isGizmoDraggingRef.current) return;

    if (e.button === 0) {
      if (e.altKey) {
        isDraggingRef.current = true;
      } else {
        raycastSelect(e);
      }
    } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
    } else if (e.button === 2) {
      isDraggingRef.current = true;
    }
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isGizmoDraggingRef.current) return;

    const dx = e.clientX - mousePosRef.current.x;
    const dy = e.clientY - mousePosRef.current.y;
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isDraggingRef.current) {
      const spherical = cameraSphericalRef.current;
      spherical.theta -= dx * 0.007;
      spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi - dy * 0.007));
      updateCameraPosition();
    } else if (isPanningRef.current) {
      if (!cameraRef.current) return;
      const cam = cameraRef.current;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      cam.matrix.extractBasis(right, up, new THREE.Vector3());

      const factor = cameraSphericalRef.current.radius * 0.0015;
      cameraTargetRef.current.addScaledVector(right, -dx * factor);
      cameraTargetRef.current.addScaledVector(up, dy * factor);
      updateCameraPosition();
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    handleZoom(e.deltaY * 0.015);
  };

  const raycastSelect = (e: React.MouseEvent) => {
    if (!mountRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = Array.from(objectMeshesRef.current.values()).filter((m) => m.visible);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      onSelectObject(hit.userData.id || null);
    } else {
      onSelectObject(null);
    }
  };

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full cursor-grab active:cursor-grabbing outline-none select-none min-h-[400px] min-w-[400px]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. Top HUD Info Overlay */}
      <div className="absolute top-4 left-4 flex items-center gap-3 bg-studio-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-studio-700/60 text-xs text-slate-200 pointer-events-none shadow-xl">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
        <span className="font-bold tracking-wider uppercase text-blue-400">{mode} Mode</span>
        <span className="text-slate-600">|</span>
        <span className="font-mono text-[11px] text-slate-300">
          Grid: <strong>5x5 Cells</strong>
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-[11px] text-slate-400">
          Ruler: <strong className="text-red-400">X</strong>, <strong className="text-green-400">Y</strong>, <strong className="text-blue-400">Z</strong> 눈금 표시
        </span>
      </div>

      {/* 2. Top-Center Transform Mode Toolbar (Move / Rotate / Scale) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-studio-900/90 backdrop-blur-md p-1.5 rounded-xl border border-studio-700/60 shadow-xl z-10">
        <button
          onClick={() => onChangeTool && onChangeTool('translate')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tool === 'translate'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
              : 'text-slate-300 hover:bg-studio-800'
          }`}
          title="도형 이동 (Move / Translate - W)"
        >
          <Move className="w-3.5 h-3.5" />
          <span>이동 (Move)</span>
        </button>
        <button
          onClick={() => onChangeTool && onChangeTool('rotate')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tool === 'rotate'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
              : 'text-slate-300 hover:bg-studio-800'
          }`}
          title="도형 회전 (Rotate - E)"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>회전 (Rotate)</span>
        </button>
        <button
          onClick={() => onChangeTool && onChangeTool('scale')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tool === 'scale'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
              : 'text-slate-300 hover:bg-studio-800'
          }`}
          title="도형 크기 조절 (Scale - R)"
        >
          <Scale className="w-3.5 h-3.5" />
          <span>크기 (Scale)</span>
        </button>
      </div>

      {/* 3. Floating Right Navigation & Zoom Controls (확대/축소) */}
      <div className="absolute right-4 top-4 flex flex-col gap-1.5 bg-studio-900/90 backdrop-blur-md p-1.5 rounded-xl border border-studio-700/60 shadow-xl z-10">
        <button
          onClick={() => handleZoom(-2.5)}
          className="p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all group"
          title="확대 (Zoom In - Wheel Up)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom(2.5)}
          className="p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all group"
          title="축소 (Zoom Out - Wheel Down)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-studio-700/60 my-0.5" />
        <button
          onClick={handleFocusSelected}
          className="p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all"
          title="선택된 도형으로 줌 포커스 (Focus Shape)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetCamera}
          className="p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all"
          title="카메라 시점 초기화 (Reset View)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsAutoAnimating(!isAutoAnimating)}
          className={`p-2 rounded-lg transition-all ${
            isAutoAnimating
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'bg-studio-800 text-slate-200 hover:bg-studio-700'
          }`}
          title="도형 자동 움직임 / 턴테이블 애니메이션"
        >
          {isAutoAnimating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
        </button>
      </div>

      {/* 4. Bottom Viewport Helper Prompt */}
      <div className="absolute bottom-4 left-4 bg-studio-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-studio-800 text-[11px] text-slate-400 pointer-events-none flex items-center gap-2">
        <Compass className="w-3.5 h-3.5 text-blue-400" />
        <span>도형을 클릭하고 <strong>빨강(X)/초록(Y)/파랑(Z) 축 기즈모</strong>를 드래그하여 자유롭게 이동하세요.</span>
      </div>
    </div>
  );
};
