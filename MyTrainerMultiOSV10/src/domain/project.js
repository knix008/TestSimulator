// A MyTrainer project (.mytrain, JSON): the dataset recipe (where the data
// comes from, preprocessing steps, split), the model graph, the training
// settings, the engine, the PyTorch code (generated, or edited by the user),
// past runs and, optionally, trained weights.
import { cleanGeneratorParams, GENERATORS } from './datasets.js';
import { SOUND_BANKS } from './datasets-media.js';
import { emptyModel, normalizeModel, outputNodes, inferShapes } from './graph.js';
import { cleanSplit, cleanSteps, defaultSplit } from './preprocess.js';

export const FORMAT = 'mytrainer';
export const FORMAT_VERSION = 1;
export const EXTENSION = 'mytrain';

export const OPTIMIZERS = ['adam', 'sgd', 'momentum', 'rmsprop', 'adagrad', 'adadelta', 'adamax'];
export const LOSSES = ['auto', 'categoricalCrossentropy', 'binaryCrossentropy', 'meanSquaredError', 'meanAbsoluteError', 'huber'];
export const SCHEDULES = ['none', 'step', 'exponential', 'cosine'];
export const ENGINES = ['tfjs', 'torch'];

export function defaultTrain() {
  return {
    optimizer: 'adam',
    learningRate: 0.01,
    epochs: 30,
    batchSize: 32,
    loss: 'auto',
    schedule: 'none',
    earlyStop: false,
    patience: 8,
    weightDecay: 0,
    snapshotEvery: 1,
    probeIndex: 0,
    // Advanced: optimizer hyperparameters, schedule, early stopping, data order, loss.
    momentum: 0.9,
    nesterov: false,
    beta1: 0.9,
    beta2: 0.999,
    epsilon: 1e-7,
    rho: 0.9,
    stepSize: 0,          // epochs per step (0: a quarter of the epochs)
    decayRate: 0,         // step / exponential factor (0: 0.5 / 0.95)
    minLearningRate: 0,
    warmupEpochs: 0,
    monitor: 'val_loss',
    minDelta: 0,
    restoreBest: false,
    shuffle: true,
    labelSmoothing: 0,
    mixup: 0,             // mixup α (classification): 0 = off
  };
}

export const MONITORS = ['val_loss', 'loss', 'val_acc', 'acc'];

const clampNumber = (value, min, max, fallback, integer = false) => {
  let n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  n = Math.min(max, Math.max(min, n));
  return integer ? Math.round(n) : n;
};

export function cleanTrain(raw = {}) {
  const base = defaultTrain();
  return {
    optimizer: OPTIMIZERS.includes(raw.optimizer) ? raw.optimizer : base.optimizer,
    learningRate: clampNumber(raw.learningRate, 1e-6, 10, base.learningRate),
    epochs: clampNumber(raw.epochs, 1, 10000, base.epochs, true),
    batchSize: clampNumber(raw.batchSize, 1, 4096, base.batchSize, true),
    loss: LOSSES.includes(raw.loss) ? raw.loss : base.loss,
    schedule: SCHEDULES.includes(raw.schedule) ? raw.schedule : base.schedule,
    earlyStop: raw.earlyStop === true,
    patience: clampNumber(raw.patience, 1, 1000, base.patience, true),
    weightDecay: clampNumber(raw.weightDecay, 0, 1, base.weightDecay),
    snapshotEvery: clampNumber(raw.snapshotEvery, 1, 1000, base.snapshotEvery, true),
    probeIndex: clampNumber(raw.probeIndex, 0, 1e7, base.probeIndex, true),
    momentum: clampNumber(raw.momentum, 0, 0.999, base.momentum),
    nesterov: raw.nesterov === true,
    beta1: clampNumber(raw.beta1, 0, 0.9999, base.beta1),
    beta2: clampNumber(raw.beta2, 0, 0.99999, base.beta2),
    epsilon: clampNumber(raw.epsilon, 1e-10, 1, base.epsilon),
    rho: clampNumber(raw.rho, 0, 0.9999, base.rho),
    stepSize: clampNumber(raw.stepSize, 0, 10000, base.stepSize, true),
    decayRate: clampNumber(raw.decayRate, 0, 1, base.decayRate),
    minLearningRate: clampNumber(raw.minLearningRate, 0, 10, base.minLearningRate),
    warmupEpochs: clampNumber(raw.warmupEpochs, 0, 1000, base.warmupEpochs, true),
    monitor: MONITORS.includes(raw.monitor) ? raw.monitor : base.monitor,
    minDelta: clampNumber(raw.minDelta, 0, 10, base.minDelta),
    restoreBest: raw.restoreBest === true,
    shuffle: raw.shuffle !== false,
    labelSmoothing: clampNumber(raw.labelSmoothing, 0, 0.5, base.labelSmoothing),
    mixup: clampNumber(raw.mixup, 0, 1, base.mixup),
  };
}

export function defaultDataset() {
  return { source: { kind: 'generator', id: 'spiral', params: cleanGeneratorParams('spiral') }, steps: [], split: defaultSplit() };
}

export function cleanDataset(raw = {}) {
  const source = raw.source ?? {};
  let clean;
  if (source.kind === 'generator' && GENERATORS[source.id]) clean = { kind: 'generator', id: source.id, params: cleanGeneratorParams(source.id, source.params) };
  else if (source.kind === 'table' && typeof source.text === 'string') {
    clean = { kind: 'table', name: String(source.name ?? 'data.csv'), text: source.text, target: source.target ?? null, features: Array.isArray(source.features) ? source.features.map(String) : null, task: ['auto', 'classification', 'regression'].includes(source.task) ? source.task : 'auto' };
  } else if (source.kind === 'images' && Array.isArray(source.items)) {
    clean = { kind: 'images', name: String(source.name ?? 'images'), size: clampNumber(source.size, 4, 128, 28, true), channels: source.channels === 3 ? 3 : 1, items: source.items.filter((item) => item && typeof item.label === 'string' && typeof item.data === 'string') };
  } else if (source.kind === 'sounds' && (SOUND_BANKS[source.bank] || Array.isArray(source.items))) {
    clean = { kind: 'sounds', name: String(source.name ?? 'sounds'), seconds: clampNumber(source.seconds, 0.3, 3, 1), copies: clampNumber(source.copies, 1, 8, 3, true), noiseClass: source.noiseClass !== false, layout: source.layout === 'seq' ? 'seq' : 'image', seed: clampNumber(source.seed, 1, 9999, 1, true) };
    if (SOUND_BANKS[source.bank]) clean.bank = source.bank;
    else clean.items = source.items.filter((item) => item && typeof item.label === 'string' && typeof item.data === 'string');
  } else clean = defaultDataset().source;
  return { source: clean, steps: cleanSteps(raw.steps), split: cleanSplit(raw.split) };
}

export function newProject(name = 'Untitled') {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name,
    description: '',
    dataset: defaultDataset(),
    model: emptyModel(),
    train: defaultTrain(),
    engine: 'tfjs',
    code: { text: null, custom: false },
    runs: [],
    weights: null,
  };
}

/** Repairs anything read from a file. */
export function normalizeProject(raw) {
  const base = newProject();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 200) : base.name,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 20000) : '',
    sample: typeof raw.sample === 'string' ? raw.sample : undefined,
    dataset: cleanDataset(raw.dataset),
    model: normalizeModel(raw.model),
    train: cleanTrain(raw.train),
    engine: ENGINES.includes(raw.engine) ? raw.engine : 'tfjs',
    code: { text: typeof raw.code?.text === 'string' ? raw.code.text : null, custom: raw.code?.custom === true && typeof raw.code?.text === 'string' },
    runs: Array.isArray(raw.runs) ? raw.runs.filter((run) => run && Array.isArray(run.history)).slice(-20) : [],
    weights: raw.weights && typeof raw.weights === 'object' && typeof raw.weights.data === 'string' ? raw.weights : null,
    variants: cleanVariants(raw.variants),
  };
}

/** Alternative models of a project (a sample with a choice of architecture), or undefined. */
function cleanVariants(raw) {
  if (!raw || !Array.isArray(raw.list)) return undefined;
  const list = raw.list.filter((v) => v && typeof v.id === 'string' && v.model).map((v) => ({ id: v.id, name: String(v.name ?? v.id), description: String(v.description ?? ''), model: normalizeModel(v.model) }));
  if (list.length < 2) return undefined;
  return { current: list.some((v) => v.id === raw.current) ? raw.current : list[0].id, list };
}

export function serializeProject(project, { includeWeights = true } = {}) {
  const out = { ...project, format: FORMAT, version: FORMAT_VERSION };
  if (!includeWeights) out.weights = null;
  return JSON.stringify(out, null, 1);
}

export function parseProject(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`project.badJson: ${error.message}`);
  }
  if (raw?.format !== FORMAT) throw new Error('project.notProject');
  return normalizeProject(raw);
}

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
export const stripExtension = (name) => String(name ?? '').replace(/\.[^.]+$/, '');
export const isProjectFileName = (name) => new RegExp(`\\.${EXTENSION}$`, 'i').test(String(name ?? ''));

/**
 * The task as the model sees it: binary classification uses one sigmoid output or two
 * softmax outputs, whichever the model ends with.
 */
export function effectiveTask(task, model, inputShape) {
  if (!task) return null;
  const out = { ...task, inputShape };
  if (task.kind === 'classification' && task.classes === 2) {
    const outputs = outputNodes(model);
    const shape = outputs.length === 1 ? inferShapes(model, inputShape).get(outputs[0].id)?.shape : null;
    out.binaryOutput = shape?.at(-1) === 2 ? 2 : 1;
  }
  return out;
}

/** The loss to use: the user's choice, or the natural one for the task. */
export function resolveLoss(train, task) {
  if (train.loss !== 'auto') return train.loss;
  if (task?.kind === 'classification') return task.classes === 2 && task.binaryOutput === 1 ? 'binaryCrossentropy' : 'categoricalCrossentropy';
  if (task?.kind === 'reconstruction') return 'meanSquaredError';
  return 'meanSquaredError';
}

/** Learning rate at an epoch (0-based) for the schedule. */
export function scheduledRate(train, epoch) {
  const lr = train.learningRate;
  const low = Math.min(train.minLearningRate ?? 0, lr);
  const step = train.stepSize || Math.max(1, Math.round(train.epochs / 4));
  let rate;
  switch (train.schedule) {
    case 'step': rate = lr * (train.decayRate || 0.5) ** Math.floor(epoch / step); break;
    case 'exponential': rate = lr * (train.decayRate || 0.95) ** epoch; break;
    case 'cosine': rate = low + (lr - low) * 0.5 * (1 + Math.cos((Math.PI * epoch) / Math.max(1, train.epochs))); break;
    default: rate = lr;
  }
  rate = Math.max(low, rate);
  // Warm-up: the first epochs climb linearly to the scheduled rate.
  if (train.warmupEpochs > 0 && epoch < train.warmupEpochs) rate *= (epoch + 1) / (train.warmupEpochs + 1);
  return rate;
}
