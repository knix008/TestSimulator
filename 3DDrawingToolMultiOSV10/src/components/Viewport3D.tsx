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

const EMPTY_AXIS_LENGTH = 1.6;
const AXIS_PADDING = 0.6;

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
  const { camera } = useThree();

  useEffect(() => {
    if (labelRef.current) labelRef.current.raycast = () => null;
  }, []);

  useFrame(() => {
    if (labelRef.current) labelRef.current.quaternion.copy(camera.quaternion);
  });

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
    { text: 'X', position: [axisLength + 0.22, 0, 0], color: '#ff5c5c' },
    { text: 'Y', position: [0, axisLength + 0.22, 0], color: '#5cff8a' },
    { text: 'Z', position: [0, 0, axisLength + 0.22], color: '#5c9cff' },
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
    const group = new THREE.Group();
    const addAxis = (end: THREE.Vector3, color: string) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), end]);
      const material = new THREE.LineBasicMaterial({ color, toneMapped: false });
      const line = new THREE.Line(geometry, material);
      line.raycast = () => null;
      group.add(line);
    };

    addAxis(new THREE.Vector3(axisLength, 0, 0), '#ff5c5c');
    addAxis(new THREE.Vector3(0, axisLength, 0), '#5cff8a');
    addAxis(new THREE.Vector3(0, 0, axisLength), '#5c9cff');
    group.userData.hideInTransparentViewportCapture = true;
    return group;
  }, [axisLength]);

  useEffect(() => {
    return () => {
      axes.traverse((child) => {
        const line = child as THREE.Line;
        line.geometry?.dispose();
        const material = line.material as THREE.Material | undefined;
        material?.dispose();
      });
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
    case 'slab':
      return <boxGeometry args={[1.6, 0.18, 1]} />;
    case 'wall':
      return <boxGeometry args={[1.8, 1.1, 0.18]} />;
    case 'rod':
      return <cylinderGeometry args={[0.16, 0.16, 1.8, 32]} />;
    case 'disk':
      return <cylinderGeometry args={[0.78, 0.78, 0.18, 64]} />;
    case 'pentagonalPrism':
      return <cylinderGeometry args={[0.65, 0.65, 1.15, 5]} />;
    case 'octagonalPrism':
      return <cylinderGeometry args={[0.65, 0.65, 1.15, 8]} />;
    case 'diamond':
      return <octahedronGeometry args={[0.8, 0]} />;
    case 'thinTorus':
      return <torusGeometry args={[0.58, 0.08, 16, 72]} />;
    case 'arc':
      return <torusGeometry args={[0.65, 0.12, 16, 48, Math.PI * 1.35]} />;
    case 'halfCylinder':
      return <cylinderGeometry args={[0.65, 0.65, 1.15, 32, 1, false, 0, Math.PI]} />;
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
    obj.type === 'plane' || obj.type === 'ring' || obj.type === 'circle' || obj.type === 'pipe' || obj.type === 'arc' || obj.type === 'halfCylinder' || !!obj.wireframe || !!map;

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

const OBJECT_PRIMITIVES = new Set<PrimitiveType>([
  'table',
  'chair',
  'sofa',
  'bed',
  'door',
  'windowFrame',
  'bookshelf',
  'laptop',
  'cup',
  'bottle',
  'plantPot',
  'deskLamp',
]);

const NETWORK_PRIMITIVES = new Set<PrimitiveType>([
  'networkRouter',
  'networkSwitch',
  'serverRack',
  'firewallAppliance',
  'wifiAccessPoint',
  'modem',
  'nasStorage',
  'patchPanel',
  'antennaTower',
  'networkCable',
]);

const COMPOSITE_PRIMITIVES = new Set<PrimitiveType>([
  ...OBJECT_PRIMITIVES,
  ...NETWORK_PRIMITIVES,
]);

function Part({
  obj,
  selected,
  position,
  scale,
  rotation = [0, 0, 0],
  geometry,
}: {
  obj: SceneObject;
  selected: boolean;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  geometry: React.ReactNode;
}) {
  return (
    <mesh castShadow receiveShadow position={position} scale={scale} rotation={rotation}>
      {geometry}
      <PrimitiveMaterial obj={obj} selected={selected} />
    </mesh>
  );
}

function DetailPart({
  position,
  scale,
  rotation = [0, 0, 0],
  color,
  geometry,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  geometry: React.ReactNode;
}) {
  return (
    <mesh castShadow receiveShadow position={position} scale={scale} rotation={rotation}>
      {geometry}
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.1} />
    </mesh>
  );
}

function ObjectPrimitiveContent({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  switch (obj.type) {
    case 'table':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.62, 0]} scale={[1.45, 0.12, 0.9]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {[-0.58, 0.58].flatMap((x) =>
            [-0.32, 0.32].map((z) => (
              <Part key={`${x}-${z}`} obj={obj} selected={selected} position={[x, 0.28, z]} scale={[0.09, 0.58, 0.09]} geometry={<boxGeometry args={[1, 1, 1]} />} />
            ))
          )}
        </group>
      );
    case 'chair':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.42, 0]} scale={[0.78, 0.12, 0.72]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.9, 0.34]} scale={[0.78, 0.85, 0.12]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {[-0.28, 0.28].flatMap((x) =>
            [-0.22, 0.22].map((z) => (
              <Part key={`${x}-${z}`} obj={obj} selected={selected} position={[x, 0.18, z]} scale={[0.08, 0.36, 0.08]} geometry={<boxGeometry args={[1, 1, 1]} />} />
            ))
          )}
        </group>
      );
    case 'sofa':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.32, 0]} scale={[1.7, 0.36, 0.72]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.72, 0.34]} scale={[1.7, 0.72, 0.18]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[-0.92, 0.48, 0]} scale={[0.18, 0.56, 0.76]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0.92, 0.48, 0]} scale={[0.18, 0.56, 0.76]} geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    case 'bed':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.28, 0]} scale={[1.8, 0.28, 1.15]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.55, -0.36]} scale={[1.68, 0.16, 0.52]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.62, 0.55]} scale={[1.85, 0.85, 0.14]} geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    case 'door':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.85, 0]} scale={[0.75, 1.7, 0.09]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0.24, 0.82, -0.06]} scale={[0.055, 0.055, 0.055]} geometry={<sphereGeometry args={[1, 16, 12]} />} />
        </group>
      );
    case 'windowFrame':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.82, 0]} scale={[1.2, 0.08, 0.08]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, -0.02, 0]} scale={[1.2, 0.08, 0.08]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[-0.56, 0.4, 0]} scale={[0.08, 0.92, 0.08]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0.56, 0.4, 0]} scale={[0.08, 0.92, 0.08]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.4, 0]} scale={[0.06, 0.88, 0.06]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.4, 0]} scale={[1.08, 0.06, 0.06]} geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    case 'bookshelf':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.8, 0]} scale={[1.15, 1.55, 0.22]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {[-0.28, 0.18, 0.64].map((y) => (
            <Part key={y} obj={obj} selected={selected} position={[0, y + 0.8, -0.18]} scale={[1.05, 0.06, 0.18]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'laptop':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.08, 0]} scale={[1.05, 0.08, 0.68]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.45, 0.32]} scale={[1.05, 0.72, 0.06]} rotation={[-0.25, 0, 0]} geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    case 'cup':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.38, 0]} scale={[1, 1, 1]} geometry={<cylinderGeometry args={[0.32, 0.25, 0.72, 36, 1, true]} />} />
          <Part obj={obj} selected={selected} position={[0.33, 0.38, 0]} scale={[1, 1, 1]} rotation={[0, Math.PI / 2, 0]} geometry={<torusGeometry args={[0.18, 0.035, 12, 24, Math.PI * 1.35]} />} />
        </group>
      );
    case 'bottle':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.36, 0]} scale={[1, 1, 1]} geometry={<cylinderGeometry args={[0.25, 0.3, 0.72, 36]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.86, 0]} scale={[1, 1, 1]} geometry={<cylinderGeometry args={[0.12, 0.16, 0.36, 28]} />} />
        </group>
      );
    case 'plantPot':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.26, 0]} scale={[1, 1, 1]} geometry={<cylinderGeometry args={[0.34, 0.24, 0.52, 36]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.76, 0]} scale={[0.62, 0.42, 0.62]} geometry={<sphereGeometry args={[0.55, 24, 16]} />} />
        </group>
      );
    case 'deskLamp':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.05, 0]} scale={[1, 1, 1]} geometry={<cylinderGeometry args={[0.34, 0.34, 0.1, 36]} />} />
          <Part obj={obj} selected={selected} position={[0, 0.48, 0]} scale={[0.08, 0.8, 0.08]} rotation={[0, 0, -0.35]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0.24, 0.9, 0]} scale={[1, 1, 1]} rotation={[0, 0, -0.35]} geometry={<coneGeometry args={[0.28, 0.38, 32]} />} />
        </group>
      );
    case 'networkRouter':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.16, 0]} scale={[1.25, 0.22, 0.78]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[-0.43, 0.58, 0.18]} scale={[0.04, 0.88, 0.04]} rotation={[0.3, 0, -0.22]} geometry={<cylinderGeometry args={[1, 1, 1, 12]} />} />
          <Part obj={obj} selected={selected} position={[0.43, 0.58, 0.18]} scale={[0.04, 0.88, 0.04]} rotation={[0.3, 0, 0.22]} geometry={<cylinderGeometry args={[1, 1, 1, 12]} />} />
          {[-0.36, -0.18, 0, 0.18, 0.36].map((x) => (
            <DetailPart key={x} position={[x, 0.3, -0.41]} scale={[0.08, 0.04, 0.02]} color="#69db7c" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'networkSwitch':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.14, 0]} scale={[1.65, 0.2, 0.62]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {Array.from({ length: 8 }, (_, i) => -0.58 + i * 0.17).map((x) => (
            <DetailPart key={x} position={[x, 0.19, -0.33]} scale={[0.09, 0.06, 0.025]} color="#212529" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
          {[-0.72, 0.72].map((x) => (
            <DetailPart key={x} position={[x, 0.3, -0.33]} scale={[0.06, 0.03, 0.02]} color="#51cf66" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'serverRack':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.85, 0]} scale={[0.95, 1.7, 0.72]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {[-0.48, -0.16, 0.16, 0.48].map((y) => (
            <DetailPart key={y} position={[0, y + 0.85, -0.38]} scale={[0.82, 0.08, 0.03]} color="#111827" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
          {[-0.28, 0, 0.28].map((x) => (
            <DetailPart key={x} position={[x, 1.58, -0.4]} scale={[0.06, 0.06, 0.025]} color="#51cf66" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'firewallAppliance':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.22, 0]} scale={[1.35, 0.32, 0.68]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <DetailPart position={[-0.38, 0.43, -0.36]} scale={[0.28, 0.08, 0.03]} color="#fff3bf" geometry={<boxGeometry args={[1, 1, 1]} />} />
          <DetailPart position={[0.32, 0.43, -0.36]} scale={[0.46, 0.08, 0.03]} color="#212529" geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    case 'wifiAccessPoint':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.14, 0]} scale={[1, 1, 1]} geometry={<cylinderGeometry args={[0.52, 0.62, 0.18, 40]} />} />
          <DetailPart position={[0, 0.25, 0]} scale={[1, 1, 1]} color="#74c0fc" geometry={<torusGeometry args={[0.27, 0.015, 8, 40]} />} />
          <DetailPart position={[0, 0.27, 0]} scale={[0.06, 0.06, 0.06]} color="#51cf66" geometry={<sphereGeometry args={[1, 16, 12]} />} />
        </group>
      );
    case 'modem':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.28, 0]} scale={[0.72, 0.56, 0.9]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          <Part obj={obj} selected={selected} position={[0.34, 0.82, 0.24]} scale={[0.035, 0.72, 0.035]} rotation={[0.18, 0, 0.16]} geometry={<cylinderGeometry args={[1, 1, 1, 12]} />} />
          {[-0.2, 0, 0.2].map((x) => (
            <DetailPart key={x} position={[x, 0.58, -0.47]} scale={[0.05, 0.05, 0.02]} color="#ffd43b" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'nasStorage':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.48, 0]} scale={[0.92, 0.96, 0.7]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {[-0.22, 0.22].map((x) => (
            <DetailPart key={x} position={[x, 0.52, -0.37]} scale={[0.28, 0.72, 0.03]} color="#212529" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
          <DetailPart position={[0.34, 0.9, -0.39]} scale={[0.06, 0.06, 0.025]} color="#51cf66" geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    case 'patchPanel':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.12, 0]} scale={[1.65, 0.16, 0.36]} geometry={<boxGeometry args={[1, 1, 1]} />} />
          {Array.from({ length: 12 }, (_, i) => -0.68 + i * 0.125).map((x) => (
            <DetailPart key={x} position={[x, 0.16, -0.2]} scale={[0.055, 0.045, 0.02]} color="#111827" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'antennaTower':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.88, 0]} scale={[0.05, 1.65, 0.05]} geometry={<cylinderGeometry args={[1, 1, 1, 8]} />} />
          <Part obj={obj} selected={selected} position={[-0.25, 0.55, 0]} scale={[0.04, 1.05, 0.04]} rotation={[0, 0, -0.28]} geometry={<cylinderGeometry args={[1, 1, 1, 8]} />} />
          <Part obj={obj} selected={selected} position={[0.25, 0.55, 0]} scale={[0.04, 1.05, 0.04]} rotation={[0, 0, 0.28]} geometry={<cylinderGeometry args={[1, 1, 1, 8]} />} />
          {[0.48, 0.88, 1.28].map((y) => (
            <DetailPart key={y} position={[0, y, 0]} scale={[0.72, 0.035, 0.035]} color="#ced4da" geometry={<boxGeometry args={[1, 1, 1]} />} />
          ))}
        </group>
      );
    case 'networkCable':
      return (
        <group>
          <Part obj={obj} selected={selected} position={[0, 0.16, 0]} scale={[1, 1, 1]} rotation={[Math.PI / 2, 0, 0]} geometry={<torusGeometry args={[0.52, 0.035, 12, 48, Math.PI * 1.45]} />} />
          <DetailPart position={[-0.5, 0.16, 0.19]} scale={[0.18, 0.09, 0.12]} color="#212529" geometry={<boxGeometry args={[1, 1, 1]} />} />
          <DetailPart position={[0.5, 0.16, -0.19]} scale={[0.18, 0.09, 0.12]} color="#212529" geometry={<boxGeometry args={[1, 1, 1]} />} />
        </group>
      );
    default:
      return null;
  }
}

function PrimitiveContent({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const type = obj.type as PrimitiveType;
  const hasTexture = !!obj.textureUrl;

  if (COMPOSITE_PRIMITIVES.has(type)) return <ObjectPrimitiveContent obj={obj} selected={selected} />;

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
  if (COMPOSITE_PRIMITIVES.has(obj.type as PrimitiveType)) return 1.35;
  if (obj.type === 'plane' || obj.type === 'image') return 1.35;
  if (obj.type === 'model') return 1.25;
  if (obj.type === 'text') {
    const textLength = Math.max(1, obj.text?.length ?? 4);
    const textSize = obj.textSize ?? 0.55;
    return Math.max(0.8, Math.min(3.5, textLength * textSize * 0.32));
  }
  return 0.95;
}

function getObjectHitSize(obj: SceneObject): [number, number, number] {
  if (obj.type === 'image') return [2.2, 1.6, 0.12];
  if (obj.type === 'model') return [2.2, 2.2, 2.2];
  if (obj.type === 'text') {
    const textLength = Math.max(1, obj.text?.length ?? 4);
    const textSize = obj.textSize ?? 0.55;
    const width = Math.max(0.8, Math.min(5, textLength * textSize * 0.55));
    return [width, textSize * 1.4, Math.max(0.1, obj.textDepth ?? 0.04)];
  }

  switch (obj.type) {
    case 'table':
      return [1.75, 0.9, 1.15];
    case 'chair':
      return [1.05, 1.45, 1.0];
    case 'sofa':
      return [2.15, 1.25, 1.05];
    case 'bed':
      return [2.2, 1.25, 1.45];
    case 'door':
      return [1.0, 1.95, 0.32];
    case 'windowFrame':
      return [1.45, 1.15, 0.32];
    case 'bookshelf':
      return [1.45, 1.75, 0.55];
    case 'laptop':
      return [1.3, 0.95, 0.95];
    case 'cup':
      return [0.95, 0.95, 0.8];
    case 'bottle':
      return [0.82, 1.2, 0.82];
    case 'plantPot':
      return [1.1, 1.15, 1.1];
    case 'deskLamp':
      return [1.0, 1.25, 0.85];
    case 'networkRouter':
      return [1.55, 1.15, 1.0];
    case 'networkSwitch':
      return [1.9, 0.55, 0.8];
    case 'serverRack':
      return [1.2, 1.9, 0.95];
    case 'firewallAppliance':
      return [1.6, 0.7, 0.9];
    case 'wifiAccessPoint':
      return [1.35, 0.45, 1.35];
    case 'modem':
      return [1.0, 1.25, 1.1];
    case 'nasStorage':
      return [1.15, 1.15, 0.95];
    case 'patchPanel':
      return [1.9, 0.42, 0.55];
    case 'antennaTower':
      return [1.0, 1.9, 0.45];
    case 'networkCable':
      return [1.35, 0.45, 0.85];
    default:
      return [1, 1, 1];
  }
}

function getDynamicAxisLength(objects: SceneObject[]) {
  let maxExtent = 0;
  let hasVisibleContent = false;

  for (const obj of objects) {
    if (!obj.visible) continue;
    hasVisibleContent = true;

    if (obj.type === 'connection') {
      const start = objects.find((o) => o.id === obj.connectionStartId && o.visible);
      const end = objects.find((o) => o.id === obj.connectionEndId && o.visible);
      for (const endpoint of [start, end]) {
        if (!endpoint) continue;
        maxExtent = Math.max(maxExtent, endpoint.position.x, endpoint.position.y, endpoint.position.z);
      }
      continue;
    }

    const [width, height, depth] = getObjectHitSize(obj);
    const halfX = Math.abs(width * obj.scale.x) / 2;
    const halfY = Math.abs(height * obj.scale.y) / 2;
    const halfZ = Math.abs(depth * obj.scale.z) / 2;
    maxExtent = Math.max(
      maxExtent,
      obj.position.x + halfX,
      obj.position.y + halfY,
      obj.position.z + halfZ
    );
  }

  if (!hasVisibleContent) return EMPTY_AXIS_LENGTH;
  return Math.ceil(Math.max(EMPTY_AXIS_LENGTH, maxExtent + AXIS_PADDING) * 2) / 2;
}

function ObjectHitTarget({ obj }: { obj: SceneObject }) {
  if (COMPOSITE_PRIMITIVES.has(obj.type as PrimitiveType)) {
    const hitSize = getObjectHitSize(obj);
    return (
      <mesh position={[0, hitSize[1] / 2, 0]} userData={{ hideInViewportCapture: true }}>
        <boxGeometry args={hitSize} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} color="#ffffff" />
      </mesh>
    );
  }

  return (
    <mesh userData={{ hideInViewportCapture: true }}>
      <sphereGeometry args={[getObjectHitRadius(obj), 18, 12]} />
      <meshBasicMaterial transparent opacity={0.001} depthWrite={false} color="#ffffff" />
    </mesh>
  );
}

const BOX_SURFACE_TYPES = new Set<PrimitiveType>([
  'box',
  'plane',
  'slab',
  'wall',
  'door',
  'windowFrame',
  'table',
  'chair',
  'sofa',
  'bed',
  'bookshelf',
  'laptop',
  'networkRouter',
  'networkSwitch',
  'serverRack',
  'firewallAppliance',
  'modem',
  'nasStorage',
  'patchPanel',
]);

function getObjectQuaternion(obj: SceneObject) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(obj.rotation.x, obj.rotation.y, obj.rotation.z));
}

function scaledHalfExtents(size: [number, number, number], obj: SceneObject) {
  return new THREE.Vector3(
    Math.max(0.02, (size[0] * Math.abs(obj.scale.x)) / 2),
    Math.max(0.02, (size[1] * Math.abs(obj.scale.y)) / 2),
    Math.max(0.02, (size[2] * Math.abs(obj.scale.z)) / 2)
  );
}

function getPrimitiveSurfaceSize(obj: SceneObject): [number, number, number] {
  switch (obj.type) {
    case 'box':
      return [1, 1, 1];
    case 'sphere':
      return [1.2, 1.2, 1.2];
    case 'cylinder':
      return [1, 1.2, 1];
    case 'cone':
      return [1.1, 1.2, 1.1];
    case 'torus':
      return [1.54, 0.44, 1.54];
    case 'plane':
      return [2, 2, 0.04];
    case 'capsule':
      return [0.8, 1.7, 0.8];
    case 'pyramid':
      return [1.4, 1.1, 1.4];
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
      return [1.4, 1.4, 1.4];
    case 'tetrahedron':
      return [1.7, 1.7, 1.7];
    case 'torusKnot':
      return [1.2, 1.2, 1.2];
    case 'ring':
    case 'circle':
      return [1.7, 1.7, 0.04];
    case 'hexPrism':
      return [1.24, 1.15, 1.24];
    case 'triangularPrism':
      return [1.44, 1.15, 1.44];
    case 'pipe':
      return [1.24, 1.25, 1.24];
    case 'halfSphere':
      return [1.44, 0.72, 1.44];
    case 'truncatedCone':
      return [1.44, 1.2, 1.44];
    case 'slab':
      return [1.6, 0.18, 1];
    case 'wall':
      return [1.8, 1.1, 0.18];
    case 'rod':
      return [0.32, 1.8, 0.32];
    case 'disk':
      return [1.56, 0.18, 1.56];
    case 'pentagonalPrism':
    case 'octagonalPrism':
      return [1.3, 1.15, 1.3];
    case 'diamond':
      return [1.6, 1.6, 1.6];
    case 'thinTorus':
      return [1.32, 0.16, 1.32];
    case 'arc':
      return [1.54, 0.24, 1.54];
    case 'halfCylinder':
      return [1.3, 1.15, 0.65];
    case 'model':
      return [2.5, 2.5, 2.5];
    case 'image':
      return [2.7, 2.7, 0.04];
    case 'text': {
      const textLength = Math.max(1, obj.text?.length ?? 4);
      const textSize = obj.textSize ?? 0.55;
      const textDepth = obj.textDepth ?? 0.08;
      return [Math.max(0.8, textLength * textSize * 0.58), Math.max(0.2, textSize), Math.max(0.04, textDepth)];
    }
    default:
      return [1, 1, 1];
  }
}

function getConnectionCenter(obj: SceneObject) {
  const center = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
  if (COMPOSITE_PRIMITIVES.has(obj.type as PrimitiveType)) {
    const offset = new THREE.Vector3(0, (getObjectHitSize(obj)[1] * obj.scale.y) / 2, 0)
      .applyQuaternion(getObjectQuaternion(obj));
    center.add(offset);
  }
  return center;
}

function getConnectionHalfExtents(obj: SceneObject) {
  const size = COMPOSITE_PRIMITIVES.has(obj.type as PrimitiveType)
    ? getObjectHitSize(obj)
    : getPrimitiveSurfaceSize(obj);
  return scaledHalfExtents(size, obj);
}

function isBoxSurface(obj: SceneObject) {
  return BOX_SURFACE_TYPES.has(obj.type as PrimitiveType) || obj.type === 'image' || obj.type === 'text';
}

function getConnectionSurfacePoint(obj: SceneObject, toward: THREE.Vector3) {
  const center = getConnectionCenter(obj);
  const worldDirection = toward.clone().sub(center);
  if (worldDirection.lengthSq() < 0.000001) return center;

  const half = getConnectionHalfExtents(obj);
  const rotation = getObjectQuaternion(obj);
  const localDirection = worldDirection.clone().applyQuaternion(rotation.clone().invert()).normalize();

  if (isBoxSurface(obj)) {
    const candidates = [
      Math.abs(localDirection.x) > 0.0001 ? half.x / Math.abs(localDirection.x) : Infinity,
      Math.abs(localDirection.y) > 0.0001 ? half.y / Math.abs(localDirection.y) : Infinity,
      Math.abs(localDirection.z) > 0.0001 ? half.z / Math.abs(localDirection.z) : Infinity,
    ];
    const distance = Math.min(...candidates.filter(Number.isFinite));
    const localPoint = localDirection.multiplyScalar(Number.isFinite(distance) ? distance : Math.max(half.x, half.y, half.z));
    return center.add(localPoint.applyQuaternion(rotation));
  }

  const denominator = Math.sqrt(
    (localDirection.x * localDirection.x) / (half.x * half.x) +
      (localDirection.y * localDirection.y) / (half.y * half.y) +
      (localDirection.z * localDirection.z) / (half.z * half.z)
  );
  const localPoint = localDirection.multiplyScalar(denominator > 0 ? 1 / denominator : Math.max(half.x, half.y, half.z));
  return center.add(localPoint.applyQuaternion(rotation));
}

function getConnectionPoints(start: SceneObject, end: SceneObject, pathType: SceneObject['linePathType']) {
  const startCenter = getConnectionCenter(start);
  const endCenter = getConnectionCenter(end);
  const a = getConnectionSurfacePoint(start, endCenter);
  const b = getConnectionSurfacePoint(end, startCenter);

  if (pathType === 'elbow') {
    return [a, new THREE.Vector3(b.x, a.y, a.z), b];
  }

  if (pathType === 'curve') {
    const distance = a.distanceTo(b);
    const control = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, Math.max(0.35, distance * 0.22), 0));
    return Array.from({ length: 13 }, (_, index) => {
      const t = index / 12;
      return a.clone().multiplyScalar((1 - t) * (1 - t))
        .add(control.clone().multiplyScalar(2 * (1 - t) * t))
        .add(b.clone().multiplyScalar(t * t));
    });
  }

  return [a, b];
}

function getSegmentBetween(start: THREE.Vector3, end: THREE.Vector3) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length < 0.001) return null;
  return {
    start,
    end,
    length,
    midpoint: start.clone().add(end).multiplyScalar(0.5),
    direction: delta.clone().normalize(),
    quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
  };
}

function ConnectionMaterial({ obj }: { obj: SceneObject }) {
  return (
    <meshStandardMaterial
      color={obj.color}
      opacity={obj.opacity}
      transparent={obj.opacity < 1}
      metalness={obj.metalness}
      roughness={obj.roughness}
      emissive={obj.emissive || '#000000'}
      emissiveIntensity={obj.emissiveIntensity ?? 0}
      wireframe={obj.wireframe}
    />
  );
}

function ConnectionEndpointMarker({
  type,
  position,
  direction,
  thickness,
  obj,
  onSelect,
}: {
  type: SceneObject['lineStartEndpoint'];
  position: THREE.Vector3;
  direction: THREE.Vector3;
  thickness: number;
  obj: SceneObject;
  onSelect: () => void;
}) {
  if (!type || type === 'none') return null;

  const size = Math.max(0.12, thickness * 2.8);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      castShadow
      receiveShadow
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {type === 'arrow' ? (
        <coneGeometry args={[size * 0.62, size * 1.35, 24]} />
      ) : (
        <sphereGeometry args={[size * 0.62, 20, 16]} />
      )}
      <ConnectionMaterial obj={obj} />
    </mesh>
  );
}

function ConnectionObjectNode({
  obj,
  objects,
  selected,
  onSelect,
}: {
  obj: SceneObject;
  objects: SceneObject[];
  selected: boolean;
  onSelect: () => void;
}) {
  const start = objects.find((o) => o.id === obj.connectionStartId);
  const end = objects.find((o) => o.id === obj.connectionEndId);

  const line = useMemo(() => {
    if (!start || !end) return null;
    const points = getConnectionPoints(start, end, obj.linePathType || 'straight');
    const segments = points.slice(0, -1)
      .map((point, index) => getSegmentBetween(point, points[index + 1]))
      .filter((segment): segment is NonNullable<ReturnType<typeof getSegmentBetween>> => !!segment);
    if (segments.length === 0) return null;
    return { points, segments, start: points[0], end: points[points.length - 1] };
  }, [start, end, obj.linePathType]);

  if (!obj.visible || !line) return null;

  const thickness = Math.max(0.01, obj.lineThickness ?? 0.06);
  const hitThickness = Math.max(0.12, thickness * 2.2);
  const lineStyle = obj.lineStyle || 'solid';

  const segmentMeshes = useMemo(() => {
    if (!line || lineStyle === 'solid') return [];
    const gap = lineStyle === 'dashed' ? Math.max(thickness * 4, 0.16) : Math.max(thickness * 5, 0.18);
    const segmentLength = lineStyle === 'dashed' ? Math.max(thickness * 6, 0.28) : 0;
    const items: Array<{ key: string; position: THREE.Vector3; length: number; quaternion: THREE.Quaternion }> = [];

    line.segments.forEach((segment, segmentIndex) => {
      let offset = 0;
      let index = 0;
      while (offset < segment.length) {
        const length = lineStyle === 'dashed' ? Math.min(segmentLength, segment.length - offset) : 0;
        const centerOffset = lineStyle === 'dashed' ? offset + length / 2 : offset;
        items.push({
          key: `${lineStyle}-${segmentIndex}-${index}`,
          position: segment.start.clone().add(segment.direction.clone().multiplyScalar(centerOffset)),
          length,
          quaternion: segment.quaternion,
        });
        offset += lineStyle === 'dashed' ? segmentLength + gap : gap;
        index += 1;
      }
    });

    return items;
  }, [line, lineStyle, thickness]);

  return (
    <group>
      {lineStyle === 'solid' ? (
        line.segments.map((segment, index) => (
          <mesh
            key={`solid-${index}`}
            position={segment.midpoint}
            quaternion={segment.quaternion}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <cylinderGeometry args={[thickness, thickness, segment.length, 24]} />
            <ConnectionMaterial obj={obj} />
          </mesh>
        ))
      ) : (
        segmentMeshes.map((segment) => (
          <mesh
            key={segment.key}
            position={segment.position}
            quaternion={segment.quaternion}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {lineStyle === 'dashed' ? (
              <cylinderGeometry args={[thickness, thickness, segment.length, 18]} />
            ) : (
              <sphereGeometry args={[Math.max(thickness * 1.35, 0.045), 16, 12]} />
            )}
            <ConnectionMaterial obj={obj} />
          </mesh>
        ))
      )}
      {line.segments.map((segment, index) => (
        <mesh
          key={`hit-${index}`}
          position={segment.midpoint}
          quaternion={segment.quaternion}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          userData={{ hideInViewportCapture: true }}
        >
          <cylinderGeometry args={[hitThickness, hitThickness, segment.length, 16]} />
          <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
        </mesh>
      ))}
      <ConnectionEndpointMarker
        type={obj.lineStartEndpoint || 'none'}
        position={line.start}
        direction={line.segments[0].direction.clone().negate()}
        thickness={thickness}
        obj={obj}
        onSelect={onSelect}
      />
      <ConnectionEndpointMarker
        type={obj.lineEndEndpoint || 'none'}
        position={line.end}
        direction={line.segments[line.segments.length - 1].direction}
        thickness={thickness}
        obj={obj}
        onSelect={onSelect}
      />
      {selected && (
        <>
          <mesh position={line.start} userData={{ hideInViewportCapture: true }}>
            <sphereGeometry args={[Math.max(0.09, thickness * 1.8), 16, 12]} />
            <meshBasicMaterial color="#22b8cf" depthTest={false} />
          </mesh>
          <mesh position={line.end} userData={{ hideInViewportCapture: true }}>
            <sphereGeometry args={[Math.max(0.09, thickness * 1.8), 16, 12]} />
            <meshBasicMaterial color="#22b8cf" depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function ConnectionPreviewLine({ start }: { start: SceneObject }) {
  const { camera, gl } = useThree();
  const [end, setEnd] = useState(() => getConnectionCenter(start));

  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -start.position.y);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const onPointerMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) setEnd(hit.clone());
    };

    gl.domElement.addEventListener('pointermove', onPointerMove);
    return () => gl.domElement.removeEventListener('pointermove', onPointerMove);
  }, [camera, gl, start.position.y]);

  const line = useMemo(() => {
    const a = getConnectionSurfacePoint(start, end);
    const delta = end.clone().sub(a);
    const length = delta.length();
    if (length < 0.001) return null;
    return {
      length,
      midpoint: a.clone().add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    };
  }, [end, start.position.x, start.position.y, start.position.z]);

  if (!line) return null;

  return (
    <group userData={{ hideInViewportCapture: true }}>
      <mesh position={line.midpoint} quaternion={line.quaternion}>
        <cylinderGeometry args={[0.025, 0.025, line.length, 12]} />
        <meshBasicMaterial color="#22b8cf" transparent opacity={0.75} depthTest={false} />
      </mesh>
      <mesh position={[end.x, end.y, end.z]}>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshBasicMaterial color="#22b8cf" transparent opacity={0.85} depthTest={false} />
      </mesh>
    </group>
  );
}

/** Latest OrbitControls instance — updated by OrbitLockBridge (useThree.getState is not available). */
let orbitControlsRef: OrbitControlsImpl | null = null;
let orbitLocked = false;

function setOrbitLocked(locked: boolean) {
  orbitLocked = locked;
  if (orbitControlsRef) orbitControlsRef.enabled = !locked;
}

function OrbitLockBridge() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    orbitControlsRef = controls;
    if (orbitControlsRef) orbitControlsRef.enabled = !orbitLocked;
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
  const labelRef = useRef<THREE.Mesh>(null);
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
    if (labelRef.current) labelRef.current.quaternion.copy(camera.quaternion);
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
          ref={labelRef}
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

function stopOrbitPointerEvent(e: ThreeEvent<PointerEvent>) {
  e.stopPropagation();
  const nativeEvent = (e as unknown as { nativeEvent?: Event; sourceEvent?: Event }).nativeEvent
    ?? (e as unknown as { nativeEvent?: Event; sourceEvent?: Event }).sourceEvent;
  nativeEvent?.stopImmediatePropagation?.();
  nativeEvent?.stopPropagation?.();
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
    scaleAxis: 'uniform' as 'uniform' | 'x' | 'y' | 'z',
    pointerId: -1,
    plane: new THREE.Plane(),
    hit: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    axisScreen: new THREE.Vector2(1, 0),
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
    if (e.button !== 0) {
      stopOrbitPointerEvent(e);
      onSelect();
      return;
    }
    if (!transformMode) {
      stopOrbitPointerEvent(e);
      onSelect();
      return;
    }
    // rotate tool: use gizmo only
    if (transformMode === 'rotate') return;

    stopOrbitPointerEvent(e);
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
      d.scaleAxis = 'uniform';
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

  const beginScaleDrag = (e: ThreeEvent<PointerEvent>, axis: 'uniform' | 'x' | 'y' | 'z') => {
    stopOrbitPointerEvent(e);
    onSelect();

    const g = groupRef.current;
    if (!g) return;

    const d = dragRef.current;
    d.active = true;
    d.kind = 'scale';
    d.scaleAxis = axis;
    d.pointerId = e.pointerId;
    d.startClientX = e.clientX;
    d.startClientY = e.clientY;
    d.startScale.copy(g.scale);

    if (axis !== 'uniform') {
      const rect = gl.domElement.getBoundingClientRect();
      const origin = g.getWorldPosition(new THREE.Vector3());
      const rotation = g.getWorldQuaternion(new THREE.Quaternion());
      const axisVector = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0
      ).applyQuaternion(rotation);
      const a = origin.clone().project(camera);
      const b = origin.clone().add(axisVector).project(camera);
      d.axisScreen.set((b.x - a.x) * rect.width, -(b.y - a.y) * rect.height);
      if (d.axisScreen.lengthSq() < 0.0001) d.axisScreen.set(1, 0);
      else d.axisScreen.normalize();
    }

    setOrbitLocked(true);
    onManipulationChange(true);

    (e.target as Element)?.setPointerCapture?.(e.pointerId);
  };

  const moveDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    stopOrbitPointerEvent(e);

    const g = groupRef.current;
    if (!g) return;

    if (d.kind === 'scale') {
      const dx = e.clientX - d.startClientX;
      const dy = d.startClientY - e.clientY;
      const delta = d.scaleAxis === 'uniform' ? (dx + dy) * 0.01 : (dx * d.axisScreen.x - dy * d.axisScreen.y) * 0.012;
      const factor = Math.max(0.05, 1 + delta);

      if (d.scaleAxis === 'uniform') {
        g.scale.set(
          Math.max(0.05, d.startScale.x * factor),
          Math.max(0.05, d.startScale.y * factor),
          Math.max(0.05, d.startScale.z * factor)
        );
      } else {
        g.scale.set(d.startScale.x, d.startScale.y, d.startScale.z);
        g.scale[d.scaleAxis] = Math.max(0.05, d.startScale[d.scaleAxis] * factor);
      }
      return;
    }

    const rect = gl.domElement.getBoundingClientRect();
    d.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    d.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    d.raycaster.setFromCamera(d.pointer, camera);

    if (d.raycaster.ray.intersectPlane(d.plane, d.hit)) {
      g.position.copy(d.hit).add(d.offset);
      updateObject(obj.id, {
        position: { x: g.position.x, y: g.position.y, z: g.position.z },
      });
    }
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d.active || (d.pointerId !== -1 && d.pointerId !== e.pointerId)) return;
    stopOrbitPointerEvent(e);
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
  const resizeHandleOffset = getObjectHitRadius(obj) + 0.28;
  const resizeHandles: Array<{
    axis: 'x' | 'y' | 'z';
    position: [number, number, number];
    color: string;
  }> = [
    { axis: 'x', position: [resizeHandleOffset, 0, 0], color: '#ff5c5c' },
    { axis: 'x', position: [-resizeHandleOffset, 0, 0], color: '#ff5c5c' },
    { axis: 'y', position: [0, resizeHandleOffset, 0], color: '#5cff8a' },
    { axis: 'y', position: [0, -resizeHandleOffset, 0], color: '#5cff8a' },
    { axis: 'z', position: [0, 0, resizeHandleOffset], color: '#5c9cff' },
    { axis: 'z', position: [0, 0, -resizeHandleOffset], color: '#5c9cff' },
  ];

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
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onContextMenu={(e) => {
          onSelect();
        }}
      >
        <ObjectContent obj={obj} selected={selected} />
        <ObjectHitTarget obj={obj} />
        {selected && (
          <>
            {resizeHandles.map((handle) => (
              <mesh
                key={`${handle.axis}-${handle.position.join(',')}`}
                position={handle.position}
                onPointerDown={(e) => beginScaleDrag(e, handle.axis)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                userData={{ hideInViewportCapture: true }}
              >
                <sphereGeometry args={[0.11, 16, 12]} />
                <meshBasicMaterial color={handle.color} depthTest={false} />
              </mesh>
            ))}
            <mesh
              position={[resizeHandleOffset, resizeHandleOffset, resizeHandleOffset]}
              onPointerDown={(e) => beginScaleDrag(e, 'uniform')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              userData={{ hideInViewportCapture: true }}
            >
              <boxGeometry args={[0.16, 0.16, 0.16]} />
              <meshBasicMaterial color="#3d8bfd" depthTest={false} />
            </mesh>
          </>
        )}
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
  const setTool = useAppStore((s) => s.setTool);
  const addConnection = useAppStore((s) => s.addConnection);
  const connectionStartId = useAppStore((s) => s.connectionStartId);
  const setConnectionStartId = useAppStore((s) => s.setConnectionStartId);
  const connectionEditTarget = useAppStore((s) => s.connectionEditTarget);
  const setConnectionEditTarget = useAppStore((s) => s.setConnectionEditTarget);
  const updateObject = useAppStore((s) => s.updateObject);
  const lights = useAppStore((s) => s.lights);
  const viewport = useAppStore((s) => s.viewport);
  const [objectManipulating, setObjectManipulating] = useState(false);
  const axisLength = useMemo(() => getDynamicAxisLength(objects), [objects]);

  // select + move → translate gizmo; rotate/scale → their gizmos
  const transformMode: 'translate' | 'rotate' | 'scale' | null = useMemo(() => {
    if (tool === 'rotate') return 'rotate';
    if (tool === 'scale') return 'scale';
    if (tool === 'move' || tool === 'select') return 'translate';
    return null;
  }, [tool]);

  const selectObject = (id: string) => {
    const target = objects.find((obj) => obj.id === id);

    if (connectionEditTarget) {
      const connection = objects.find((obj) => obj.id === connectionEditTarget.connectionId && obj.type === 'connection');
      if (!connection || !target || target.type === 'connection') {
        setSelectedId(id);
        return;
      }

      const otherId = connectionEditTarget.endpoint === 'start' ? connection.connectionEndId : connection.connectionStartId;
      if (target.id !== otherId) {
        updateObject(connection.id, connectionEditTarget.endpoint === 'start'
          ? { connectionStartId: target.id }
          : { connectionEndId: target.id });
        setConnectionEditTarget(null);
        setSelectedId(connection.id);
      }
      return;
    }

    if (connectionStartId) {
      if (!target || target.type === 'connection') {
        setSelectedId(id);
        return;
      }

      if (connectionStartId !== id) {
        const connection = addConnection(connectionStartId, id);
        if (connection) setSelectedId(connection.id);
        setConnectionStartId(null);
        setTool('select');
      } else {
        setSelectedId(id);
      }
      return;
    }

    if (tool === 'connection') {
      if (!target || target.type === 'connection') {
        setSelectedId(id);
        return;
      }

      if (!connectionStartId || connectionStartId === id) {
        setConnectionStartId(id);
        setSelectedId(id);
        return;
      }

      const connection = addConnection(connectionStartId, id);
      if (connection) {
        setSelectedId(connection.id);
        setConnectionStartId(null);
        setTool('select');
      }
      return;
    }

    setSelectedId(id);
  };

  const selectLight = (kind: LightKind) => {
    setSelectedLight(kind);
  };

  const clearSelection = () => {
    setConnectionStartId(null);
    setConnectionEditTarget(null);
    setSelectedId(null);
    setSelectedLight(null);
  };

  return (
    <>
      <color attach="background" args={[viewport.backgroundColor]} />
      <ambientLight intensity={lights.ambientIntensity} color={lights.ambientColor} />
      <directionalLight
        castShadow
        intensity={lights.directionalEnabled ? lights.directionalIntensity : 0}
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
        intensity={lights.pointEnabled ? lights.pointIntensity * POINT_LIGHT_RENDER_MULTIPLIER : 0}
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

      {objects.map((obj) =>
        obj.type === 'connection' ? (
          <ConnectionObjectNode
            key={obj.id}
            obj={obj}
            objects={objects}
            selected={selectedId === obj.id}
            onSelect={() => selectObject(obj.id)}
          />
        ) : (
          <SceneObjectNode
            key={obj.id}
            obj={obj}
            selected={selectedId === obj.id || connectionStartId === obj.id}
            transformMode={transformMode === 'translate' || selectedId === obj.id ? transformMode : null}
            onSelect={() => selectObject(obj.id)}
            onManipulationChange={setObjectManipulating}
          />
        )
      )}

      {connectionStartId && (() => {
        const start = objects.find((obj) => obj.id === connectionStartId && obj.type !== 'connection');
        return start ? <ConnectionPreviewLine start={start} /> : null;
      })()}

      {connectionEditTarget && (() => {
        const connection = objects.find((obj) => obj.id === connectionEditTarget.connectionId && obj.type === 'connection');
        if (!connection) return null;
        const fixedId = connectionEditTarget.endpoint === 'start' ? connection.connectionEndId : connection.connectionStartId;
        const fixed = objects.find((obj) => obj.id === fixedId && obj.type !== 'connection');
        return fixed ? <ConnectionPreviewLine start={fixed} /> : null;
      })()}

      <OrbitControls
        makeDefault
        enabled={!objectManipulating}
        enableDamping={!objectManipulating}
        dampingFactor={0.08}
      />
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
