// The exchange-format jobs (the formats worker's, and the app's own when there are no workers, as under Node):
// IGES through the full OpenCASCADE build, Parasolid XT through cad/parasolid-brep.js.
export async function formatsJob(message) {
  const { kind } = message;
  if (kind === 'import-iges' || kind === 'export-iges') {
    const m = await import('../cad/occt-full.js');
    return kind === 'import-iges' ? m.igesToBrep(message.data) : m.brepToIges(message.brep, message);
  }
  if (kind === 'import-xt' || kind === 'export-xt') {
    const m = await import('../cad/parasolid-brep.js');
    if (kind === 'import-xt') return m.xtToBrep(message.data);
    return m.brepToXt(message.brep, { binary: Boolean(message.binary), file: message.file ?? '' });
  }
  throw new Error(`unknown request ${kind}`);
}
