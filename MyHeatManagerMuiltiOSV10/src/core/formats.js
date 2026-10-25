// File-format conversion for the products this program follows: solver decks
// (Nastran / Simcenter bulk data, Ansys MAPDL .cdb, COMSOL .mphtxt mesh, Gmsh
// .msh), results for ParaView (.vtu), geometry for CAD (STL, DXF R12) and
// LBNL THERM 7 sections (.thmx, read and write), plus Gmsh meshes back into
// a model. Every mesh export is the model's structured grid (the same cells the
// engine solves): one quad (2D) / hexahedron (3D) per cell that has material.
// Units: solver decks are SI (m, kg, s, W) with temperatures in °C; mesh /
// geometry files that are unitless by convention (Gmsh, VTU, STL, DXF, THERM)
// stay in mm. Pure functions — no DOM, no Node APIs — unit-tested in Node.
import { cellSize, normalizeModel, bodyContains, bodyBounds, newId } from './model.js';
import { MATERIAL_LIBRARY, materialFromLibrary } from './materials.js';
import { field } from './result.js';

const SIGMA = 5.670374419e-8;

// ───────────────────────── format tables

const N = (ko, en) => ({ ko, en });

/** Every file format the program reads or writes (the UI builds its menus and file filters from this). */
export const FORMATS = [
  { id: 'myheat', ext: 'myheat', name: N('MyHeatManager 모델', 'MyHeatManager model'), product: 'MyHeatManager', open: true, save: true },
  { id: 'calculix', ext: 'inp', name: N('CalculiX / Abaqus 입력 덱', 'CalculiX / Abaqus input deck'), product: 'CalculiX', open: true, save: true },
  { id: 'nastran', ext: 'bdf', name: N('Nastran 벌크 데이터 (SOL 153)', 'Nastran bulk data (SOL 153)'), product: 'Nastran / Simcenter', open: true, save: true },
  { id: 'ansys', ext: 'cdb', name: N('Ansys MAPDL 입력 (.cdb)', 'Ansys MAPDL input (.cdb)'), product: 'Ansys', open: true, save: true },
  { id: 'comsol', ext: 'mphtxt', name: N('COMSOL 텍스트 메시', 'COMSOL text mesh'), product: 'COMSOL', open: true, save: true },
  { id: 'gmsh', ext: 'msh', name: N('Gmsh 메시 (MSH 2.2)', 'Gmsh mesh (MSH 2.2)'), product: 'Gmsh', open: true, save: true },
  { id: 'therm', ext: 'thmx', name: N('THERM 7 단면', 'THERM 7 section'), product: 'THERM', open: true, save: true },
  { id: 'vtk', ext: 'vtk', name: N('VTK 레거시 결과', 'Legacy VTK result'), product: 'ParaView', open: false, save: true },
  { id: 'vtu', ext: 'vtu', name: N('VTK XML 결과 (.vtu)', 'VTK XML result (.vtu)'), product: 'ParaView', open: false, save: true },
  { id: 'stl', ext: 'stl', name: N('STL 형상', 'STL geometry'), product: 'STL (SOLIDWORKS, FreeCAD, SimScale)', open: false, save: true },
  { id: 'dxf', ext: 'dxf', name: N('DXF 도면 (R12)', 'DXF drawing (R12)'), product: 'DXF (CAD)', open: true, save: true },
  { id: 'csv', ext: 'csv', name: N('CSV (필드 값 / 측정점)', 'CSV (field values / measured nodes)'), product: 'CSV', open: true, save: true },
  { id: 'png', ext: 'png', name: N('PNG 그림', 'PNG image'), product: 'PNG', open: false, save: true },
  { id: 'idf', ext: 'emn', name: N('IDF 3.0 기판 (.emn + 부품 라이브러리 .emp)', 'IDF 3.0 board (.emn + .emp part library)'), product: 'ECAD (IDF)', open: true, save: false },
];

/** Extensions that open as a new model through import (core/decks.js, core/idf.js, THERM, Gmsh, DXF). */
export const IMPORT_EXTENSIONS = ['thmx', 'msh', 'dxf', 'bdf', 'dat', 'nas', 'cdb', 'inp', 'mphtxt', 'emn'];

/** Vendor formats that cannot be read or written without the vendor's own libraries, and what to use instead. */
export const UNSUPPORTED = [
  { ext: 'mph', product: 'COMSOL', reason: N('COMSOL 이진 모델 파일은 공개되지 않은 형식입니다. COMSOL에서 메시를 .mphtxt로 내보내거나 이 프로그램의 .mphtxt 메시를 COMSOL로 가져가세요.', 'The binary COMSOL model is an undocumented format. Export the mesh from COMSOL as .mphtxt, or import this program\'s .mphtxt mesh into COMSOL.') },
  { ext: 'sldprt', product: 'SOLIDWORKS', reason: N('SOLIDWORKS 부품 파일은 Parasolid 기반 비공개 형식입니다. SOLIDWORKS에서 DXF(단면) 또는 STL로 저장하세요.', 'SOLIDWORKS parts are a proprietary Parasolid-based format. Save from SOLIDWORKS as DXF (section) or STL.') },
  { ext: 'sldasm', product: 'SOLIDWORKS', reason: N('SOLIDWORKS 어셈블리는 비공개 형식입니다. 부품별로 DXF 또는 STL로 저장하세요.', 'SOLIDWORKS assemblies are proprietary. Save the parts as DXF or STL.') },
  { ext: 'wbpj', product: 'Ansys', reason: N('Ansys Workbench 프로젝트는 Workbench만 열 수 있습니다. Mechanical APDL에서 .cdb로 쓰거나 이 프로그램의 .cdb를 External Model로 가져가세요.', 'Ansys Workbench projects open only in Workbench. Write a .cdb from Mechanical APDL, or bring this program\'s .cdb in through External Model.') },
  { ext: 'wbpz', product: 'Ansys', reason: N('압축된 Workbench 프로젝트(.wbpz)도 Workbench 전용입니다.', 'Archived Workbench projects (.wbpz) are Workbench-only as well.') },
  { ext: 'db', product: 'Ansys', reason: N('Ansys 데이터베이스(.db)는 이진 형식입니다. MAPDL에서 CDWRITE로 .cdb를 만드세요.', 'The Ansys database (.db) is binary. Use CDWRITE in MAPDL to write a .cdb.') },
  { ext: 'cas', product: 'Ansys Fluent', reason: N('Fluent 케이스·데이터(.cas/.dat, .cas.h5)는 이진 형식입니다. 유동 결과는 Fluent에서 VTK/CSV로 내보내세요.', 'Fluent case / data files (.cas/.dat, .cas.h5) are binary. Export flow results from Fluent as VTK or CSV.') },
  { ext: 'sim', product: 'Nastran / Simcenter', reason: N('Simcenter 3D 시뮬레이션 파일은 NX 전용 형식입니다. Simcenter에서 Nastran .bdf/.dat로 내보내세요.', 'Simcenter 3D simulation files are NX-only. Export a Nastran .bdf/.dat from Simcenter.') },
  { ext: 'fem', product: 'Nastran / Simcenter', reason: N('Simcenter FEM 파일은 NX 전용 형식입니다. 이 프로그램의 .bdf를 Simcenter로 가져가세요.', 'Simcenter FEM files are NX-only. Import this program\'s .bdf into Simcenter.') },
  { ext: 'x_t', product: 'Parasolid', reason: N('Parasolid 형상 커널(B-rep) 파일은 커널 라이브러리 없이 읽을 수 없습니다. DXF(단면) 또는 STL을 쓰세요.', 'Parasolid (B-rep kernel) files need the kernel library. Use DXF (section) or STL.') },
  { ext: 'step', product: 'STEP (ISO 10303)', reason: N('STEP은 아직 지원하지 않습니다 (B-rep 커널이 없음). CAD에서 DXF(단면) 또는 STL로 저장하세요.', 'STEP is not supported yet (no B-rep kernel). Save from your CAD program as DXF (section) or STL.') },
  { ext: 'stp', product: 'STEP (ISO 10303)', reason: N('STEP은 아직 지원하지 않습니다 (B-rep 커널이 없음). DXF 또는 STL을 쓰세요.', 'STEP is not supported yet (no B-rep kernel). Use DXF or STL.') },
  { ext: 'iges', product: 'IGES', reason: N('IGES는 아직 지원하지 않습니다 (B-rep 커널이 없음). DXF 또는 STL을 쓰세요.', 'IGES is not supported yet (no B-rep kernel). Use DXF or STL.') },
  { ext: 'igs', product: 'IGES', reason: N('IGES는 아직 지원하지 않습니다 (B-rep 커널이 없음). DXF 또는 STL을 쓰세요.', 'IGES is not supported yet (no B-rep kernel). Use DXF or STL.') },
];

// ───────────────────────── small helpers

const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
/** A compact decimal (10 significant digits, no trailing noise). */
const num = (v) => String(Number(finite(Number(v)).toPrecision(10)));
/** ASCII-only text for formats that are not UTF-8 safe. */
const ascii = (s) => String(s ?? '').replace(/[^\x20-\x7e]/g, '_');
const safeName = (s, fallback = 'item') => (ascii(s).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || fallback);

function uniqueNames(list, fallback) {
  const seen = new Map();
  return list.map((raw, i) => {
    const base = safeName(raw, `${fallback}${i + 1}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

const xmlEscape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Per-axis conductivity [kx, ky, kz] (missing overrides use k) and whether it is anisotropic. */
function conductivity(m) {
  const k = [m.kx, m.ky, m.kz].map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : m.k));
  return { k, anisotropic: k.some((v) => v !== m.k) };
}

/** Linearised radiation coefficient 4·ε·σ·T³ (W/m²K) at T °C. */
const hRadiation = (emissivity, T) => 4 * emissivity * SIGMA * (T + 273.15) ** 3;

/** The domain in mm and the grid, noted in a comment so decks read back (decks.js) get the same domain and cells. */
export const domainNote = (d) => `MyHeatManager domain ${d.dim === 3 ? 3 : 2} ${num(d.width)} ${num(d.height)} ${num(d.depth)} ${d.nx} ${d.ny} ${d.dim === 3 ? d.nz : 1}`;

// ───────────────────────── the grid mesh shared by every solver export

const FACES_2D = [
  { side: 'bottom', d: [0, -1, 0], local: [0, 1], ansys: 1 },
  { side: 'right', d: [1, 0, 0], local: [1, 2], ansys: 2 },
  { side: 'top', d: [0, 1, 0], local: [2, 3], ansys: 3 },
  { side: 'left', d: [-1, 0, 0], local: [3, 0], ansys: 4 },
];
// Local node order of a hex: 0-3 counter-clockwise at z-min, 4-7 above them. Face node lists run so their normal points out.
const FACES_3D = [
  { side: 'front', d: [0, 0, -1], local: [0, 3, 2, 1], ansys: 1 },
  { side: 'back', d: [0, 0, 1], local: [4, 5, 6, 7], ansys: 6 },
  { side: 'bottom', d: [0, -1, 0], local: [0, 1, 5, 4], ansys: 2 },
  { side: 'right', d: [1, 0, 0], local: [1, 2, 6, 5], ansys: 3 },
  { side: 'top', d: [0, 1, 0], local: [2, 3, 7, 6], ansys: 4 },
  { side: 'left', d: [-1, 0, 0], local: [3, 0, 4, 7], ansys: 5 },
];

/** Which boundary condition a grid face gets: body:<id> > edge > exterior, the last one of a class wins (ARCHITECTURE.md). */
function faceBoundary(model, f, tol) {
  let best = null;
  let bestRank = -1;
  for (const bc of model.boundaries) {
    let rank;
    if (bc.target.startsWith('body:')) {
      if (!f.e.owner || `body:${f.e.owner.id}` !== bc.target) continue;
      rank = 2;
    } else if (bc.target === 'exterior') rank = 0;
    else {
      if (f.edge !== bc.target) continue;
      if (bc.range) {
        const s = bc.target === 'left' || bc.target === 'right' ? f.y : bc.target === 'bottom' || bc.target === 'top' ? f.x : null;
        if (s != null && (s < Math.min(...bc.range) - tol || s > Math.max(...bc.range) + tol)) continue;
      }
      rank = 1;
    }
    if (bc.region && !(f.x >= bc.region[0] - tol && f.x <= bc.region[2] + tol && f.y >= bc.region[1] - tol && f.y <= bc.region[3] + tol)) continue;
    if (rank >= bestRank) { best = bc; bestRank = rank; }
  }
  return best;
}

/**
 * The structured grid of the domain restricted to cells with material: nodes (mm, compact 0-based in grid order),
 * elements (quad / hex), the materials in use, the outside faces (void or domain edge) with their boundary condition.
 */
function gridMesh(model) {
  const d = model.domain;
  const is3d = d.dim === 3;
  const { dx, dy, dz } = cellSize(d);
  const nz = is3d ? d.nz : 1;
  const visible = model.bodies.filter((b) => !b.hidden);
  const cells = d.nx * d.ny * nz;
  const owner = new Array(cells).fill(null);
  const mat = new Array(cells).fill(null);
  for (let k = 0; k < nz; k++) for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) {
    const x = (i + 0.5) * dx;
    const y = (j + 0.5) * dy;
    const z = (k + 0.5) * dz;
    const c = i + d.nx * (j + d.ny * k);
    mat[c] = d.background;
    for (let b = visible.length - 1; b >= 0; b--) {
      const body = visible[b];
      if (is3d && (z < body.z0 || z > body.z1)) continue;
      if (bodyContains(body, x, y)) { owner[c] = body; mat[c] = body.material; break; }
    }
  }
  const materials = [];
  const matIndex = new Map();
  const gridNode = (i, j, k) => i + (d.nx + 1) * (j + (d.ny + 1) * k);
  const used = new Uint8Array((d.nx + 1) * (d.ny + 1) * (is3d ? nz + 1 : 1));
  const raw = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) {
    const c = i + d.nx * (j + d.ny * k);
    if (mat[c] == null) continue;
    if (!matIndex.has(mat[c])) {
      matIndex.set(mat[c], materials.length);
      materials.push(model.materials.find((m) => m.id === mat[c]) ?? { id: mat[c], name: String(mat[c]), k: 1, rho: 1000, cp: 1000, emissivity: 0.9 });
    }
    const g = is3d
      ? [gridNode(i, j, k), gridNode(i + 1, j, k), gridNode(i + 1, j + 1, k), gridNode(i, j + 1, k), gridNode(i, j, k + 1), gridNode(i + 1, j, k + 1), gridNode(i + 1, j + 1, k + 1), gridNode(i, j + 1, k + 1)]
      : [gridNode(i, j, 0), gridNode(i + 1, j, 0), gridNode(i + 1, j + 1, 0), gridNode(i, j + 1, 0)];
    for (const n of g) used[n] = 1;
    raw.push({ i, j, k, c, g, mat: mat[c], mi: matIndex.get(mat[c]), owner: owner[c] });
  }
  const compact = new Int32Array(used.length).fill(-1);
  const nodes = [];
  for (let k = 0; k < (is3d ? nz + 1 : 1); k++) for (let j = 0; j <= d.ny; j++) for (let i = 0; i <= d.nx; i++) {
    const g = gridNode(i, j, k);
    if (!used[g]) continue;
    compact[g] = nodes.length;
    nodes.push([i * dx, j * dy, is3d ? k * dz : 0]);
  }
  const elements = raw.map((e, index) => ({ id: index + 1, i: e.i, j: e.j, k: e.k, mat: e.mat, mi: e.mi, owner: e.owner, n: e.g.map((g) => compact[g]) }));
  const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= d.nx || j >= d.ny || k >= nz ? undefined : mat[i + d.nx * (j + d.ny * k)]);
  const faces = [];
  const tol = 1e-9 * Math.max(d.width, d.height, d.depth);
  for (const e of elements) {
    for (const def of is3d ? FACES_3D : FACES_2D) {
      const [fi, fj, fk] = def.d;
      const neighbour = at(e.i + fi, e.j + fj, e.k + fk);
      if (neighbour != null) continue;
      const f = {
        e, def, nodes: def.local.map((l) => e.n[l]), edge: neighbour === undefined ? def.side : null,
        x: (e.i + 0.5 + fi * 0.5) * dx, y: (e.j + 0.5 + fj * 0.5) * dy, z: (e.k + 0.5 + fk * 0.5) * dz,
      };
      f.bc = faceBoundary(model, f, tol);
      faces.push(f);
    }
  }
  return { d, is3d, dx, dy, dz, nz, nodes, elements, materials, faces };
}

/** Faces grouped by boundary condition in model order (only conditions that reach a face). */
function boundaryGroups(model, mesh) {
  const groups = new Map();
  for (const f of mesh.faces) {
    if (!f.bc) continue;
    if (!groups.has(f.bc)) groups.set(f.bc, []);
    groups.get(f.bc).push(f);
  }
  return model.boundaries.filter((bc) => groups.has(bc)).map((bc) => ({ bc, faces: groups.get(bc) }));
}

/** Volumetric heat source (W/m³) per element of every powered body (power spread over the body's visible cells). */
function bodySources(model, mesh) {
  const cellVolume = (mesh.dx / 1000) * (mesh.dy / 1000) * ((mesh.is3d ? mesh.dz : mesh.d.depth) / 1000);
  const out = [];
  for (const body of model.bodies.filter((b) => b.power > 0 && !b.hidden)) {
    const list = mesh.elements.filter((e) => e.owner === body);
    if (list.length) out.push({ body, q: body.power / (list.length * cellVolume), elements: list });
  }
  return out;
}

/** Film coefficient and ambient temperature of a convection / radiation condition (radiation linearised). */
function filmOf(bc) {
  if (bc.type === 'convection') return { h: bc.h + (bc.emissivity > 0 ? hRadiation(bc.emissivity, bc.Tinf) : 0), Tinf: bc.Tinf };
  if (bc.type === 'radiation') return { h: hRadiation(bc.emissivity, bc.Tamb), Tinf: bc.Tamb };
  return null;
}

// ───────────────────────── Nastran / Simcenter

/** Nastran real in at most `width` characters (always with a decimal point, exponent without "E"). */
function nasReal(value, width = 8) {
  const v = finite(Number(value));
  if (v === 0) return '0.';
  for (let p = width; p >= 1; p--) {
    let s = v.toPrecision(p);
    let exp = '';
    const e = s.indexOf('e');
    if (e >= 0) { exp = s.slice(e + 1); s = s.slice(0, e); }
    if (s.includes('.')) s = s.replace(/0+$/, '');
    else s += '.';
    s += exp;
    if (s.length <= width) return s;
  }
  return v.toExponential(0).replace('e', '');
}

/**
 * Nastran / Simcenter bulk data for SOL 153 (steady heat transfer), free-field entries with large-field GRID*.
 * 2D: CQUAD4 + PSHELL (thickness = domain depth); 3D: CHEXA + PSOLID; MAT4 per material (MAT5 when kx/ky/kz differ). Fixed temperatures as
 * SPC (component 1), convection as CHBDYG/CHBDYP + PCONV + CONV to an SPC'd ambient SPOINT, flux as QBDY1, body
 * power as QVOL (W/m³). Radiation is linearised into the film coefficient. SI units (m), temperatures in °C.
 */
export function nastranBdf(input) {
  const model = normalizeModel(input);
  const mesh = gridMesh(model);
  const { is3d } = mesh;
  const s = 1 / 1000;
  const lines = [
    '$ MyHeatManager -> Nastran / Simcenter bulk data (SOL 153 steady heat transfer)',
    `$ ${ascii(model.name || 'model')} - ${is3d ? '3D CHEXA + PSOLID' : `2D CQUAD4 + PSHELL (thickness ${num(mesh.d.depth * s)} m)`}`,
    '$ SI units (m, kg, s, W), temperatures in deg C; radiation linearised: h_r = 4*eps*sigma*(T_inf+273.15)^3 added to h',
    `$ ${domainNote(model.domain)}`,
  ];
  if (model.study.type === 'transient') lines.push('$ Note: the model is transient in MyHeatManager; this deck is the steady-state (SOL 153) version.');
  const groups = boundaryGroups(model, mesh);
  const sources = bodySources(model, mesh);
  const bulk = ['PARAM,POST,-1'];
  for (let n = 0; n < mesh.nodes.length; n++) {
    const [x, y, z] = mesh.nodes[n];
    bulk.push(`GRID*   ${String(n + 1).padStart(16)}${''.padStart(16)}${nasReal(x * s, 16).padStart(16)}${nasReal(y * s, 16).padStart(16)}`);
    bulk.push(`*       ${nasReal(z * s, 16).padStart(16)}`);
  }
  for (const e of mesh.elements) {
    const g = e.n.map((x) => x + 1);
    if (is3d) bulk.push(`CHEXA,${e.id},${e.mi + 1},${g.slice(0, 6).join(',')},+`, `+,${g[6]},${g[7]}`);
    else bulk.push(`CQUAD4,${e.id},${e.mi + 1},${g.join(',')}`);
  }
  mesh.materials.forEach((m, i) => {
    bulk.push(`$ material ${i + 1}: ${ascii(m.name || m.id)}`);
    bulk.push(is3d ? `PSOLID,${i + 1},${i + 1}` : `PSHELL,${i + 1},${i + 1},${nasReal(mesh.d.depth * s)}`);
    const { k, anisotropic } = conductivity(m);
    if (anisotropic) bulk.push(`MAT5,${i + 1},${nasReal(k[0])},0.,0.,${nasReal(k[1])},0.,${nasReal(k[2])},${nasReal(m.cp)},+`, `+,${nasReal(m.rho)}`);
    else bulk.push(`MAT4,${i + 1},${nasReal(m.k)},${nasReal(m.cp)},${nasReal(m.rho)}`);
  });
  bulk.push(`TEMPD,3,${nasReal(model.study.initialT ?? model.ambient)}`);
  let nextElement = mesh.elements.length + 1;
  let nextMat = mesh.materials.length + 1;
  let nextPoint = mesh.nodes.length + 1;
  let pconv = 1;
  const spcs = [];
  const loads = [];
  const temps = new Map();
  if (!is3d && groups.some((g) => ['convection', 'radiation', 'flux'].includes(g.bc.type))) bulk.push(`PHBDY,1,${nasReal(mesh.d.depth * s)}`);
  const chbdy = (f) => {
    const id = nextElement++;
    const g = f.nodes.map((x) => x + 1);
    if (is3d) bulk.push(`CHBDYG,${id},,AREA4,,,,,,+`, `+,${g.join(',')}`);
    else bulk.push(`CHBDYP,${id},1,LINE,,,${g[0]},${g[1]}`);
    return id;
  };
  for (const { bc, faces } of groups) {
    const film = filmOf(bc);
    if (bc.type === 'temperature') {
      for (const f of faces) for (const n of f.nodes) temps.set(n + 1, bc.T);
    } else if (film) {
      const ambient = nextPoint++;
      const mid = nextMat++;
      const pid = pconv++;
      bulk.push(`$ ${ascii(bc.name || bc.id)} (${bc.type}): h = ${num(film.h)} W/m2K, T_inf = ${num(film.Tinf)} C`);
      bulk.push(`SPOINT,${ambient}`, `MAT4,${mid},,,,${nasReal(film.h)}`, `PCONV,${pid},${mid}`);
      spcs.push(`SPC,1,${ambient},0,${nasReal(film.Tinf)}`);
      for (const f of faces) bulk.push(`CONV,${chbdy(f)},${pid},,,${ambient}`);
    } else if (bc.type === 'flux') {
      bulk.push(`$ ${ascii(bc.name || bc.id)} (flux): ${num(bc.q)} W/m2 into the body`);
      for (const f of faces) loads.push(`QBDY1,2,${nasReal(bc.q)},${chbdy(f)}`);
    }
  }
  for (const [n, T] of temps) spcs.push(`SPC,1,${n},1,${nasReal(T)}`);
  for (const src of sources) {
    loads.push(`$ ${ascii(src.body.name || src.body.id)}: ${num(src.body.power)} W`);
    for (const e of src.elements) loads.push(`QVOL,2,${nasReal(src.q)},,${e.id}`);
  }
  lines.push('SOL 153', 'CEND', `TITLE = ${ascii(model.name || 'MyHeatManager model').slice(0, 64)}`, 'ANALYSIS = HEAT');
  if (spcs.length) lines.push('SPC = 1');
  if (loads.length) lines.push('LOAD = 2');
  lines.push('TEMPERATURE(INITIAL) = 3', 'THERMAL(PRINT,PLOT) = ALL', 'FLUX(PRINT,PLOT) = ALL', 'BEGIN BULK', ...bulk, ...spcs, ...loads, 'ENDDATA', '');
  return lines.join('\n');
}

// ───────────────────────── Ansys MAPDL

/** Fortran E21.13E3 field as CDWRITE writes it. */
function e21(value) {
  const v = finite(Number(value));
  const [mantissa, exponent] = v.toExponential(13).split('e');
  const ex = Number(exponent);
  return `${mantissa}E${ex < 0 ? '-' : '+'}${String(Math.abs(ex)).padStart(3, '0')}`.padStart(21);
}
const i9 = (v) => String(v).padStart(9);

/**
 * Ansys MAPDL archive (.cdb, readable with /INPUT or Workbench External Model): PLANE55 (2D, thickness = depth
 * via KEYOPT(3)=3 and a real constant) or SOLID70 (3D), MP KXX(/KYY/KZZ)/DENS/C per material, NBLOCK/EBLOCK, D TEMP for
 * fixed temperatures, SFE CONV (film + bulk temperature) and SFE HFLUX on element faces, BFE HGEN for body
 * power, then a steady thermal solve. Radiation is linearised into the film coefficient. SI units (m), °C.
 */
export function ansysCdb(input) {
  const model = normalizeModel(input);
  const mesh = gridMesh(model);
  const { is3d } = mesh;
  const s = 1 / 1000;
  const lines = [
    '/COM, MyHeatManager -> Ansys MAPDL input',
    `/COM, ${ascii(model.name || 'model')} - ${is3d ? '3D SOLID70' : '2D PLANE55 with thickness'}`,
    '/COM, SI units (m, kg, s, W), temperatures in deg C; radiation linearised into the film coefficient',
    `/COM, ${domainNote(model.domain)}`,
    '/PREP7',
    '/UNITS,SI',
  ];
  // Element types by number, as Ansys itself writes .cdb files (70 = SOLID70, 55 = PLANE55).
  if (is3d) lines.push('ET,1,70');
  else lines.push('ET,1,55', 'KEYOPT,1,3,3', `R,1,${num(mesh.d.depth * s)}`);
  mesh.materials.forEach((m, i) => {
    const { k, anisotropic } = conductivity(m);
    lines.push(`/COM, material ${i + 1}: ${ascii(m.name || m.id)}`, `MP,KXX,${i + 1},${num(k[0])}`);
    if (anisotropic) lines.push(`MP,KYY,${i + 1},${num(k[1])}`, ...(is3d ? [`MP,KZZ,${i + 1},${num(k[2])}`] : []));
    lines.push(`MP,DENS,${i + 1},${num(m.rho)}`, `MP,C,${i + 1},${num(m.cp)}`);
  });
  lines.push(`NBLOCK,6,SOLID,${i9(mesh.nodes.length)},${i9(mesh.nodes.length)}`, '(3i9,6e21.13e3)');
  mesh.nodes.forEach(([x, y, z], n) => lines.push(`${i9(n + 1)}${i9(0)}${i9(0)}${e21(x * s)}${e21(y * s)}${e21(z * s)}`));
  lines.push('N,R5.3,LOC,       -1,');
  const nn = is3d ? 8 : 4;
  lines.push(`EBLOCK,19,SOLID,${i9(mesh.elements.length)},${i9(mesh.elements.length)}`, '(19i9)');
  for (const e of mesh.elements) {
    // material, type, real, section, esys, birth/death, solid ref, shape, node count, unused, element id, nodes
    lines.push([e.mi + 1, 1, 1, 1, 0, 0, 0, 0, nn, 0, e.id, ...e.n.map((x) => x + 1)].map(i9).join(''));
  }
  lines.push(i9(-1));
  lines.push(`TUNIF,${num(model.study.initialT ?? model.ambient)}`);
  const temps = new Map();
  for (const { bc, faces } of boundaryGroups(model, mesh)) {
    const film = filmOf(bc);
    if (bc.type === 'temperature') {
      for (const f of faces) for (const n of f.nodes) temps.set(n + 1, bc.T);
    } else if (film) {
      lines.push(`/COM, ${ascii(bc.name || bc.id)} (${bc.type}): h = ${num(film.h)} W/m2K, T_inf = ${num(film.Tinf)} C`);
      for (const f of faces) lines.push(`SFE,${f.e.id},${f.def.ansys},CONV,1,${num(film.h)}`, `SFE,${f.e.id},${f.def.ansys},CONV,2,${num(film.Tinf)}`);
    } else if (bc.type === 'flux') {
      lines.push(`/COM, ${ascii(bc.name || bc.id)} (flux): ${num(bc.q)} W/m2 into the body`);
      for (const f of faces) lines.push(`SFE,${f.e.id},${f.def.ansys},HFLUX,1,${num(bc.q)}`);
    }
  }
  if (temps.size) lines.push('/COM, fixed temperatures');
  for (const [n, T] of temps) lines.push(`D,${n},TEMP,${num(T)}`);
  for (const src of bodySources(model, mesh)) {
    lines.push(`/COM, ${ascii(src.body.name || src.body.id)}: ${num(src.body.power)} W`);
    for (const e of src.elements) lines.push(`BFE,${e.id},HGEN,1,${num(src.q)}`);
  }
  lines.push('FINISH', '/SOLU', 'ANTYPE,STATIC', 'SOLVE', 'FINISH', '');
  return lines.join('\n');
}

// ───────────────────────── COMSOL

/**
 * COMSOL Multiphysics text mesh (.mphtxt, mesh version 4): vertices in metres (COMSOL's default length unit),
 * quad (2D) / hex (3D) domain elements in COMSOL's lexicographic vertex order with domain index = material
 * index + 1, and the outside faces as edg (2D) / quad (3D) boundary elements, one boundary entity per boundary
 * condition (0-based, in model order) and a last one for faces without a condition.
 */
export function comsolMphtxt(input) {
  const model = normalizeModel(input);
  const mesh = gridMesh(model);
  const { is3d } = mesh;
  const s = 1 / 1000;
  const groups = boundaryGroups(model, mesh);
  const bcIndex = new Map(groups.map((g, i) => [g.bc, i]));
  const lex = (n) => (is3d ? [n[0], n[1], n[3], n[2], n[4], n[5], n[7], n[6]] : [n[0], n[1], n[3], n[2]]);
  const faceLex = (n) => (n.length === 4 ? [n[0], n[1], n[3], n[2]] : n);
  const out = [
    '# Created by COMSOL Multiphysics.', '',
    `# MyHeatManager -> COMSOL text mesh: ${ascii(model.name || 'model')}; coordinates in m`, `# ${domainNote(model.domain)}`, '',
    '# Major & minor version', '0 1', '1 # number of tags', '# Tags', '5 mesh1', '1 # number of types', '# Types', '3 obj', '',
    '# --------- Object 0 ----------', '', '0 0 1', '4 Mesh # class', '4 # version', `${is3d ? 3 : 2} # sdim`,
    `${mesh.nodes.length} # number of mesh vertices`, '0 # lowest mesh vertex index', '', '# Mesh vertex coordinates',
  ];
  for (const [x, y, z] of mesh.nodes) out.push(is3d ? `${num(x * s)} ${num(y * s)} ${num(z * s)}` : `${num(x * s)} ${num(y * s)}`);
  const type = (index, name, perElement, rows, entities) => {
    out.push('', `# Type #${index}`, '', `${name.length} ${name} # type name`, '', '', `${perElement} # number of vertices per element`, `${rows.length} # number of elements`, '# Elements');
    for (const r of rows) out.push(r.join(' '));
    out.push('', `${entities.length} # number of geometric entity indices`, '# Geometric entity indices');
    for (const g of entities) out.push(String(g));
  };
  out.push('', '2 # number of element types');
  type(0, is3d ? 'quad' : 'edg', is3d ? 4 : 2, mesh.faces.map((f) => faceLex(f.nodes)), mesh.faces.map((f) => (f.bc ? bcIndex.get(f.bc) : groups.length)));
  type(1, is3d ? 'hex' : 'quad', is3d ? 8 : 4, mesh.elements.map((e) => lex(e.n)), mesh.elements.map((e) => e.mi + 1));
  out.push('');
  return out.join('\n');
}

// ───────────────────────── Gmsh

/**
 * Gmsh MSH 2.2 ASCII: one physical group per material (2D surface / 3D volume, named by the material id) and
 * per boundary condition (lines / quads, named "<name> [<type>]"), quad (type 3) or hex (type 5) elements.
 * Coordinates in mm (Gmsh is unitless). A $MyHeatManager section (ignored by Gmsh) keeps the domain size.
 */
export function gmshMsh(input) {
  const model = normalizeModel(input);
  const mesh = gridMesh(model);
  const { is3d, d } = mesh;
  const dim = is3d ? 3 : 2;
  const groups = boundaryGroups(model, mesh);
  const out = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$PhysicalNames', String(mesh.materials.length + groups.length)];
  mesh.materials.forEach((m, i) => out.push(`${dim} ${i + 1} "${String(m.id).replace(/"/g, "'")}"`));
  groups.forEach((g, i) => out.push(`${dim - 1} ${mesh.materials.length + i + 1} "${String(g.bc.name || g.bc.id).replace(/["[\]]/g, "'")} [${g.bc.type}]"`));
  out.push('$EndPhysicalNames', '$MyHeatManager', `domain ${d.dim} ${num(d.width)} ${num(d.height)} ${num(d.depth)} ${d.nx} ${d.ny} ${d.nz}`, '$EndMyHeatManager');
  out.push('$Nodes', String(mesh.nodes.length));
  mesh.nodes.forEach(([x, y, z], n) => out.push(`${n + 1} ${num(x)} ${num(y)} ${num(z)}`));
  out.push('$EndNodes', '$Elements');
  const rows = [];
  for (const e of mesh.elements) rows.push(`${is3d ? 5 : 3} 2 ${e.mi + 1} ${e.mi + 1} ${e.n.map((x) => x + 1).join(' ')}`);
  groups.forEach((g, i) => {
    const tag = mesh.materials.length + i + 1;
    for (const f of g.faces) rows.push(`${is3d ? 3 : 1} 2 ${tag} ${tag} ${f.nodes.map((x) => x + 1).join(' ')}`);
  });
  out.push(String(rows.length), ...rows.map((r, i) => `${i + 1} ${r}`), '$EndElements', '');
  return out.join('\n');
}

// ───────────────────────── outline tracing (Gmsh import)

const pointKey = (x, y) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
const signedArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]);
  return a / 2;
};

/** Drops vertices that lie on the straight line through their neighbours. */
function simplifyLoop(pts) {
  let list = pts.slice();
  let changed = true;
  while (changed && list.length > 3) {
    changed = false;
    for (let i = 0; i < list.length && list.length > 3; i++) {
      const a = list[(i - 1 + list.length) % list.length];
      const b = list[i];
      const c = list[(i + 1) % list.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (Math.abs(cross) <= 1e-9 * Math.max(scale, 1e-30)) { list.splice(i, 1); i--; changed = true; }
    }
  }
  return list;
}

/**
 * Outlines of a set of 2D cells (each an array of [x, y] corners): edges used by one cell only, chained into
 * closed loops (sharpest left turn at pinch points so touching regions stay apart). Outer loops have positive
 * area, holes negative. Returns null when the edges do not close.
 */
function traceOutlines(cells) {
  const xy = new Map();
  const directed = new Map();
  for (const cell of cells) {
    let pts = cell;
    if (signedArea(pts) < 0) pts = pts.slice().reverse();
    const keys = pts.map(([x, y]) => { const k = pointKey(x, y); xy.set(k, [x, y]); return k; });
    for (let i = 0; i < keys.length; i++) {
      const a = keys[i];
      const b = keys[(i + 1) % keys.length];
      if (a === b) continue;
      const key = `${a}|${b}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  const out = new Map();
  let count = 0;
  for (const [key, n] of directed) {
    const [a, b] = key.split('|');
    const back = directed.get(`${b}|${a}`) ?? 0;
    for (let r = 0; r < n - back; r++) {
      if (!out.has(a)) out.set(a, []);
      out.get(a).push(b);
      count++;
    }
  }
  const loops = [];
  let guard = 0;
  while (count > 0) {
    const start = [...out.keys()].find((k) => out.get(k).length);
    const first = out.get(start).pop();
    count--;
    const loop = [start];
    let prev = start;
    let cur = first;
    while (cur !== start) {
      if (++guard > 1e7) return null;
      loop.push(cur);
      const options = out.get(cur);
      if (!options?.length) return null;
      const [px, py] = xy.get(prev);
      const [cx, cy] = xy.get(cur);
      let best = 0;
      let bestTurn = -Infinity;
      options.forEach((nk, i) => {
        const [nx, ny] = xy.get(nk);
        const turn = Math.atan2((cx - px) * (ny - cy) - (cy - py) * (nx - cx), (cx - px) * (nx - cx) + (cy - py) * (ny - cy));
        if (turn > bestTurn) { bestTurn = turn; best = i; }
      });
      const next = options.splice(best, 1)[0];
      count--;
      prev = cur;
      cur = next;
    }
    const pts = simplifyLoop(loop.map((k) => xy.get(k)));
    loops.push({ points: pts, area: signedArea(pts) });
  }
  return loops;
}

/** A body for a traced outline: a rect when it is an axis-aligned rectangle, else a polygon. */
function outlineBody(points, extra) {
  const xs = [...new Set(points.map((p) => p[0]))];
  const ys = [...new Set(points.map((p) => p[1]))];
  if (points.length === 4 && xs.length === 2 && ys.length === 2) {
    return { ...extra, shape: 'rect', x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
  }
  return { ...extra, shape: 'polygon', points: points.map((p) => [p[0], p[1]]) };
}

/** A material for a name found in a foreign file: the library material with that id or name, else a generic solid. */
function materialForName(name, id, language, props = {}) {
  const lower = String(name).trim().toLowerCase();
  const lib = MATERIAL_LIBRARY.find((m) => m.id.toLowerCase() === lower || m.name.en.toLowerCase() === lower || m.name.ko === String(name).trim());
  if (lib && props.k == null) return { ...materialFromLibrary(lib.id, language), id };
  const k = props.k ?? 1;
  // Rough density / heat capacity from the conductivity class when the file has none (THERM stores k only).
  const [rho, cp] = k >= 50 ? [2700, 900] : k <= 0.06 ? [40, 1200] : k >= 0.6 && k <= 2 ? [2300, 880] : [1200, 1300];
  return {
    id, name: String(name) || id, kind: 'solid', k, rho: props.rho ?? rho, cp: props.cp ?? cp, emissivity: props.emissivity ?? 0.9,
    E: null, nu: 0.3, alpha: 0, color: props.color ?? ['#b8c2cc', '#d9a441', '#3f7d3a', '#9fd3e6', '#a5523a', '#e6d27a', '#5f6f86', '#c49a6c'][Math.abs([...String(name)].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % 8],
  };
}

const GMSH_NODES = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 8, 6: 6, 7: 5, 8: 3, 9: 6, 10: 9, 11: 10, 12: 27, 13: 18, 14: 14, 15: 1, 16: 8, 17: 20, 18: 15, 19: 13 };
const GMSH_CORNERS = { 1: 2, 8: 2, 2: 3, 9: 3, 3: 4, 10: 4, 16: 4, 4: 4, 11: 4, 5: 8, 12: 8, 17: 8, 6: 6, 13: 6, 18: 6, 7: 5, 14: 5, 19: 5, 15: 1 };
const GMSH_DIM = { 15: 0, 1: 1, 8: 1, 2: 2, 3: 2, 9: 2, 10: 2, 16: 2, 4: 3, 5: 3, 6: 3, 7: 3, 11: 3, 12: 3, 13: 3, 14: 3, 17: 3, 18: 3, 19: 3 };

/**
 * Model from a Gmsh MSH 2.2 ASCII mesh: each physical group of 2D cells (3D: hexahedra, slab by slab) becomes
 * polygon / rect bodies traced from its outline, boundary groups become boundary conditions (type taken from a
 * trailing "[type]" in the name, else convection with default values). Returns { model, warnings }.
 */
export function gmshToModel(text, { language = 'ko' } = {}) {
  const warnings = [];
  const rows = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const section = (name) => {
    const a = rows.findIndex((r) => r.trim() === `$${name}`);
    if (a < 0) return null;
    const b = rows.findIndex((r, i) => i > a && r.trim() === `$End${name}`);
    return rows.slice(a + 1, b < 0 ? rows.length : b).map((r) => r.trim()).filter(Boolean);
  };
  const format = section('MeshFormat');
  if (!format) throw new Error('not a Gmsh MSH file ($MeshFormat missing)');
  const version = Number(format[0].split(/\s+/)[0]);
  if (!(version >= 2 && version < 3)) throw new Error(`MSH ${version} is not supported — save as MSH 2.2 ASCII in Gmsh (File > Export, Version 2 ASCII)`);
  if (format[0].split(/\s+/)[1] !== '0') throw new Error('binary MSH is not supported — save as ASCII');
  const names = new Map();
  for (const r of (section('PhysicalNames') ?? []).slice(1)) {
    const m = r.match(/^(\d+)\s+(\d+)\s+"(.*)"$/);
    if (m) names.set(`${m[1]}:${m[2]}`, m[3]);
  }
  const nodes = new Map();
  for (const r of (section('Nodes') ?? []).slice(1)) {
    const [id, x, y, z] = r.split(/\s+/).map(Number);
    nodes.set(id, [x, y, z || 0]);
  }
  if (!nodes.size) throw new Error('the mesh has no nodes');
  const elements = [];
  for (const r of (section('Elements') ?? []).slice(1)) {
    const v = r.split(/\s+/).map(Number);
    const type = v[1];
    const ntags = v[2];
    const tags = v.slice(3, 3 + ntags);
    const ids = v.slice(3 + ntags, 3 + ntags + (GMSH_NODES[type] ?? 0));
    if (GMSH_DIM[type] == null) continue;
    const pts = ids.slice(0, GMSH_CORNERS[type]).map((id) => nodes.get(id));
    if (pts.some((p) => !p)) continue;
    elements.push({ type, dim: GMSH_DIM[type], group: tags[0] || tags[1] || 0, pts });
  }
  const top = Math.max(...elements.map((e) => e.dim), 0);
  if (top < 2) throw new Error('the mesh has no 2D or 3D cells');
  const all = [...nodes.values()];
  const lo = [0, 1, 2].map((a) => Math.min(...all.map((p) => p[a])));
  const hi = [0, 1, 2].map((a) => Math.max(...all.map((p) => p[a])));
  // Domain: the size stored by gmshMsh, else the bounding box moved to the origin with a cell size from the elements.
  const saved = (section('MyHeatManager') ?? []).map((r) => r.split(/\s+/)).find((r) => r[0] === 'domain');
  const shift = saved ? [0, 0, 0] : lo;
  const is3d = top === 3;
  let domain;
  if (saved) {
    const [, dim, width, height, depth, nx, ny, nz] = saved.map(Number);
    domain = { dim: dim === 3 ? 3 : 2, width, height, depth, nx, ny, nz, background: null };
  } else {
    const width = Math.max(1e-6, hi[0] - lo[0]);
    const height = Math.max(1e-6, hi[1] - lo[1]);
    const depth = is3d ? Math.max(1e-6, hi[2] - lo[2]) : 10;
    const sizes = (axis) => elements.filter((e) => e.dim === top).map((e) => Math.max(...e.pts.map((p) => p[axis])) - Math.min(...e.pts.map((p) => p[axis]))).filter((v) => v > 0).sort((a, b) => a - b);
    const median = (list, fallback) => (list.length ? list[Math.floor(list.length / 2)] : fallback);
    let cx = median(sizes(0), width / 100);
    let cy = median(sizes(1), height / 100);
    let cz = is3d ? median(sizes(2), depth / 10) : 1;
    const cap = is3d ? 2_000_000 : 250_000;
    const cells = (width / cx) * (height / cy) * (is3d ? depth / cz : 1);
    if (cells > cap) { const f = (cells / cap) ** (1 / (is3d ? 3 : 2)); cx *= f; cy *= f; cz *= f; }
    domain = { dim: is3d ? 3 : 2, width, height, depth, nx: Math.max(1, Math.round(width / cx)), ny: Math.max(1, Math.round(height / cy)), nz: is3d ? Math.max(1, Math.round(depth / cz)) : 1, background: null };
  }
  const at = (p) => [p[0] - shift[0], p[1] - shift[1], p[2] - shift[2]];
  const groupName = (dim, tag) => names.get(`${dim}:${tag}`) ?? `Group ${tag}`;
  const materials = [];
  const bodies = [];
  const holes = [];
  const taken = [];
  const cellGroups = new Map();
  for (const e of elements.filter((x) => x.dim === top)) {
    if (!cellGroups.has(e.group)) cellGroups.set(e.group, []);
    cellGroups.get(e.group).push(e);
  }
  for (const [tag, list] of cellGroups) {
    const name = groupName(top, tag);
    const id = safeName(name, `mat${tag}`);
    const matId = materials.some((m) => m.id === id) ? `${id}_${tag}` : id;
    materials.push(materialForName(name, matId, language));
    const addLoops = (cells, extra) => {
      const loops = traceOutlines(cells);
      if (!loops) return false;
      for (const loop of loops) {
        if (loop.area > 0) bodies.push({ body: outlineBody(loop.points, extra), area: loop.area });
        else holes.push({ points: loop.points, group: name, z: extra.z0 != null ? (extra.z0 + extra.z1) / 2 : null });
      }
      return true;
    };
    const bbox = (cells, extra) => {
      const pts = cells.flat();
      const x0 = Math.min(...pts.map((p) => p[0]));
      const y0 = Math.min(...pts.map((p) => p[1]));
      bodies.push({ body: { ...extra, shape: 'rect', x: x0, y: y0, w: Math.max(...pts.map((p) => p[0])) - x0, h: Math.max(...pts.map((p) => p[1])) - y0 }, area: Infinity });
    };
    if (!is3d) {
      const cells = list.map((e) => e.pts.map((p) => at(p).slice(0, 2)));
      if (!addLoops(cells, { name, material: matId })) {
        warnings.push(`"${name}": outline could not be traced — replaced by its bounding rectangle`);
        bbox(cells, { name, material: matId });
      }
      continue;
    }
    // 3D: hexahedra whose top face sits over the bottom face are cut into z slabs; equal outlines in consecutive slabs merge.
    const slabs = new Map();
    let extruded = true;
    for (const e of list) {
      const p = e.pts.map(at);
      if (e.type !== 5 && e.type !== 12 && e.type !== 17) { extruded = false; break; }
      const bottom = p.slice(0, 4);
      const topFace = p.slice(4, 8);
      if (bottom.some((b, i) => Math.abs(b[0] - topFace[i][0]) > 1e-9 || Math.abs(b[1] - topFace[i][1]) > 1e-9 || Math.abs(b[2] - bottom[0][2]) > 1e-9 || Math.abs(topFace[i][2] - topFace[0][2]) > 1e-9)) { extruded = false; break; }
      const z0 = Math.min(bottom[0][2], topFace[0][2]);
      const z1 = Math.max(bottom[0][2], topFace[0][2]);
      const key = `${num(z0)}|${num(z1)}`;
      if (!slabs.has(key)) slabs.set(key, { z0, z1, cells: [] });
      slabs.get(key).cells.push(bottom.map((q) => [q[0], q[1]]));
    }
    if (!extruded) {
      warnings.push(`"${name}": cells are not z-extruded hexahedra — replaced by its bounding box`);
      const pts = list.flatMap((e) => e.pts.map(at));
      const z0 = Math.min(...pts.map((q) => q[2]));
      const z1 = Math.max(...pts.map((q) => q[2]));
      bbox([pts.map((q) => [q[0], q[1]])], { name, material: matId, z0, z1 });
      continue;
    }
    const open = new Map();
    let failed = false;
    for (const slab of [...slabs.values()].sort((a, b) => a.z0 - b.z0)) {
      const loops = traceOutlines(slab.cells);
      if (!loops) { failed = true; bbox(slab.cells, { name, material: matId, z0: slab.z0, z1: slab.z1 }); continue; }
      for (const loop of loops) {
        if (loop.area <= 0) { holes.push({ points: loop.points, group: name, z: (slab.z0 + slab.z1) / 2 }); continue; }
        const key = loop.points.map((p) => pointKey(p[0], p[1])).join(';');
        const prior = open.get(key);
        if (prior && Math.abs(prior.body.z1 - slab.z0) < 1e-9) { prior.body.z1 = slab.z1; continue; }
        const entry = { body: { ...outlineBody(loop.points, { name, material: matId }), z0: slab.z0, z1: slab.z1 }, area: loop.area };
        open.set(key, entry);
        bodies.push(entry);
      }
    }
    if (failed) warnings.push(`"${name}": some slabs could not be traced — replaced by bounding rectangles`);
  }
  // Large outlines first so smaller bodies (and bodies inside holes) paint over them.
  bodies.sort((a, b) => b.area - a.area);
  const finalBodies = bodies.map((entry, i) => {
    const id = newId('g', taken);
    taken.push(id);
    const sameName = bodies.filter((x) => x.body.name === entry.body.name).length > 1;
    return { ...entry.body, id, name: sameName ? `${entry.body.name} ${bodies.slice(0, i + 1).filter((x) => x.body.name === entry.body.name).length}` : entry.body.name };
  });
  for (const hole of holes) {
    // A point just inside the hole (holes run clockwise, so the hole is to the right of the first edge).
    const [a, b] = hole.points;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const px = (a[0] + b[0]) / 2 + ((b[1] - a[1]) / len) * 1e-4;
    const py = (a[1] + b[1]) / 2 - ((b[0] - a[0]) / len) * 1e-4;
    const covered = finalBodies.some((body) => body.material !== hole.group && bodyContains(body, px, py) && (hole.z == null || (hole.z >= body.z0 && hole.z <= body.z1)));
    if (!covered) warnings.push(`"${hole.group}": a hole in the region is filled with the region's material (bodies cannot have holes)`);
  }
  // Boundary groups → boundary conditions.
  const boundaries = [];
  const faceGroups = new Map();
  for (const e of elements.filter((x) => x.dim === top - 1)) {
    if (!faceGroups.has(e.group)) faceGroups.set(e.group, []);
    faceGroups.get(e.group).push(e);
  }
  const W = domain.width;
  const H = domain.height;
  const D = domain.depth;
  const tol = 1e-6 * Math.max(W, H, D);
  let defaulted = false;
  for (const [tag, list] of faceGroups) {
    const label = groupName(top - 1, tag);
    const m = label.match(/^(.*?)\s*\[(\w+)\]\s*$/);
    const type = m && ['temperature', 'flux', 'convection', 'radiation', 'adiabatic'].includes(m[2]) ? m[2] : 'convection';
    if (!m) defaulted = true;
    const pts = list.flatMap((e) => e.pts.map(at));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const zs = pts.map((p) => p[2]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let target = 'exterior';
    let range = null;
    let region = null;
    if (xs.every((x) => Math.abs(x) < tol)) { target = 'left'; range = [y0, y1]; }
    else if (xs.every((x) => Math.abs(x - W) < tol)) { target = 'right'; range = [y0, y1]; }
    else if (ys.every((y) => Math.abs(y) < tol)) { target = 'bottom'; range = [x0, x1]; }
    else if (ys.every((y) => Math.abs(y - H) < tol)) { target = 'top'; range = [x0, x1]; }
    else if (is3d && zs.every((z) => Math.abs(z) < tol)) target = 'front';
    else if (is3d && zs.every((z) => Math.abs(z - D) < tol)) target = 'back';
    else region = [x0 - tol, y0 - tol, x1 + tol, y1 + tol];
    if (range && Math.abs(range[0]) < tol && Math.abs(range[1] - (target === 'left' || target === 'right' ? H : W)) < tol) range = null;
    boundaries.push({ id: newId('bc', boundaries.map((x) => x.id)), name: m ? m[1] : label, target, range, region, type });
  }
  if (defaulted) warnings.push('boundary groups without a "[type]" tag were imported as convection with default values — check them');
  if (faceGroups.size) warnings.push('boundary values (h, T, q…) are not stored in MSH files — check the imported conditions');
  const model = normalizeModel({
    name: language === 'en' ? 'Gmsh import' : 'Gmsh 가져오기',
    domain, materials, bodies: finalBodies, boundaries, ambient: 25, study: { type: 'steady' },
  });
  return { model, warnings };
}

// ───────────────────────── ParaView (.vtu)

/**
 * VTK XML UnstructuredGrid (ASCII) of a decoded result: one VTK_QUAD (2D) / VTK_HEXAHEDRON (3D) per simulated
 * cell (void cells, mat ≥ 255, are left out), every per-cell field of the last frame as CellData, plus heat
 * flux / velocity / displacement as 3-component vectors with their magnitudes. Coordinates in mm.
 */
export function resultVtu(result, title = 'MyHeatManager') {
  const { grid, fields } = result.header;
  const is3d = grid.dim === 3;
  const nz = is3d ? grid.nz : 1;
  const cells = grid.nx * grid.ny * nz;
  const mat = field(result, 'mat');
  const keep = [];
  for (let c = 0; c < cells; c++) if (!mat || mat[c] < 255) keep.push(c);
  const nodeOf = (i, j, k) => i + (grid.nx + 1) * (j + (grid.ny + 1) * k);
  const compact = new Map();
  const corners = (c) => {
    const i = c % grid.nx;
    const j = Math.floor(c / grid.nx) % grid.ny;
    const k = Math.floor(c / (grid.nx * grid.ny));
    const base = [nodeOf(i, j, k), nodeOf(i + 1, j, k), nodeOf(i + 1, j + 1, k), nodeOf(i, j + 1, k)];
    return is3d ? [...base, nodeOf(i, j, k + 1), nodeOf(i + 1, j, k + 1), nodeOf(i + 1, j + 1, k + 1), nodeOf(i, j + 1, k + 1)] : base;
  };
  const connectivity = [];
  for (const c of keep) for (const g of corners(c)) {
    if (!compact.has(g)) compact.set(g, compact.size);
    connectivity.push(compact.get(g));
  }
  const points = new Array(compact.size);
  for (const [g, n] of compact) {
    const i = g % (grid.nx + 1);
    const j = Math.floor(g / (grid.nx + 1)) % (grid.ny + 1);
    const k = Math.floor(g / ((grid.nx + 1) * (grid.ny + 1)));
    points[n] = `${num(i * grid.dx)} ${num(j * grid.dy)} ${is3d ? num(k * grid.dz) : 0}`;
  }
  const per = is3d ? 8 : 4;
  const wrap = (list, n = 12) => {
    const out = [];
    for (let i = 0; i < list.length; i += n) out.push(`          ${list.slice(i, i + n).join(' ')}`);
    return out.join('\n');
  };
  const value = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(7))) : '0');
  const arrays = [];
  const last = (name) => field(result, name, (fields[name].frames ?? 1) - 1);
  const scalarNames = Object.keys(fields).filter((name) => fields[name].length === cells);
  for (const name of scalarNames) {
    const values = last(name);
    arrays.push(`        <DataArray type="Float32" Name="${xmlEscape(name)}" format="ascii">\n${wrap(keep.map((c) => value(values[c])))}\n        </DataArray>`);
  }
  for (const [vname, parts] of [['heatFlux', ['qx', 'qy', 'qz']], ['velocity', ['u', 'v', 'w']], ['displacement', ['dispX', 'dispY', 'dispZ']]]) {
    const comps = parts.map((p) => (scalarNames.includes(p) ? last(p) : null));
    if (!comps[0] && !comps[1]) continue;
    const vec = keep.map((c) => comps.map((p) => (p ? value(p[c]) : '0')).join(' '));
    const mag = keep.map((c) => value(Math.sqrt(comps.reduce((sum, p) => sum + (p ? p[c] * p[c] : 0), 0))));
    arrays.push(`        <DataArray type="Float32" Name="${vname}" NumberOfComponents="3" format="ascii">\n${wrap(vec, 4)}\n        </DataArray>`);
    arrays.push(`        <DataArray type="Float32" Name="${vname}Magnitude" format="ascii">\n${wrap(mag)}\n        </DataArray>`);
  }
  const offsets = keep.map((_, n) => (n + 1) * per);
  const types = keep.map(() => (is3d ? 12 : 9));
  return [
    '<?xml version="1.0"?>',
    `<!-- ${String(title).replace(/--/g, '- -').replace(/\n/g, ' ').slice(0, 250)} (MyHeatManager, mm) -->`,
    '<VTKFile type="UnstructuredGrid" version="0.1" byte_order="LittleEndian">',
    '  <UnstructuredGrid>',
    `    <Piece NumberOfPoints="${points.length}" NumberOfCells="${keep.length}">`,
    '      <Points>',
    '        <DataArray type="Float32" NumberOfComponents="3" format="ascii">',
    wrap(points, 4),
    '        </DataArray>',
    '      </Points>',
    '      <Cells>',
    `        <DataArray type="Int32" Name="connectivity" format="ascii">\n${wrap(connectivity, per * 3)}\n        </DataArray>`,
    `        <DataArray type="Int32" Name="offsets" format="ascii">\n${wrap(offsets)}\n        </DataArray>`,
    `        <DataArray type="UInt8" Name="types" format="ascii">\n${wrap(types, 24)}\n        </DataArray>`,
    '      </Cells>',
    `      <CellData${scalarNames.includes('T') ? ' Scalars="T"' : ''}>`,
    ...arrays,
    '      </CellData>',
    '    </Piece>',
    '  </UnstructuredGrid>',
    '</VTKFile>',
    '',
  ].join('\n');
}

// ───────────────────────── STL

/** A body's 2D outline as counter-clockwise [x, y] points (circles as `segments`-gons). */
function bodyOutline(body, segments = 48) {
  let pts;
  if (body.shape === 'circle') pts = Array.from({ length: segments }, (_, i) => [body.cx + body.r * Math.cos((2 * Math.PI * i) / segments), body.cy + body.r * Math.sin((2 * Math.PI * i) / segments)]);
  else if (body.shape === 'polygon') pts = body.points.map((p) => [p[0], p[1]]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  else pts = [[body.x, body.y], [body.x + body.w, body.y], [body.x + body.w, body.y + body.h], [body.x, body.y + body.h]];
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

/** Ear-clipping triangulation of a simple counter-clockwise polygon → index triples. */
export function triangulate(pts) {
  const idx = pts.map((_, i) => i);
  const tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) > 0 && cross(b, c, p) > 0 && cross(c, a, p) > 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10 * pts.length * pts.length) {
    let clipped = false;
    for (let n = 0; n < idx.length; n++) {
      const ia = idx[(n - 1 + idx.length) % idx.length];
      const ib = idx[n];
      const ic = idx[(n + 1) % idx.length];
      const [a, b, c] = [pts[ia], pts[ib], pts[ic]];
      if (cross(a, b, c) <= 0) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], a, b, c))) continue;
      tris.push([ia, ib, ic]);
      idx.splice(n, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  else for (let n = 1; n + 1 < idx.length; n++) tris.push([idx[0], idx[n], idx[n + 1]]); // degenerate leftovers: fan
  return tris;
}

/**
 * ASCII STL of the visible bodies as closed solids in mm: 2D outlines extruded through the domain depth, 3D
 * bodies from z0 to z1; rect → box, circle → 48-sided prism, polygon → prism with ear-clipped caps. One
 * `solid` per body, outward normals.
 */
export function modelStl(input) {
  const model = normalizeModel(input);
  const is3d = model.domain.dim === 3;
  const out = [];
  const names = uniqueNames(model.bodies.map((b) => b.name || b.id), 'body');
  const facet = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    if (!(len > 0)) return;
    out.push(`  facet normal ${n.map((x) => num(x / len)).join(' ')}`, '    outer loop', ...[a, b, c].map((p) => `      vertex ${p.map(num).join(' ')}`), '    endloop', '  endfacet');
  };
  model.bodies.forEach((body, bi) => {
    if (body.hidden) return;
    const pts = bodyOutline(body);
    if (pts.length < 3) return;
    const z0 = is3d ? Math.min(body.z0, body.z1) : 0;
    const z1 = is3d ? Math.max(body.z0, body.z1) : model.domain.depth;
    if (!(z1 > z0)) return;
    out.push(`solid ${names[bi]}`);
    for (const [a, b, c] of triangulate(pts)) {
      facet([...pts[a], z1], [...pts[b], z1], [...pts[c], z1]);
      facet([...pts[a], z0], [...pts[c], z0], [...pts[b], z0]);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      facet([...p, z0], [...q, z0], [...q, z1]);
      facet([...p, z0], [...q, z1], [...p, z1]);
    }
    out.push(`endsolid ${names[bi]}`);
  });
  return `${out.join('\n')}\n`;
}

// ───────────────────────── DXF

/**
 * DXF R12 ASCII in mm: a HEADER ($ACADVER AC1009, $INSUNITS 4 = mm), a LAYER table with one layer per body
 * (the sanitised body name) and the bodies as closed POLYLINE/VERTEX (rect, polygon) or CIRCLE entities —
 * readable by bodiesFromDxf and by CAD programs.
 */
export function dxfFromModel(input) {
  const model = normalizeModel(input);
  const layers = uniqueNames(model.bodies.map((b) => b.name || b.id), 'BODY');
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC'];
  out.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB');
  out.push('0', 'TABLE', '2', 'LAYER', '70', String(layers.length + 1), '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  layers.forEach((layer, i) => out.push('0', 'LAYER', '2', layer, '70', '0', '62', String((i % 6) + 1), '6', 'CONTINUOUS'));
  out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  const n = (v) => String(Number(finite(v).toPrecision(15)));
  model.bodies.forEach((body, i) => {
    if (body.shape === 'circle') {
      out.push('0', 'CIRCLE', '8', layers[i], '10', n(body.cx), '20', n(body.cy), '30', '0.0', '40', n(body.r));
      return;
    }
    const pts = body.shape === 'polygon' ? body.points : [[body.x, body.y], [body.x + body.w, body.y], [body.x + body.w, body.y + body.h], [body.x, body.y + body.h]];
    if (pts.length < 3) return;
    out.push('0', 'POLYLINE', '8', layers[i], '66', '1', '10', '0.0', '20', '0.0', '30', '0.0', '70', '1');
    for (const [x, y] of pts) out.push('0', 'VERTEX', '8', layers[i], '10', n(x), '20', n(y), '30', '0.0');
    out.push('0', 'SEQEND', '8', layers[i]);
  });
  out.push('0', 'ENDSEC', '0', 'EOF', '');
  return out.join('\n');
}

// ───────────────────────── THERM 7 (.thmx)

/** A tiny XML reader: { name, attrs, children, text } trees (no DTDs; entities and CDATA handled). */
function parseXml(text) {
  const src = String(text).replace(/^﻿/, '');
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[k];
  });
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { stack[stack.length - 1].text += decode(src.slice(i)); break; }
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); stack[stack.length - 1].text += src.slice(lt + 9, e < 0 ? src.length : e); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) { const e = src.indexOf('>', lt); i = e < 0 ? src.length : e + 1; continue; }
    // Find the end of the tag outside quoted attribute values.
    let j = lt + 1;
    let quote = null;
    while (j < src.length && (quote || src[j] !== '>')) { if (quote) { if (src[j] === quote) quote = null; } else if (src[j] === '"' || src[j] === "'") quote = src[j]; j++; }
    const body = src.slice(lt + 1, j);
    i = j + 1;
    if (body.startsWith('/')) {
      const name = body.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) if (stack[s].name.toLowerCase() === name) { stack.length = s; break; }
      continue;
    }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const nameMatch = inner.match(/^\s*([^\s/>]+)/);
    if (!nameMatch) continue;
    const node = { name: nameMatch[1], attrs: {}, children: [], text: '' };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"']+))/g;
    let m;
    const rest = inner.slice(nameMatch[0].length);
    while ((m = re.exec(rest))) node.attrs[m[1]] = decode(m[3] ?? m[4] ?? m[5] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

const lower = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
/** All descendants with one of the tag names (case- and punctuation-insensitive). */
function findAll(node, ...names) {
  const wanted = names.map(lower);
  const out = [];
  const walk = (n) => { for (const c of n.children) { if (wanted.includes(lower(c.name))) out.push(c); walk(c); } };
  walk(node);
  return out;
}
/** A field given as an attribute or as a child element's text (first of the aliases that exists). */
function prop(node, ...names) {
  const wanted = names.map(lower);
  for (const w of wanted) {
    const key = Object.keys(node.attrs).find((k) => lower(k) === w);
    if (key != null) return node.attrs[key].trim();
  }
  for (const w of wanted) {
    const child = node.children.find((c) => lower(c.name) === w);
    if (child) return child.text.trim();
  }
  return null;
}
const propNum = (node, ...names) => {
  const v = prop(node, ...names);
  const n = v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
const propFlag = (node, ...names) => {
  const v = prop(node, ...names);
  return v != null && /^(1|true|yes|on)$/i.test(v);
};
function pointsOf(node, scale) {
  return findAll(node, 'Point', 'Pt', 'Vertex')
    .map((p) => [propNum(p, 'x'), propNum(p, 'y'), propNum(p, 'index') ?? 0])
    .filter((p) => p[0] != null && p[1] != null)
    .map((p) => [p[0] * scale, p[1] * scale]);
}
const unitScale = (node, fallback = 1) => {
  const u = (prop(node, 'units', 'unit') ?? '').toLowerCase();
  return u === 'in' || u === 'inch' || u === 'inches' ? 25.4 : u === 'mm' ? 1 : u === 'm' ? 1000 : u === 'cm' ? 10 : u === 'ft' ? 304.8 : fallback;
};
const colorOf = (v) => {
  if (!v) return null;
  const m = String(v).match(/^(?:0x|#)?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : null;
};

/** Distance from (x, y) to the segment a–b. */
function segmentDistance(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

/** The model boundary type of a THERM boundary condition (flags, Type text or the name). */
function thermBcType(node) {
  const name = (prop(node, 'Name') ?? '').toLowerCase();
  const type = (prop(node, 'Type', 'BCType', 'Model') ?? '').toLowerCase();
  const H = propNum(node, 'H', 'FilmCoefficient', 'Hc', 'ConvectiveFilmCoefficient') ?? 0;
  const q = propNum(node, 'HeatFlux', 'Flux', 'q') ?? 0;
  if (/adiabatic/.test(name) || /adiabatic/.test(type)) return 'adiabatic';
  if (propFlag(node, 'ConstantTemperatureFlag', 'FixedTemperatureFlag') || /temperature|fixed/.test(type)) return 'temperature';
  if (propFlag(node, 'ConvectionFlag') || /convection|film/.test(type) || H > 0) return 'convection';
  if (propFlag(node, 'RadiationFlag') || /radiation/.test(type)) return 'radiation';
  if (propFlag(node, 'FluxFlag') || /flux/.test(type) || q !== 0) return 'flux';
  return 'adiabatic';
}

/**
 * Model from a THERM 7 .thmx section (XML): materials (Conductivity, emissivity; ρ/cp from the library when the
 * name matches, else rough defaults), polygons → bodies (moved so the lower-left corner is the origin), boundary
 * segments → boundary conditions (on a domain edge: that edge with a range; elsewhere: the nearest body with a
 * region). 2D, void background, depth 1000 mm (THERM works per metre of length).
 */
export function thermToModel(xmlText, { language = 'ko' } = {}) {
  const doc = parseXml(xmlText);
  const rootScale = /<units>\s*ip\s*<\/units>/i.test(String(xmlText)) ? 25.4 : 1;
  const materials = [];
  const matByName = new Map();
  const ensureMaterial = (name, node) => {
    const key = String(name ?? '').trim();
    if (matByName.has(key.toLowerCase())) return matByName.get(key.toLowerCase());
    let id = safeName(key, 'material');
    while (materials.some((m) => m.id === id)) id += '_';
    const props = node ? {
      k: propNum(node, 'Conductivity', 'K', 'ThermalConductivity', 'Lambda'),
      emissivity: propNum(node, 'Emissivity', 'EmissivityFront', 'EmissivityBack', 'Ei'),
      rho: propNum(node, 'Density', 'Rho'), cp: propNum(node, 'SpecificHeat', 'Cp'), color: colorOf(prop(node, 'RGBColor', 'Color')),
    } : {};
    if (props.k == null) delete props.k;
    for (const k of Object.keys(props)) if (props[k] == null) delete props[k];
    const material = materialForName(key || id, id, language, props);
    if (props.k == null && material.k == null) material.k = 0.025;
    materials.push(material);
    matByName.set(key.toLowerCase(), id);
    return id;
  };
  for (const node of findAll(doc, 'Material')) {
    const name = prop(node, 'Name');
    if (name != null && !node.children.some((c) => lower(c.name) === 'material')) ensureMaterial(name, node);
  }
  const bcDefs = new Map();
  for (const node of findAll(doc, 'BoundaryCondition', 'BC')) {
    const name = prop(node, 'Name');
    if (name == null || node.children.some((c) => lower(c.name) === 'point')) continue;
    const type = thermBcType(node);
    const T = propNum(node, 'Temperature', 'T', 'Tinf', 'AirTemperature');
    const radT = propNum(node, 'Tr', 'RadiationTemperature', 'Tamb');
    const emissivity = propNum(node, 'Ei', 'Emissivity', 'EmissivityModifier') ?? 0;
    const values = { type };
    if (type === 'temperature') values.T = T ?? 20;
    if (type === 'convection') Object.assign(values, { h: propNum(node, 'H', 'FilmCoefficient', 'Hc', 'ConvectiveFilmCoefficient') ?? 10, Tinf: T ?? 20, emissivity: propFlag(node, 'RadiationFlag') ? emissivity : 0 });
    if (type === 'radiation') Object.assign(values, { emissivity: emissivity || 0.9, Tamb: radT ?? T ?? 20 });
    if (type === 'flux') values.q = propNum(node, 'HeatFlux', 'Flux', 'q') ?? 0;
    bcDefs.set(name.toLowerCase(), { name, ...values });
  }
  const polys = [];
  for (const node of findAll(doc, 'Polygon')) {
    const pts = pointsOf(node, unitScale(node, rootScale));
    if (pts.length < 3) continue;
    const matName = prop(node, 'Material', 'MaterialName') ?? '';
    polys.push({ id: prop(node, 'ID', 'Id') ?? String(polys.length + 1), points: pts, material: ensureMaterial(matName, findAll(doc, 'Material').find((m) => (prop(m, 'Name') ?? '').toLowerCase() === matName.toLowerCase())) });
  }
  if (!polys.length) throw new Error('THERM file has no polygons');
  const segments = [];
  for (const node of findAll(doc, 'BCPolygon', 'BoundaryPolygon', 'BCSegment')) {
    const pts = pointsOf(node, unitScale(node, rootScale));
    if (pts.length < 2) continue;
    segments.push({ bc: prop(node, 'BC', 'BoundaryCondition', 'Name') ?? '', points: pts, polygon: prop(node, 'PolygonID') });
  }
  const all = polys.flatMap((p) => p.points);
  const x0 = Math.min(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1]));
  const W = Math.max(...all.map((p) => p[0])) - x0;
  const H = Math.max(...all.map((p) => p[1])) - y0;
  const move = (p) => [p[0] - x0, p[1] - y0];
  const taken = [];
  const bodies = polys.map((p, i) => {
    const id = newId('th', taken);
    taken.push(id);
    const name = `${materials.find((m) => m.id === p.material)?.name ?? 'Polygon'} ${i + 1}`;
    return outlineBody(p.points.map(move), { id, name, material: p.material, thermId: p.id });
  });
  // Grid: the smallest polygon gets at least two cells across, at most ~250 k cells.
  const feature = Math.min(...bodies.map((b) => { const bb = bodyBounds(b); return Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0); }).filter((v) => v > 0), Math.max(W, H));
  let cell = feature / 2;
  if ((W / cell) * (H / cell) > 250_000) cell = Math.sqrt((W * H) / 250_000);
  const domain = { dim: 2, width: W, height: H, depth: 1000, nx: Math.max(1, Math.ceil(W / cell - 1e-9)), ny: Math.max(1, Math.ceil(H / cell - 1e-9)), nz: 1, background: null };
  const dx = W / domain.nx;
  const dy = H / domain.ny;
  const tol = 1e-6 * Math.max(W, H);
  const boundaries = [];
  for (const seg of segments) {
    const def = bcDefs.get(seg.bc.toLowerCase()) ?? { name: seg.bc || 'Adiabatic', type: /adiabatic/i.test(seg.bc) || !seg.bc ? 'adiabatic' : 'convection' };
    const pts = seg.points.map(move);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [sx0, sx1, sy0, sy1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const { name, ...values } = def;
    const bc = { id: newId('bc', boundaries.map((b) => b.id)), name, ...values, range: null, region: null };
    if (xs.every((x) => Math.abs(x) < tol)) Object.assign(bc, { target: 'left', range: [sy0, sy1] });
    else if (xs.every((x) => Math.abs(x - W) < tol)) Object.assign(bc, { target: 'right', range: [sy0, sy1] });
    else if (ys.every((y) => Math.abs(y) < tol)) Object.assign(bc, { target: 'bottom', range: [sx0, sx1] });
    else if (ys.every((y) => Math.abs(y - H) < tol)) Object.assign(bc, { target: 'top', range: [sx0, sx1] });
    else {
      const mx = (sx0 + sx1) / 2;
      const my = (sy0 + sy1) / 2;
      let best = bodies.find((b) => seg.polygon != null && b.thermId === seg.polygon) ?? null;
      if (!best) {
        let bestDistance = Infinity;
        for (const b of bodies) {
          const outline = bodyOutline(b);
          for (let i = 0; i < outline.length; i++) {
            const dist = segmentDistance(mx, my, outline[i], outline[(i + 1) % outline.length]);
            if (dist < bestDistance) { bestDistance = dist; best = b; }
          }
        }
      }
      // Faces sit on cell edges, so a segment between cell lines still catches the faces within half a cell of it.
      const vertical = sx1 - sx0 < tol;
      const horizontal = sy1 - sy0 < tol;
      const px = vertical || !horizontal ? dx / 2 + tol : tol;
      const py = horizontal || !vertical ? dy / 2 + tol : tol;
      Object.assign(bc, { target: `body:${best.id}`, region: [sx0 - px, sy0 - py, sx1 + px, sy1 + py] });
    }
    boundaries.push(bc);
  }
  const title = findAll(doc, 'Title')[0]?.text.trim();
  return normalizeModel({
    name: title || (language === 'en' ? 'THERM import' : 'THERM 가져오기'),
    description: findAll(doc, 'Notes')[0]?.text.trim() ?? '',
    domain, materials, bodies: bodies.map(({ thermId, ...b }) => b), boundaries,
    ambient: 20, study: { type: 'steady' },
  });
}

/** Intersection parameter t on p→q with r→s, or null. */
function segmentHit(p, q, r, s) {
  const d1 = [q[0] - p[0], q[1] - p[1]];
  const d2 = [s[0] - r[0], s[1] - r[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-15) return null;
  const t = ((r[0] - p[0]) * d2[1] - (r[1] - p[1]) * d2[0]) / den;
  const u = ((r[0] - p[0]) * d1[1] - (r[1] - p[1]) * d1[0]) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * THERM 7-style .thmx XML of a 2D model: materials (THERM attributes plus Density / SpecificHeat), the thermal
 * boundary conditions, every visible body as a polygon (circles as 48-gons) and the exterior outline split into
 * BCPolygon segments carrying the condition that applies there (adiabatic where none does). The background
 * material is not written (THERM polygons must not overlap) and overlapping bodies are written as they are.
 */
export function modelToTherm(input) {
  const model = normalizeModel(input);
  const { width: W, height: H } = model.domain;
  const visible = model.bodies.filter((b) => !b.hidden);
  const outlines = visible.map((b) => bodyOutline(b));
  const usedMats = model.materials.filter((m) => visible.some((b) => b.material === m.id));
  const matNames = uniqueNamesKeep(usedMats.map((m) => m.name || m.id));
  const matName = new Map(usedMats.map((m, i) => [m.id, matNames[i]]));
  const thermal = model.boundaries.filter((bc) => ['temperature', 'flux', 'convection', 'radiation', 'adiabatic'].includes(bc.type));
  const bcNames = uniqueNamesKeep(thermal.map((bc) => bc.name || bc.id));
  const bcName = new Map(thermal.map((bc, i) => [bc, bcNames[i]]));
  const adiabaticName = bcNames.some((n) => n.toLowerCase() === 'adiabatic') ? 'Adiabatic (MyHeatManager)' : 'Adiabatic';
  const eps = 1e-5 * Math.max(W, H);
  const owner = (x, y) => {
    for (let i = visible.length - 1; i >= 0; i--) if (bodyContains(visible[i], x, y)) return visible[i];
    return null;
  };
  const pickBc = (body, mx, my) => {
    let best = null;
    let rank = -1;
    for (const bc of thermal) {
      let r;
      if (bc.target.startsWith('body:')) { if (bc.target !== `body:${body.id}`) continue; r = 2; }
      else if (bc.target === 'exterior') r = 0;
      else {
        const on = { left: Math.abs(mx) < eps, right: Math.abs(mx - W) < eps, bottom: Math.abs(my) < eps, top: Math.abs(my - H) < eps }[bc.target];
        if (!on) continue;
        if (bc.range) {
          const s = bc.target === 'left' || bc.target === 'right' ? my : mx;
          if (s < Math.min(...bc.range) - eps || s > Math.max(...bc.range) + eps) continue;
        }
        r = 1;
      }
      if (bc.region && !(mx >= bc.region[0] - eps && mx <= bc.region[2] + eps && my >= bc.region[1] - eps && my <= bc.region[3] + eps)) continue;
      if (r >= rank) { best = bc; rank = r; }
    }
    return best;
  };
  const segments = [];
  visible.forEach((body, bi) => {
    const pts = outlines[bi];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < eps) continue;
      const ts = [0, 1];
      outlines.forEach((other, oi) => {
        if (oi === bi) return;
        for (let j = 0; j < other.length; j++) {
          const r = other[j];
          const s = other[(j + 1) % other.length];
          const t = segmentHit(p, q, r, s);
          if (t != null) ts.push(t);
          if (segmentDistance(r[0], r[1], p, q) < eps) ts.push(((r[0] - p[0]) * (q[0] - p[0]) + (r[1] - p[1]) * (q[1] - p[1])) / (len * len));
        }
      });
      const sorted = [...new Set(ts.filter((t) => t >= 0 && t <= 1).map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
      const nx = (q[1] - p[1]) / len;
      const ny = -(q[0] - p[0]) / len;
      let run = null;
      for (let k = 0; k + 1 < sorted.length; k++) {
        const [t0, t1] = [sorted[k], sorted[k + 1]];
        if ((t1 - t0) * len < eps) continue;
        const mx = p[0] + (q[0] - p[0]) * (t0 + t1) / 2;
        const my = p[1] + (q[1] - p[1]) * (t0 + t1) / 2;
        const inner = owner(mx - nx * eps * 10, my - ny * eps * 10);
        const ox = mx + nx * eps * 10;
        const oy = my + ny * eps * 10;
        const outsideDomain = ox < -eps || oy < -eps || ox > W + eps || oy > H + eps;
        const exterior = inner === body && (outsideDomain || !owner(ox, oy));
        const bc = exterior ? pickBc(body, mx, my) : null;
        const name = exterior ? (bc ? bcName.get(bc) : adiabaticName) : null;
        const a = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0];
        const b = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
        if (run && run.name === name && name) run.b = b;
        else {
          if (run?.name) segments.push(run);
          run = { name, a, b, polygon: bi + 1, material: matName.get(body.material) };
        }
      }
      if (run?.name) segments.push(run);
    }
  });
  const hex = (c) => `0x${String(c ?? '#808080').replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase()}`;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<ThermModel>', '  <Version>1</Version>', '  <ThermVersion>Version 7.8 (MyHeatManager export)</ThermVersion>', '  <FileVersion>1</FileVersion>',
    `  <Title>${xmlEscape(model.name)}</Title>`, '  <CreatedBy>MyHeatManager</CreatedBy>', `  <Notes>${xmlEscape(model.description)}</Notes>`, '  <Units>SI</Units>', '  <Materials>'];
  usedMats.forEach((m) => {
    out.push(`    <Material Name="${xmlEscape(matName.get(m.id))}" Type="0" Conductivity="${num(m.k)}" Tir="0" EmissivityFront="${num(m.emissivity ?? 0.9)}" EmissivityBack="${num(m.emissivity ?? 0.9)}" RGBColor="${hex(m.color)}" Density="${num(m.rho)}" SpecificHeat="${num(m.cp)}" />`);
  });
  out.push('  </Materials>', '  <BoundaryConditions>');
  const bcLine = (name, flags) => {
    const f = { H: 0, HeatFlux: 0, Temperature: 0, Tr: 0, Hr: 0, Ei: 0, ConvectionFlag: 0, FluxFlag: 0, RadiationFlag: 0, ConstantTemperatureFlag: 0, ...flags };
    out.push(`    <BoundaryCondition Name="${xmlEscape(name)}" Type="0" H="${num(f.H)}" HeatFlux="${num(f.HeatFlux)}" Temperature="${num(f.Temperature)}" RGBColor="0x000000" Tr="${num(f.Tr)}" Hr="${num(f.Hr)}" Ei="${num(f.Ei)}" Viewfactor="1" RadiationModel="1" ConvectionFlag="${f.ConvectionFlag}" FluxFlag="${f.FluxFlag}" RadiationFlag="${f.RadiationFlag}" ConstantTemperatureFlag="${f.ConstantTemperatureFlag}" EmisModifier="1" />`);
  };
  bcLine(adiabaticName, {});
  for (const bc of thermal) {
    const name = bcName.get(bc);
    if (bc.type === 'temperature') bcLine(name, { Temperature: bc.T, ConstantTemperatureFlag: 1 });
    else if (bc.type === 'convection') bcLine(name, { H: bc.h, Temperature: bc.Tinf, Tr: bc.Tinf, Ei: bc.emissivity, ConvectionFlag: 1, RadiationFlag: bc.emissivity > 0 ? 1 : 0, Hr: bc.emissivity > 0 ? hRadiation(bc.emissivity, bc.Tinf) : 0 });
    else if (bc.type === 'radiation') bcLine(name, { Temperature: bc.Tamb, Tr: bc.Tamb, Ei: bc.emissivity, RadiationFlag: 1 });
    else if (bc.type === 'flux') bcLine(name, { HeatFlux: bc.q, FluxFlag: 1 });
    else bcLine(name, {});
  }
  out.push('  </BoundaryConditions>', '  <Polygons>');
  visible.forEach((body, i) => {
    const pts = outlines[i];
    out.push(`    <Polygon ID="${i + 1}" Material="${xmlEscape(matName.get(body.material) ?? body.material)}" NSides="${pts.length}" Type="1" units="mm">`);
    pts.forEach(([x, y], n) => out.push(`      <Point index="${n}" x="${num(x)}" y="${num(y)}" />`));
    out.push('    </Polygon>');
  });
  out.push('  </Polygons>', '  <Boundaries>');
  segments.forEach((s, i) => {
    out.push(`    <BCPolygon ID="${i + 1}" BC="${xmlEscape(s.name)}" units="mm" PolygonID="${s.polygon}" EnclosureID="0" MaterialName="${xmlEscape(s.material ?? '')}">`);
    out.push(`      <Point index="0" x="${num(s.a[0])}" y="${num(s.a[1])}" />`, `      <Point index="1" x="${num(s.b[0])}" y="${num(s.b[1])}" />`, '    </BCPolygon>');
  });
  out.push('  </Boundaries>', '</ThermModel>', '');
  return out.join('\n');
}

/** Unique display names (kept as they are, with " (2)" … appended to repeats). */
function uniqueNamesKeep(list) {
  const seen = new Map();
  return list.map((raw) => {
    const base = String(raw).trim() || 'item';
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} (${n})`;
  });
}
