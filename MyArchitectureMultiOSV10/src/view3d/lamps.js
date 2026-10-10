// Lamp lighting for the 3D viewer. The building carries an empty "lamp"
// anchor per light fixture (build.js); this rig turns the nearest lit ones
// into real three.js lights.
//
// Performance: every real light costs on every pixel and changing how many
// there are recompiles every shader, so the rig keeps a fixed pool — at most
// LAMP_CAP.point point lights and LAMP_CAP.spot spot lights, none casting
// shadows — and moves those to the lamps closest to the camera (on visible
// levels, below the section cut) as the view changes. Lamps beyond the cap
// still glow; they just do not light their surroundings. Switching a lamp
// only changes intensities and materials, never the pool size.

export const LAMP_CAP = { point: 12, spot: 8 };
// Lumens → three.js candela. The scene is not photometric (the sun is 2.4),
// so lamps are scaled down to sit in the same range.
export const LAMP_SCALE = 0.05;

// Every lamp anchor under `root` with its world position and direction.
export function collectLamps(THREE, root) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.userData || !o.userData.lamp) return;
    const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const q = new THREE.Quaternion();
    o.getWorldQuaternion(q);
    const dir = new THREE.Vector3(...o.userData.lamp.dir).normalize().applyQuaternion(q);
    let level = null;
    for (let p = o; p && !level; p = p.parent) if (p.userData && p.userData.level && !p.isMesh && p.name.startsWith("level:")) level = p;
    out.push({ ...o.userData.lamp, anchor: o, pos, dirW: dir, levelGroup: level });
  });
  return out;
}

const visibleUp = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

// Candela for a lamp: lm / 4π for a bare bulb; a spot squeezes the same
// flux into its cone.
export function lampCandela(lamp) {
  const lm = Math.max(0, +lamp.lumens || 0);
  if (lamp.type === "spot") {
    const half = (Math.max(5, Math.min(170, lamp.beam || 60)) * Math.PI) / 360;
    return (lm / (2 * Math.PI * (1 - Math.cos(half)))) * LAMP_SCALE;
  }
  return (lm / (4 * Math.PI)) * LAMP_SCALE;
}

// The lamps that get a real light: lit, visible, on a level the section cut
// keeps (a ceiling lamp above the cut still lights its room below it),
// nearest to `eye` first (bright lamps count as a little nearer), up to the cap
// of their type. → {point: [...], spot: [...]}
export function pickLamps(lamps, eye, { cap = LAMP_CAP, clip = null } = {}) {
  const cut = (l) => clip && clip.distanceToPoint({ x: l.pos.x, y: (l.floor ?? l.pos.y) + 0.01, z: l.pos.z, isVector3: true }) < 0;
  const live = lamps.filter((l) => l.on && l.lumens > 0 && visibleUp(l.anchor) && !cut(l));
  const score = (l) => l.pos.distanceTo(eye) / Math.sqrt(Math.max(0.2, l.lumens / 800));
  live.sort((a, b) => score(a) - score(b));
  return { point: live.filter((l) => l.type !== "spot").slice(0, cap.point), spot: live.filter((l) => l.type === "spot").slice(0, cap.spot) };
}

// Range (m) a lamp reaches: brighter lamps further; a limit keeps light from
// leaking far through floors (lamps cast no shadows).
export const lampRange = (lamp) => Math.max(5, Math.min(25, Math.sqrt(Math.max(1, lamp.lumens)) * 0.22));

export function createLampRig(THREE, scene) {
  const group = new THREE.Group();
  group.name = "lamp-lights";
  scene.add(group);
  const pool = { point: [], spot: [] };
  let lamps = [];
  let lastKey = "";

  // Grow the pool (never shrinks: a shrink would recompile the shaders too).
  function ensure(type, n) {
    const list = pool[type];
    while (list.length < Math.min(n, LAMP_CAP[type])) {
      let l;
      if (type === "spot") {
        l = new THREE.SpotLight(0xffffff, 0, 10, Math.PI / 6, 0.45, 2);
        group.add(l.target);
      } else l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      l.name = `lamp-${type}-${list.length}`;
      group.add(l);
      list.push(l);
    }
  }

  function setLamps(list) {
    lamps = list;
    // Size the pool for every lamp the model has (on or off), so switching
    // lamps later does not change the light count.
    ensure("point", lamps.filter((l) => l.type !== "spot").length);
    ensure("spot", lamps.filter((l) => l.type === "spot").length);
    lastKey = "";
  }

  // Place the pool on the lamps nearest to the eye.
  function update(eye, opts = {}) {
    const pick = pickLamps(lamps, eye, opts);
    const key = `${pick.point.map((l) => l.id).join()}|${pick.spot.map((l) => l.id).join()}|${opts.dim ?? 1}`;
    if (key === lastKey) return false;
    lastKey = key;
    for (const type of ["point", "spot"]) {
      pool[type].forEach((light, i) => {
        const lamp = pick[type][i];
        if (!lamp) { light.intensity = 0; return; }
        light.color.set(lamp.color);
        light.intensity = lampCandela(lamp) * (opts.dim ?? 1);
        light.distance = lampRange(lamp);
        light.position.copy(lamp.pos);
        if (type === "spot") {
          light.angle = (Math.max(5, Math.min(170, lamp.beam || 60)) * Math.PI) / 360;
          light.target.position.copy(lamp.pos).add(lamp.dirW);
          light.target.updateMatrixWorld();
        }
      });
    }
    return true;
  }

  // A switch or a change of brightness/colour: refresh the lamp records.
  function setState(id, state) {
    for (const l of lamps) if (l.id === id) Object.assign(l, state);
    lastKey = "";
  }

  const info = () => {
    const active = [...pool.point, ...pool.spot].filter((l) => l.intensity > 0);
    return { lamps: lamps.length, on: lamps.filter((l) => l.on).length, pool: pool.point.length + pool.spot.length, active: active.length, point: pool.point.filter((l) => l.intensity > 0).length, spot: pool.spot.filter((l) => l.intensity > 0).length };
  };

  function dispose() {
    for (const l of [...pool.point, ...pool.spot]) l.dispose && l.dispose();
    scene.remove(group);
  }

  return { setLamps, update, setState, info, dispose, invalidate: () => { lastKey = ""; }, get lamps() { return lamps; } };
}
