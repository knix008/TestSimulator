// Option structures: optimset / optimget (classic names) and optimoptions
// (solver-specific defaults with the current names). Both produce plain
// structs, and every solver reads old and new names alike.
import { str, num, bool, empty, struct, isText, toStr, isStruct, isFuncHandle, isObject, tensor } from '../../../value.js';
import { E, H, isEmptyV } from '../_util.js';

const OPTIMSET_FIELDS = [
  'Algorithm', 'AlwaysHonorConstraints', 'Diagnostics', 'DiffMaxChange', 'DiffMinChange', 'Display', 'FinDiffRelStep', 'FinDiffType',
  'FunValCheck', 'GradConstr', 'GradObj', 'HessFcn', 'Hessian', 'HessMult', 'HessPattern', 'InitBarrierParam', 'InitDamping',
  'InitTrustRegionRadius', 'Jacobian', 'JacobMult', 'JacobPattern', 'LargeScale', 'MaxFunEvals', 'MaxIter', 'MaxPCGIter',
  'MaxProjCGIter', 'MaxSQPIter', 'MaxTime', 'ObjectiveLimit', 'OutputFcn', 'PlotFcns', 'PrecondBandWidth', 'RelLineSrchBnd',
  'RelLineSrchBndDuration', 'ScaleProblem', 'SubproblemAlgorithm', 'TolCon', 'TolConSQP', 'TolFun', 'TolGradCon', 'TolPCG',
  'TolProjCG', 'TolProjCGAbs', 'TolX', 'TypicalX', 'UseParallel',
];
const NEW_TO_OLD = {
  maxiterations: 'MaxIter', maxfunctionevaluations: 'MaxFunEvals', optimalitytolerance: 'TolFun', functiontolerance: 'TolFun',
  steptolerance: 'TolX', constrainttolerance: 'TolCon', specifyobjectivegradient: 'GradObj', specifyconstraintgradient: 'GradConstr',
  finitedifferencetype: 'FinDiffType', plotfcn: 'PlotFcns', hessianfcn: 'HessFcn', finitedifferencestepsize: 'FinDiffRelStep',
};
const OLD_TO_NEW = {
  maxiter: 'MaxIterations', maxfunevals: 'MaxFunctionEvaluations', tolx: 'StepTolerance', tolcon: 'ConstraintTolerance',
  gradobj: 'SpecifyObjectiveGradient', gradconstr: 'SpecifyConstraintGradient', jacobian: 'SpecifyObjectiveGradient',
  findifftype: 'FiniteDifferenceType', plotfcns: 'PlotFcn', hessfcn: 'HessianFcn', findiffrelstep: 'FiniteDifferenceStepSize',
  generations: 'MaxGenerations', stallgenlimit: 'MaxStallGenerations', popinitrange: 'InitialPopulationRange', tolmesh: 'MeshTolerance',
  stalliterlimit: 'MaxStallIterations', initialpopulation: 'InitialPopulationMatrix', initialswarm: 'InitialSwarmMatrix',
  meshexpansion: 'MeshExpansionFactor', meshcontraction: 'MeshContractionFactor', completepoll: 'UseCompletePoll', tolinteger: 'IntegerTolerance',
  tolgaprel: 'RelativeGapTolerance', tolgapabs: 'AbsoluteGapTolerance', selfadjustment: 'SelfAdjustmentWeight', socialadjustment: 'SocialAdjustmentWeight',
};

const NV = 'numberOfVariables';
const F_ = false;
const common = (extra) => ({ Display: 'final', OutputFcn: [], PlotFcn: [], ...extra });
const SOLVER_DEFAULTS = {
  fmincon: common({ Algorithm: 'interior-point', ConstraintTolerance: 1e-6, EnableFeasibilityMode: F_, FiniteDifferenceStepSize: 'sqrt(eps)', FiniteDifferenceType: 'forward', HessianApproximation: 'bfgs', HessianFcn: [], MaxFunctionEvaluations: 3000, MaxIterations: 1000, ObjectiveLimit: -1e20, OptimalityTolerance: 1e-6, ScaleProblem: F_, SpecifyConstraintGradient: F_, SpecifyObjectiveGradient: F_, StepTolerance: 1e-10, TypicalX: `ones(${NV},1)`, UseParallel: F_ }),
  fminunc: common({ Algorithm: 'quasi-newton', FiniteDifferenceStepSize: 'sqrt(eps)', FiniteDifferenceType: 'forward', HessianFcn: [], MaxFunctionEvaluations: `100*${NV}`, MaxIterations: 400, ObjectiveLimit: -1e20, OptimalityTolerance: 1e-6, SpecifyObjectiveGradient: F_, StepTolerance: 1e-6, TypicalX: `ones(${NV},1)`, UseParallel: F_ }),
  fsolve: common({ Algorithm: 'trust-region-dogleg', FiniteDifferenceStepSize: 'sqrt(eps)', FiniteDifferenceType: 'forward', FunctionTolerance: 1e-6, MaxFunctionEvaluations: `100*${NV}`, MaxIterations: 400, OptimalityTolerance: 1e-6, SpecifyObjectiveGradient: F_, StepTolerance: 1e-6, TypicalX: `ones(${NV},1)`, UseParallel: F_ }),
  lsqnonlin: common({ Algorithm: 'trust-region-reflective', FiniteDifferenceStepSize: 'sqrt(eps)', FiniteDifferenceType: 'forward', FunctionTolerance: 1e-6, MaxFunctionEvaluations: `100*${NV}`, MaxIterations: 400, OptimalityTolerance: 1e-6, SpecifyObjectiveGradient: F_, StepTolerance: 1e-6, TypicalX: `ones(${NV},1)`, UseParallel: F_ }),
  linprog: common({ Algorithm: 'dual-simplex', ConstraintTolerance: 1e-4, MaxIterations: '10*(numberOfEqualities+numberOfInequalities+numberOfVariables)', MaxTime: Infinity, OptimalityTolerance: 1e-7 }),
  intlinprog: common({ AbsoluteGapTolerance: 0, BranchRule: 'reliability', ConstraintTolerance: 1e-4, Display: 'iter', Heuristics: 'basic', IntegerTolerance: 1e-5, MaxNodes: 1e7, MaxTime: 7200, ObjectiveCutOff: Infinity, RelativeGapTolerance: 1e-4 }),
  quadprog: common({ Algorithm: 'interior-point-convex', ConstraintTolerance: 1e-8, LinearSolver: 'auto', MaxIterations: 200, OptimalityTolerance: 1e-8, StepTolerance: 1e-12 }),
  lsqlin: common({ Algorithm: 'interior-point', ConstraintTolerance: 1e-8, LinearSolver: 'auto', MaxIterations: 200, OptimalityTolerance: 1e-8, StepTolerance: 1e-12 }),
  fminimax: common({ AbsoluteMaxObjectiveCount: 0, ConstraintTolerance: 1e-6, FiniteDifferenceStepSize: 'sqrt(eps)', FiniteDifferenceType: 'forward', FunctionTolerance: 1e-6, MaxFunctionEvaluations: `100*${NV}`, MaxIterations: `400*${NV}`, OptimalityTolerance: 1e-6, SpecifyConstraintGradient: F_, SpecifyObjectiveGradient: F_, StepTolerance: 1e-6, TypicalX: `ones(${NV},1)`, UseParallel: F_ }),
  ga: common({ ConstraintTolerance: 1e-3, CreationFcn: [], CrossoverFcn: [], CrossoverFraction: 0.8, EliteCount: '0.05*PopulationSize', FitnessLimit: -Infinity, FitnessScalingFcn: 'fitscalingrank', FunctionTolerance: 1e-6, HybridFcn: [], InitialPopulationMatrix: [], InitialPopulationRange: [-10, 10], InitialScoresMatrix: [], MaxGenerations: `100*${NV}`, MaxStallGenerations: 50, MaxStallTime: Infinity, MaxTime: Infinity, MutationFcn: [], NonlinearConstraintAlgorithm: 'auglag', PopulationSize: `50 when ${NV} <= 5, else 200`, PopulationType: 'doubleVector', SelectionFcn: 'selectionstochunif', UseParallel: F_, UseVectorized: F_ }),
  particleswarm: common({ CreationFcn: 'pswcreationuniform', FunctionTolerance: 1e-6, HybridFcn: [], InertiaRange: [0.1, 1.1], InitialSwarmMatrix: [], InitialSwarmSpan: 2000, MaxIterations: `200*${NV}`, MaxStallIterations: 20, MaxStallTime: Infinity, MaxTime: Infinity, MinNeighborsFraction: 0.25, ObjectiveLimit: -Infinity, SelfAdjustmentWeight: 1.49, SocialAdjustmentWeight: 1.49, SwarmSize: `min(100,10*${NV})`, UseParallel: F_, UseVectorized: F_ }),
  simulannealbnd: common({ AcceptanceFcn: 'acceptancesa', AnnealingFcn: 'annealingfast', DataType: 'double', FunctionTolerance: 1e-6, HybridFcn: [], HybridInterval: 'end', InitialTemperature: 100, MaxFunctionEvaluations: `3000*${NV}`, MaxIterations: Infinity, MaxStallIterations: `500*${NV}`, MaxTime: Infinity, ObjectiveLimit: -Infinity, ReannealInterval: 100, TemperatureFcn: 'temperatureexp' }),
  patternsearch: common({ AccelerateMesh: F_, ConstraintTolerance: 1e-6, FunctionTolerance: 1e-6, InitialMeshSize: 1, MaxFunctionEvaluations: `2000*${NV}`, MaxIterations: `100*${NV}`, MaxTime: Infinity, MeshContractionFactor: 0.5, MeshExpansionFactor: 2, MeshTolerance: 1e-6, PollMethod: 'GPSPositiveBasis2N', PollOrderAlgorithm: 'consecutive', ScaleMesh: true, SearchFcn: [], StepTolerance: 1e-6, UseCompletePoll: F_, UseCompleteSearch: F_, UseParallel: F_, UseVectorized: F_ }),
  fminsearch: { Display: 'notify', FunValCheck: 'off', MaxFunEvals: `200*${NV}`, MaxIter: `200*${NV}`, OutputFcn: [], PlotFcns: [], TolFun: 1e-4, TolX: 1e-4 },
  fminbnd: { Display: 'notify', FunValCheck: 'off', MaxFunEvals: 500, MaxIter: 500, OutputFcn: [], PlotFcns: [], TolX: 1e-4 },
  fzero: { Display: 'notify', FunValCheck: 'off', OutputFcn: [], PlotFcns: [], TolX: 2.220446049250313e-16 },
  lsqnonneg: { Display: 'notify', TolX: '10*eps*norm(c,1)*length(c)' },
};
SOLVER_DEFAULTS.lsqcurvefit = SOLVER_DEFAULTS.lsqnonlin;
SOLVER_DEFAULTS.fgoalattain = { ...SOLVER_DEFAULTS.fminimax, GoalsExactAchieve: 0 }; delete SOLVER_DEFAULTS.fgoalattain.AbsoluteMaxObjectiveCount;

const jsToValue = (v) => {
  if (v === null || (Array.isArray(v) && !v.length)) return empty();
  if (typeof v === 'boolean') return bool(v);
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) return tensor('double', [v.length === 2 && v[0] === -10 ? 2 : 1, v.length === 2 && v[0] === -10 ? 1 : v.length], Float64Array.from(v));
  return v;
};
const mkStruct = (fields, values) => { const r = Object.create(null); fields.forEach((f, i) => { r[f] = values[i]; }); return struct([1, 1], fields, [r]); };
const normVal = (v) => {
  if (isText(v)) { const s = toStr(v).toLowerCase(); if (s === 'on' || s === 'true') return bool(true); if (s === 'off' || s === 'false') return bool(false); }
  return v;
};

function solverName(v) {
  if (isFuncHandle(v)) return v.name || '';
  if (isText(v)) return toStr(v);
  return null;
}

function optimset(args, nargout, ctx) {
  if (!args.length) {
    if (nargout === 0) {
      ctx.out(OPTIMSET_FIELDS.map((f) => `${f.padStart(24)}: ${f === 'Display' ? "[ off | iter | iter-detailed | notify | notify-detailed | final | final-detailed ]" : '[ value ]'}`).join('\n') + '\n');
      return undefined;
    }
    return mkStruct(OPTIMSET_FIELDS, OPTIMSET_FIELDS.map(() => empty()));
  }
  const fields = OPTIMSET_FIELDS.slice(); const vals = Object.create(null);
  for (const f of fields) vals[f] = empty();
  const canon = (name) => {
    const k = name.toLowerCase();
    let f = fields.find((x) => x.toLowerCase() === k);
    if (!f && NEW_TO_OLD[k]) f = NEW_TO_OLD[k];
    if (!f) { const c = fields.filter((x) => x.toLowerCase().startsWith(k)); if (c.length === 1) f = c[0]; }
    if (!f) {
      // toolbox-specific names (ga, patternsearch ...) are kept as given
      const nf = OLD_TO_NEW[k] || name; if (!fields.includes(nf)) { fields.push(nf); vals[nf] = empty(); } f = nf;
    }
    return f;
  };
  let i = 0;
  if (isText(args[0]) && args.length === 1) {
    const s = toStr(args[0]); const d = SOLVER_DEFAULTS[s];
    if (!d) throw E('optimset:invalidFunction', `No default options available for the function '${s}'.`);
    for (const [k, v] of Object.entries(d)) { const f = canon(k); vals[f] = jsToValue(v); }
    return mkStruct(fields, fields.map((f) => vals[f]));
  }
  if (isFuncHandle(args[0]) && args.length === 1) return optimset([str(args[0].name || '')], nargout, ctx);
  while (i < args.length && (isStruct(args[i]) || isEmptyV(args[i]) && !isText(args[i]))) {
    const s = args[i];
    if (isStruct(s) && s.data.length) for (const f0 of s.fields) { const v = s.data[0][f0]; const f = canon(f0); if (!isEmptyV(v) || isFuncHandle(v)) vals[f] = v; }
    i++;
  }
  while (i < args.length) {
    if (!isText(args[i])) throw E('optimset:invalidArgument', `Expected an option name at argument ${i + 1}.`);
    if (i + 1 >= args.length) throw E('optimset:invalidArgument', `Option '${toStr(args[i])}' needs a value.`);
    const f = canon(toStr(args[i])); vals[f] = args[i + 1]; i += 2;
  }
  return mkStruct(fields, fields.map((f) => vals[f]));
}

function optimget(args) {
  if (args.length < 2) throw E('optimget:notEnoughInputs', 'optimget requires an options structure and an option name.');
  const o = args[0]; const name = toStr(args[1]).toLowerCase(); const def = args.length > 2 ? args[2] : empty();
  if (isEmptyV(o)) return def;
  const cands = [name, (NEW_TO_OLD[name] || '').toLowerCase(), (OLD_TO_NEW[name] || '').toLowerCase()].filter(Boolean);
  if (isStruct(o)) {
    for (const c of cands) { const f = o.fields.find((x) => x.toLowerCase() === c); if (f !== undefined) { const v = o.data[0][f]; return isEmptyV(v) && !isFuncHandle(v) ? def : v; } }
    if (OPTIMSET_FIELDS.some((x) => x.toLowerCase() === name)) return def;
    throw E('optimget:invalidProperty', `Unrecognized property name '${toStr(args[1])}'.`);
  }
  if (isObject(o) && o.props) { for (const c of cands) { const k = Object.keys(o.props).find((x) => x.toLowerCase() === c); if (k) return o.props[k]; } }
  return def;
}

function optimoptions(args, nargout, ctx) {
  if (!args.length) throw E('optimoptions:notEnoughInputs', 'optimoptions requires a solver name or an options object.');
  let solver, base = null, i = 1;
  if (isStruct(args[0])) {
    base = args[0];
    const sn = base.fields.find((f) => f === 'SolverName');
    solver = sn ? toStr(base.data[0][sn]) : null;
    if (args.length > 1 && (isText(args[1]) || isFuncHandle(args[1])) && SOLVER_DEFAULTS[solverName(args[1])]) {
      // optimoptions(newSolver, oldOptions) handled below; optimoptions(oldOptions, ...) otherwise
    }
    if (!solver) throw E('optimoptions:noSolver', 'The options structure has no SolverName; create it with optimoptions(solver, ...).');
  } else {
    solver = solverName(args[0]);
    if (solver === null) throw E('optimoptions:badSolver', 'The first argument must be a solver name or function handle.');
    if (args.length > 1 && isStruct(args[1])) { base = args[1]; i = 2; }
  }
  const d = SOLVER_DEFAULTS[solver];
  if (!d) throw E('optimoptions:invalidSolver', `'${solver}' is not a known solver.`);
  const fields = ['SolverName', ...Object.keys(d)]; const vals = Object.create(null);
  vals.SolverName = str(solver);
  for (const [k, v] of Object.entries(d)) vals[k] = jsToValue(v);
  const canon = (name, strict) => {
    const k = name.toLowerCase();
    let f = fields.find((x) => x.toLowerCase() === k);
    if (!f && OLD_TO_NEW[k]) f = fields.find((x) => x.toLowerCase() === OLD_TO_NEW[k].toLowerCase());
    if (!f && k === 'tolfun') f = fields.includes('OptimalityTolerance') ? 'OptimalityTolerance' : fields.includes('FunctionTolerance') ? 'FunctionTolerance' : undefined;
    if (!f && k === 'plotfcns') f = 'PlotFcn';
    if (!f && strict) throw E('optimoptions:invalidOption', `'${name}' is not an option for ${solver.toUpperCase()}.`);
    return f;
  };
  if (base) for (const f0 of base.fields) { if (f0 === 'SolverName') continue; const f = canon(f0, false); if (f) vals[f] = base.data[0][f0]; }
  if (isStruct(args[0])) i = 1;
  while (i < args.length) {
    if (!isText(args[i])) throw E('optimoptions:invalidArgument', `Expected an option name at argument ${i + 1}.`);
    if (i + 1 >= args.length) throw E('optimoptions:invalidArgument', `Option '${toStr(args[i])}' needs a value.`);
    const f = canon(toStr(args[i]), true);
    vals[f] = /^Specify|^Use|^Enable/.test(f) ? normVal(args[i + 1]) : args[i + 1];
    i += 2;
  }
  return mkStruct(fields, fields.map((f) => vals[f]));
}

export const builtins = { optimset, optimget, optimoptions };
export const help = {
  optimset: H('Creates or changes an optimization options structure (classic option names); optimset(solver) gives that solver\'s defaults.', '최적화 옵션 구조체를 만들거나 바꿉니다 (기존 옵션 이름); optimset(solver) 는 해당 솔버의 기본값을 줍니다.', ['options = optimset(Name, Value, ...)', 'optimset', 'options = optimset', "options = optimset('fminsearch')", 'options = optimset(oldopts, Name, Value)', 'options = optimset(oldopts, newopts)']),
  optimget: H('Value of an option in an optimization options structure (old and new names accepted).', '최적화 옵션 구조체에서 옵션 값을 가져옵니다 (기존·새 이름 모두 허용).', ['val = optimget(options, name)', 'val = optimget(options, name, default)']),
  optimoptions: H('Solver-specific optimization options with defaults (current option names; old names are converted).', '솔버별 기본값을 가진 최적화 옵션 (현재 옵션 이름; 기존 이름은 변환됩니다).', ["options = optimoptions('fmincon')", "options = optimoptions(@fminunc, 'Algorithm', 'quasi-newton')", 'options = optimoptions(oldoptions, Name, Value)', "options = optimoptions('fsolve', oldoptions)"]),
};
