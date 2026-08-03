import { Canvas, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  TransformControls,
  Text,
  Text3D,
  Center,
  ContactShadows,
  useTexture,
} from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import helvetikerRegularUrl from 'three/examples/fonts/helvetiker_regular.typeface.json?url';
import helvetikerBoldUrl from 'three/examples/fonts/helvetiker_bold.typeface.json?url';
import gentilisRegularUrl from 'three/examples/fonts/gentilis_regular.typeface.json?url';
import gentilisBoldUrl from 'three/examples/fonts/gentilis_bold.typeface.json?url';
import optimerRegularUrl from 'three/examples/fonts/optimer_regular.typeface.json?url';
import optimerBoldUrl from 'three/examples/fonts/optimer_bold.typeface.json?url';
import droidSansRegularUrl from 'three/examples/fonts/droid/droid_sans_regular.typeface.json?url';
import droidSansBoldUrl from 'three/examples/fonts/droid/droid_sans_bold.typeface.json?url';
import droidSerifRegularUrl from 'three/examples/fonts/droid/droid_serif_regular.typeface.json?url';
import droidSerifBoldUrl from 'three/examples/fonts/droid/droid_serif_bold.typeface.json?url';
import { useAppStore } from '../store/useAppStore';
import { ALL_PRIMITIVES, type LightKind, type PrimitiveType, type SceneObject, type TextFontId } from '../types';
import { importModelFiles } from '../utils/modelImport';
import { registerViewportCapture, unregisterViewportCapture } from '../utils/viewportCapture';
import ImportedAsset from './ImportedAsset';
import LightsCanvasPanel from './LightsCanvasPanel';

const WORLD_AXIS_LENGTH = 40;

/** Fine fixed world grid — on-screen size grows/shrinks with zoom (배율) */
const GRID_CELL_SIZE = 0.1;
const GRID_SECTION_SIZE = 0.5;
const GRID_ARGS: [number, number] = [40, 40];
const BASE_CAMERA_DISTANCE = Math.sqrt(6 * 6 + 5 * 5 + 8 * 8);
const POINT_LIGHT_RENDER_MULTIPLIER = 4;

const TEXT_FONT_URLS: Record<TextFontId, { regular: string; bold: string }> = {
  helvetiker: { regular: helvetikerRegularUrl, bold: helvetikerBoldUrl },
  gentilis: { regular: gentilisRegularUrl, bold: gentilisBoldUrl },
  optimer: { regular: optimerRegularUrl, bold: optimerBoldUrl },
  droidSans: { regular: droidSansRegularUrl, bold: droidSansBoldUrl },
  droidSerif: { regular: droidSerifRegularUrl, bold: droidSerifBoldUrl },
};

const ITALIC_MATRIX = new THREE.Matrix4().set(
  1, -0.28, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
);

function SceneGrid() {
  return (
    <group userData={{ hideInTransparentViewportCapture: true }}>
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
        side={THREE.DoubleSide}
        renderOrder={-1}
      />
    </group>
  );
}

function AxisLabel({
  text,
  position,
  color,
}: {
  text: string;
  position: [number, number, number];
  color: string;
}) {
  const labelRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (labelRef.current) labelRef.current.raycast = () => null;
  }, []);

  return (
    <Text
      ref={labelRef}
      position={position}
      fontSize={0.38}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.025}
      outlineColor="#0a0e14"
    >
      {text}
    </Text>
  );
}

function AxisLabels({ axisLength }: { axisLength: number }) {
  const labels: { text: string; position: [number, number, number]; color: string }[] = [
    { text: 'X', position: [axisLength + 0.28, 0, 0], color: '#ff5c5c' },
    { text: 'Y', position: [0, axisLength + 0.28, 0], color: '#5cff8a' },
    { text: 'Z', position: [0, 0, axisLength + 0.28], color: '#5c9cff' },
  ];

  return (
    <group userData={{ hideInTransparentViewportCapture: true }}>
      {labels.map(({ text, position, color }) => (
        <AxisLabel key={text} text={text} position={position} color={color} />
      ))}
    </group>
  );
}

function SceneAxes({ axisLength }: { axisLength: number }) {
  const axes = useMemo(() => {
    const helper = new THREE.AxesHelper(axisLength);
    helper.raycast = () => null;
    helper.userData.hideInTransparentViewportCapture = true;
    return helper;
  }, [axisLength]);

  useEffect(() => {
    return () => {
      axes.dispose();
    };
  }, [axes]);

  return <primitive object={axes} />;
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
    case 'circle':
      return <circleGeometry args={[0.85, 64]} />;
    case 'hexPrism':
      return <cylinderGeometry args={[0.62, 0.62, 1.15, 6]} />;
    case 'triangularPrism':
      return <cylinderGeometry args={[0.72, 0.72, 1.15, 3]} />;
    case 'pipe':
      return <cylinderGeometry args={[0.62, 0.62, 1.25, 48, 1, true]} />;
    case 'halfSphere':
      return <sphereGeometry args={[0.72, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />;
    case 'truncatedCone':
      return <cylinderGeometry args={[0.35, 0.72, 1.2, 48]} />;
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
    obj.type === 'plane' || obj.type === 'ring' || obj.type === 'circle' || obj.type === 'pipe' || !!obj.wireframe || !!map;

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

function TextMaterial({
  obj,
  selected,
  map,
  color = obj.color,
  attach,
}: {
  obj: SceneObject;
  selected: boolean;
  map?: THREE.Texture | null;
  color?: string;
  attach?: string;
}) {
  const selectGlow = selected ? 0.12 : 0;
  const fillGlow = obj.type === 'text' ? 0.18 : 0;
  const emissiveIntensity = Math.max(obj.emissiveIntensity ?? 0, selectGlow, fillGlow);
  const emissive =
    (selected || fillGlow > 0) && (obj.emissiveIntensity ?? 0) < 0.05
      ? color
      : obj.emissive || '#000000';

  return (
    <meshStandardMaterial
      attach={attach}
      color={color}
      map={map ?? undefined}
      transparent={obj.opacity < 1}
      opacity={obj.opacity}
      metalness={obj.metalness}
      roughness={obj.roughness}
      wireframe={!!obj.wireframe}
      flatShading={!!obj.flatShading}
      side={THREE.DoubleSide}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
    />
  );
}

function TextSurfaceMaterials({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const outlineColor = obj.textOutlineColor || '#1f2937';

  return (
    <>
      <TextMaterial obj={obj} selected={selected} attach="material-0" />
      <TextMaterial obj={obj} selected={selected} color={outlineColor} attach="material-1" />
    </>
  );
}

function TexturedTextMaterials({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const url = obj.textureUrl!;
  const texture = useTexture(url);
  const repeat = Math.max(0.1, obj.textureRepeat ?? 2);
  const outlineColor = obj.textOutlineColor || '#1f2937';

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.needsUpdate = true;
  }, [texture, repeat]);

  return (
    <>
      <TextMaterial obj={obj} selected={selected} map={texture} attach="material-0" />
      <TextMaterial obj={obj} selected={selected} color={outlineColor} attach="material-1" />
    </>
  );
}

function TextContent({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const text = obj.text?.trim() || 'Text';
  const size = Math.max(0.05, obj.textSize ?? 0.55);
  const depth = Math.max(0.01, obj.textDepth ?? 0.08);
  const hasTexture = !!obj.textureUrl;
  const fontSet = TEXT_FONT_URLS[obj.textFont || 'helvetiker'] || TEXT_FONT_URLS.helvetiker;
  const fontUrl = obj.textBold ? fontSet.bold : fontSet.regular;
  const underlineWidth = Math.max(size * 0.65, text.length * size * (obj.textBold ? 0.66 : 0.58));
  const underlineHeight = Math.max(0.018, size * 0.045);

  return (
    <Center>
      <group matrix={obj.textItalic ? ITALIC_MATRIX : undefined} matrixAutoUpdate={!obj.textItalic}>
        <Text3D
          font={fontUrl}
          size={size}
          height={depth}
          curveSegments={16}
          bevelEnabled
          bevelSize={Math.min(size * 0.018, 0.025)}
          bevelThickness={Math.min(depth * 0.22, 0.04)}
          bevelSegments={2}
          castShadow
          receiveShadow
        >
          {text}
          {hasTexture ? (
            <Suspense fallback={<TextMaterial obj={obj} selected={selected} />}>
              <TexturedTextMaterials key={obj.textureUrl} obj={obj} selected={selected} />
            </Suspense>
          ) : (
            <TextSurfaceMaterials obj={obj} selected={selected} />
          )}
        </Text3D>
        {obj.textUnderline && (
          <mesh
            castShadow
            receiveShadow
            position={[underlineWidth / 2, -size * 0.18, depth / 2]}
          >
            <boxGeometry args={[underlineWidth, underlineHeight, Math.max(depth * 0.65, 0.02)]} />
            {hasTexture ? (
              <Suspense fallback={<TextMaterial obj={obj} selected={selected} />}>
                <TexturedTextMaterials key={`${obj.textureUrl}-underline`} obj={obj} selected={selected} />
              </Suspense>
            ) : (
              <TextMaterial obj={obj} selected={selected} />
            )}
          </mesh>
        )}
      </group>
    </Center>
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
  if (obj.type === 'text') {
    return <TextContent obj={obj} selected={selected} />;
  }
  return null;
}

function getObjectHitRadius(obj: SceneObject) {
  if (obj.type === 'plane' || obj.type === 'image') return 1.35;
  if (obj.type === 'model') return 1.25;
  if (obj.type === 'text') {
    const textLength = Math.max(1, obj.text?.length ?? 4);
    const textSize = obj.textSize ?? 0.55;
    return Math.max(0.8, Math.min(3.5, textLength * textSize * 0.32));
  }
  return 0.95;
}

function ObjectHitTarget({ obj }: { obj: SceneObject }) {
  return (
    <mesh userData={{ hideInViewportCapture: true }}>
      <sphereGeometry args={[getObjectHitRadius(obj), 18, 12]} />
      <meshBasicMaterial transparent opacity={0.001} depthWrite={false} color="#ffffff" />
    </mesh>
  );
}

/** Latest OrbitControls instance — updated by OrbitLockBridge (useThree.getState is not available). */
let orbitControlsRef: OrbitControlsImpl | null = null;

function setOrbitLocked(locked: boolean) {
  if (orbitControlsRef) orbitControlsRef.enabled = !locked;
}

function OrbitLockBridge() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    orbitControlsRef = controls;
    return () => {
      if (orbitControlsRef === controls) orbitControlsRef = null;
    };
  }, [controls]);
  return null;
}

const LIGHT_DRAG_THRESHOLD_PX = 4;

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
    <group ref={groupRef} position={[position.x, position.y, position.z]} userData={{ hideInViewportCapture: true }}>
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
        <Text
          position={[0, radius + 0.3, 0]}
          fontSize={0.24}
          color={color}
          anchorX="center"
          outlineWidth={0.02}
          outlineColor="#0a0e14"
        >
          {label}
        </Text>
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
  onManipulationChange,
}: {
  obj: SceneObject;
  selected: boolean;
  transformMode: 'translate' | 'rotate' | 'scale' | null;
  onSelect: () => void;
  onManipulationChange: (active: boolean) => void;
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
      onManipulationChange(event.value);
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
    onManipulationChange(true);

    if (transformMode === 'scale') {
      d.kind = 'scale';
    } else {
      d.kind = 'move';
      d.plane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()).negate(),
        g.position
      );

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
      g.position.copy(d.hit).add(d.offset);
    }
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d.active || (d.pointerId !== -1 && d.pointerId !== e.pointerId)) return;
    d.active = false;
    d.pointerId = -1;
    setOrbitLocked(false);
    onManipulationChange(false);
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
        <ObjectHitTarget obj={obj} />
      </group>

      {selected && transformMode === 'rotate' && (
        <TransformControls
          ref={transformRef}
          object={groupRef}
          mode={transformMode}
          size={transformMode === 'scale' ? 1.05 : 0.85}
          space="world"
          userData={{ hideInViewportCapture: true }}
        />
      )}
    </>
  );
}

function SceneContent() {
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const selectedLight = useAppStore((s) => s.selectedLight);
  const setSelectedLight = useAppStore((s) => s.setSelectedLight);
  const tool = useAppStore((s) => s.tool);
  const lights = useAppStore((s) => s.lights);
  const viewport = useAppStore((s) => s.viewport);
  const [objectManipulating, setObjectManipulating] = useState(false);
  const axisLength = WORLD_AXIS_LENGTH;

  // select + move → translate gizmo; rotate/scale → their gizmos
  const transformMode: 'translate' | 'rotate' | 'scale' | null = useMemo(() => {
    if (tool === 'rotate') return 'rotate';
    if (tool === 'scale') return 'scale';
    if (tool === 'move' || tool === 'select') return 'translate';
    return null;
  }, [tool]);

  const selectObject = (id: string) => {
    setSelectedId(id);
  };

  const selectLight = (kind: LightKind) => {
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
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />
      <pointLight
        castShadow
        intensity={lights.pointIntensity * POINT_LIGHT_RENDER_MULTIPLIER}
        color={lights.pointColor}
        position={[lights.pointPosition.x, lights.pointPosition.y, lights.pointPosition.z]}
        distance={60}
        decay={1.15}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.00025}
        shadow-normalBias={0.02}
      />

      {viewport.showLightMarkers && (
        <>
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
        </>
      )}

      {viewport.showGrid && <SceneGrid />}

      {viewport.showAxes && (
        <>
          <SceneAxes axisLength={axisLength} />
          <AxisLabels axisLength={axisLength} />
        </>
      )}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
        onClick={clearSelection}
        userData={{ hideInTransparentViewportCapture: true }}
      >
        <planeGeometry args={[100, 100]} />
        <shadowMaterial opacity={0.32} depthWrite={false} />
      </mesh>

      <group userData={{ hideInTransparentViewportCapture: true }}>
        <ContactShadows
          position={[0, -0.045, 0]}
          opacity={0.34}
          scale={34}
          blur={2.4}
          far={12}
          resolution={1024}
          color="#05070a"
        />
      </group>

      {objects.map((obj) => (
        <SceneObjectNode
          key={obj.id}
          obj={obj}
          selected={selectedId === obj.id}
          transformMode={selectedId === obj.id ? transformMode : null}
          onSelect={() => selectObject(obj.id)}
          onManipulationChange={setObjectManipulating}
        />
      ))}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <OrbitLockBridge />
      <CameraScaleReporter />
      <group userData={{ hideInTransparentViewportCapture: true }}>
        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport axisColors={['#ff5c5c', '#5cff8a', '#5c9cff']} labelColor="white" />
        </GizmoHelper>
      </group>
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
        gl={{
          preserveDrawingBuffer: true,
          alpha: true,
          antialias: true,
        }}
        onCreated={({ gl }) => {
          // Keep normal frames opaque; transparent clear is used only during image export
          gl.setClearColor('#000000', 1);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
        }}
        camera={{ position: [6, 5, 8], fov: 45, near: 0.1, far: 200 }}
        onPointerMissed={() => {
          useAppStore.getState().setSelectedId(null);
          useAppStore.getState().setSelectedLight(null);
        }}
      >
        <ViewportCaptureBridge />
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
