import { Canvas, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  TransformControls,
  Text,
  Billboard,
  useTexture,
} from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { ALL_PRIMITIVES, type PrimitiveType, type SceneObject } from '../types';
import { importModelFiles } from '../utils/modelImport';
import { registerViewportCapture, unregisterViewportCapture } from '../utils/viewportCapture';
import ImportedAsset from './ImportedAsset';
import LightsCanvasPanel from './LightsCanvasPanel';

const AXIS_LENGTH = 3;

/** Fine fixed world grid — on-screen size grows/shrinks with zoom (배율) */
const GRID_CELL_SIZE = 0.1;
const GRID_SECTION_SIZE = 0.5;
const GRID_ARGS: [number, number] = [40, 40];
const BASE_CAMERA_DISTANCE = Math.sqrt(6 * 6 + 5 * 5 + 8 * 8);

function SceneGrid() {
  return (
    <Grid
      args={GRID_ARGS}
      position={[0, 0, 0]}
      cellSize={GRID_CELL_SIZE}
      cellThickness={0.4}
      cellColor="#334155"
      sectionSize={GRID_SECTION_SIZE}
      sectionThickness={0.95}
      sectionColor="#64748b"
      fadeDistance={50}
      fadeStrength={1}
      infiniteGrid
      followCamera={false}
      renderOrder={-1}
    />
  );
}

function AxisLabels() {
  const labels: { text: string; position: [number, number, number]; color: string }[] = [
    { text: 'X', position: [AXIS_LENGTH + 0.28, 0, 0], color: '#ff5c5c' },
    { text: 'Y', position: [0, AXIS_LENGTH + 0.28, 0], color: '#5cff8a' },
    { text: 'Z', position: [0, 0, AXIS_LENGTH + 0.28], color: '#5c9cff' },
  ];

  return (
    <group>
      {labels.map(({ text, position, color }) => (
        <Billboard key={text} position={position} follow>
          <Text
            fontSize={0.38}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.025}
            outlineColor="#0a0e14"
          >
            {text}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}

function CameraScaleReporter() {
  const { camera } = useThree();
  const last = useRef(-1);
  const setViewScale = useAppStore((s) => s.setViewScale);

  useFrame(() => {
    const dist = Math.max(0.001, camera.position.length());
    const pct = Math.round((BASE_CAMERA_DISTANCE / dist) * 100);
    if (pct !== last.current) {
      last.current = pct;
      setViewScale(pct);
    }
  });

  return null;
}

function ViewportCaptureBridge() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    const api = { gl, scene, camera };
    registerViewportCapture(api);
    return () => unregisterViewportCapture(api);
  }, [gl, scene, camera]);

  return null;
}

function ShapeGeometry({ type }: { type: PrimitiveType }) {
  switch (type) {
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />;
    case 'sphere':
      return <sphereGeometry args={[0.6, 48, 48]} />;
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1.2, 48]} />;
    case 'cone':
      return <coneGeometry args={[0.55, 1.2, 48]} />;
    case 'torus':
      return <torusGeometry args={[0.55, 0.22, 24, 64]} />;
    case 'plane':
      return <planeGeometry args={[2, 2]} />;
    case 'capsule':
      return <capsuleGeometry args={[0.4, 0.9, 8, 24]} />;
    case 'pyramid':
      return <coneGeometry args={[0.7, 1.1, 4]} />;
    case 'dodecahedron':
      return <dodecahedronGeometry args={[0.7, 0]} />;
    case 'icosahedron':
      return <icosahedronGeometry args={[0.7, 0]} />;
    case 'octahedron':
      return <octahedronGeometry args={[0.7, 0]} />;
    case 'tetrahedron':
      return <tetrahedronGeometry args={[0.85, 0]} />;
    case 'torusKnot':
      return <torusKnotGeometry args={[0.45, 0.15, 128, 24]} />;
    case 'ring':
      return <ringGeometry args={[0.35, 0.85, 48]} />;
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

function PrimitiveMaterial({
  obj,
  selected,
  map,
}: {
  obj: SceneObject;
  selected: boolean;
  map?: THREE.Texture | null;
}) {
  const selectGlow = selected ? 0.12 : 0;
  const emissiveIntensity = Math.max(obj.emissiveIntensity ?? 0, selectGlow);
  const emissive =
    selected && (obj.emissiveIntensity ?? 0) < 0.05 ? obj.color : obj.emissive || '#000000';
  const doubleSide =
    obj.type === 'plane' || obj.type === 'ring' || !!obj.wireframe || !!map;

  return (
    <meshStandardMaterial
      color={obj.color}
      map={map ?? undefined}
      transparent={obj.opacity < 1 || !!obj.wireframe}
      opacity={obj.opacity}
      metalness={obj.metalness}
      roughness={obj.roughness}
      wireframe={!!obj.wireframe}
      flatShading={!!obj.flatShading}
      side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
    />
  );
}

function TexturedPrimitiveMaterial({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const url = obj.textureUrl!;
  const texture = useTexture(url);
  const repeat = Math.max(0.1, obj.textureRepeat ?? 2);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.needsUpdate = true;
  }, [texture, repeat]);

  return <PrimitiveMaterial obj={obj} selected={selected} map={texture} />;
}

function PrimitiveContent({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const type = obj.type as PrimitiveType;
  const hasTexture = !!obj.textureUrl;

  return (
    <mesh castShadow receiveShadow>
      <ShapeGeometry type={type} />
      {hasTexture ? (
        <Suspense fallback={<PrimitiveMaterial obj={obj} selected={selected} />}>
          <TexturedPrimitiveMaterial key={obj.textureUrl} obj={obj} selected={selected} />
        </Suspense>
      ) : (
        <PrimitiveMaterial obj={obj} selected={selected} />
      )}
    </mesh>
  );
}

function ObjectContent({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  if (obj.type === 'model' || obj.type === 'image') {
    return (
      <Suspense fallback={null}>
        <ImportedAsset obj={obj} selected={selected} />
      </Suspense>
    );
  }
  if (ALL_PRIMITIVES.includes(obj.type as PrimitiveType)) {
    return <PrimitiveContent obj={obj} selected={selected} />;
  }
  return null;
}

/** Always read latest OrbitControls from the R3F store (avoids stale lock after drag). */
function setOrbitLocked(locked: boolean) {
  const orbit = useThree.getState().controls as OrbitControlsImpl | null;
  if (orbit) orbit.enabled = !locked;
}

const LIGHT_DRAG_THRESHOLD_PX = 4;

type LightKind = 'directional' | 'point';

/**
 * Light marker: drag the marker body directly (large hit area).
 * No translate gizmo — its center picker used to block marker drags.
 */
function DraggableLightMarker({
  kind,
  position,
  color,
  label,
  selected,
  onSelect,
}: {
  kind: LightKind;
  position: { x: number; y: number; z: number };
  color: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const setLights = useAppStore((s) => s.setLights);
  const { camera, gl } = useThree();

  const dragRef = useRef({
    pending: false,
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    plane: new THREE.Plane(),
    hit: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
  });

  const commit = () => {
    const g = groupRef.current;
    if (!g) return;
    const next = { x: g.position.x, y: g.position.y, z: g.position.z };
    if (kind === 'directional') setLights({ directionalPosition: next });
    else setLights({ pointPosition: next });
  };

  const endLightDrag = () => {
    const d = dragRef.current;
    const wasDragging = d.active;
    d.pending = false;
    d.active = false;
    d.pointerId = -1;
    if (wasDragging) commit();
    setOrbitLocked(false);
  };

  // Keep marker roughly constant on screen while zooming
  useFrame(() => {
    const dist = Math.max(0.001, camera.position.length());
    const s = dist / BASE_CAMERA_DISTANCE;
    if (visualRef.current) visualRef.current.scale.setScalar(s);
  });

  useEffect(() => {
    const g = groupRef.current;
    if (!g || dragRef.current.active || dragRef.current.pending) return;
    g.position.set(position.x, position.y, position.z);
  }, [position.x, position.y, position.z]);

  useEffect(() => {
    const beginActiveDrag = (clientX: number, clientY: number) => {
      const d = dragRef.current;
      const g = groupRef.current;
      if (!g) return;
      d.active = true;
      d.pending = false;
      setOrbitLocked(true);

      const normal = camera.getWorldDirection(new THREE.Vector3()).negate();
      d.plane.setFromNormalAndCoplanarPoint(normal, g.position);
      const rect = gl.domElement.getBoundingClientRect();
      d.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      d.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      d.raycaster.setFromCamera(d.pointer, camera);
      if (d.raycaster.ray.intersectPlane(d.plane, d.hit)) {
        d.offset.copy(g.position).sub(d.hit);
      } else {
        d.offset.set(0, 0, 0);
      }
    };

    const applyPointer = (clientX: number, clientY: number) => {
      const d = dragRef.current;
      const g = groupRef.current;
      if (!d.active || !g) return;
      const normal = camera.getWorldDirection(new THREE.Vector3()).negate();
      d.plane.setFromNormalAndCoplanarPoint(normal, g.position);
      const rect = gl.domElement.getBoundingClientRect();
      d.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      d.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      d.raycaster.setFromCamera(d.pointer, camera);
      if (d.raycaster.ray.intersectPlane(d.plane, d.hit)) {
        g.position.copy(d.hit).add(d.offset);
        commit();
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.pointerId !== e.pointerId) return;

      if (d.pending && !d.active) {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (dx * dx + dy * dy < LIGHT_DRAG_THRESHOLD_PX * LIGHT_DRAG_THRESHOLD_PX) return;
        beginActiveDrag(e.clientX, e.clientY);
      }

      if (d.active) applyPointer(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.pending && !d.active) return;
      if (d.pointerId !== -1 && d.pointerId !== e.pointerId) return;
      endLightDrag();
    };

    const onBlur = () => {
      if (dragRef.current.pending || dragRef.current.active) endLightDrag();
      else setOrbitLocked(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      dragRef.current.pending = false;
      dragRef.current.active = false;
      dragRef.current.pointerId = -1;
      setOrbitLocked(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  const onMarkerPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect();

    const d = dragRef.current;
    d.pending = true;
    d.active = false;
    d.pointerId = e.pointerId;
    d.startX = e.clientX;
    d.startY = e.clientY;
    // Do not lock orbit until the pointer actually moves (keeps view control responsive)
  };

  const radius = kind === 'point' ? 0.32 : 0.28;
  const hitRadius = radius * 1.6;

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      <group ref={visualRef}>
        <mesh
          onPointerDown={onMarkerPointerDown}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <sphereGeometry args={[hitRadius, 16, 16]} />
          <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[radius, 20, 20]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={selected ? 1 : 0.9}
            depthTest
          />
        </mesh>
        {selected && (
          <mesh>
            <sphereGeometry args={[radius * 1.4, 20, 20]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.55} />
          </mesh>
        )}
        <Billboard follow position={[0, radius + 0.3, 0]}>
          <Text
            fontSize={0.24}
            color={color}
            anchorX="center"
            outlineWidth={0.02}
            outlineColor="#0a0e14"
          >
            {label}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

/** Drag to move (select/move) or drag to resize (scale tool) */
function SceneObjectNode({
  obj,
  selected,
  transformMode,
  onSelect,
}: {
  obj: SceneObject;
  selected: boolean;
  transformMode: 'translate' | 'rotate' | 'scale' | null;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const transformRef = useRef<TransformControlsImpl>(null);
  const updateObject = useAppStore((s) => s.updateObject);
  const { camera, gl } = useThree();

  const dragRef = useRef({
    active: false,
    kind: 'move' as 'move' | 'scale',
    pointerId: -1,
    plane: new THREE.Plane(),
    hit: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    startClientX: 0,
    startClientY: 0,
    startScale: new THREE.Vector3(1, 1, 1),
  });

  const commitFromGroup = () => {
    const g = groupRef.current;
    if (!g) return;
    updateObject(obj.id, {
      position: { x: g.position.x, y: g.position.y, z: g.position.z },
      rotation: { x: g.rotation.x, y: g.rotation.y, z: g.rotation.z },
      scale: {
        x: Math.max(0.05, g.scale.x),
        y: Math.max(0.05, g.scale.y),
        z: Math.max(0.05, g.scale.z),
      },
    });
  };

  // Keep TransformControls from fighting OrbitControls
  useEffect(() => {
    const tc = transformRef.current;
    if (!tc || !selected || !transformMode) return;

    const onDraggingChanged = (event: { value: boolean }) => {
      setOrbitLocked(event.value);
      if (!event.value) commitFromGroup();
    };

    // Live-commit scale/move while using gizmo so right panel stays in sync
    const onObjectChange = () => {
      if ((tc as unknown as { dragging?: boolean }).dragging) {
        const g = groupRef.current;
        if (!g) return;
        // only push scale frequently during scale mode for snappy UI
        if (transformMode === 'scale') {
          updateObject(obj.id, {
            scale: {
              x: Math.max(0.05, g.scale.x),
              y: Math.max(0.05, g.scale.y),
              z: Math.max(0.05, g.scale.z),
            },
          });
        }
      }
    };

    tc.addEventListener('dragging-changed', onDraggingChanged as never);
    tc.addEventListener('objectChange', onObjectChange as never);
    return () => {
      tc.removeEventListener('dragging-changed', onDraggingChanged as never);
      tc.removeEventListener('objectChange', onObjectChange as never);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, transformMode, obj.id]);

  // Sync React store → Three when not actively dragging
  useEffect(() => {
    const g = groupRef.current;
    if (!g || dragRef.current.active) return;
    const tc = transformRef.current as unknown as { dragging?: boolean } | null;
    if (tc?.dragging) return;
    g.position.set(obj.position.x, obj.position.y, obj.position.z);
    g.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    g.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
  }, [obj.position, obj.rotation, obj.scale]);

  const beginDrag = (e: ThreeEvent<PointerEvent>) => {
    // rotate tool: use gizmo only
    if (transformMode === 'rotate') return;

    e.stopPropagation();
    onSelect();

    const g = groupRef.current;
    if (!g) return;

    const d = dragRef.current;
    d.active = true;
    d.pointerId = e.pointerId;
    d.startClientX = e.clientX;
    d.startClientY = e.clientY;
    d.startScale.copy(g.scale);
    setOrbitLocked(true);

    if (transformMode === 'scale') {
      d.kind = 'scale';
    } else {
      d.kind = 'move';
      d.plane.set(new THREE.Vector3(0, 1, 0), -g.position.y);

      const rect = gl.domElement.getBoundingClientRect();
      d.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      d.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      d.raycaster.setFromCamera(d.pointer, camera);

      if (d.raycaster.ray.intersectPlane(d.plane, d.hit)) {
        d.offset.copy(g.position).sub(d.hit);
      } else {
        d.offset.set(0, 0, 0);
      }
    }

    (e.target as Element)?.setPointerCapture?.(e.pointerId);
  };

  const moveDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const g = groupRef.current;
    if (!g) return;

    if (d.kind === 'scale') {
      // Drag up/right = larger, down/left = smaller (uniform scale)
      const dx = e.clientX - d.startClientX;
      const dy = d.startClientY - e.clientY;
      const delta = (dx + dy) * 0.01;
      const factor = Math.max(0.05, 1 + delta);
      g.scale.set(
        Math.max(0.05, d.startScale.x * factor),
        Math.max(0.05, d.startScale.y * factor),
        Math.max(0.05, d.startScale.z * factor)
      );
      return;
    }

    const rect = gl.domElement.getBoundingClientRect();
    d.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    d.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    d.raycaster.setFromCamera(d.pointer, camera);

    if (d.raycaster.ray.intersectPlane(d.plane, d.hit)) {
      g.position.set(d.hit.x + d.offset.x, g.position.y, d.hit.z + d.offset.z);
    }
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d.active || (d.pointerId !== -1 && d.pointerId !== e.pointerId)) return;
    d.active = false;
    d.pointerId = -1;
    setOrbitLocked(false);
    commitFromGroup();
    try {
      (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!obj.visible) return null;

  return (
    <>
      <group
        ref={groupRef}
        position={[obj.position.x, obj.position.y, obj.position.z]}
        rotation={[obj.rotation.x, obj.rotation.y, obj.rotation.z]}
        scale={[obj.scale.x, obj.scale.y, obj.scale.z]}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={(e) => {
          if (dragRef.current.active) endDrag(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <ObjectContent obj={obj} selected={selected} />
      </group>

      {selected && transformMode && (
        <TransformControls
          ref={transformRef}
          object={groupRef}
          mode={transformMode}
          size={transformMode === 'scale' ? 1.05 : 0.85}
          space="world"
        />
      )}
    </>
  );
}

function SceneContent() {
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const tool = useAppStore((s) => s.tool);
  const lights = useAppStore((s) => s.lights);
  const viewport = useAppStore((s) => s.viewport);
  const [selectedLight, setSelectedLight] = useState<LightKind | null>(null);

  // select + move → translate gizmo; rotate/scale → their gizmos
  const transformMode: 'translate' | 'rotate' | 'scale' | null = useMemo(() => {
    if (tool === 'rotate') return 'rotate';
    if (tool === 'scale') return 'scale';
    if (tool === 'move' || tool === 'select') return 'translate';
    return null;
  }, [tool]);

  const selectObject = (id: string) => {
    setSelectedLight(null);
    setSelectedId(id);
  };

  const selectLight = (kind: LightKind) => {
    setSelectedId(null);
    setSelectedLight(kind);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedLight(null);
  };

  return (
    <>
      <color attach="background" args={[viewport.backgroundColor]} />
      <ambientLight intensity={lights.ambientIntensity} color={lights.ambientColor} />
      <directionalLight
        castShadow
        intensity={lights.directionalIntensity}
        color={lights.directionalColor}
        position={[
          lights.directionalPosition.x,
          lights.directionalPosition.y,
          lights.directionalPosition.z,
        ]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight
        intensity={lights.pointIntensity}
        color={lights.pointColor}
        position={[lights.pointPosition.x, lights.pointPosition.y, lights.pointPosition.z]}
      />

      <DraggableLightMarker
        kind="directional"
        position={lights.directionalPosition}
        color={lights.directionalColor}
        label="Dir"
        selected={selectedLight === 'directional'}
        onSelect={() => selectLight('directional')}
      />
      <DraggableLightMarker
        kind="point"
        position={lights.pointPosition}
        color={lights.pointColor}
        label="Point"
        selected={selectedLight === 'point'}
        onSelect={() => selectLight('point')}
      />

      {viewport.showGrid && <SceneGrid />}

      {viewport.showAxes && (
        <>
          <axesHelper args={[AXIS_LENGTH]} />
          <AxisLabels />
        </>
      )}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
        onClick={clearSelection}
      >
        <planeGeometry args={[100, 100]} />
        <shadowMaterial opacity={0.15} depthWrite={false} />
      </mesh>

      {objects.map((obj) => (
        <SceneObjectNode
          key={obj.id}
          obj={obj}
          selected={selectedId === obj.id}
          transformMode={selectedId === obj.id ? transformMode : null}
          onSelect={() => selectObject(obj.id)}
        />
      ))}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <CameraScaleReporter />
      <ViewportCaptureBridge />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#ff5c5c', '#5cff8a', '#5c9cff']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

export default function Viewport3D() {
  const objects = useAppStore((s) => s.objects);
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="viewport"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) {
          await importModelFiles(e.dataTransfer.files);
        }
      }}
    >
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        camera={{ position: [6, 5, 8], fov: 45, near: 0.1, far: 200 }}
        onPointerMissed={() => {
          useAppStore.getState().setSelectedId(null);
        }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <LightsCanvasPanel />
      <div className="viewport-overlay">
        <span className="chip">
          {t('status.objects')}: {objects.length}
        </span>
      </div>
      {dragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px dashed var(--accent)',
            background: 'rgba(61, 139, 253, 0.12)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 20,
            pointerEvents: 'none',
            color: 'var(--text)',
            fontWeight: 700,
          }}
        >
          Drop 3D models / images
        </div>
      )}
    </div>
  );
}
