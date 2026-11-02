// hgtransform support: applies a 4×4 transform Matrix to the coordinate data
// of the objects inside a transform group. Used for the axes extent
// (compute.js) and for the scene sent to the GUI (scene.js), where a
// transform node is sent as an 'hggroup' whose children already carry the
// transformed coordinates — the renderers need no transform support.

/** 4×4 row-major array from a Matrix Mat ({dims:[4,4], data column-major}); identity when unset. */
export function matrixOf(M) {
  const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  if (!M || !M.dims || M.dims[0] !== 4 || M.dims[1] !== 4) return I;
  const d = M.data;
  return [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => Number(d[i + 4 * j])));
}
export function isIdentity(T) { return T.every((r, i) => r.every((v, j) => v === (i === j ? 1 : 0))); }
export function mulMat(A, B) { return A.map((r) => [0, 1, 2, 3].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j] + r[3] * B[3][j])); }

function apply(T, x, y, z) {
  const w = T[3][0] * x + T[3][1] * y + T[3][2] * z + T[3][3] || 1;
  return [(T[0][0] * x + T[0][1] * y + T[0][2] * z + T[0][3]) / w, (T[1][0] * x + T[1][1] * y + T[1][2] * z + T[1][3]) / w, (T[2][0] * x + T[2][1] * y + T[2][2] * z + T[2][3]) / w];
}
const len = (M) => (M && M.data ? M.data.length : 0);
const mk = (dims, arr, like) => ({ dims: dims.slice(), data: like && Array.isArray(like.data) ? Array.from(arr) : Float64Array.from(arr) });

/** Transformed copy of an object's coordinate props (only the changed keys). */
export function transformProps(type, p, T) {
  const out = {};
  switch (type) {
    case 'line': case 'animatedline': case 'stem': case 'scatter': case 'stair': {
      const n = len(p.YData);
      if (!n) break;
      const X = p.XData, Y = p.YData, Z = p.ZData;
      const xs = [], ys = [], zs = [];
      for (let i = 0; i < n; i++) {
        const q = apply(T, len(X) === n ? X.data[i] : i + 1, Y.data[i], len(Z) === n ? Z.data[i] : 0);
        xs.push(q[0]); ys.push(q[1]); zs.push(q[2]);
      }
      const dims = Y.dims;
      out.XData = mk(dims, xs, Y); out.YData = mk(dims, ys, Y); out.ZData = mk(dims, zs, Y);
      break;
    }
    case 'surface': {
      const Z = p.ZData;
      if (!len(Z)) break;
      const [m, n] = Z.dims;
      const X = p.XData, Y = p.YData;
      const xAt = (i, j) => (len(X) === m * n ? X.data[i + j * m] : len(X) === n ? X.data[j] : j + 1);
      const yAt = (i, j) => (len(Y) === m * n ? Y.data[i + j * m] : len(Y) === m ? Y.data[i] : i + 1);
      const xs = new Array(m * n), ys = new Array(m * n), zs = new Array(m * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const k = i + j * m; const q = apply(T, xAt(i, j), yAt(i, j), Z.data[k]); xs[k] = q[0]; ys[k] = q[1]; zs[k] = q[2]; }
      out.XData = mk([m, n], xs, Z); out.YData = mk([m, n], ys, Z); out.ZData = mk([m, n], zs, Z);
      break;
    }
    case 'patch': {
      const V = p.Vertices;
      if (!len(V)) break;
      const [m, k] = V.dims;
      const d = new Array(m * 3);
      for (let i = 0; i < m; i++) { const q = apply(T, V.data[i], V.data[i + m], k > 2 ? V.data[i + 2 * m] : 0); d[i] = q[0]; d[i + m] = q[1]; d[i + 2 * m] = q[2]; }
      out.Vertices = mk([m, 3], d, V);
      break;
    }
    case 'text': case 'light': {
      const P = p.Position;
      if (Array.isArray(P) && P.length >= 2 && (type === 'light' || !p.Units || p.Units === 'data')) out.Position = apply(T, P[0], P[1], P[2] || 0);
      break;
    }
    case 'quiver': {
      const n = len(p.XData);
      if (!n) break;
      const xs = [], ys = [], zs = [], us = [], vs = [], ws = [];
      for (let i = 0; i < n; i++) {
        const x = p.XData.data[i], y = p.YData.data[i], z = len(p.ZData) === n ? p.ZData.data[i] : 0;
        const u = len(p.UData) === n ? p.UData.data[i] : 0, v = len(p.VData) === n ? p.VData.data[i] : 0, w = len(p.WData) === n ? p.WData.data[i] : 0;
        const a = apply(T, x, y, z), b = apply(T, x + u, y + v, z + w);
        xs.push(a[0]); ys.push(a[1]); zs.push(a[2]); us.push(b[0] - a[0]); vs.push(b[1] - a[1]); ws.push(b[2] - a[2]);
      }
      const dims = p.XData.dims;
      Object.assign(out, { XData: mk(dims, xs, p.XData), YData: mk(dims, ys, p.XData), ZData: mk(dims, zs, p.XData), UData: mk(dims, us, p.XData), VData: mk(dims, vs, p.XData), WData: mk(dims, ws, p.XData) });
      break;
    }
    default: break;
  }
  return out;
}

/** Calls fn(pseudoObject) for every leaf below a transform/group object, with coordinates transformed. */
export function forEachTransformedLeaf(st, o, T, fn) {
  for (const c of o.children) {
    const co = st.objs.get(c);
    if (!co || co.props.Visible === false) continue;
    if (co.type === 'hgtransform') { forEachTransformedLeaf(st, co, mulMat(T, matrixOf(co.props.Matrix)), fn); continue; }
    if (co.type === 'hggroup') { forEachTransformedLeaf(st, co, T, fn); continue; }
    fn({ ...co, props: { ...co.props, ...transformProps(co.type, co.props, T) } });
  }
}

/** Applies T to a serialized node subtree (in place). */
export function transformNode(node, T) {
  for (const c of node.children || []) {
    if (c.type === 'hggroup') { transformNode(c, T); continue; }
    Object.assign(c.props, transformProps(c.type, c.props, T));
    if (c.type === 'quiver') for (const k of ['Segments', 'Heads']) {
      const a = c.props[k];
      if (!Array.isArray(a)) continue;
      const b = new Array(a.length);
      for (let i = 0; i + 2 < a.length; i += 3) { const q = apply(T, a[i], a[i + 1], a[i + 2]); b[i] = q[0]; b[i + 1] = q[1]; b[i + 2] = q[2]; }
      c.props[k] = b;
    }
  }
}
