// Rigid 3D transforms of solid placements (x, y, z, rx, ry, rz with
// R = Rz·Ry·Rx, as solids.js places them): matrices, Euler angles back from
// a matrix, and the best rotation + translation carrying points onto points
// (Horn's quaternion method) for Std_Alignment.

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** 3 × 3 rotation of a placement: R = Rz(rz) · Ry(ry) · Rx(rx). */
export function rotationOf({ rx = 0, ry = 0, rz = 0 } = {}) {
  const [ca, sa] = [Math.cos(rad(rx)), Math.sin(rad(rx))];
  const [cb, sb] = [Math.cos(rad(ry)), Math.sin(rad(ry))];
  const [cc, sc] = [Math.cos(rad(rz)), Math.sin(rad(rz))];
  return [
    [cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc],
    [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc],
    [-sb, sa * cb, ca * cb],
  ];
}

/** Euler angles (degrees) of a rotation matrix in the same convention. */
export function eulerOf(R) {
  const sb = Math.max(-1, Math.min(1, -R[2][0]));
  const b = Math.asin(sb);
  let a; let c;
  if (Math.abs(Math.cos(b)) > 1e-9) {
    a = Math.atan2(R[2][1], R[2][2]);
    c = Math.atan2(R[1][0], R[0][0]);
  } else {
    // Gimbal lock: rx and rz turn about the same axis; all of it goes into rx.
    a = Math.atan2(-R[1][2], R[1][1]);
    c = 0;
  }
  const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(9));
  return { rx: clean(deg(a)), ry: clean(deg(b)), rz: clean(deg(c)) };
}

export const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
export const apply = (R, p) => [0, 1, 2].map((i) => R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2]);

/** A placement moved by a rigid transform (rotation R about the origin, then translation t). */
export function transformPlacement(entity, R, t) {
  const rotation = mul(R, rotationOf(entity));
  const position = apply(R, [entity.x ?? 0, entity.y ?? 0, entity.z ?? 0]).map((v, i) => v + t[i]);
  const angles = eulerOf(rotation);
  return { x: +position[0].toFixed(9), y: +position[1].toFixed(9), z: +position[2].toFixed(9), ...angles };
}

/** Eigen decomposition of a symmetric matrix (Jacobi); returns { values, vectors (columns) }. */
export function symmetricEigen(input) {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p]; const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]; const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p]; const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

/**
 * The rigid transform carrying the points `from` onto `to` as well as possible
 * (least squares; Horn 1987). One pair: only a translation; two: the line through
 * them is matched; three or more: the full rotation. Returns { R, t, rms }.
 */
export function bestFit(from, to) {
  const n = Math.min(from.length, to.length);
  if (!n) return { R: rotationOf(), t: [0, 0, 0], rms: 0 };
  const mean = (list) => [0, 1, 2].map((i) => list.slice(0, n).reduce((sum, p) => sum + p[i], 0) / n);
  const ca = mean(from); const cb = mean(to);
  let R = rotationOf();
  if (n >= 2) {
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < n; k++) {
      const a = from[k].map((v, i) => v - ca[i]);
      const b = to[k].map((v, i) => v - cb[i]);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += a[i] * b[j];
    }
    const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S;
    const N = [
      [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
      [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
      [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
      [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
    ];
    const { values, vectors } = symmetricEigen(N);
    const best = values.indexOf(Math.max(...values));
    const [w, x, y, z] = vectors.map((row) => row[best]);
    R = [
      [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
    ];
  }
  const rotated = apply(R, ca);
  const t = cb.map((v, i) => v - rotated[i]);
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const p = apply(R, from[k]).map((v, i) => v + t[i]);
    sum += p.reduce((s, v, i) => s + (v - to[k][i]) ** 2, 0);
  }
  return { R, t, rms: Math.sqrt(sum / n) };
}
