// The modelling elements. Every element on the 2D canvas is a "block" of one of
// these types: discrete-event process blocks (AnyLogic's Process Modeling
// Library style), material handling and warehouse equipment (FlexSim style),
// traffic, system dynamics (stocks, flows, variables) and agent populations,
// plus layout decorations (zones, walls, labels, live displays).
//
// A type says which category it belongs to, its size in metres, its input and
// output ports, and its properties (the right panel builds its editor from
// them). Positions are in metres: x to the right, y down (2D) — y becomes z in 3D.

export const CATEGORIES = [
  { id: 'process', icon: 'fProcessCat' },
  { id: 'machines', icon: 'fCnc' },
  { id: 'handling', icon: 'fConveyor' },
  { id: 'warehouse', icon: 'fRack' },
  { id: 'traffic', icon: 'fCar' },
  { id: 'rail', icon: 'fTrack' },
  { id: 'pedestrian', icon: 'fPedIn' },
  { id: 'fluid', icon: 'fTank' },
  { id: 'sd', icon: 'fStock' },
  { id: 'agent', icon: 'fAgents' },
  { id: 'analysis', icon: 'fChart' },
  { id: 'layout', icon: 'fZone' },
];

/** Paradigm of each category (the explorer groups by it; the report lists them). */
export const PARADIGM = { process: 'de', machines: 'de', handling: 'de', warehouse: 'de', traffic: 'de', rail: 'de', pedestrian: 'de', fluid: 'sd', sd: 'sd', agent: 'abm', analysis: 'layout', layout: 'layout' };

export const LOOKS = ['machine', 'cnc', 'lathe', 'mill', 'robot', 'press', 'injection', 'oven', 'dryer', 'workstation', 'assembly', 'kitting', 'inspection', 'test', 'packing', 'labeler', 'paint', 'welder', 'laser', 'saw', 'grinder', 'printer', 'washer', 'lift', 'turntable', 'desk', 'checkout', 'scanner', 'turnstile', 'elevator', 'toll', 'fuel', 'platform', 'bed'];
export const SHAPES = ['box', 'pallet', 'part', 'carton', 'bottle', 'container', 'car', 'truck', 'bus', 'train', 'person', 'patient', 'bag'];
export const TIME_UNITS = ['s', 'min', 'h', 'day'];

const DIST = (mean, type = 'exponential') => ({ type, ...(type === 'constant' ? { value: mean } : type === 'triangular' ? { min: mean * 0.7, mode: mean, max: mean * 1.4 } : type === 'uniform' ? { min: mean * 0.6, max: mean * 1.4 } : type === 'normal' ? { mean, sd: mean * 0.15 } : { mean }) });

// Property helpers: { key, type, def, … }; `group` sorts them into the panel's sections, `when(props)` hides one.
const p = (key, type, def, extra = {}) => ({ key, type, def, group: 'main', ...extra });
const statsGroup = { group: 'stats' };

export const BLOCK_TYPES = {
  // ───────────── discrete-event process
  source: {
    cat: 'process', icon: 'fSource', w: 2, h: 2, ins: 0, outs: 1, color: '#16a34a',
    props: [
      p('arrivalMode', 'select', 'interval', { options: ['interval', 'rate', 'schedule'] }),
      p('interarrival', 'dist', DIST(60), { unit: 'time', when: (q) => q.arrivalMode === 'interval' }),
      p('rate', 'expr', '1', { unit: 'perTime', when: (q) => q.arrivalMode === 'rate' }),
      p('schedule', 'schedule', [{ start: 0, end: 480, value: 1 }, { start: 480, end: 960, value: 0.5 }], { when: (q) => q.arrivalMode === 'schedule', valueKey: 'rate' }),
      p('period', 'number', 1440, { unit: 'time', min: 1, when: (q) => q.arrivalMode === 'schedule' }),
      p('batchSize', 'int', 1, { min: 1, max: 1000 }),
      p('firstAt', 'number', 0, { unit: 'time', min: 0 }),
      p('maxArrivals', 'int', 0, { min: 0, hint: 'zeroUnlimited' }),
      p('types', 'types', [{ name: 'Part', color: '#3b82f6', weight: 1 }], { group: 'entity' }),
      p('shape', 'select', 'box', { options: SHAPES, group: 'entity' }),
      p('priority', 'int', 0, { group: 'entity' }),
      p('onBlocked', 'select', 'wait', { options: ['wait', 'drop'] }),
    ],
  },
  sink: { cat: 'process', icon: 'fSink', w: 2, h: 2, ins: 1, outs: 0, color: '#dc2626', props: [] },
  queue: {
    cat: 'process', icon: 'fQueue', w: 4, h: 1.4, ins: 1, outs: 2, optionalOuts: [1], color: '#f59e0b',
    props: [
      p('capacity', 'int', 0, { min: 0, hint: 'zeroUnlimited' }),
      p('discipline', 'select', 'fifo', { options: ['fifo', 'lifo', 'priority', 'random'] }),
      p('timeout', 'number', 0, { unit: 'time', min: 0, hint: 'timeoutPort' }),
    ],
  },
  process: {
    cat: 'process', icon: 'fProcess', w: 2.6, h: 2.2, ins: 1, outs: 2, optionalOuts: [1], color: '#2563eb',
    props: [
      p('look', 'select', 'machine', { options: LOOKS }),
      p('capacity', 'int', 1, { min: 1, max: 500 }),
      p('time', 'dist', DIST(45, 'triangular'), { unit: 'time' }),
      p('pool', 'pool', '', { group: 'resources' }),
      p('units', 'int', 1, { min: 1, group: 'resources', when: (q) => Boolean(q.pool) }),
      p('setup', 'number', 0, { unit: 'time', min: 0, group: 'quality' }),
      p('defectRate', 'number', 0, { min: 0, max: 1, step: 0.01, group: 'quality', hint: 'rejectPort' }),
      p('failures', 'bool', false, { group: 'failures' }),
      p('mtbf', 'dist', DIST(480), { unit: 'time', group: 'failures', when: (q) => q.failures }),
      p('mttr', 'dist', DIST(30, 'triangular'), { unit: 'time', group: 'failures', when: (q) => q.failures }),
      p('cost', 'number', 0, { min: 0, unit: 'costPerTime', group: 'cost' }),
    ],
  },
  resourcePool: {
    cat: 'process', icon: 'fPool', w: 2.4, h: 1.6, ins: 0, outs: 0, color: '#7c3aed',
    props: [
      p('capacity', 'int', 2, { min: 1, max: 500 }),
      p('kind', 'select', 'worker', { options: ['worker', 'robot', 'tool', 'forklift'] }),
      p('shifts', 'bool', false),
      p('schedule', 'schedule', [{ start: 0, end: 480, value: 2 }, { start: 480, end: 1440, value: 1 }], { when: (q) => q.shifts, valueKey: 'capacity' }),
      p('period', 'number', 1440, { unit: 'time', min: 1, when: (q) => q.shifts }),
      p('cost', 'number', 0, { min: 0, unit: 'costPerTime', group: 'cost' }),
    ],
  },
  seize: { cat: 'process', icon: 'fSeize', w: 1.8, h: 1.4, ins: 1, outs: 1, color: '#9333ea', props: [p('pool', 'pool', ''), p('units', 'int', 1, { min: 1 })] },
  release: { cat: 'process', icon: 'fRelease', w: 1.8, h: 1.4, ins: 1, outs: 1, color: '#a855f7', props: [p('pool', 'pool', '', { hint: 'releaseAll' })] },
  select: {
    cat: 'process', icon: 'fSelect', w: 1.8, h: 2, ins: 1, outs: 'outputs', color: '#0891b2',
    props: [
      p('outputs', 'int', 2, { min: 2, max: 6 }),
      p('mode', 'select', 'probability', { options: ['probability', 'type', 'roundRobin', 'shortest', 'first', 'condition'] }),
      p('weights', 'text', '1, 1', { when: (q) => q.mode === 'probability', hint: 'weights' }),
      p('typeMap', 'text', '', { when: (q) => q.mode === 'type', hint: 'typeMap' }),
      p('condition', 'expr', 'priority > 0', { when: (q) => q.mode === 'condition', hint: 'conditionTrue' }),
    ],
  },
  combine: {
    cat: 'process', icon: 'fCombine', w: 2.6, h: 2.4, ins: 'inputs', outs: 1, color: '#0d9488',
    props: [
      p('inputs', 'int', 2, { min: 2, max: 5 }),
      p('quantities', 'text', '1, 1', { hint: 'quantities' }),
      p('time', 'dist', DIST(30, 'triangular'), { unit: 'time' }),
      p('outType', 'text', 'Assembly'),
      p('outColor', 'color', '#0d9488'),
    ],
  },
  batch: { cat: 'process', icon: 'fBatch', w: 2, h: 1.8, ins: 1, outs: 1, color: '#ca8a04', props: [p('size', 'int', 4, { min: 2, max: 1000 }), p('outType', 'text', 'Pallet'), p('outColor', 'color', '#a16207'), p('shape', 'select', 'pallet', { options: SHAPES })] },
  unbatch: { cat: 'process', icon: 'fUnbatch', w: 2, h: 1.8, ins: 1, outs: 1, color: '#eab308', props: [] },
  gate: {
    cat: 'process', icon: 'fGate', w: 1.4, h: 1.8, ins: 1, outs: 1, color: '#475569',
    props: [p('mode', 'select', 'schedule', { options: ['schedule', 'open', 'closed', 'condition'] }), p('openTime', 'number', 60, { unit: 'time', min: 0, when: (q) => q.mode === 'schedule' }), p('closedTime', 'number', 30, { unit: 'time', min: 0, when: (q) => q.mode === 'schedule' }), p('condition', 'expr', '1', { when: (q) => q.mode === 'condition' })],
  },
  assign: {
    cat: 'process', icon: 'fAssign', w: 1.8, h: 1.4, ins: 1, outs: 1, color: '#db2777',
    props: [p('setType', 'text', ''), p('setColor', 'color', ''), p('setPriority', 'expr', ''), p('setShape', 'select', '', { options: ['', ...SHAPES] })],
  },
  delay: { cat: 'process', icon: 'fDelay', w: 2, h: 1.4, ins: 1, outs: 1, color: '#64748b', props: [p('time', 'dist', DIST(10, 'constant'), { unit: 'time' }), p('capacity', 'int', 0, { min: 0, hint: 'zeroUnlimited' })] },

  // ───────────── material handling
  conveyor: {
    cat: 'handling', icon: 'fConveyor', path: true, w: 1, h: 1, ins: 1, outs: 1, color: '#525252',
    props: [p('speed', 'number', 30, { unit: 'speed', min: 0.01 }), p('spacing', 'number', 1, { unit: 'length', min: 0.1 }), p('width', 'number', 0.8, { unit: 'length', min: 0.2 }), p('accumulating', 'bool', true)],
    defaultPoints: [[0, 0], [8, 0]],
  },
  transporter: {
    cat: 'handling', icon: 'fAgv', w: 2.4, h: 2, ins: 1, outs: 1, color: '#ea580c',
    props: [p('vehicle', 'select', 'agv', { options: ['agv', 'forklift', 'cart', 'drone'] }), p('fleet', 'int', 2, { min: 1, max: 100 }), p('speed', 'number', 60, { unit: 'speed', min: 0.01 }), p('loadTime', 'number', 0.5, { unit: 'time', min: 0 }), p('unloadTime', 'number', 0.5, { unit: 'time', min: 0 }), p('returnHome', 'bool', true), p('routing', 'select', 'manhattan', { options: ['manhattan', 'straight'] })],
  },
  robot: {
    cat: 'handling', icon: 'fRobot', w: 2, h: 2, ins: 1, outs: 1, color: '#0284c7',
    props: [p('time', 'dist', DIST(8, 'uniform'), { unit: 'time' }), p('reach', 'number', 2.5, { unit: 'length', min: 0.5 })],
  },

  // ───────────── warehouse
  rack: {
    cat: 'warehouse', icon: 'fRack', w: 6, h: 1.4, ins: 1, outs: 1, color: '#b45309',
    props: [p('bays', 'int', 6, { min: 1, max: 60 }), p('levels', 'int', 4, { min: 1, max: 12 }), p('dwell', 'dist', DIST(240, 'exponential'), { unit: 'time' }), p('storeTime', 'number', 1, { unit: 'time', min: 0 }), p('retrieveTime', 'number', 1, { unit: 'time', min: 0 }), p('policy', 'select', 'fifo', { options: ['fifo', 'lifo', 'random'] })],
  },
  dock: {
    cat: 'warehouse', icon: 'fDock', w: 3, h: 2, ins: 1, outs: 1, color: '#78716c',
    props: [p('doors', 'int', 2, { min: 1, max: 40 }), p('time', 'dist', DIST(20, 'triangular'), { unit: 'time' })],
  },

  // ───────────── traffic
  road: {
    cat: 'traffic', icon: 'fRoad', path: true, w: 1, h: 1, ins: 1, outs: 1, color: '#334155',
    props: [p('speed', 'number', 800, { unit: 'speed', min: 1 }), p('lanes', 'int', 2, { min: 1, max: 6 }), p('vehicleLength', 'number', 6, { unit: 'length', min: 1 })],
    defaultPoints: [[0, 0], [30, 0]],
  },
  signal: {
    cat: 'traffic', icon: 'fSignal', w: 1, h: 2.2, ins: 1, outs: 1, color: '#16a34a',
    props: [p('green', 'number', 0.5, { unit: 'time', min: 0 }), p('yellow', 'number', 0.05, { unit: 'time', min: 0 }), p('red', 'number', 0.5, { unit: 'time', min: 0 }), p('offset', 'number', 0, { unit: 'time', min: 0 }), p('headway', 'number', 0.03, { unit: 'time', min: 0 })],
  },
  parking: {
    cat: 'traffic', icon: 'fParking', w: 8, h: 5, ins: 1, outs: 1, color: '#1d4ed8',
    props: [p('spaces', 'int', 20, { min: 1, max: 2000 }), p('dwell', 'dist', DIST(60, 'normal'), { unit: 'time' })],
  },

  // ───────────── system dynamics
  stock: {
    cat: 'sd', icon: 'fStock', w: 3, h: 2, ins: 0, outs: 0, sd: true, color: '#2563eb',
    props: [p('initial', 'expr', '100'), p('nonNegative', 'bool', true), p('unitLabel', 'text', '')],
  },
  flow: {
    cat: 'sd', icon: 'fFlow', w: 2.2, h: 1.4, ins: 1, outs: 1, sd: true, color: '#0ea5e9',
    props: [p('equation', 'expr', '10'), p('unitLabel', 'text', '')],
  },
  variable: { cat: 'sd', icon: 'fVariable', w: 2.2, h: 1.4, ins: 0, outs: 0, sd: true, color: '#8b5cf6', props: [p('equation', 'expr', '0'), p('unitLabel', 'text', '')] },
  parameter: {
    cat: 'sd', icon: 'fParameter', w: 2.2, h: 1.2, ins: 0, outs: 0, sd: true, color: '#f97316',
    props: [p('value', 'number', 1, { live: true }), p('min', 'number', 0), p('max', 'number', 10), p('unitLabel', 'text', '')],
  },

  // ───────────── agents
  population: {
    cat: 'agent', icon: 'fAgents', w: 16, h: 12, ins: 0, outs: 0, resizable: true, color: '#059669',
    props: [
      p('count', 'int', 200, { min: 1, max: 5000 }),
      p('speed', 'number', 5, { unit: 'speed', min: 0 }),
      p('shape', 'select', 'person', { options: ['person', 'dot', 'car'] }),
      p('states', 'states', [{ name: 'Susceptible', color: '#3b82f6' }, { name: 'Infected', color: '#ef4444' }, { name: 'Recovered', color: '#22c55e' }], { group: 'statechart' }),
      p('initial', 'text', 'Susceptible:0.98, Infected:0.02', { group: 'statechart', hint: 'initialStates' }),
      p('transitions', 'transitions', [
        { from: 'Susceptible', to: 'Infected', kind: 'contact', value: 0.6, trigger: 'Infected', radius: 1.2 },
        { from: 'Infected', to: 'Recovered', kind: 'timeout', value: 14 },
      ], { group: 'statechart' }),
    ],
  },

  // ───────────── layout and display
  zone: { cat: 'layout', icon: 'fZone', w: 12, h: 8, ins: 0, outs: 0, resizable: true, color: '#94a3b8', props: [p('fill', 'color', '#cbd5e1'), p('opacity', 'number', 0.35, { min: 0, max: 1, step: 0.05 }), p('floor', 'select', 'concrete', { options: ['concrete', 'epoxy', 'asphalt', 'grass', 'tile', 'wood'] })] },
  wall: { cat: 'layout', icon: 'fWall', path: true, w: 1, h: 1, ins: 0, outs: 0, color: '#64748b', props: [p('height', 'number', 3, { unit: 'length', min: 0.2 }), p('thickness', 'number', 0.2, { unit: 'length', min: 0.05 })], defaultPoints: [[0, 0], [10, 0]] },
  label: { cat: 'layout', icon: 'fLabel', w: 4, h: 1, ins: 0, outs: 0, color: '#0f172a', props: [p('text', 'text', 'Label'), p('size', 'number', 0.8, { unit: 'length', min: 0.2, max: 10 }), p('textColor', 'color', '#0f172a')] },
  display: { cat: 'layout', icon: 'fDisplay', w: 4, h: 2, ins: 0, outs: 0, color: '#0f766e', props: [p('expression', 'expr', 'time'), p('digits', 'int', 1, { min: 0, max: 6 }), p('unitLabel', 'text', '')] },
  chart: { cat: 'layout', icon: 'fChart', w: 10, h: 6, ins: 0, outs: 0, resizable: true, color: '#0369a1', props: [p('series', 'text', '', { hint: 'chartSeries' }), p('chartKind', 'select', 'line', { options: ['line', 'bar'] })] },
};


// ───────────────────────── more behaviours (AnyLogic Process Modeling / Fluid / SD, FlexSim)

Object.assign(BLOCK_TYPES, {
  split: { cat: 'process', icon: 'fSplit', w: 1.8, h: 1.8, ins: 1, outs: 2, color: '#0e7490', props: [p('copies', 'int', 1, { min: 1, max: 100 }), p('copyType', 'text', ''), p('copyColor', 'color', '')] },
  match: { cat: 'process', icon: 'fMatch', w: 2.2, h: 2.2, ins: 2, outs: 2, color: '#4f46e5', props: [p('byType', 'bool', false, { hint: 'matchType' }), p('capacity', 'int', 0, { min: 0, hint: 'zeroUnlimited' })] },
  restrictedStart: { cat: 'process', icon: 'fAreaStart', w: 1.6, h: 1.6, ins: 1, outs: 1, color: '#be123c', props: [p('capacity', 'int', 5, { min: 1, max: 10000, hint: 'wipLimit' })] },
  restrictedEnd: { cat: 'process', icon: 'fAreaEnd', w: 1.6, h: 1.6, ins: 1, outs: 1, color: '#be123c', props: [p('start', 'ref', '', { refBase: 'restrictedStart' })] },
  timeStart: { cat: 'process', icon: 'fTimerStart', w: 1.4, h: 1.4, ins: 1, outs: 1, color: '#0369a1', props: [] },
  timeEnd: { cat: 'process', icon: 'fTimerEnd', w: 1.4, h: 1.4, ins: 1, outs: 1, color: '#0369a1', props: [p('start', 'ref', '', { refBase: 'timeStart' })] },
  maintenance: {
    cat: 'process', icon: 'fMaintenance', w: 2, h: 1.6, ins: 0, outs: 0, color: '#b45309',
    props: [p('target', 'ref', '', { refBase: 'process' }), p('interval', 'dist', DIST(240, 'constant'), { unit: 'time' }), p('duration', 'dist', DIST(20, 'triangular'), { unit: 'time' }), p('firstAt', 'number', 120, { unit: 'time', min: 0 })],
  },
  merge: { cat: 'handling', icon: 'fMerge', w: 1.8, h: 2, ins: 'inputs', outs: 1, color: '#0f766e', props: [p('inputs', 'int', 2, { min: 2, max: 6 })] },
  lookup: { cat: 'sd', icon: 'fLookup', w: 2.4, h: 1.4, ins: 0, outs: 0, sd: true, color: '#7c3aed', props: [p('input', 'expr', 'time'), p('xs', 'text', '0, 50, 100', { hint: 'lookupXs' }), p('ys', 'text', '0, 80, 100', { hint: 'lookupYs' }), p('unitLabel', 'text', '')] },
  smooth: { cat: 'sd', icon: 'fSmooth', w: 2.4, h: 1.4, ins: 0, outs: 0, sd: true, color: '#9333ea', props: [p('input', 'expr', '10'), p('delay', 'number', 5, { unit: 'time', min: 0.0001 }), p('initial', 'expr', ''), p('unitLabel', 'text', '')] },
  cellGrid: {
    cat: 'agent', icon: 'fCells', w: 16, h: 12, ins: 0, outs: 0, resizable: true, color: '#15803d',
    props: [
      p('cols', 'int', 40, { min: 2, max: 200 }), p('rows', 'int', 30, { min: 2, max: 200 }),
      p('neighborhood', 'select', 'moore', { options: ['moore', 'vonNeumann'] }), p('wrap', 'bool', true),
      p('states', 'states', [{ name: 'Tree', color: '#16a34a' }, { name: 'Fire', color: '#f97316' }, { name: 'Ash', color: '#57534e' }], { group: 'statechart' }),
      p('initial', 'text', 'Tree:0.995, Fire:0.005', { group: 'statechart', hint: 'initialStates' }),
      p('transitions', 'transitions', [
        { from: 'Tree', to: 'Fire', kind: 'neighbors', value: 1, trigger: 'Fire' },
        { from: 'Fire', to: 'Ash', kind: 'timeout', value: 1 },
        { from: 'Ash', to: 'Tree', kind: 'rate', value: 0.01 },
      ], { group: 'statechart' }),
    ],
  },
  pillar: { cat: 'layout', icon: 'fPillar', w: 0.6, h: 0.6, ins: 0, outs: 0, color: '#6b7280', props: [p('height', 'number', 6, { unit: 'length', min: 0.5 })] },
  door: { cat: 'layout', icon: 'fDoor', w: 3, h: 0.3, ins: 0, outs: 0, color: '#78716c', props: [p('height', 'number', 3.5, { unit: 'length', min: 1 })] },
  tree: { cat: 'layout', icon: 'fTree', w: 3, h: 3, ins: 0, outs: 0, color: '#15803d', props: [p('height', 'number', 6, { unit: 'length', min: 1 })] },
});
// Wider choices for existing properties.
BLOCK_TYPES.transporter.props.find((q) => q.key === 'vehicle').options.push('crane', 'tugger');
BLOCK_TYPES.chart.props.find((q) => q.key === 'chartKind').options.push('area', 'pie', 'histogram');
BLOCK_TYPES.display.props.push(p('style', 'select', 'number', { options: ['number', 'gauge', 'bar', 'counter'] }), p('min', 'number', 0), p('max', 'number', 100));
BLOCK_TYPES.stock.props.push(p('capacity', 'number', 0, { min: 0, hint: 'zeroUnlimited' }));
BLOCK_TYPES.flow.props.push(p('openTime', 'number', 0, { unit: 'time', min: 0, hint: 'valveCycle' }), p('closedTime', 'number', 0, { unit: 'time', min: 0 }));
BLOCK_TYPES.process.props.find((q) => q.key === 'look').options = LOOKS;
for (const type of ['display', 'chart']) BLOCK_TYPES[type].cat = 'analysis';

// ───────────────────────── presets: a behaviour with its own name, icon, look and defaults

/**
 * A ready-made block built on a behaviour (`base`): the same engine and editor, with its own
 * category, icon, size, colour and default values ("CNC machine" = a process that looks like a CNC).
 */
function preset(base, cat, icon, { color, w, h, defaults = {}, ins, outs, path, points } = {}) {
  const b = BLOCK_TYPES[base];
  const props = b.props.map((q) => {
    if (!(q.key in defaults)) return q;
    const copy = { ...q, def: structuredClone(defaults[q.key]) };
    if (q.options && !q.options.includes(defaults[q.key]) && q.type === 'select') copy.options = [...q.options, defaults[q.key]];
    return copy;
  });
  return {
    ...b, base, cat, icon, props, color: color ?? b.color, w: w ?? b.w, h: h ?? b.h,
    ins: ins ?? b.ins, outs: outs ?? b.outs, path: path ?? b.path,
    defaultPoints: points ?? b.defaultPoints,
  };
}
const MACHINE = (look, time, extra = {}) => ({ look, time, ...extra });
const T = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const E = (mean) => ({ type: 'exponential', mean });
const K = (value) => ({ type: 'constant', value });
const U = (min, max) => ({ type: 'uniform', min, max });
const N = (mean, sd) => ({ type: 'normal', mean, sd });

Object.assign(BLOCK_TYPES, {
  // ── machines and stations (FlexSim fixed resources)
  cncMachine: preset('process', 'machines', 'fCnc', { color: '#1d4ed8', w: 2.8, h: 2.4, defaults: MACHINE('cnc', T(3, 4, 6), { failures: true, mtbf: E(480), mttr: T(10, 20, 40) }) }),
  lathe: preset('process', 'machines', 'fLathe', { color: '#2563eb', w: 3.2, h: 1.8, defaults: MACHINE('lathe', T(2, 3, 5)) }),
  millingMachine: preset('process', 'machines', 'fMill', { color: '#1e40af', w: 2.6, h: 2.6, defaults: MACHINE('mill', T(4, 5, 8)) }),
  drillPress: preset('process', 'machines', 'fDrill', { color: '#3b82f6', w: 1.6, h: 1.6, defaults: MACHINE('press', T(1, 1.5, 2.5)) }),
  pressMachine: preset('process', 'machines', 'fPress', { color: '#475569', w: 2.6, h: 2.2, defaults: MACHINE('press', K(0.5), { setup: 15 }) }),
  injectionMolder: preset('process', 'machines', 'fInjection', { color: '#0891b2', w: 4, h: 2, defaults: MACHINE('injection', K(1.2), { capacity: 4 }) }),
  oven: preset('process', 'machines', 'fOven', { color: '#c2410c', w: 5, h: 2.2, defaults: MACHINE('oven', K(30), { capacity: 12 }) }),
  dryer: preset('process', 'machines', 'fDryer', { color: '#ea580c', w: 4, h: 2, defaults: MACHINE('dryer', N(20, 3), { capacity: 6 }) }),
  paintBooth: preset('process', 'machines', 'fPaint', { color: '#db2777', w: 4, h: 3, defaults: MACHINE('paint', T(4, 5, 7)) }),
  welder: preset('process', 'machines', 'fWeld', { color: '#f59e0b', w: 2.4, h: 2.4, defaults: MACHINE('welder', T(1.5, 2, 3), { failures: true, mtbf: E(300), mttr: T(5, 8, 15) }) }),
  laserCutter: preset('process', 'machines', 'fLaser', { color: '#dc2626', w: 3, h: 2.2, defaults: MACHINE('laser', T(1, 1.4, 2)) }),
  sawCutter: preset('process', 'machines', 'fSaw', { color: '#a16207', w: 3, h: 1.6, defaults: MACHINE('saw', T(0.5, 0.8, 1.2)) }),
  grinder: preset('process', 'machines', 'fGrinder', { color: '#64748b', w: 1.8, h: 1.6, defaults: MACHINE('grinder', T(1, 2, 3)) }),
  printer3d: preset('process', 'machines', 'fPrinter3d', { color: '#7c3aed', w: 1.4, h: 1.4, defaults: MACHINE('printer', N(60, 10), { capacity: 1 }) }),
  assemblyStation: preset('process', 'machines', 'fAssemblyStation', { color: '#0d9488', w: 2.6, h: 1.8, defaults: MACHINE('assembly', T(3, 4, 6)) }),
  inspectionStation: preset('process', 'machines', 'fInspect', { color: '#0284c7', w: 2.2, h: 1.8, defaults: MACHINE('inspection', T(0.5, 1, 1.5), { defectRate: 0.05 }) }),
  testBench: preset('process', 'machines', 'fTestBench', { color: '#0369a1', w: 2.4, h: 1.6, defaults: MACHINE('test', T(2, 3, 5), { defectRate: 0.03, capacity: 2 }) }),
  labeler: preset('process', 'machines', 'fLabeler', { color: '#ca8a04', w: 1.8, h: 1.4, defaults: MACHINE('labeler', K(0.2)) }),
  packingMachine: preset('process', 'machines', 'fPacker', { color: '#a16207', w: 2.6, h: 2, defaults: MACHINE('packing', T(0.8, 1, 1.5)) }),
  washingMachine: preset('process', 'machines', 'fWasher', { color: '#0ea5e9', w: 3.4, h: 2, defaults: MACHINE('washer', K(5), { capacity: 4 }) }),
  kittingStation: preset('process', 'machines', 'fKitting', { color: '#16a34a', w: 2.4, h: 1.6, defaults: MACHINE('kitting', T(2, 3, 4)) }),
  // ── material handling (FlexSim task executers, AnyLogic Material Handling)
  rollerConveyor: preset('conveyor', 'handling', 'fRoller', { color: '#57534e', defaults: { speed: 18, spacing: 0.7, width: 0.9 } }),
  chute: preset('conveyor', 'handling', 'fChute', { color: '#78716c', defaults: { speed: 40, spacing: 0.5, width: 0.6, accumulating: false }, points: [[0, 0], [4, 0]] }),
  forkliftFleet: preset('transporter', 'handling', 'fForklift', { color: '#f59e0b', defaults: { vehicle: 'forklift', fleet: 3, speed: 90, loadTime: 0.4, unloadTime: 0.4 } }),
  agvFleet: preset('transporter', 'handling', 'fAgv', { color: '#ea580c', defaults: { vehicle: 'agv', fleet: 4, speed: 50 } }),
  tuggerTrain: preset('transporter', 'handling', 'fTugger', { color: '#9a3412', defaults: { vehicle: 'tugger', fleet: 1, speed: 70, loadTime: 1, unloadTime: 1, routing: 'manhattan' } }),
  overheadCrane: preset('transporter', 'handling', 'fCrane', { color: '#eab308', w: 3, h: 2.4, defaults: { vehicle: 'crane', fleet: 1, speed: 30, loadTime: 0.8, unloadTime: 0.8, routing: 'manhattan', returnHome: false } }),
  droneFleet: preset('transporter', 'handling', 'fDrone', { color: '#475569', defaults: { vehicle: 'drone', fleet: 3, speed: 300, routing: 'straight', loadTime: 0.2, unloadTime: 0.2 } }),
  lift: preset('process', 'handling', 'fLift', { color: '#64748b', w: 2, h: 2, defaults: MACHINE('lift', K(0.6), { capacity: 1 }) }),
  turntable: preset('process', 'handling', 'fTurntable', { color: '#6b7280', w: 1.8, h: 1.8, defaults: MACHINE('turntable', K(0.1), { capacity: 1 }) }),
  sorter: preset('select', 'handling', 'fSorter', { color: '#0891b2', w: 3, h: 2.4, defaults: { outputs: 3, mode: 'type', typeMap: '' } }),
  diverter: preset('select', 'handling', 'fDiverter', { color: '#0e7490', w: 1.6, h: 1.6, defaults: { outputs: 2, mode: 'shortest' } }),
  palletizer: preset('batch', 'handling', 'fPalletizer', { color: '#b45309', w: 2.6, h: 2.6, defaults: { size: 24, outType: 'Pallet', shape: 'pallet' } }),
  depalletizer: preset('unbatch', 'handling', 'fDepalletizer', { color: '#ca8a04', w: 2.6, h: 2.6 }),
  accumulator: preset('queue', 'handling', 'fAccumulator', { color: '#d97706', w: 6, h: 1.2, defaults: { capacity: 30 } }),
  // ── warehouse
  asrs: preset('rack', 'warehouse', 'fAsrs', { color: '#1e3a8a', w: 14, h: 1.6, defaults: { bays: 20, levels: 8, storeTime: 0.4, retrieveTime: 0.4, dwell: E(600) } }),
  flowRack: preset('rack', 'warehouse', 'fFlowRack', { color: '#1d4ed8', w: 5, h: 1.6, defaults: { bays: 5, levels: 3, policy: 'fifo', dwell: E(60), storeTime: 0.1, retrieveTime: 0.1 } }),
  floorStorage: preset('rack', 'warehouse', 'fFloorStore', { color: '#a8a29e', w: 8, h: 4, defaults: { bays: 12, levels: 1, dwell: E(180), policy: 'random' } }),
  coldStorage: preset('rack', 'warehouse', 'fCold', { color: '#0ea5e9', w: 8, h: 2, defaults: { bays: 8, levels: 4, dwell: E(720) } }),
  receivingDock: preset('dock', 'warehouse', 'fReceiving', { color: '#16a34a', defaults: { doors: 3, time: T(10, 15, 25) } }),
  shippingDock: preset('dock', 'warehouse', 'fShipping', { color: '#dc2626', defaults: { doors: 3, time: T(8, 12, 20) } }),
  pickStation: preset('process', 'warehouse', 'fPick', { color: '#0d9488', w: 2.4, h: 1.6, defaults: MACHINE('workstation', T(0.5, 0.8, 1.5), { capacity: 2 }) }),
  packStation: preset('process', 'warehouse', 'fPack', { color: '#a16207', w: 2.4, h: 1.6, defaults: MACHINE('packing', T(1, 1.5, 2.5), { capacity: 2 }) }),
  stagingLane: preset('queue', 'warehouse', 'fStaging', { color: '#f59e0b', w: 6, h: 2.4, defaults: { capacity: 40 } }),
  qualityHold: preset('delay', 'warehouse', 'fHold', { color: '#be123c', w: 3, h: 2, defaults: { time: T(30, 60, 120), capacity: 0 } }),
  // ── traffic (AnyLogic Road Traffic)
  carSource: preset('source', 'traffic', 'fCarIn', { color: '#16a34a', defaults: { interarrival: E(0.2), shape: 'car', types: [{ name: 'Car', color: '#2563eb', weight: 3 }, { name: 'Car', color: '#dc2626', weight: 2 }, { name: 'Car', color: '#e5e7eb', weight: 2 }, { name: 'Truck', color: '#f59e0b', weight: 1 }] } }),
  carSink: preset('sink', 'traffic', 'fCarOut', { color: '#dc2626' }),
  highway: preset('road', 'traffic', 'fHighway', { color: '#1f2937', defaults: { lanes: 3, speed: 1600, vehicleLength: 8 }, points: [[0, 0], [60, 0]] }),
  busStop: preset('delay', 'traffic', 'fBusStop', { color: '#0284c7', w: 3, h: 1.6, defaults: { time: T(0.3, 0.5, 1), capacity: 2 } }),
  tollBooth: preset('process', 'traffic', 'fToll', { color: '#7c3aed', w: 2.4, h: 3, defaults: MACHINE('toll', T(0.1, 0.15, 0.3), { capacity: 3 }) }),
  fuelStation: preset('process', 'traffic', 'fFuel', { color: '#b91c1c', w: 6, h: 4, defaults: MACHINE('fuel', T(3, 5, 8), { capacity: 4 }) }),
  crosswalk: preset('signal', 'traffic', 'fCrosswalk', { color: '#facc15', defaults: { green: 1, yellow: 0.05, red: 0.4, headway: 0.02 } }),
  junction: preset('merge', 'traffic', 'fJunction', { color: '#334155', w: 2, h: 2 }),
  // ── rail (AnyLogic Rail)
  railTrack: preset('conveyor', 'rail', 'fTrack', { color: '#44403c', defaults: { speed: 1200, spacing: 120, width: 1.5, accumulating: true }, points: [[0, 0], [80, 0]] }),
  trainSource: preset('source', 'rail', 'fTrainIn', { color: '#16a34a', defaults: { interarrival: K(20), shape: 'train', types: [{ name: 'Train', color: '#1d4ed8', weight: 2 }, { name: 'Freight', color: '#b45309', weight: 1 }] } }),
  trainSink: preset('sink', 'rail', 'fTrainOut', { color: '#dc2626' }),
  railStation: preset('process', 'rail', 'fStation', { color: '#0369a1', w: 12, h: 3, defaults: MACHINE('platform', T(1.5, 2, 4), { capacity: 2 }) }),
  railSwitch: preset('select', 'rail', 'fSwitch', { color: '#525252', defaults: { outputs: 2, mode: 'type', typeMap: 'Train:1, Freight:2' } }),
  railSignal: preset('signal', 'rail', 'fRailSignal', { color: '#16a34a', defaults: { green: 4, yellow: 0.5, red: 4, headway: 2 } }),
  railYard: preset('rack', 'rail', 'fYard', { color: '#57534e', w: 20, h: 6, defaults: { bays: 6, levels: 1, dwell: T(30, 60, 120), storeTime: 2, retrieveTime: 2 } }),
  // ── pedestrians (AnyLogic Pedestrian)
  pedSource: preset('source', 'pedestrian', 'fPedIn', { color: '#16a34a', defaults: { interarrival: E(0.3), shape: 'person', types: [{ name: 'Visitor', color: '#8b5cf6', weight: 3 }, { name: 'Staff', color: '#0ea5e9', weight: 1 }] } }),
  pedSink: preset('sink', 'pedestrian', 'fPedOut', { color: '#dc2626' }),
  walkway: preset('conveyor', 'pedestrian', 'fWalkway', { color: '#a3a3a3', defaults: { speed: 70, spacing: 0.6, width: 2.5 }, points: [[0, 0], [15, 0]] }),
  escalator: preset('conveyor', 'pedestrian', 'fEscalator', { color: '#6b7280', defaults: { speed: 30, spacing: 0.8, width: 1.2, accumulating: true }, points: [[0, 0], [10, 0]] }),
  pedService: preset('process', 'pedestrian', 'fCounter', { color: '#7c3aed', w: 4, h: 1.6, defaults: MACHINE('desk', T(1, 2, 4), { capacity: 3 }) }),
  waitingArea: preset('queue', 'pedestrian', 'fWaiting', { color: '#a78bfa', w: 6, h: 4, defaults: { capacity: 0 } }),
  turnstile: preset('process', 'pedestrian', 'fTurnstile', { color: '#334155', w: 1.4, h: 1.6, defaults: MACHINE('turnstile', K(0.05), { capacity: 1 }) }),
  securityCheck: preset('process', 'pedestrian', 'fSecurity', { color: '#0f766e', w: 3, h: 2, defaults: MACHINE('scanner', T(0.5, 1, 2), { capacity: 1, defectRate: 0.02 }) }),
  elevator: preset('process', 'pedestrian', 'fElevator', { color: '#64748b', w: 2.4, h: 2.4, defaults: MACHINE('elevator', K(0.8), { capacity: 12 }) }),
  seatingArea: preset('rack', 'pedestrian', 'fSeats', { color: '#8b5cf6', w: 6, h: 4, defaults: { bays: 20, levels: 1, dwell: N(20, 5), storeTime: 0, retrieveTime: 0, policy: 'random' } }),
  // ── fluids (AnyLogic Fluid; continuous, solved with the SD integrator)
  tank: preset('stock', 'fluid', 'fTank', { color: '#0284c7', w: 3, h: 3, defaults: { initial: '200', capacity: 1000, unitLabel: 'L' } }),
  pipe: preset('flow', 'fluid', 'fPipe', { color: '#0ea5e9', defaults: { equation: '10', unitLabel: 'L' } }),
  valve: preset('flow', 'fluid', 'fValve', { color: '#0369a1', defaults: { equation: '20', openTime: 30, closedTime: 30, unitLabel: 'L' } }),
  pump: preset('flow', 'fluid', 'fPump', { color: '#1d4ed8', defaults: { equation: '15', unitLabel: 'L' } }),
  fluidSource: preset('flow', 'fluid', 'fFluidIn', { color: '#16a34a', ins: 0, defaults: { equation: '12', unitLabel: 'L' } }),
  fluidSink: preset('flow', 'fluid', 'fFluidOut', { color: '#dc2626', outs: 0, defaults: { equation: '10', unitLabel: 'L' } }),
  mixingTank: preset('stock', 'fluid', 'fMixer', { color: '#7c3aed', w: 3.2, h: 3.2, defaults: { initial: '0', capacity: 500, unitLabel: 'L' } }),
  // ── agents
  marketPopulation: preset('population', 'agent', 'fMarket', { color: '#0d9488', defaults: { count: 500, speed: 3, shape: 'dot', states: [{ name: 'Potential', color: '#94a3b8' }, { name: 'Adopter', color: '#16a34a' }], initial: 'Potential:1, Adopter:0', transitions: [{ from: 'Potential', to: 'Adopter', kind: 'rate', value: 0.002 }, { from: 'Potential', to: 'Adopter', kind: 'contact', value: 0.3, trigger: 'Adopter', radius: 1.5 }] } }),
  crowd: preset('population', 'agent', 'fCrowd', { color: '#7c3aed', defaults: { count: 300, speed: 40, shape: 'person', states: [{ name: 'Walking', color: '#8b5cf6' }, { name: 'Resting', color: '#f59e0b' }], initial: 'Walking:1', transitions: [{ from: 'Walking', to: 'Resting', kind: 'rate', value: 0.05 }, { from: 'Resting', to: 'Walking', kind: 'timeout', value: 5 }] } }),
  gameOfLife: preset('cellGrid', 'agent', 'fLife', { color: '#0f172a', defaults: { cols: 60, rows: 40, states: [{ name: 'Dead', color: '#e2e8f0' }, { name: 'Alive', color: '#0f172a' }], initial: 'Dead:0.75, Alive:0.25', transitions: [{ from: 'Dead', to: 'Alive', kind: 'neighbors', value: 3, max: 3, trigger: 'Alive' }, { from: 'Alive', to: 'Dead', kind: 'neighborsOutside', value: 2, max: 3, trigger: 'Alive' }] } }),
  // ── analysis and display
  gauge: preset('display', 'analysis', 'fGauge', { color: '#0f766e', w: 3, h: 3, defaults: { style: 'gauge', expression: 'time', min: 0, max: 100 } }),
  counter: preset('display', 'analysis', 'fCounter2', { color: '#1e293b', w: 3, h: 1.6, defaults: { style: 'counter', digits: 0 } }),
  progressBar: preset('display', 'analysis', 'fProgress', { color: '#2563eb', w: 6, h: 1.4, defaults: { style: 'bar', expression: 'time', min: 0, max: 100 } }),
  barChart: preset('chart', 'analysis', 'fBarChart', { color: '#0369a1', defaults: { chartKind: 'bar' } }),
  areaChart: preset('chart', 'analysis', 'fAreaChart', { color: '#0284c7', defaults: { chartKind: 'area' } }),
  pieChart: preset('chart', 'analysis', 'fPieChart', { color: '#7c3aed', w: 7, h: 6, defaults: { chartKind: 'pie' } }),
  histogramChart: preset('chart', 'analysis', 'fHistogram', { color: '#0891b2', defaults: { chartKind: 'histogram' } }),
  // ── layout
  fence: preset('wall', 'layout', 'fFence', { color: '#a3a3a3', defaults: { height: 1.2, thickness: 0.06 } }),
  floorMarking: preset('wall', 'layout', 'fMarking', { color: '#facc15', defaults: { height: 0.01, thickness: 0.12 } }),
  office: preset('zone', 'layout', 'fOffice', { color: '#a5b4fc', defaults: { fill: '#c7d2fe', opacity: 0.5, floor: 'wood' } }),
});

/** The behaviour a block type is built on (itself for the base types). */
export const baseOf = (type) => BLOCK_TYPES[type]?.base ?? type;

export const TYPE_IDS = Object.keys(BLOCK_TYPES);
export const typesIn = (cat) => TYPE_IDS.filter((id) => BLOCK_TYPES[id].cat === cat);
export const isPathType = (type) => Boolean(BLOCK_TYPES[type]?.path);
export const isSd = (type) => Boolean(BLOCK_TYPES[type]?.sd);

/** Default property values of a type (deep copies, so blocks never share arrays). */
export function defaultProps(type) {
  const out = {};
  for (const prop of BLOCK_TYPES[type]?.props ?? []) out[prop.key] = structuredClone(prop.def);
  return out;
}

/** The number of input / output ports of a block (some follow a property). */
export function portCount(block, side) {
  const spec = BLOCK_TYPES[block.type];
  if (!spec) return 0;
  const v = side === 'in' ? spec.ins : spec.outs;
  if (typeof v === 'string') return Math.max(1, Math.round(Number(block.props?.[v]) || 1));
  return v;
}

/** The world position of each port: { x, y, nx, ny } (n = the direction a link leaves or arrives). */
export function portsOf(block) {
  const spec = BLOCK_TYPES[block.type];
  const ins = []; const outs = [];
  if (!spec) return { ins, outs };
  if (spec.path) {
    const pts = pathPoints(block);
    const a = pts[0]; const b = pts[1] ?? [a[0] + 1, a[1]];
    const y = pts[pts.length - 1]; const z = pts[pts.length - 2] ?? [y[0] - 1, y[1]];
    const d1 = norm(b[0] - a[0], b[1] - a[1]); const d2 = norm(y[0] - z[0], y[1] - z[1]);
    if (spec.ins) ins.push({ x: a[0], y: a[1], nx: -d1[0], ny: -d1[1] });
    if (spec.outs) outs.push({ x: y[0], y: y[1], nx: d2[0], ny: d2[1] });
    return { ins, outs };
  }
  const nIn = portCount(block, 'in'); const nOut = portCount(block, 'out');
  const w = block.w ?? spec.w; const h = block.h ?? spec.h;
  const rot = ((block.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(rot); const s = Math.sin(rot);
  const place = (lx, ly, nx, ny) => ({ x: block.x + lx * c - ly * s, y: block.y + lx * s + ly * c, nx: nx * c - ny * s, ny: nx * s + ny * c });
  for (let i = 0; i < nIn; i++) ins.push(place(-w / 2, -h / 2 + (h * (i + 1)) / (nIn + 1), -1, 0));
  for (let i = 0; i < nOut; i++) {
    // A second, optional output (queue timeout, process rejects) sits at the bottom edge.
    if (spec.optionalOuts?.includes(i)) outs.push(place(0, h / 2, 0, 1));
    else { const n = nOut - (spec.optionalOuts?.length ?? 0); outs.push(place(w / 2, -h / 2 + (h * (i + 1)) / (n + 1), 1, 0)); }
  }
  return { ins, outs };
}

const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** World points of a path block (conveyor, road, wall). */
export function pathPoints(block) {
  const pts = block.points?.length >= 2 ? block.points : BLOCK_TYPES[block.type]?.defaultPoints ?? [[0, 0], [5, 0]];
  return pts.map(([x, y]) => [block.x + x, block.y + y]);
}

export function pathLength(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return L;
}

/** The point and direction at distance s along a polyline. */
export function pointAlong(points, s) {
  let left = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]; const [x1, y1] = points[i];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (left <= L || i === points.length - 1) {
      const f = L ? Math.min(1, left / L) : 0;
      return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, dx: L ? (x1 - x0) / L : 1, dy: L ? (y1 - y0) / L : 0 };
    }
    left -= L;
  }
  const last = points[points.length - 1];
  return { x: last[0], y: last[1], dx: 1, dy: 0 };
}

/** Bounding box of a block in world coordinates. */
export function blockBounds(block) {
  const spec = BLOCK_TYPES[block.type];
  if (spec?.path) {
    const pts = pathPoints(block);
    const pad = (Number(block.props?.width) || Number(block.props?.thickness) || 1) / 2 + (baseOf(block.type) === 'road' ? (Number(block.props?.lanes) || 1) * 1.75 : 0);
    const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
    return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
  }
  const w = block.w ?? spec?.w ?? 1; const h = block.h ?? spec?.h ?? 1;
  const rot = ((block.rot ?? 0) * Math.PI) / 180;
  const ex = Math.abs(w / 2 * Math.cos(rot)) + Math.abs(h / 2 * Math.sin(rot));
  const ey = Math.abs(w / 2 * Math.sin(rot)) + Math.abs(h / 2 * Math.cos(rot));
  return { x0: block.x - ex, y0: block.y - ey, x1: block.x + ex, y1: block.y + ey };
}

/** Default name stem of a type ("process" → "Process"; the model numbers them). */
export const nameStem = (type) => ({ resourcePool: 'Pool' })[type] ?? type[0].toUpperCase() + type.slice(1);
