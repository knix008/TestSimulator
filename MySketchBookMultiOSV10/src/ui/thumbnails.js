// Library thumbnails: parametric items and material swatches rendered once by a
// small offscreen renderer (studio light, 3/4 view), cached in memory and in
// IndexedDB, and queued so the library scrolls smoothly — at most one render per
// animation frame, only for cards that are on screen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getMaterial } from '../engine/materials.js';
import { idbGet, idbSet } from '../platform/idb.js';

const SIZE = 192;
const VERSION = 3;
const memory = new Map();
const queue = [];
let renderer = null;
let scene = null;
let camera = null;
let running = false;
// Thumbnails share the GPU and the main thread with the 3D view: they wait while the user is moving the view.
let busy = () => false;
/** `fn()` returns true while thumbnails should wait (orbiting, panning, dragging, camera animation). */
export function setThumbnailGate(fn) { busy = typeof fn === 'function' ? fn : () => false; }

const idle = () => new Promise((resolve) => (globalThis.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 600 }) : setTimeout(resolve, 16)));
async function whenQuiet() {
  for (;;) {
    await idle();
    if (!busy()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The canvas as a WebP data URL, encoded off the main thread (toBlob) instead of a blocking toDataURL. */
async function canvasUrl(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) return canvas.toDataURL('image/webp', 0.86);
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(''); r.readAsDataURL(blob); });
}

function setup() {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.radius = 4;
  scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x998877, 0.5));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
}

/** A finished thumbnail of an item (null when it has not been made yet); never queues work. */
export const cachedThumbnail = (item) => memory.get(`item:${item.id}:${VERSION}`) || null;

/** A data URL for a library item (parametric build) — from cache, or queued (onReady gets it). */
export function itemThumbnail(item, build, onReady) {
  const key = `item:${item.id}:${VERSION}`;
  if (memory.has(key)) return memory.get(key);
  queue.push({ key, kind: 'item', item, build, onReady });
  pump();
  return null;
}

export function materialThumbnail(presetId, onReady) {
  const key = `mat:${presetId}:${VERSION}`;
  if (memory.has(key)) return memory.get(key);
  queue.push({ key, kind: 'material', presetId, onReady });
  pump();
  return null;
}

/** Drops queued work for cards that are no longer shown (library filter changed). */
export function cancelThumbnails() { queue.length = 0; }

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    if (memory.has(job.key)) { job.onReady?.(memory.get(job.key)); continue; }
    let url = await idbGet(`thumb:${job.key}`).catch(() => null);
    if (!url) {
      await whenQuiet();
      try { url = await (job.kind === 'item' ? renderItem(job) : renderMaterial(job.presetId)); } catch (error) { console.warn('thumbnail', job.key, error); url = ''; }
      if (url) idbSet(`thumb:${job.key}`, url).catch(() => {});
    }
    memory.set(job.key, url);
    job.onReady?.(url);
  }
  running = false;
}

async function renderItem({ item, build }) {
  setup();
  const object = build();
  if (!object) return '';
  scene.add(object);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.05, size.length() / 2);
  const dir = item.placement === 'wall' || item.placement === 'opening' ? new THREE.Vector3(0.35, 0.2, 1) : new THREE.Vector3(1, 0.75, 1.25);
  camera.position.copy(center).addScaledVector(dir.normalize(), radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02);
  camera.lookAt(center);
  scene.getObjectByName('floor').position.y = box.min.y - 0.001;
  renderer.render(scene, camera);
  const pending = canvasUrl(renderer.domElement); // the picture is taken now, encoded in the background
  scene.remove(object);
  return pending;
}

async function renderMaterial(presetId) {
  setup();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), getMaterial(presetId));
  // Sphere UVs span 0..1; a metre-scaled texture would look too large on a 1 m ball: scale UVs up.
  const uv = sphere.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3.14, uv.getY(i) * 1.57);
  sphere.position.y = 0.5;
  sphere.castShadow = true;
  scene.add(sphere);
  camera.position.set(0.9, 1.15, 1.6);
  camera.lookAt(0, 0.5, 0);
  scene.getObjectByName('floor').position.y = 0;
  renderer.render(scene, camera);
  const pending = canvasUrl(renderer.domElement); // the picture is taken now, encoded in the background
  scene.remove(sphere);
  sphere.geometry.dispose();
  return pending;
}

/** Textures of a preset may arrive after its thumbnail: forget that one so it renders again. */
export function forgetMaterialThumbnail(presetId) { memory.delete(`mat:${presetId}:${VERSION}`); idbSet(`thumb:mat:${presetId}:${VERSION}`, '').catch(() => {}); }
