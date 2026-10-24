// Compact models (the Icepak / FloTHERM style shortcuts): a JEDEC two-resistor
// package, a plate-fin heat sink, the effective conductivity of a PCB stack-up
// and heat sources from a power map. Each returns ordinary model pieces —
// rect bodies (mm; 3D bodies are the x-y outline extruded over z0..z1) and
// material objects like the ones in materials.js — so the caller just adds
// them to the model. Pure functions, unit-tested in Node.
import { newId } from './model.js';

const ids = (taken) => {
  const list = [...taken];
  return (prefix) => { const id = newId(prefix, list); list.push(id); return id; };
};

const packageMaterial = (id, name, k, color) => ({ id, name, kind: 'solid', k, rho: 1900, cp: 900, emissivity: 0.9, E: 25e9, nu: 0.3, alpha: 12e-6, color });

/**
 * JEDEC two-resistor package (JESD15-3): a top layer (junction → case, Rjc), a thin high-k junction layer carrying the
 * power and a bottom layer (junction → board, Rjb), stacked along y. 2D: footprint w along x, package thickness h, section
 * depth `depth` (mm); 3D: footprint w (x) × d (z, from z0) and thickness t (or h). Layer conductivities follow from the 1D
 * resistance t_layer/(k·A), counted from the junction mid-plane: k_top = t_top / ((Rjc − R_half-junction)·A).
 * opts: Rjc, Rjb (K/W), power (W), junctionFraction (of the thickness, default 0.2 so the junction covers grid cells),
 * topFraction (share of the rest above the junction, 0.5), kJunction (W/mK, 1000), id, name, taken (ids in use).
 * Returns { bodies: [top, junction, bottom], materials: [top, junction, bottom], probe: { id, name, x, y, z }, layers }.
 */
export function jedecTwoResistor({ x = 0, y = 0, w, h, d = null, t = null, Rjc, Rjb, power = 0, depth = 10, dim = 2, z0 = 0,
  junctionFraction = 0.2, topFraction = 0.5, kJunction = 1000, id = 'pkg', name = 'Package', taken = [] }) {
  const is3d = dim === 3;
  const thick = is3d ? (t ?? h) : h;
  const across = is3d ? (d ?? w) : depth; // mm
  if (!(w > 0) || !(thick > 0) || !(across > 0)) throw new Error('package size must be positive');
  if (!(Rjc > 0) || !(Rjb > 0)) throw new Error('Rjc and Rjb must be positive');
  const A = (w / 1000) * (across / 1000); // m²
  const tj = thick * junctionFraction;
  const tTop = (thick - tj) * topFraction;
  const tBot = thick - tj - tTop;
  const rHalf = (tj / 2 / 1000) / (kJunction * A);
  if (Rjc <= rHalf || Rjb <= rHalf) throw new Error('Rjc / Rjb smaller than the junction layer itself');
  const kTop = (tTop / 1000) / ((Rjc - rHalf) * A);
  const kBot = (tBot / 1000) / ((Rjb - rHalf) * A);
  const next = ids(taken);
  const mTop = packageMaterial(`${id}Top`, `${name} (Rjc ${Rjc} K/W)`, kTop, '#3a3a40');
  const mJ = packageMaterial(`${id}Junction`, `${name} junction`, kJunction, '#c0392b');
  const mBot = packageMaterial(`${id}Bottom`, `${name} (Rjb ${Rjb} K/W)`, kBot, '#2b2b30');
  const z = is3d ? { z0, z1: z0 + across } : {};
  const bottom = { id: next(`${id}B`), name: `${name} bottom`, shape: 'rect', material: mBot.id, x, y, w, h: tBot, ...z };
  const junction = { id: next(`${id}J`), name: `${name} junction`, shape: 'rect', material: mJ.id, x, y: y + tBot, w, h: tj, power, ...z };
  const top = { id: next(`${id}T`), name: `${name} top`, shape: 'rect', material: mTop.id, x, y: y + tBot + tj, w, h: tTop, ...z };
  const probe = { id: next('probe'), name: `${name} Tj`, x: x + w / 2, y: y + tBot + tj / 2, z: is3d ? z0 + across / 2 : 0 };
  return {
    bodies: [top, junction, bottom], materials: [mTop, mJ, mBot], probe,
    layers: { area: A, top: { thickness: tTop, k: kTop }, junction: { thickness: tj, k: kJunction }, bottom: { thickness: tBot, k: kBot } },
  };
}

/**
 * Plate-fin heat sink: a base (baseW × baseT mm at x, y) with finCount fins (finT thick, finH tall) evenly spaced on top,
 * the outer fins flush with the base edges. 3D bodies span z0..z1 (default 0..depth). Throws when the fins do not fit.
 * Returns { bodies: [base, fin1, …], gap (mm between fins), pitch (mm) }.
 */
export function heatSink({ x = 0, y = 0, baseW, baseT, finCount, finT, finH, material = 'al6061', dim = 2, depth = 10, z0 = null, z1 = null, name = 'Heat sink', taken = [] }) {
  const n = Math.round(finCount);
  if (!(baseW > 0) || !(baseT > 0)) throw new Error('base size must be positive');
  if (!(n >= 1) || !(finT > 0) || !(finH > 0)) throw new Error('fins need a count, thickness and height');
  if (n * finT > baseW + 1e-9) throw new Error(`${n} fins of ${finT} mm do not fit on a ${baseW} mm base`);
  const gap = n > 1 ? (baseW - n * finT) / (n - 1) : 0;
  const pitch = finT + gap;
  const z = dim === 3 ? { z0: z0 ?? 0, z1: z1 ?? (z0 ?? 0) + depth } : {};
  const next = ids(taken);
  const bodies = [{ id: next('hsBase'), name: `${name} base`, shape: 'rect', material, x, y, w: baseW, h: baseT, ...z }];
  for (let i = 0; i < n; i++) {
    const fx = n > 1 ? x + i * pitch : x + (baseW - finT) / 2;
    bodies.push({ id: next('hsFin'), name: `${name} fin ${i + 1}`, shape: 'rect', material, x: fx, y: y + baseT, w: finT, h: finH, ...z });
  }
  return { bodies, gap, pitch };
}

/**
 * Effective conductivity of a PCB stack-up. layers [{ type: 'copper' | 'dielectric', thickness (mm), coverage (0–1, copper),
 * k? }]; copper k = 390, dielectric (FR-4) k = 0.3 W/mK unless given. A copper layer with coverage c has
 * k = c·k_cu + (1 − c)·k_dielectric; in-plane = thickness-weighted mean (parallel), through-plane = series sum.
 * Returns { kInPlane, kThrough, thickness (mm), rho, cp, copperFraction, material } — material follows materials.js
 * anisotropy: k = through-plane (y in a 2D section), kx = kz = in-plane.
 */
export function pcbStackup(layers, { kCopper = 390, kDielectric = 0.3, id = 'pcbStack', name = 'PCB stack-up' } = {}) {
  let thickness = 0; let parallel = 0; let series = 0; let mass = 0; let heat = 0; let copper = 0;
  for (const layer of layers) {
    const t = Number(layer.thickness);
    if (!(t > 0)) continue;
    const isCu = layer.type === 'copper';
    const c = isCu ? Math.min(1, Math.max(0, layer.coverage ?? 1)) : 0;
    const k = layer.k ?? (isCu ? c * kCopper + (1 - c) * kDielectric : kDielectric);
    const rho = c * 8933 + (1 - c) * 1900;
    const cp = rho > 0 ? (c * 8933 * 385 + (1 - c) * 1900 * 1150) / rho : 1150;
    thickness += t; parallel += k * t; series += t / k; mass += rho * t; heat += rho * cp * t; copper += c * t;
  }
  if (!(thickness > 0)) throw new Error('no layers');
  const kInPlane = parallel / thickness;
  const kThrough = thickness / series;
  const rho = mass / thickness;
  const cp = heat / mass;
  const material = { id, name, kind: 'solid', k: kThrough, kx: kInPlane, kz: kInPlane, rho, cp, emissivity: 0.9, E: 22e9, nu: 0.15, alpha: 16e-6, color: '#2e6b34' };
  return { kInPlane, kThrough, thickness, rho, cp, copperFraction: copper / thickness, material };
}

/**
 * Heat sources from a power map CSV: lines `x, y, W` (mm, mm, W; header optional; comma, semicolon or tab) → square
 * bodies of `size` mm centred on each point carrying that power. 3D bodies span z0..z1 (the map is in the x-y plane).
 */
export function powerMapBodies(csvText, { size = 2, material = 'silicon', dim = 2, z0 = 0, z1 = 1, taken = [], name = 'Source' } = {}) {
  const next = ids(taken);
  const bodies = [];
  for (const raw of String(csvText).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(/[,;\t]/).map((c) => Number(c.trim()));
    if (cells.length < 3 || !cells.slice(0, 3).every(Number.isFinite)) continue; // header or junk
    const [cx, cy, W] = cells;
    bodies.push({
      id: next('src'), name: `${name} ${bodies.length + 1}`, shape: 'rect', material, x: cx - size / 2, y: cy - size / 2, w: size, h: size, power: W,
      ...(dim === 3 ? { z0, z1 } : {}),
    });
  }
  return bodies;
}
