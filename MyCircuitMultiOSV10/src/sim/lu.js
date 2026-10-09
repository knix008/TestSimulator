// Dense LU solvers with partial pivoting, real and complex.
//
// Circuits here are small (< a few hundred unknowns), so a dense O(n^3)
// factorisation per Newton iteration is simpler and fast enough. Matrices are
// row-major Float64Arrays of n*n entries; inputs are copied, never modified.

export class SingularMatrixError extends Error {
  constructor(index) {
    super(`singular matrix at unknown ${index}`);
    this.index = index; // column (unknown) that had no usable pivot
  }
}

// A pivot this much smaller than the largest original entry of its column is
// treated as zero: that unknown is not determined by the equations (floating
// node, voltage-source loop, ...). Relative to the column so tiny gmin-only
// rows still count as determined.
const PIVOT_REL = 1e-13;

function columnMax(n, re, im) {
  const cm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      const a = im ? Math.hypot(re[k], im[k]) : Math.abs(re[k]);
      if (a > cm[j]) cm[j] = a;
    }
  }
  return cm;
}

export function solveReal(n, Ain, bin) {
  const A = Float64Array.from(Ain);
  const b = Float64Array.from(bin);
  const cm = columnMax(n, A, null);
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const a = Math.abs(A[i * n + k]);
      if (a > best) { best = a; p = i; }
    }
    if (!(best > PIVOT_REL * cm[k]) || best === 0) throw new SingularMatrixError(k);
    if (p !== k) {
      for (let j = k; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[k]; b[k] = b[p]; b[p] = t;
    }
    const piv = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / piv;
      if (f === 0) continue;
      A[i * n + k] = 0;
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      b[i] -= f * b[k];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
    x[i] = s / A[i * n + i];
  }
  return x;
}

// Complex version: separate real/imaginary arrays. Returns {re, im}.
export function solveComplex(n, Are, Aim, bre, bim) {
  const R = Float64Array.from(Are);
  const I = Float64Array.from(Aim);
  const br = Float64Array.from(bre);
  const bi = Float64Array.from(bim);
  const cm = columnMax(n, R, I);
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.hypot(R[k * n + k], I[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const a = Math.hypot(R[i * n + k], I[i * n + k]);
      if (a > best) { best = a; p = i; }
    }
    if (!(best > PIVOT_REL * cm[k]) || best === 0) throw new SingularMatrixError(k);
    if (p !== k) {
      for (let j = k; j < n; j++) {
        const a = k * n + j, c = p * n + j;
        let t = R[a]; R[a] = R[c]; R[c] = t;
        t = I[a]; I[a] = I[c]; I[c] = t;
      }
      let t = br[k]; br[k] = br[p]; br[p] = t;
      t = bi[k]; bi[k] = bi[p]; bi[p] = t;
    }
    const pr = R[k * n + k], pi = I[k * n + k];
    const pd = pr * pr + pi * pi;
    for (let i = k + 1; i < n; i++) {
      const ar = R[i * n + k], ai = I[i * n + k];
      if (ar === 0 && ai === 0) continue;
      // f = a / piv
      const fr = (ar * pr + ai * pi) / pd;
      const fi = (ai * pr - ar * pi) / pd;
      R[i * n + k] = 0; I[i * n + k] = 0;
      for (let j = k + 1; j < n; j++) {
        const cr = R[k * n + j], ci = I[k * n + j];
        R[i * n + j] -= fr * cr - fi * ci;
        I[i * n + j] -= fr * ci + fi * cr;
      }
      const cr = br[k], ci = bi[k];
      br[i] -= fr * cr - fi * ci;
      bi[i] -= fr * ci + fi * cr;
    }
  }
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sr = br[i], si = bi[i];
    for (let j = i + 1; j < n; j++) {
      const ar = R[i * n + j], ai = I[i * n + j];
      sr -= ar * xr[j] - ai * xi[j];
      si -= ar * xi[j] + ai * xr[j];
    }
    const pr = R[i * n + i], pi = I[i * n + i];
    const pd = pr * pr + pi * pi;
    xr[i] = (sr * pr + si * pi) / pd;
    xi[i] = (si * pr - sr * pi) / pd;
  }
  return { re: xr, im: xi };
}
