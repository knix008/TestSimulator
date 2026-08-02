import { useLoader } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import type { SceneObject } from '../types';

function prepareObject(object: THREE.Object3D, targetSize = 2) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!mesh.geometry.attributes.normal) {
        mesh.geometry.computeVertexNormals();
      }
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);

  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  // sit roughly on the ground plane
  box.setFromObject(object);
  object.position.y -= box.min.y;
}

function applyAppearance(object: THREE.Object3D, obj: SceneObject, selected: boolean) {
  const selectGlow = selected ? 0.12 : 0;
  const emissiveIntensity = Math.max(obj.emissiveIntensity ?? 0, selectGlow);
  const emissive =
    selected && (obj.emissiveIntensity ?? 0) < 0.05 ? obj.color : obj.emissive || '#000000';

  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((mat) => {
      if (!mat) return;
      const m = mat as THREE.MeshStandardMaterial;
      if ('color' in m && m.color) m.color.set(obj.color);
      if ('opacity' in m) {
        m.transparent = obj.opacity < 1 || !!obj.wireframe;
        m.opacity = obj.opacity;
      }
      if ('metalness' in m) m.metalness = obj.metalness;
      if ('roughness' in m) m.roughness = obj.roughness;
      if ('wireframe' in m) m.wireframe = !!obj.wireframe;
      if ('flatShading' in m) {
        m.flatShading = !!obj.flatShading;
      }
      if ('emissive' in m && m.emissive) {
        m.emissive.set(emissive);
        m.emissiveIntensity = emissiveIntensity;
      }
      m.needsUpdate = true;
    });
  });
}

function GltfModel({ url, obj, selected }: { url: string; obj: SceneObject; selected: boolean }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    prepareObject(clone);
    return clone;
  }, [gltf]);

  useEffect(() => {
    applyAppearance(scene, obj, selected);
  }, [
    scene,
    obj.color,
    obj.opacity,
    obj.metalness,
    obj.roughness,
    obj.wireframe,
    obj.emissive,
    obj.emissiveIntensity,
    obj.flatShading,
    selected,
  ]);

  return <primitive object={scene} />;
}

function ObjModel({ url, obj, selected }: { url: string; obj: SceneObject; selected: boolean }) {
  const loaded = useLoader(OBJLoader, url);
  const scene = useMemo(() => {
    const clone = loaded.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({ color: obj.color });
      }
    });
    prepareObject(clone);
    return clone;
  }, [loaded, obj.color]);

  useEffect(() => {
    applyAppearance(scene, obj, selected);
  }, [
    scene,
    obj.color,
    obj.opacity,
    obj.metalness,
    obj.roughness,
    obj.wireframe,
    obj.emissive,
    obj.emissiveIntensity,
    obj.flatShading,
    selected,
  ]);

  return <primitive object={scene} />;
}

function FbxModel({ url, obj, selected }: { url: string; obj: SceneObject; selected: boolean }) {
  const loaded = useLoader(FBXLoader, url);
  const scene = useMemo(() => {
    const clone = loaded.clone(true);
    prepareObject(clone);
    return clone;
  }, [loaded]);

  useEffect(() => {
    applyAppearance(scene, obj, selected);
  }, [
    scene,
    obj.color,
    obj.opacity,
    obj.metalness,
    obj.roughness,
    obj.wireframe,
    obj.emissive,
    obj.emissiveIntensity,
    obj.flatShading,
    selected,
  ]);

  return <primitive object={scene} />;
}

function GeometryModel({
  url,
  Loader,
  obj,
  selected,
}: {
  url: string;
  Loader: typeof STLLoader | typeof PLYLoader;
  obj: SceneObject;
  selected: boolean;
}) {
  const geometry = useLoader(Loader, url);
  const prepared = useMemo(() => {
    const geo = geometry.clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
    const s = 2 / maxDim;
    geo.translate(-center.x, -center.y, -center.z);
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      geo.translate(0, -geo.boundingBox.min.y, 0);
    }
    return geo;
  }, [geometry]);

  const selectGlow = selected ? 0.12 : 0;
  const emissiveIntensity = Math.max(obj.emissiveIntensity ?? 0, selectGlow);
  const emissive =
    selected && (obj.emissiveIntensity ?? 0) < 0.05 ? obj.color : obj.emissive || '#000000';

  return (
    <mesh castShadow receiveShadow geometry={prepared}>
      <meshStandardMaterial
        color={obj.color}
        transparent={obj.opacity < 1 || !!obj.wireframe}
        opacity={obj.opacity}
        metalness={obj.metalness}
        roughness={obj.roughness}
        wireframe={!!obj.wireframe}
        flatShading={!!obj.flatShading}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

function ImagePlane({ url, obj, selected }: { url: string; obj: SceneObject; selected: boolean }) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;

  const aspect = useMemo(() => {
    const img = texture.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) return img.width / img.height;
    return 1;
  }, [texture]);

  const width = 2;
  const height = width / aspect;
  const selectGlow = selected ? 0.08 : 0;
  const emissiveIntensity = Math.max(obj.emissiveIntensity ?? 0, selectGlow);
  const emissive =
    selected && (obj.emissiveIntensity ?? 0) < 0.05 ? obj.color : obj.emissive || '#000000';

  return (
    <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={texture}
        color={obj.color}
        transparent
        opacity={obj.opacity}
        side={THREE.DoubleSide}
        metalness={obj.metalness}
        roughness={obj.roughness}
        wireframe={!!obj.wireframe}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

export default function ImportedAsset({
  obj,
  selected,
}: {
  obj: SceneObject;
  selected: boolean;
}) {
  if (!obj.modelUrl || !obj.modelFormat) return null;

  const url = obj.modelUrl;
  const format = obj.modelFormat;

  switch (format) {
    case 'glb':
    case 'gltf':
      return <GltfModel url={url} obj={obj} selected={selected} />;
    case 'obj':
      return <ObjModel url={url} obj={obj} selected={selected} />;
    case 'fbx':
      return <FbxModel url={url} obj={obj} selected={selected} />;
    case 'stl':
      return <GeometryModel url={url} Loader={STLLoader} obj={obj} selected={selected} />;
    case 'ply':
      return <GeometryModel url={url} Loader={PLYLoader} obj={obj} selected={selected} />;
    case 'image':
      return <ImagePlane url={url} obj={obj} selected={selected} />;
    default:
      return null;
  }
}
