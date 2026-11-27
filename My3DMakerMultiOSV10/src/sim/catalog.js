// The analysis systems, boundary conditions and result quantities. The user interface (toolbox,
// outline, details, ribbon, result lists) is drawn from these tables; the solver reads the same
// keys (crates/sim-core). Labels: i18n keys sys.<id>, bc.<id>, set.<key>, res.<key>.

export const GROUPS = [
  { id: 'structural', icon: 'simStatic' },
  { id: 'dynamics', icon: 'simModal' },
  { id: 'thermal', icon: 'simThermal' },
  { id: 'fluid', icon: 'simFluid' },
  { id: 'electromagnetic', icon: 'simMagnetic' },
  { id: 'acoustic', icon: 'simAcoustic' },
  { id: 'optimization', icon: 'simTopology' },
];

// Setting field: [key, type, default, unit kind | options, min, max, step]
const num = (key, def, kind = 'ratio', min = -1e30, max = 1e30, step = 1) => ({ key, type: 'number', def, kind, min, max, step });
const int = (key, def, min, max) => ({ key, type: 'number', def, kind: 'count', min, max, step: 1, integer: true });
const sel = (key, def, options) => ({ key, type: 'select', def, options });
const bool = (key, def) => ({ key, type: 'bool', def });
const vec = (key, def, kind) => ({ key, type: 'vector', def, kind });
const table = (key, def, cols) => ({ key, type: 'table', def, cols });

const STRUCT_BCS = ['fixed', 'displacement', 'frictionless', 'elastic', 'remoteDisplacement', 'force', 'pressure', 'moment', 'bearing', 'remoteForce', 'gravity', 'acceleration', 'rotation', 'thermal'];
const SUPPORTS = ['fixed', 'displacement', 'frictionless', 'elastic', 'remoteDisplacement'];
// Static analyses also take bolt pretension.
const STATIC_BCS = [...STRUCT_BCS, 'boltPretension'];
const THERMAL_BCS = ['temperature', 'convection', 'heatFlux', 'heatFlow', 'radiation', 'heatGeneration', 'heatPower', 'bodyTemperature'];

export const SYSTEMS = {
  static: {
    group: 'structural', icon: 'simStatic', analysis: 'static', bcs: STATIC_BCS, contacts: true,
    settings: [num('referenceTemperature', 22, 'temperature', -273, 5000, 1)],
    results: ['displacement', 'ux', 'uy', 'uz', 'vonMises', 'principal1', 'principal2', 'principal3', 'maxShear', 'intensity', 'sx', 'sy', 'sz', 'sxy', 'syz', 'szx', 'strain', 'safety'],
    outputs: ['maxDisplacement', 'maxVonMises', 'minSafety', 'mass'],
  },
  fatigue: {
    group: 'structural', icon: 'simFatigue', analysis: 'static', fixed: { fatigue: true }, bcs: STATIC_BCS, contacts: true,
    settings: [
      sel('method', 'stressLife', ['stressLife', 'strainLife']),
      sel('loading', 'fullyReversed', ['fullyReversed', 'zeroBased', 'ratio', 'history']), num('ratio', -1, 'ratio', -1, 1, 0.1),
      { ...table('loadHistory', [[0, 0], [1, 1], [2, -0.6], [3, 0.8], [4, -1], [5, 0.3], [6, 0]], [['time', 'time'], ['factor', 'ratio']]), if: 'loading=history' },
      sel('meanTheory', 'goodman', ['goodman', 'soderberg', 'gerber', 'none']), sel('stressMeasure', 'vonMises', ['vonMises', 'maxPrincipal']),
      num('loadScale', 1, 'ratio', 0, 1000, 0.1), num('designLife', 1e6, 'life', 1, 1e12, 1e5),
    ],
    results: ['life', 'damage', 'fatigueSafety', 'vonMises', 'displacement'],
    outputs: ['minLife', 'maxVonMises', 'maxDisplacement'],
  },
  nonlinear: {
    group: 'structural', icon: 'simNonlinear', analysis: 'nonlinear', bcs: STATIC_BCS, contacts: true,
    settings: [int('steps', 10, 1, 200), bool('plasticity', true), bool('largeDeflection', false), int('maxIterations', 25, 3, 100), num('tolerance', 0.005, 'ratio', 1e-5, 0.1, 0.001),
      bool('creep', false), { ...num('creepTime', 3.6e6, 'time', 1, 1e10, 3600), if: 'creep' }, { ...int('creepSteps', 20, 1, 1000), if: 'creep' }],
    results: ['displacement', 'ux', 'uy', 'uz', 'vonMises', 'plasticStrain', 'creepStrain', 'principal1', 'principal3', 'strain', 'safety'],
    outputs: ['maxDisplacement', 'maxVonMises', 'maxPlasticStrain', 'maxCreepStrain'],
  },
  topology: {
    group: 'optimization', icon: 'simTopology', analysis: 'topology', bcs: ['fixed', 'force', 'pressure'],
    settings: [sel('body', '', '$bodies'), num('volumeFraction', 0.4, 'ratio', 0.05, 0.95, 0.05), int('iterations', 40, 1, 300), num('penalty', 3, 'ratio', 1, 5, 0.5), num('filterRadius', 1.5, 'ratio', 1, 4, 0.1), int('resolution', 40, 8, 120), num('threshold', 0.5, 'ratio', 0.05, 0.95, 0.05)],
    results: ['density'],
    outputs: ['compliance', 'keptFraction'],
  },
  modal: {
    group: 'dynamics', icon: 'simModal', analysis: 'modal', bcs: SUPPORTS, contacts: true,
    settings: [int('modes', 6, 1, 40)],
    results: ['mode'],
    outputs: ['frequency1', 'frequency2', 'mass'],
  },
  buckling: {
    group: 'structural', icon: 'simBuckling', analysis: 'buckling', bcs: STRUCT_BCS, contacts: false,
    settings: [int('modes', 4, 1, 20)],
    results: ['bucklingMode', 'vonMises', 'displacement'],
    outputs: ['loadFactor1'],
  },
  harmonic: {
    group: 'dynamics', icon: 'simHarmonic', analysis: 'harmonic', bcs: STRUCT_BCS, contacts: true,
    settings: [num('fmin', 0, 'frequency', 0, 1e6, 10), num('fmax', 500, 'frequency', 0, 1e6, 10), int('points', 100, 5, 2000), num('damping', 0.02, 'ratio', 0, 0.5, 0.005), int('modes', 12, 1, 60)],
    results: ['displacement', 'vonMises', 'harmonicAnimation'],
    outputs: ['peakFrequency', 'maxDisplacement', 'maxVonMises'],
  },
  transient: {
    group: 'dynamics', icon: 'simTransient', analysis: 'transient', bcs: STRUCT_BCS, contacts: true,
    settings: [num('endTime', 0.1, 'time', 1e-6, 1e4, 0.01), int('steps', 100, 2, 5000), num('alpha', 0, 'ratio', 0, 1e4, 1), num('beta', 0, 'ratio', 0, 1, 1e-5), int('frames', 30, 2, 120), table('history', [[0, 0], [0.01, 1], [0.1, 1]], [['time', 'time'], ['factor', 'ratio']])],
    results: ['displacement', 'vonMises', 'maxVonMises', 'transientAnimation'],
    outputs: ['maxDisplacement', 'maxVonMises'],
  },
  spectrum: {
    group: 'dynamics', icon: 'simSpectrum', analysis: 'spectrum', bcs: SUPPORTS, contacts: true,
    settings: [int('modes', 12, 1, 60), vec('direction', [0, 0, 1], 'ratio'), sel('combination', 'srss', ['srss', 'cqc']), { ...num('damping', 0.05, 'ratio', 0, 0.5, 0.005), if: 'combination=cqc' }, table('spectrum', [[1, 2], [10, 20], [30, 20], [100, 5]], [['frequency', 'frequency'], ['acceleration', 'acceleration']])],
    results: ['displacement', 'vonMises'],
    outputs: ['maxDisplacement', 'maxVonMises'],
  },
  random: {
    group: 'dynamics', icon: 'simRandom', analysis: 'random', bcs: SUPPORTS, contacts: true,
    settings: [int('modes', 12, 1, 60), num('damping', 0.02, 'ratio', 0, 0.5, 0.005), vec('direction', [0, 0, 1], 'ratio'), bool('crossTerms', true), table('psd', [[20, 0.01], [80, 0.04], [350, 0.04], [2000, 0.007]], [['frequency', 'frequency'], ['psd', 'psd']])],
    results: ['displacement', 'vonMises'],
    outputs: ['maxDisplacement', 'maxVonMises'],
  },
  explicit: {
    group: 'dynamics', icon: 'simExplicit', analysis: 'explicit', bcs: ['fixed', 'velocity', 'wall', 'gravity'], contacts: true, linearOnly: true,
    settings: [num('endTime', 0.002, 'time', 1e-7, 1, 0.0005), bool('plasticity', true), bool('bodyContact', true), { ...num('contactFriction', 0, 'ratio', 0, 2, 0.05), if: 'bodyContact' }, num('erosionStrain', 0, 'ratio', 0, 10, 0.05), int('frames', 40, 2, 200), num('timeStepFactor', 0.6, 'ratio', 0.05, 0.9, 0.05), num('targetTimeStep', 0, 'time', 0, 1, 1e-7)],
    results: ['displacement', 'vonMises', 'explicitAnimation'],
    outputs: ['maxDisplacement', 'maxVonMises'],
  },
  rigid: {
    group: 'dynamics', icon: 'simRigid', analysis: 'rigid', bcs: ['joint', 'spring', 'gravity', 'velocity', 'angularVelocity', 'force', 'moment'], linearOnly: true,
    settings: [num('endTime', 1, 'time', 1e-4, 1e4, 0.1), int('frames', 60, 2, 400), num('timeStep', 0, 'time', 0, 1, 1e-4)],
    results: ['rigidAnimation', 'displacement', 'rigidSpeed'],
    outputs: ['maxDisplacement', 'mass'],
  },
  thermal: {
    group: 'thermal', icon: 'simThermal', analysis: 'thermal', bcs: THERMAL_BCS,
    settings: [],
    results: ['temperature', 'flux'],
    outputs: ['maxTemperature', 'minTemperature'],
  },
  thermalTransient: {
    group: 'thermal', icon: 'simThermalTransient', analysis: 'thermalTransient', bcs: THERMAL_BCS,
    settings: [num('endTime', 60, 'time', 1e-6, 1e7, 10), int('steps', 60, 1, 5000), num('initialTemperature', 22, 'temperature', -273, 5000, 1), int('frames', 30, 2, 120)],
    results: ['temperature', 'flux', 'thermalAnimation'],
    outputs: ['maxTemperature'],
  },
  thermalStress: {
    group: 'thermal', icon: 'simThermalStress', analysis: 'thermalStress', bcs: [...THERMAL_BCS, ...SUPPORTS], contacts: false,
    settings: [num('referenceTemperature', 22, 'temperature', -273, 5000, 1)],
    results: ['temperatureCoupled', 'displacement', 'vonMises', 'principal1', 'safety'],
    outputs: ['maxTemperature', 'maxDisplacement', 'maxVonMises'],
  },
  fluid: {
    group: 'fluid', icon: 'simFluid', analysis: 'fluid', bcs: ['inlet', 'outlet', 'heatPower', 'bodyTemperature'], enclosure: true,
    settings: [
      sel('flowType', 'external', ['external', 'internal']), sel('fluid', 'air', '$fluids'), vec('inletVelocity', [5, 0, 0], 'velocity'),
      sel('turbulence', 'turbulent', ['laminar', 'turbulent']), bool('steady', true), num('endTime', 1, 'time', 1e-4, 1e5, 0.1), int('maxSteps', 1500, 10, 200000),
      num('cellSize', 0, 'length', 0, 1e6, 1), int('maxCells', 60000, 1000, 2000000), bool('thermal', false), bool('buoyancy', true),
      num('inletTemperature', 22, 'temperature', -273, 2000, 1), num('initialTemperature', 22, 'temperature', -273, 2000, 1), vec('gravity', [0, 0, -9.80665], 'acceleration'),
      sel('xmin', 'inlet', ['inlet', 'outlet', 'slip', 'wall', 'opening']), sel('xmax', 'outlet', ['inlet', 'outlet', 'slip', 'wall', 'opening']),
      sel('ymin', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']), sel('ymax', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']),
      sel('zmin', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']), sel('zmax', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']),
      int('streamlines', 12, 2, 40), num('referenceArea', 0, 'area', 0, 1e12, 1),
    ],
    results: ['speed', 'pressureCell', 'temperatureCell', 'vorticity', 'surfacePressure', 'surfaceTemperature', 'streamlines'],
    outputs: ['drag', 'lift', 'cd', 'maxSpeed', 'maxFluidTemperature', 'pressureDrop'],
  },
  fsi: {
    group: 'fluid', icon: 'simFsi', analysis: 'fsi', bcs: ['inlet', 'outlet', 'fixed', 'displacement', 'frictionless', 'elastic', 'force', 'gravity'], enclosure: true, linearOnly: false,
    settings: [
      sel('flowType', 'external', ['external', 'internal']), sel('fluid', 'air', '$fluids'), vec('inletVelocity', [20, 0, 0], 'velocity'),
      sel('turbulence', 'turbulent', ['laminar', 'turbulent']), int('maxSteps', 600, 10, 200000), num('cellSize', 0, 'length', 0, 1e6, 1), int('maxCells', 60000, 1000, 2000000),
      sel('xmin', 'inlet', ['inlet', 'outlet', 'slip', 'wall', 'opening']), sel('xmax', 'outlet', ['inlet', 'outlet', 'slip', 'wall', 'opening']),
      sel('ymin', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']), sel('ymax', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']),
      sel('zmin', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']), sel('zmax', 'slip', ['inlet', 'outlet', 'slip', 'wall', 'opening']),
      num('pressureScale', 1, 'ratio', 0, 1e6, 0.5), int('streamlines', 12, 2, 40),
    ],
    results: ['displacement', 'vonMises', 'fluidPressure', 'speed', 'pressureCell', 'streamlines', 'safety'],
    outputs: ['maxDisplacement', 'maxVonMises', 'drag', 'maxSpeed'],
  },
  electrostatic: {
    group: 'electromagnetic', icon: 'simElectric', analysis: 'electrostatic', bcs: ['voltage', 'charge', 'surfaceCharge'], enclosure: true,
    settings: [num('airPermittivity', 1, 'ratio', 1, 100, 0.1)],
    results: ['potential', 'efield', 'sliceField', 'slicePotential'],
    outputs: ['capacitance', 'maxField', 'energy'],
  },
  conduction: {
    group: 'electromagnetic', icon: 'simCurrent', analysis: 'conduction', bcs: ['voltage', 'current', ...THERMAL_BCS.filter((b) => b !== 'heatGeneration' && b !== 'heatPower')],
    settings: [bool('coupleThermal', false)],
    results: ['potential', 'currentDensity', 'joule', 'temperatureJoule'],
    outputs: ['resistance', 'power', 'maxCurrentDensity', 'maxTemperature'],
  },
  magnetostatic: {
    group: 'electromagnetic', icon: 'simMagnetic', analysis: 'magnetostatic', bcs: ['coil', 'magnet'], enclosure: true, linearOnly: true,
    settings: [],
    results: ['fluxDensity', 'fieldStrength', 'coilCurrent', 'sliceFlux'],
    outputs: ['inductance', 'maxFlux', 'energy', 'force'],
  },
  acousticModal: {
    group: 'acoustic', icon: 'simAcoustic', analysis: 'acousticModal', bcs: ['acPressure'],
    settings: [int('modes', 8, 1, 40)],
    results: ['acousticMode'],
    outputs: ['frequency1', 'frequency2'],
  },
  acousticHarmonic: {
    group: 'acoustic', icon: 'simAcousticHarmonic', analysis: 'acousticHarmonic', bcs: ['acVelocity', 'acPressure', 'absorbing'],
    settings: [num('fmin', 20, 'frequency', 1, 1e5, 10), num('fmax', 1000, 'frequency', 1, 1e5, 10), int('points', 60, 2, 400), num('damping', 0.01, 'ratio', 0, 0.5, 0.005)],
    results: ['spl', 'acousticPressure'],
    outputs: ['maxSpl'],
  },
};

export const SYSTEM_IDS = Object.keys(SYSTEMS);

// Boundary condition: target faces | bodies | none; fields like the settings (SI defaults).
export const BCS = {
  fixed: { icon: 'bcFixed', target: 'faces', cat: 'support', fields: [] },
  displacement: { icon: 'bcDisplacement', target: 'faces', cat: 'support', fields: [{ key: 'x', type: 'optional', def: 0, kind: 'displacement' }, { key: 'y', type: 'optional', def: null, kind: 'displacement' }, { key: 'z', type: 'optional', def: null, kind: 'displacement' }] },
  frictionless: { icon: 'bcFrictionless', target: 'faces', cat: 'support', fields: [] },
  elastic: { icon: 'bcElastic', target: 'faces', cat: 'support', fields: [num('stiffness', 1e9, 'stiffness', 0, 1e20, 1e8)] },
  force: { icon: 'bcForce', target: 'faces', cat: 'load', fields: [vec('vector', [0, 0, -1000], 'force')] },
  remoteForce: { icon: 'bcRemoteForce', target: 'faces', cat: 'load', fields: [sel('behavior', 'deformable', ['deformable', 'rigid']), bool('atCentroid', false), { ...vec('point', [0, 0, 0], 'length'), if: '!atCentroid' }, vec('vector', [0, 0, -1000], 'force'), vec('moment', [0, 0, 0], 'moment')] },
  remoteDisplacement: { icon: 'bcRemoteDisplacement', target: 'faces', cat: 'support', fields: [bool('atCentroid', true), { ...vec('point', [0, 0, 0], 'length'), if: '!atCentroid' }, { key: 'x', type: 'optional', def: 0, kind: 'displacement' }, { key: 'y', type: 'optional', def: 0, kind: 'displacement' }, { key: 'z', type: 'optional', def: 0, kind: 'displacement' }, { key: 'rx', type: 'optional', def: 0, kind: 'angle' }, { key: 'ry', type: 'optional', def: 0, kind: 'angle' }, { key: 'rz', type: 'optional', def: 0, kind: 'angle' }] },
  boltPretension: { icon: 'bcBolt', target: 'bodies', cat: 'load', fields: [sel('mode', 'force', ['force', 'adjustment']), { ...num('force', 10000, 'force', 0, 1e9, 500), if: 'mode=force' }, { ...num('adjustment', 1e-4, 'displacement', -1, 1, 1e-5), if: 'mode=adjustment' }, vec('axis', [0, 0, 1], 'ratio')] },
  pressure: { icon: 'bcPressure', target: 'faces', cat: 'load', fields: [num('value', 1e6, 'pressure', -1e12, 1e12, 1e5)] },
  moment: { icon: 'bcMoment', target: 'faces', cat: 'load', fields: [vec('vector', [0, 0, 10], 'moment')] },
  bearing: { icon: 'bcBearing', target: 'faces', cat: 'load', fields: [vec('vector', [0, 0, -1000], 'force')] },
  gravity: { icon: 'bcGravity', target: 'none', cat: 'load', fields: [vec('vector', [0, 0, -9.80665], 'acceleration')] },
  acceleration: { icon: 'bcAcceleration', target: 'none', cat: 'load', fields: [vec('vector', [9.80665, 0, 0], 'acceleration')] },
  rotation: { icon: 'bcRotation', target: 'bodies', cat: 'load', fields: [vec('axis', [0, 0, 1], 'ratio'), vec('origin', [0, 0, 0], 'length'), num('omega', 100, 'angular', -1e6, 1e6, 10)] },
  thermal: { icon: 'bcThermalCondition', target: 'none', cat: 'load', fields: [num('value', 100, 'temperature', -273, 5000, 10)] },
  velocity: { icon: 'bcVelocity', target: 'bodies', cat: 'load', fields: [vec('vector', [0, 0, -5], 'velocity')] },
  angularVelocity: { icon: 'bcRotation', target: 'bodies', cat: 'load', fields: [vec('vector', [0, 0, 10], 'angular')] },
  joint: { icon: 'bcJoint', target: 'bodies', cat: 'support', fields: [sel('joint', 'revolute', ['revolute', 'spherical', 'fixed']), vec('point', [0, 0, 0], 'length'), { ...vec('axis', [0, 1, 0], 'ratio'), if: 'joint=revolute' }] },
  spring: { icon: 'bcSpring', target: 'bodies', cat: 'load', fields: [vec('pointA', [0, 0, 0], 'length'), vec('pointB', [0, 0, 0.1], 'length'), num('stiffness', 1e4, 'springRate', 0, 1e12, 1000), num('damping', 0, 'dampingCoef', 0, 1e9, 10), bool('initialLength', true), { ...num('length', 0.1, 'length', 0, 1e3, 0.001), if: '!initialLength' }] },
  wall: { icon: 'bcWall', target: 'none', cat: 'support', fields: [vec('point', [0, 0, 0], 'length'), vec('normal', [0, 0, 1], 'ratio'), num('friction', 0, 'ratio', 0, 2, 0.05)] },
  temperature: { icon: 'bcTemperature', target: 'faces', cat: 'thermal', fields: [num('value', 100, 'temperature', -273, 5000, 5)] },
  convection: { icon: 'bcConvection', target: 'faces', cat: 'thermal', fields: [num('h', 20, 'htc', 0, 1e7, 5), num('ambient', 22, 'temperature', -273, 5000, 1)] },
  heatFlux: { icon: 'bcHeatFlux', target: 'faces', cat: 'thermal', fields: [num('value', 1000, 'heatFlux', -1e12, 1e12, 100)] },
  heatFlow: { icon: 'bcHeatFlow', target: 'faces', cat: 'thermal', fields: [num('value', 10, 'power', -1e9, 1e9, 1)] },
  radiation: { icon: 'bcRadiation', target: 'faces', cat: 'thermal', fields: [num('emissivity', 0.8, 'ratio', 0, 1, 0.05), num('ambient', 22, 'temperature', -273, 5000, 1)] },
  heatGeneration: { icon: 'bcHeatGeneration', target: 'bodies', cat: 'thermal', fields: [num('value', 1e6, 'heatGen', -1e15, 1e15, 1e5)] },
  heatPower: { icon: 'bcHeatPower', target: 'bodies', cat: 'thermal', fields: [num('value', 5, 'power', -1e9, 1e9, 1)] },
  bodyTemperature: { icon: 'bcBodyTemperature', target: 'bodies', cat: 'thermal', fields: [num('value', 80, 'temperature', -273, 5000, 5)] },
  voltage: { icon: 'bcVoltage', target: 'faces|bodies', cat: 'electric', fields: [num('value', 10, 'voltage', -1e9, 1e9, 1)] },
  current: { icon: 'bcCurrent', target: 'faces', cat: 'electric', fields: [num('value', 1, 'current', -1e9, 1e9, 0.1)] },
  charge: { icon: 'bcCharge', target: 'bodies', cat: 'electric', fields: [num('value', 1e-6, 'charge', -1e9, 1e9, 1e-7)] },
  surfaceCharge: { icon: 'bcSurfaceCharge', target: 'faces', cat: 'electric', fields: [num('value', 1e-6, 'surfaceCharge', -1e9, 1e9, 1e-7)] },
  coil: { icon: 'bcCoil', target: 'bodies', cat: 'magnetic', fields: [num('current', 1, 'current', -1e9, 1e9, 0.5), int('turns', 100, 1, 1e7), sel('kind', 'loop', ['loop', 'straight']), vec('axis', [0, 0, 1], 'ratio'), vec('direction', [0, 0, 1], 'ratio')] },
  magnet: { icon: 'bcMagnet', target: 'bodies', cat: 'magnetic', fields: [num('remanence', 1.2, 'flux', 0, 5, 0.05), vec('direction', [0, 0, 1], 'ratio')] },
  acVelocity: { icon: 'bcAcVelocity', target: 'faces', cat: 'acoustic', solverType: 'velocity', fields: [num('value', 1e-3, 'velocity', -1e3, 1e3, 1e-4)] },
  acPressure: { icon: 'bcAcPressure', target: 'faces', cat: 'acoustic', solverType: 'pressure', fields: [num('value', 0, 'acousticPressure', -1e9, 1e9, 1)] },
  absorbing: { icon: 'bcAbsorbing', target: 'faces', cat: 'acoustic', fields: [num('impedance', 420, 'impedance', 1, 1e9, 10)] },
  inlet: { icon: 'bcInlet', target: 'faces', cat: 'fluid', fields: [bool('useVector', false), { ...num('speed', 1, 'velocity', -1e3, 1e3, 0.1), if: '!useVector' }, { ...vec('vector', [1, 0, 0], 'velocity'), if: 'useVector' }, num('temperature', 22, 'temperature', -273, 2000, 1)] },
  outlet: { icon: 'bcOutlet', target: 'faces', cat: 'fluid', fields: [] },
};

export const BC_CATS = ['support', 'load', 'thermal', 'electric', 'magnetic', 'acoustic', 'fluid'];

// Result quantity: where its values are and what kind. source: result | fatigue | mode | buckling | thermal |
// fluid (grid) | slice | special.
const q = (source, field, kind, extra = {}) => ({ source, field, kind, ...extra });
export const RESULTS = {
  displacement: q('result', 'displacement', 'displacement', { deform: true }),
  ux: q('result', 'ux', 'displacement', { deform: true, signed: true }),
  uy: q('result', 'uy', 'displacement', { deform: true, signed: true }),
  uz: q('result', 'uz', 'displacement', { deform: true, signed: true }),
  vonMises: q('result', 'vonMises', 'stress', { deform: true }),
  principal1: q('result', 'principal1', 'stress', { deform: true, signed: true }),
  principal2: q('result', 'principal2', 'stress', { deform: true, signed: true }),
  principal3: q('result', 'principal3', 'stress', { deform: true, signed: true }),
  maxShear: q('result', 'maxShear', 'stress', { deform: true }),
  intensity: q('result', 'intensity', 'stress', { deform: true }),
  sx: q('result', 'sx', 'stress', { deform: true, signed: true }),
  sy: q('result', 'sy', 'stress', { deform: true, signed: true }),
  sz: q('result', 'sz', 'stress', { deform: true, signed: true }),
  sxy: q('result', 'sxy', 'stress', { deform: true, signed: true }),
  syz: q('result', 'syz', 'stress', { deform: true, signed: true }),
  szx: q('result', 'szx', 'stress', { deform: true, signed: true }),
  strain: q('result', 'strain', 'strain', { deform: true }),
  safety: q('result', 'safety', 'ratio', { deform: true, reverse: true }),
  plasticStrain: q('result', 'plasticStrain', 'strain', { deform: true }),
  creepStrain: q('result', 'creepStrain', 'strain', { deform: true }),
  maxVonMises: q('transientMax', 'maxVonMises', 'stress', { deform: false }),
  life: q('fatigue', 'life', 'life', { log: true, reverse: true }),
  damage: q('fatigue', 'damage', 'ratio', { log: true }),
  fatigueSafety: q('fatigue', 'safety', 'ratio', { reverse: true }),
  mode: q('mode', 'field', 'ratio', { deform: true, animate: true }),
  bucklingMode: q('buckling', 'field', 'ratio', { deform: true, animate: true }),
  harmonicAnimation: q('harmonic', 'total', 'displacement', { deform: true, animate: true }),
  transientAnimation: q('frames', 'vonMises', 'stress', { deform: true, animate: true }),
  explicitAnimation: q('explicitFrames', 'vonMises', 'stress', { deform: true, animate: true }),
  rigidAnimation: q('rigidFrames', 'displacement', 'displacement', { deform: true, animate: true }),
  rigidSpeed: q('result', 'rigidSpeed', 'velocity', { deform: true }),
  thermalAnimation: q('thermalFrames', 'temperature', 'temperature', { animate: true }),
  temperature: q('result', 'temperature', 'temperature'),
  flux: q('result', 'flux', 'heatFlux', { vector: 'fluxVector' }),
  temperatureCoupled: q('thermal', 'temperature', 'temperature'),
  density: q('topology', 'density', 'ratio'),
  speed: q('fluid', 'speed', 'velocity'),
  pressureCell: q('fluid', 'pressure', 'pressure', { signed: true }),
  temperatureCell: q('fluid', 'temperature', 'temperature'),
  vorticity: q('fluid', 'vorticity', 'angular'),
  surfacePressure: q('result', 'pressure', 'pressure', { signed: true }),
  fluidPressure: q('result', 'fluidPressure', 'pressure', { signed: true, deform: true }),
  surfaceTemperature: q('result', 'temperature', 'temperature'),
  streamlines: q('streamlines', 'speed', 'velocity'),
  potential: q('result', 'potential', 'voltage'),
  efield: q('result', 'field', 'efield', { vector: 'fieldVector' }),
  sliceField: q('slice', 'field', 'efield'),
  slicePotential: q('slice', 'potential', 'voltage'),
  currentDensity: q('result', 'currentDensity', 'currentDensity', { vector: 'currentVector' }),
  joule: q('result', 'joule', 'jouleDensity'),
  temperatureJoule: q('result', 'temperature', 'temperature'),
  fluxDensity: q('result', 'flux', 'flux', { vector: 'fluxVector' }),
  fieldStrength: q('result', 'fieldStrength', 'hfield'),
  coilCurrent: q('result', 'currentDensity', 'currentDensity'),
  sliceFlux: q('slice', 'flux', 'flux'),
  acousticMode: q('mode', 'field', 'ratio', { signed: true }),
  spl: q('result', 'spl', 'spl'),
  acousticPressure: q('result', 'pressure', 'acousticPressure'),
};

/** Whether a field shows for an object: `if` is "key" (truthy), "!key" (falsy) or "key=value". */
export function fieldShown(f, obj) {
  if (!f.if) return true;
  const neg = f.if.startsWith('!');
  const cond = neg ? f.if.slice(1) : f.if;
  const [key, want] = cond.split('=');
  const v = obj?.[key];
  const on = want === undefined ? Boolean(v) : String(v) === want;
  return neg ? !on : on;
}

/** Default settings of a system type. */
export function defaultSettings(type) {
  const out = {};
  for (const f of SYSTEMS[type]?.settings ?? []) out[f.key] = structuredClone(f.def);
  return out;
}

export function defaultBc(type) {
  const out = { type };
  for (const f of BCS[type]?.fields ?? []) out[f.key] = structuredClone(f.def);
  return out;
}

/** Dependent systems made from another (their loads copied, the schematic links them). */
export const FOLLOW_UPS = {
  static: ['buckling', 'fatigue', 'nonlinear', 'topology', 'modal'],
  modal: ['harmonic', 'spectrum', 'random', 'transient'],
  rigid: ['explicit', 'modal'],
  thermal: ['thermalStress', 'thermalTransient'],
  conduction: ['thermal'],
  fluid: ['thermal', 'fsi'],
  acousticModal: ['acousticHarmonic'],
};
