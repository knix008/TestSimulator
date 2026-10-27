// Random numbers: rand, randn, randi, randperm, rng, RandStream.
// Generator: Mersenne Twister MT19937 seeded with init_genrand(seed) (seed 0 →
// 5489, the generator's classic default), doubles with 53 random bits from two
// draws, so `rng(0); rand` gives 0.8147236863931789 like the reference.
// Normal variates: Marsaglia–Tsang ziggurat (128 layers) on the same stream
// ('Ziggurat', default), Marsaglia polar ('Polar') or inversion ('Inversion').
// Exact randn sequences differ from the reference (its ziggurat variant is not
// published); the distribution is the same.
// 'philox', 'threefry', 'simdTwister', 'combRecursive', 'multFibonacci' and
// 'v4'/'v5uniform'/'v5normal' are accepted and map to the twister.
import { tensor, num, str, structOf, cell, isText, toStr, toNum, isStruct, isObject, object, MError, prod, stringArray } from '../../value.js';
import { E, F, H, sizeArgs, sfield, nv } from './_util.js';
import { norminv } from './_kernels.js';

const GEN_NAMES = ['twister', 'mt19937ar', 'simdtwister', 'dsfmt19937', 'combrecursive', 'mrg32k3a', 'multfibonacci', 'mlfg6331_64', 'philox', 'philox4x32_10', 'threefry', 'threefry4x64_20', 'v4', 'v5uniform', 'v5normal', 'shr3cong', 'swb2712'];
const canonType = (t) => {
  const s = t.toLowerCase();
  if (s === 'twister' || s === 'mt19937ar') return 'twister';
  if (!GEN_NAMES.includes(s)) throw E('rng:badGenerator', `Unknown random number generator '${t}'.`);
  if (s === 'philox4x32_10') return 'philox';
  if (s === 'threefry4x64_20') return 'threefry';
  if (s === 'dsfmt19937') return 'simdTwister';
  if (s === 'simdtwister') return 'simdTwister';
  if (s === 'mrg32k3a') return 'combRecursive';
  if (s === 'mlfg6331_64') return 'multFibonacci';
  return s === 'combrecursive' ? 'combRecursive' : s === 'multfibonacci' ? 'multFibonacci' : s;
};
const RS_TYPE = { twister: 'mt19937ar', simdTwister: 'dsfmt19937', combRecursive: 'mrg32k3a', multFibonacci: 'mlfg6331_64', philox: 'philox4x32_10', threefry: 'threefry4x64_20' };

// ------------------------------------------------------------ MT19937
export class MT {
  constructor(seed = 0, type = 'twister', normalTransform = 'Ziggurat') {
    this.mt = new Uint32Array(624); this.mti = 625; this.type = type; this.normalTransform = normalTransform; this.antithetic = false; this.fullPrecision = true;
    this.seed(seed);
  }
  seed(s) {
    this.seedValue = s;
    let x = s === 0 ? 5489 : s >>> 0;
    // reference maps seeds through uint32; type-specific offsets keep different generators distinct
    if (this.type !== 'twister' && this.type !== 'v5uniform' && this.type !== 'v5normal' && this.type !== 'v4') x = (x ^ (this.type.length * 0x9e3779b9)) >>> 0;
    const mt = this.mt; mt[0] = x;
    for (let i = 1; i < 624; i++) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = (Math.imul(1812433253, p) + i) >>> 0; }
    this.mti = 624; this.spare = null;
  }
  nextU32() {
    const mt = this.mt; let y;
    if (this.mti >= 624) {
      let kk = 0;
      for (; kk < 624 - 397; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + 397] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      for (; kk < 623; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + (397 - 624)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      y = (mt[623] & 0x80000000) | (mt[0] & 0x7fffffff); mt[623] = mt[396] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.mti = 0;
    }
    y = mt[this.mti++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  /** Uniform on (0,1), 53-bit resolution (0 is skipped like the reference). */
  rand() {
    let r;
    do { const a = this.nextU32() >>> 5, b = this.nextU32() >>> 6; r = (a * 67108864 + b) / 9007199254740992; } while (r === 0);
    return this.antithetic ? 1 - r : r;
  }
  randn() {
    const t = this.normalTransform.toLowerCase();
    if (t === 'polar') {
      if (this.spare != null) { const s = this.spare; this.spare = null; return s; }
      let u, v, s; do { u = 2 * this.rand() - 1; v = 2 * this.rand() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s); this.spare = v * m; return u * m;
    }
    if (t === 'inversion') return norminv(this.rand());
    return zig(this);
  }
  /** Integer in 1..n (ceil(rand*n)). */
  randi(n) { return Math.ceil(this.rand() * n); }
  getState() { const s = new Float64Array(625); for (let i = 0; i < 624; i++) s[i] = this.mt[i]; s[624] = this.mti; return s; }
  setState(s) { if (s.length < 625) throw E('rng:badState', 'Invalid generator state.'); for (let i = 0; i < 624; i++) this.mt[i] = s[i] >>> 0; this.mti = s[624]; this.spare = null; }
}

// ------------------------------------------------------------ ziggurat (Marsaglia & Tsang 2000)
const KN = new Int32Array(128), WN = new Float64Array(128), FN = new Float64Array(128);
(function zigset() {
  const m1 = 2147483648.0; let dn = 3.442619855899, tn = dn; const vn = 9.91256303526217e-3;
  const q = vn / Math.exp(-0.5 * dn * dn);
  KN[0] = Math.floor((dn / q) * m1); KN[1] = 0;
  WN[0] = q / m1; WN[127] = dn / m1;
  FN[0] = 1.0; FN[127] = Math.exp(-0.5 * dn * dn);
  for (let i = 126; i >= 1; i--) {
    dn = Math.sqrt(-2.0 * Math.log(vn / dn + Math.exp(-0.5 * dn * dn)));
    KN[i + 1] = Math.floor((dn / tn) * m1); tn = dn;
    FN[i] = Math.exp(-0.5 * dn * dn); WN[i] = dn / m1;
  }
})();
function zig(g) {
  const r = 3.442620;
  for (;;) {
    const hz = g.nextU32() | 0; const iz = hz & 127;
    if (Math.abs(hz) < KN[iz]) return hz * WN[iz];
    // nfix
    let x = hz * WN[iz];
    if (iz === 0) {
      let y;
      do { x = -Math.log(g.rand()) / r; y = -Math.log(g.rand()); } while (y + y < x * x);
      return hz > 0 ? r + x : -r - x;
    }
    if (FN[iz] + g.rand() * (FN[iz - 1] - FN[iz]) < Math.exp(-0.5 * x * x)) return x;
  }
}

// ------------------------------------------------------------ global stream
export function rngState(ctx) {
  if (!ctx.state.rng) ctx.state.rng = { global: new MT(0, 'twister') };
  return ctx.state.rng;
}
/** The global generator (an MT instance with rand(), randn(), randi(n)). */
export const globalGen = (ctx) => rngState(ctx).global;
/** Uniform draw from the global stream. */
export const urand = (ctx) => globalGen(ctx).rand();
/** Standard normal draw from the global stream. */
export const nrand = (ctx) => globalGen(ctx).randn();

// ------------------------------------------------------------ argument handling
const FLOAT_CLASSES = ['double', 'single'];
const INT_CLASSES = ['int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'];
function streamArg(args) {
  if (args.length && isObject(args[0]) && args[0].cls === 'RandStream') return [args[0]._gen, args.slice(1)];
  return [null, args];
}
function classAndLike(rest, allowInt) {
  let cls = 'double', complex = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!isText(a)) throw E('rand:badArg', 'Size inputs must be numeric scalars.');
    const s = toStr(a).toLowerCase();
    if (s === 'like') { const p = rest[++i]; if (!p) throw E('rand:badLike', "'like' needs a prototype."); cls = p.cls === 'logical' || p.cls === 'char' ? 'double' : p.cls; complex = !!p.im; continue; }
    if (FLOAT_CLASSES.includes(s) || (allowInt && INT_CLASSES.includes(s)) || (allowInt && s === 'logical')) { cls = s; continue; }
    if (s === 'seed' || s === 'state' || s === 'twister') throw E('rand:legacy', 'The legacy rand(\'seed\') syntax is not supported; use rng.');
    throw E('rand:badClass', `Unknown class or option '${toStr(a)}'.`);
  }
  if (!allowInt && !FLOAT_CLASSES.includes(cls)) throw E('rand:badClass', 'Class must be double or single.');
  return { cls, complex };
}
function fill(dims, cls, f, complex = false) {
  const n = prod(dims); const re = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = cls === 'single' ? Math.fround(f()) : f();
  let im = null;
  if (complex) { im = new Float64Array(n); for (let i = 0; i < n; i++) im[i] = cls === 'single' ? Math.fround(f()) : f(); }
  return tensor(cls, dims, re, im);
}

function genFor(ctx, g) { return g || globalGen(ctx); }

export function randImpl(args, ctx, kind) {
  const [g0, a] = streamArg(args); const g = genFor(ctx, g0);
  const { dims, rest } = sizeArgs(a);
  const { cls, complex } = classAndLike(rest, false);
  if (kind === 'n') return fill(dims, cls, () => g.randn(), complex);
  return fill(dims, cls, () => g.rand(), false);
}
export function randiImpl(args, ctx) {
  const [g0, a] = streamArg(args); const g = genFor(ctx, g0);
  if (!a.length) throw E('randi:noRange', 'randi needs the maximum value.');
  const r = F(a[0]); let lo = 1, hi;
  if (r.length === 1) hi = r[0]; else if (r.length === 2) { lo = r[0]; hi = r[1]; } else throw E('randi:badRange', 'The first input must be a scalar or a two-element vector.');
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw E('randi:badRange', 'IMAX must be a positive integer, or [IMIN IMAX] with IMIN <= IMAX.');
  const { dims, rest } = sizeArgs(a.slice(1));
  const { cls } = classAndLike(rest, true);
  const span = hi - lo + 1;
  const t = fill(dims, 'double', () => lo - 1 + g.randi(span));
  return cls === 'double' ? t : { ...t, cls };
}
export function randpermImpl(args, ctx) {
  const [g0, a] = streamArg(args); const g = genFor(ctx, g0);
  const n = toNum(a[0], 'N'); const k = a.length > 1 ? toNum(a[1], 'K') : n;
  if (!Number.isInteger(n) || n < 0) throw E('randperm:badN', 'N must be a non-negative integer.');
  if (!Number.isInteger(k) || k < 0 || k > n) throw E('randperm:badK', 'K must be an integer between 0 and N.');
  let out;
  if (k === n || k > n / 4) {
    // sort of uniform keys (stable)
    const keys = Array.from({ length: n }, (_, i) => [g.rand(), i]);
    keys.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    out = keys.slice(0, k).map((x) => x[1] + 1);
  } else {
    // partial Fisher-Yates via a sparse map
    const map = new Map(); out = [];
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(g.rand() * (n - i));
      const vj = map.has(j) ? map.get(j) : j; const vi = map.has(i) ? map.get(i) : i;
      map.set(j, vi); out.push(vj + 1);
    }
  }
  return tensor('double', [1, k], Float64Array.from(out));
}

// ------------------------------------------------------------ rng
function settings(g) {
  return structOf({ Type: str(g.type), Seed: num(g.seedValue), State: tensor('uint32', [625, 1], g.getState()) });
}
function rngImpl(args, nargout, ctx) {
  const st = rngState(ctx); const prev = settings(st.global);
  if (!args.length) return prev;
  const a0 = args[0];
  if (isStruct(a0)) {
    const type = canonType(toStr(sfield(a0, 'Type') || str('twister')));
    const seed = sfield(a0, 'Seed') ? toNum(sfield(a0, 'Seed')) : 0;
    const g = new MT(seed, type, st.global.normalTransform);
    const state = sfield(a0, 'State'); if (state && prod(state.dims) >= 625) g.setState(F(state));
    st.global = g;
    return nargout > 0 ? prev : undefined;
  }
  let seed = null, type = null;
  if (isText(a0)) {
    const s = toStr(a0).toLowerCase();
    if (s === 'default') { st.global = new MT(0, 'twister'); return nargout > 0 ? prev : undefined; }
    if (s === 'shuffle') seed = (Date.now() * 1000 + Math.floor(Math.random() * 1000)) % 4294967296;
    else throw E('rng:badArg', `Unknown rng option '${toStr(a0)}'. Use a seed, 'default' or 'shuffle'.`);
  } else {
    seed = toNum(a0, 'Seed');
    if (!Number.isInteger(seed) || seed < 0 || seed >= 4294967296) throw E('rng:badSeed', 'The seed must be a nonnegative integer less than 2^32.');
  }
  if (args.length > 1) type = canonType(toStr(args[1]));
  st.global = new MT(seed, type || st.global.type, st.global.normalTransform);
  return nargout > 0 ? prev : undefined;
}

// ------------------------------------------------------------ RandStream class
function makeStream(g) {
  return object('RandStream', {
    get Type() { return str(RS_TYPE[g.type] || g.type); },
    get Seed() { return num(g.seedValue); },
    NumStreams: num(1), StreamIndex: num(1),
    get State() { return tensor('uint32', [625, 1], g.getState()); },
    get Substream() { return num(1); },
    get NormalTransform() { return str(g.normalTransform); },
    get Antithetic() { return tensor('logical', [1, 1], [g.antithetic ? 1 : 0]); },
    get FullPrecision() { return tensor('logical', [1, 1], [1]); },
  }, { handle: true, extra: { _gen: g } });
}
function streamCreate(args) {
  if (!args.length || !isText(args[0])) throw E('RandStream:noType', 'RandStream requires a generator type.');
  const type = canonType(toStr(args[0]));
  const o = nv(args, 1, ['Seed', 'NormalTransform', 'NumStreams', 'StreamIndices', 'CellOutput']);
  let seed = 0; if (o.seed) { if (isText(o.seed)) seed = Date.now() % 4294967296; else seed = toNum(o.seed); }
  const g = new MT(seed, type, o.normaltransform ? toStr(o.normaltransform) : 'Ziggurat');
  const ns = o.numstreams ? toNum(o.numstreams) : 1;
  if (ns > 1) {
    const idx = o.streamindices ? Array.from(F(o.streamindices)) : Array.from({ length: ns }, (_, i) => i + 1);
    const items = idx.map((k) => { const gk = new MT(seed + 1000003 * (k - 1), type, g.normalTransform); const s = makeStream(gk); s.props.NumStreams = num(ns); s.props.StreamIndex = num(k); return s; });
    if (items.length === 1 && !(o.celloutput && toNum(o.celloutput))) return items[0];
    return cell([1, items.length], items);
  }
  return makeStream(g);
}
function streamProps(obj) { return ['Type', 'Seed', 'NumStreams', 'StreamIndex', 'State', 'Substream', 'NormalTransform', 'Antithetic', 'FullPrecision']; }

export const classes = {
  RandStream: {
    handle: true,
    props: streamProps(),
    construct(args, ctx) { return streamCreate(args); },
    statics: {
      create(args) { return streamCreate(args); },
      getGlobalStream(args, nargout, ctx) { const st = rngState(ctx); if (!st.globalObj || st.globalObj._gen !== st.global) st.globalObj = makeStream(st.global); return st.globalObj; },
      setGlobalStream(args, nargout, ctx) { const st = rngState(ctx); const prev = classes.RandStream.statics.getGlobalStream([], 1, ctx); const s = args[0]; if (!s || s.cls !== 'RandStream') throw E('RandStream:badStream', 'Input must be a RandStream.'); st.global = s._gen; st.globalObj = s; return prev; },
      list() { return cell([GEN_NAMES.length, 1], ['mt19937ar', 'dsfmt19937', 'mrg32k3a', 'mlfg6331_64', 'philox4x32_10', 'threefry4x64_20', 'shr3cong', 'swb2712', 'mcg16807'].map((s) => str(s))); },
    },
    methods: {
      rand(args, nargout, ctx) { return randImpl(args, ctx, 'u'); },
      randn(args, nargout, ctx) { return randImpl(args, ctx, 'n'); },
      randi(args, nargout, ctx) { return randiImpl(args, ctx); },
      randperm(args, nargout, ctx) { return randpermImpl(args, ctx); },
      reset(args) { const g = args[0]._gen; g.seed(args.length > 1 ? toNum(args[1]) : g.seedValue); return args[0]; },
    },
    subsasgn(obj, subs, rhs) {
      if (subs.length === 1 && subs[0].type === '.') {
        const p = subs[0].subs; const g = obj._gen;
        if (p === 'State') { g.setState(F(rhs)); return obj; }
        if (p === 'NormalTransform') { g.normalTransform = toStr(rhs); return obj; }
        if (p === 'Antithetic') { g.antithetic = toNum(rhs) !== 0; return obj; }
        if (p === 'Substream') return obj;
        throw E('RandStream:readOnly', `The '${p}' property of RandStream is read-only.`);
      }
      throw E('RandStream:badAssign', 'Unsupported assignment to a RandStream.');
    },
    display(obj, name) {
      const g = obj._gen;
      return `${name} = \n\nmt19937ar random stream\n`.replace('mt19937ar', RS_TYPE[g.type] || g.type) + (obj.props.NumStreams && toNum(obj.props.NumStreams) > 1 ? `      StreamIndex: ${toNum(obj.props.StreamIndex)}\n       NumStreams: ${toNum(obj.props.NumStreams)}\n` : '') +
        `             Seed: ${g.seedValue}\n  NormalTransform: ${g.normalTransform}\n`;
    },
  },
};

export const builtins = {
  rand(args, nargout, ctx) { return randImpl(args, ctx, 'u'); },
  randn(args, nargout, ctx) { return randImpl(args, ctx, 'n'); },
  randi(args, nargout, ctx) { return randiImpl(args, ctx); },
  randperm(args, nargout, ctx) { return randpermImpl(args, ctx); },
  rng: rngImpl,
  RandStream(args, nargout, ctx) { return streamCreate(args); },
};

export const help = {
  rand: H('Uniformly distributed random numbers on (0,1).', '(0,1) 구간의 균등 분포 난수.', ['X = rand', 'X = rand(n)', 'X = rand(sz1,...,szN)', 'X = rand(sz)', "X = rand(___, 'single')", "X = rand(___, 'like', p)", 'X = rand(s, ___)']),
  randn: H('Normally distributed random numbers (mean 0, standard deviation 1).', '표준 정규 분포 난수 (평균 0, 표준편차 1).', ['X = randn', 'X = randn(n)', 'X = randn(sz1,...,szN)', "X = randn(___, 'like', p)", 'X = randn(s, ___)']),
  randi: H('Uniformly distributed random integers.', '균등 분포 정수 난수.', ['X = randi(imax)', 'X = randi(imax, n)', 'X = randi([imin imax], sz1,...,szN)', "X = randi(___, 'int32')"]),
  randperm: H('Random permutation of integers 1..n.', '1..n 정수의 무작위 순열.', ['p = randperm(n)', 'p = randperm(n, k)', 'p = randperm(s, ___)']),
  rng: H("Controls the random number generator (seed, 'default', 'shuffle', generator type, saved settings).", "난수 생성기를 제어합니다 (시드, 'default', 'shuffle', 생성기 종류, 저장한 설정).", ['rng(seed)', "rng('default')", "rng('shuffle')", 'rng(seed, generator)', 's = rng', 'rng(s)', 't = rng(___)']),
  RandStream: H('Random number stream object (create, getGlobalStream, setGlobalStream, rand/randn/randi methods).', '난수 스트림 객체 (create, getGlobalStream, setGlobalStream, rand/randn/randi 메서드).', ["s = RandStream('mt19937ar', 'Seed', 1)", "s = RandStream.create('mrg32k3a', 'NumStreams', 3, 'StreamIndices', 1)", 's = RandStream.getGlobalStream', 'prev = RandStream.setGlobalStream(s)', 'x = rand(s, 3)', 'reset(s)']),
};

export function install(ctx) { rngState(ctx); }
