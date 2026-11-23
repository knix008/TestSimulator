// The full OpenCASCADE build (opencascade.js, LGPL-2.1) for the exchange formats the modelling kernel (replicad's
// smaller build) does not carry: IGES read and write. Loaded only when such a file is opened or saved (the app runs
// it in a worker: src/workers/formats-worker.js). Shapes cross between the two builds as BREP text
// (BRepTools' own format), which both read and write.
//
// Under Node (the unit tests) the package's node entry is used; in the app Vite hands out the wasm's URL.

// Node-only entry, named through a variable so Vite leaves it alone.
const NODE_ENTRY = 'opencascade.js/dist/node.js';
let loading = null;

/** The full kernel (cached). */
export function loadFullKernel() {
  loading ??= (async () => {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node) && typeof window === 'undefined' && typeof self === 'undefined';
    if (isNode) {
      const { default: init } = await import(/* @vite-ignore */ NODE_ENTRY);
      return init();
    }
    const [{ default: mainJS }, { default: wasmUrl }] = await Promise.all([
      import('opencascade.js/dist/opencascade.full.js'),
      import('opencascade.js/dist/opencascade.full.wasm?url'),
    ]);
    return new mainJS({ locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : path) });
  })();
  return loading;
}

let files = 0;
const tempName = (ext) => `/x${++files}.${ext}`;
const progress = (oc) => new oc.Message_ProgressRange_1();
const unlink = (oc, ...names) => { for (const n of names) { try { oc.FS.unlink(n); } catch { /* not there */ } } };

/** BREP text of the shape in an IGES file (bytes or text); throws { code: 'iges-read' | 'iges-empty' }. */
export async function igesToBrep(data) {
  const oc = await loadFullKernel();
  const inName = tempName('igs'); const outName = tempName('brep');
  oc.FS.writeFile(inName, typeof data === 'string' ? data : new Uint8Array(data));
  const reader = new oc.IGESControl_Reader_1();
  try {
    const status = reader.ReadFile(inName);
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw Object.assign(new Error('the IGES file could not be read'), { code: 'iges-read' });
    reader.TransferRoots(progress(oc));
    if (!(reader.NbShapes() > 0)) throw Object.assign(new Error('the IGES file holds no shape'), { code: 'iges-empty' });
    let shape = reader.OneShape();
    // Trimmed surfaces (type 144) arrive as loose faces: sewn into shells, and each closed shell made a solid.
    if (!count(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID) && count(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_FACE)) shape = sewSolids(oc, shape);
    if (!oc.BRepTools.Write_3(shape, outName, progress(oc))) throw Object.assign(new Error('the shape could not be written'), { code: 'iges-read' });
    return oc.FS.readFile(outName, { encoding: 'utf8' });
  } finally { reader.delete(); unlink(oc, inName, outName); }
}

/** The shape in BREP text (the form shapes cross between the two kernels). */
export function shapeFromBrep(oc, brep) {
  const name = tempName('brep');
  oc.FS.writeFile(name, brep);
  const shape = new oc.TopoDS_Shape(); const builder = new oc.BRep_Builder();
  try {
    if (!oc.BRepTools.Read_2(shape, name, builder, progress(oc))) throw Object.assign(new Error('the shape could not be read'), { code: 'brep-read' });
    return shape;
  } finally { builder.delete(); unlink(oc, name); }
}

/** BREP text of a shape. */
export function brepOfShape(oc, shape) {
  const name = tempName('brep');
  try {
    if (!oc.BRepTools.Write_3(shape, name, progress(oc))) throw Object.assign(new Error('the shape could not be written'), { code: 'brep-write' });
    return oc.FS.readFile(name, { encoding: 'utf8' });
  } finally { unlink(oc, name); }
}

/** How many sub-shapes of a kind a shape holds. */
export function count(oc, shape, kind) {
  const ex = new oc.TopExp_Explorer_2(shape, kind, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { for (; ex.More(); ex.Next()) n++; } finally { ex.delete(); }
  return n;
}

/**
 * Loose faces sewn (tolerance 1e-3 mm, the usual exchange-file gap) into shells; every closed shell becomes a
 * solid (oriented outward by ShapeFix_Solid). Open shells are kept as they are, in a compound with the solids.
 */
export function sewSolids(oc, shape) {
  const sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
  try {
    sew.Add(shape);
    sew.Perform(progress(oc));
    const sewn = sew.SewedShape();
    const out = new oc.TopoDS_Compound(); const b = new oc.BRep_Builder(); b.MakeCompound(out);
    const ex = new oc.TopExp_Explorer_2(sewn, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let added = 0;
    try {
      for (; ex.More(); ex.Next()) {
        const shell = oc.TopoDS.Shell_1(ex.Current());
        let piece = shell;
        if (oc.BRep_Tool.IsClosed_1(shell)) {
          const fix = new oc.ShapeFix_Solid_1();
          try { const solid = fix.SolidFromShell(shell); if (!solid.IsNull()) piece = solid; } finally { fix.delete(); }
        }
        b.Add(out, piece); added++;
      }
    } finally { ex.delete(); }
    return added ? out : sewn;
  } finally { sew.delete(); }
}

/**
 * IGES text of a shape given as BREP text. `mode` 'brep' writes it as a manifold solid (IGES 5.3 type 186 with its
 * shells and faces — what CAD programs read back as solids), 'faces' as trimmed surfaces (type 144, read by every
 * IGES reader). `unit` 'MM' or 'IN'.
 */
export async function brepToIges(brep, { unit = 'MM', mode = 'brep' } = {}) {
  const oc = await loadFullKernel();
  const inName = tempName('brep'); const outName = tempName('igs');
  oc.FS.writeFile(inName, brep);
  const shape = new oc.TopoDS_Shape(); const builder = new oc.BRep_Builder();
  const writer = new oc.IGESControl_Writer_2(unit, mode === 'faces' ? 0 : 1);
  try {
    if (!oc.BRepTools.Read_2(shape, inName, builder, progress(oc))) throw Object.assign(new Error('the shape could not be read'), { code: 'iges-write' });
    if (!writer.AddShape(shape, progress(oc))) throw Object.assign(new Error('the shape could not be written as IGES'), { code: 'iges-write' });
    writer.ComputeModel();
    if (!writer.Write_2(outName, false)) throw Object.assign(new Error('the IGES file could not be written'), { code: 'iges-write' });
    return oc.FS.readFile(outName, { encoding: 'utf8' });
  } finally { writer.delete(); builder.delete(); shape.delete(); unlink(oc, inName, outName); }
}
