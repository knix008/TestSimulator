/* Image fusion (PET/CT, SPECT/CT, MR over CT…): a second DICOM image laid over the shown one in
 * a colour map, resampled through patient coordinates (Image Position / Orientation), as in RadiAnt.
 *
 *   Fusion.compose({ base, baseFrame, baseRgba, overlay, colormap, opacity, threshold }) → Promise<{ rgba, matched }>
 *     base / overlay: DicomDecoder images; for a multi-frame overlay the slice nearest to the base plane is used.
 *     Without geometry on both sides, or when the two do not overlap in patient space at all (different
 *     scans), the overlay is stretched over the base (noOverlap: true in the second case).
 *   Fusion.mapper(gBase, gOverlay) → (x, y) → [u, v] | null      (pure, tested)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fusion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  function geometry(img, frame) {
    const fi = img.frameInfo(frame);
    return fi && fi.position && fi.orientation ? { o: fi.position, r: fi.orientation.slice(0, 3), c: fi.orientation.slice(3, 6), sp: fi.pixelSpacing || [1, 1], w: img.width, h: img.height } : null;
  }

  /** Base pixel (x, y) → overlay pixel (u, v), through patient space. */
  function mapper(gb, go) {
    if (!gb || !go) return null;
    return (x, y) => {
      const w = [0, 1, 2].map((k) => gb.o[k] + x * gb.sp[1] * gb.r[k] + y * gb.sp[0] * gb.c[k]);
      const d = [w[0] - go.o[0], w[1] - go.o[1], w[2] - go.o[2]];
      return [dot(d, go.r) / go.sp[1], dot(d, go.c) / go.sp[0]];
    };
  }

  /** The overlay frame whose plane is nearest to the base plane (multi-frame PET, dose…). */
  function nearestFrame(gb, overlay) {
    if (!gb || overlay.frames < 2) return 0;
    const n = cross(gb.r, gb.c);
    let best = 0, bestD = Infinity;
    for (let f = 0; f < overlay.frames; f++) {
      const g = geometry(overlay, f);
      if (!g) return 0;
      const d = Math.abs(dot([g.o[0] - gb.o[0], g.o[1] - gb.o[1], g.o[2] - gb.o[2]], n));
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  async function compose({ base, baseFrame = 0, baseRgba, overlay, colormap = 'hotiron', opacity = 0.5, threshold = 0.05, lut }) {
    const W = base.width, H = base.height;
    const gb = geometry(base, baseFrame);
    const frame = nearestFrame(gb, overlay);
    const go = geometry(overlay, frame);
    // the overlay in its own window, grey; then the colour map of its brightness
    const r = await overlay.render({ frame, colormap: 'gray', invert: false });
    const ow = r.width, oh = r.height, src = r.rgba;
    const table = lut || (typeof window !== 'undefined' && window.DicomDecoder ? window.DicomDecoder.colormap(colormap) : null);
    const a0 = Math.max(0, Math.min(1, opacity));
    const cut = Math.round(threshold * 255);
    const blend = (map) => {
      const out = new Uint8ClampedArray(baseRgba);
      let matched = 0, inside = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let u, v;
          if (map) { [u, v] = map(x + 0.5, y + 0.5); u = Math.floor(u); v = Math.floor(v); }
          else { u = Math.floor((x + 0.5) * ow / W); v = Math.floor((y + 0.5) * oh / H); }
          if (u < 0 || v < 0 || u >= ow || v >= oh) continue;
          inside++;
          const g = src[(v * ow + u) * 4];
          if (g <= cut) continue;
          matched++;
          const o = (y * W + x) * 4;
          const cr = table ? table[g * 3] : g, cg = table ? table[g * 3 + 1] : g, cb = table ? table[g * 3 + 2] : g;
          out[o] = out[o] + (cr - out[o]) * a0;
          out[o + 1] = out[o + 1] + (cg - out[o + 1]) * a0;
          out[o + 2] = out[o + 2] + (cb - out[o + 2]) * a0;
        }
      }
      return { rgba: out, matched, inside };
    };
    const map = mapper(gb, go);
    let res = blend(map), noOverlap = false;
    if (map && !res.inside) { res = blend(null); noOverlap = true; }
    return { rgba: res.rgba, matched: res.matched, frame, resampled: !!map && !noOverlap, noOverlap };
  }

  return { compose, mapper, nearestFrame, geometry };
});
