// Model graph + training settings → a complete, readable PyTorch script.
//
// Shapes in the app are channels-last (TensorFlow / Keras style). PyTorch wants
// images as (N, C, H, W) and Conv1d input as (N, C, L), so the generator keeps
// track of each tensor's layout and inserts the permute / transpose calls a
// layer needs — visibly, in the code, with a comment. Every layer output goes
// through mt.trace(name, tensor) so MyTrainer can show activations per node; the
// bridge module (python/mytrainer_bridge.py) also loads the data, reports
// progress and answers probes from the app.
import { incoming, inferShapes, lastActivation, nodeById, outputNodes, topoOrder } from './graph.js';
import { parseShape } from './layers.js';
import { resolveLoss } from './project.js';

const PY_BUILTINS = new Set(['input', 'sum', 'max', 'min', 'list', 'dict', 'type', 'id', 'len', 'map', 'filter', 'range', 'iter', 'next', 'object', 'str', 'int', 'float', 'bool', 'set', 'tuple', 'print', 'format', 'hash', 'abs', 'all', 'any', 'zip', 'out', 'loss', 'epoch', 'logs', 'optimizer', 'scheduler', 'device', 'xb', 'yb', 'copy', 'math', 'learning_rate', 'monitor', 'value', 'watched', 'best_state', 'group']);
const varName = (name) => (PY_BUILTINS.has(name) ? `${name}_` : name);
const pyNumber = (value) => (Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(8))));
const pyBool = (value) => (value ? 'True' : 'False');
const pyString = (value) => JSON.stringify(String(value));

/** The PyTorch expression applying an activation to `expr` (null: nothing to apply). */
export function activationExpr(activation, expr, channelFirst = false) {
  switch (activation) {
    case 'linear': return null;
    case 'relu': return `torch.relu(${expr})`;
    case 'relu6': return `F.relu6(${expr})`;
    case 'elu': return `F.elu(${expr})`;
    case 'selu': return `F.selu(${expr})`;
    case 'sigmoid': return `torch.sigmoid(${expr})`;
    case 'hardSigmoid': return `torch.clamp(0.2 * ${expr} + 0.5, 0.0, 1.0)`;
    case 'tanh': return `torch.tanh(${expr})`;
    case 'softmax': return `torch.softmax(${expr}, dim=${channelFirst ? 1 : -1})`;
    case 'softplus': return `F.softplus(${expr})`;
    case 'softsign': return `F.softsign(${expr})`;
    case 'swish': return `F.silu(${expr})`;
    case 'mish': return `F.mish(${expr})`;
    case 'gelu': return `F.gelu(${expr})`;
    default: return null;
  }
}

const isChannelFirst = (layout) => layout === 'nchw' || layout === 'ncl';
const CONVERT = {
  'nhwc>nchw': ['.permute(0, 3, 1, 2)', '(N, H, W, C) → (N, C, H, W)'],
  'nchw>nhwc': ['.permute(0, 2, 3, 1)', '(N, C, H, W) → (N, H, W, C)'],
  'nlc>ncl': ['.transpose(1, 2)', '(N, L, C) → (N, C, L)'],
  'ncl>nlc': ['.transpose(1, 2)', '(N, C, L) → (N, L, C)'],
};
/** The channels-last layout for a shape rank (no batch). */
const lastLayout = (rank) => (rank === 3 ? 'nhwc' : rank === 2 ? 'nlc' : 'flat');
const firstLayout = (rank) => (rank === 3 ? 'nchw' : rank === 2 ? 'ncl' : 'flat');
const toLast = (layout) => (layout === 'nchw' ? 'nhwc' : layout === 'ncl' ? 'nlc' : layout);

function samePadding(length, kernel, stride) {
  const out = Math.ceil(length / stride);
  const total = Math.max((out - 1) * stride + kernel - length, 0);
  return [Math.floor(total / 2), total - Math.floor(total / 2)];
}

/**
 * Generates the script. options = { project, task (effectiveTask), inputShape, hooks (mt.trace lines, default true) }.
 * Returns { code, errors: [] } — errors when the model cannot be turned into PyTorch (the code is still the best effort).
 */
export function generatePytorch({ project, task, inputShape, hooks = true }) {
  const graph = project.model;
  const train = project.train;
  const errors = [];
  let order;
  try { order = topoOrder(graph); } catch { return { code: '# The model has a cycle: fix the connections in the model editor.\n', errors: ['graph.cycle'] }; }
  const shapes = inferShapes(graph, inputShape);
  const outputs = outputNodes(graph);
  const init = [];
  const forward = [];
  const layouts = new Map();
  const names = new Map(graph.nodes.map((node) => [node.id, varName(node.name)]));
  const helpers = new Set();
  const trace = (node, expr, layout) => (hooks ? `mt.trace(${pyString(node.name)}, ${expr}${isChannelFirst(layout) ? `, ${pyString(layout)}` : ''})` : expr);

  /** The expression of a node's input in the wanted layout (adds a conversion when needed). */
  const inputIn = (edgeSource, wanted, notes) => {
    const have = layouts.get(edgeSource);
    const variable = names.get(edgeSource);
    if (!wanted || have === wanted || have === 'flat' || have === 'tokens') return variable;
    const conversion = CONVERT[`${have}>${wanted}`];
    if (!conversion) return variable;
    notes.push(conversion[1]);
    return `${variable}${conversion[0]}`;
  };

  for (const id of order) {
    const node = nodeById(graph, id);
    const p = node.params;
    const v = names.get(id);
    const self = `self.${node.name}`;
    const sources = incoming(graph, id).map((edge) => edge.from);
    const inShape = sources.length ? shapes.get(sources[0])?.shape : null;
    const outShape = shapes.get(id)?.shape;
    if (shapes.get(id)?.error) errors.push(`${node.name}: ${shapes.get(id).error.code}`);
    const notes = [];
    const line = (expr, layout, comment = '') => {
      layouts.set(id, layout);
      const allNotes = [...notes, comment].filter(Boolean).join('; ');
      forward.push(`        ${v} = ${trace(node, expr, layout)}${allNotes ? `  # ${allNotes}` : ''}`);
    };
    if (node.type === 'input') {
      const shape = inputShape ?? parseShape(p.shape) ?? [1];
      const tokens = outputsOf(graph, id).some((next) => next.type === 'embedding' || next.type === 'tokenPositionEmbedding');
      if (shape.length === 3) {
        forward.push(`        ${v} = ${hooks ? `mt.trace(${pyString(node.name)}, x)` : 'x'}  # (N, ${shape.join(', ')}) channels-last, as MyTrainer stores pictures`);
        layouts.set(id, 'nhwc');
      } else {
        forward.push(`        ${v} = ${hooks ? `mt.trace(${pyString(node.name)}, x)` : 'x'}  # (N, ${shape.join(', ')})`);
        layouts.set(id, tokens ? 'tokens' : lastLayout(shape.length));
      }
      continue;
    }
    if (!inShape) {
      forward.push(`        # ${node.name}: not connected`);
      continue;
    }
    const src = sources[0];
    switch (node.type) {
      case 'dense': {
        init.push(`        ${self} = nn.Linear(${inShape.at(-1)}, ${p.units}${p.useBias ? '' : ', bias=False'})`);
        const x = inputIn(src, inShape.length === 3 ? 'nhwc' : inShape.length === 2 ? 'nlc' : null, notes);
        const call = `${self}(${x})`;
        line(activationExpr(p.activation, call) ?? call, lastLayout(outShape.length));
        break;
      }
      case 'activation': {
        const layout = layouts.get(src);
        line(activationExpr(p.activation, names.get(src), isChannelFirst(layout)) ?? names.get(src), layout);
        break;
      }
      case 'leakyRelu':
        line(`F.leaky_relu(${names.get(src)}, negative_slope=${pyNumber(p.alpha)})`, layouts.get(src));
        break;
      case 'dropout':
        init.push(`        ${self} = nn.Dropout(p=${pyNumber(p.rate)})`);
        line(`${self}(${names.get(src)})`, layouts.get(src));
        break;
      case 'batchNorm': {
        const kind = inShape.length === 3 ? '2d' : '1d';
        init.push(`        ${self} = nn.BatchNorm${kind}(${inShape.at(-1)}, eps=${pyNumber(p.epsilon)}, momentum=${pyNumber(Math.max(0, 1 - p.momentum))})  # Keras momentum ${p.momentum} = PyTorch ${pyNumber(1 - p.momentum)}`);
        const wanted = inShape.length === 1 ? null : firstLayout(inShape.length);
        const x = inputIn(src, wanted, notes);
        line(`${self}(${x})`, wanted ?? 'flat');
        break;
      }
      case 'layerNorm': {
        init.push(`        ${self} = nn.LayerNorm(${inShape.at(-1)}, eps=${pyNumber(p.epsilon)})`);
        const x = inputIn(src, inShape.length === 2 ? 'nlc' : null, notes);
        line(`${self}(${x})`, lastLayout(inShape.length));
        break;
      }
      case 'flatten': {
        const x = inputIn(src, inShape.length >= 2 ? lastLayout(inShape.length) : null, notes);
        line(`torch.flatten(${x}, 1)`, 'flat', inShape.length >= 2 ? 'flattened channels-last, like Keras' : '');
        break;
      }
      case 'reshape': {
        const target = parseShape(p.targetShape) ?? outShape;
        const x = inputIn(src, inShape.length >= 2 ? lastLayout(inShape.length) : null, notes);
        line(`${x}.reshape(-1, ${target.join(', ')})`, lastLayout(target.length));
        break;
      }
      case 'conv2d': {
        let x = inputIn(src, 'nchw', notes);
        let padding = p.padding === 'same' ? (p.strides === 1 ? '"same"' : '0') : '0';
        if (p.padding === 'same' && p.strides > 1) {
          const [top, bottom] = samePadding(inShape[0], p.kernelSize, p.strides);
          const [left, right] = samePadding(inShape[1], p.kernelSize, p.strides);
          init.push(`        ${self}_pad = nn.ZeroPad2d((${left}, ${right}, ${top}, ${bottom}))  # "same" padding with stride ${p.strides}`);
          x = `${self}_pad(${x})`;
        }
        if (p.padding === 'valid') padding = '0';
        init.push(`        ${self} = nn.Conv2d(${inShape[2]}, ${p.filters}, kernel_size=${p.kernelSize}, stride=${p.strides}, padding=${padding}${p.useBias ? '' : ', bias=False'})`);
        const call = `${self}(${x})`;
        line(activationExpr(p.activation, call, true) ?? call, 'nchw');
        break;
      }
      case 'maxPool2d':
      case 'avgPool2d':
        init.push(`        ${self} = nn.${node.type === 'maxPool2d' ? 'MaxPool2d' : 'AvgPool2d'}(kernel_size=${p.poolSize}, stride=${p.strides})`);
        line(`${self}(${inputIn(src, 'nchw', notes)})`, 'nchw');
        break;
      case 'globalAvgPool2d':
        line(`${inputIn(src, 'nchw', notes)}.mean(dim=(2, 3))`, 'flat', 'global average over height and width');
        break;
      case 'upSampling2d':
        init.push(`        ${self} = nn.Upsample(scale_factor=${p.size}, mode="nearest")`);
        line(`${self}(${inputIn(src, 'nchw', notes)})`, 'nchw');
        break;
      case 'conv1d': {
        let x = inputIn(src, 'ncl', notes);
        let padding = p.padding === 'same' && p.strides === 1 ? '"same"' : '0';
        if (p.padding === 'same' && p.strides > 1) {
          const [left, right] = samePadding(inShape[0], p.kernelSize, p.strides);
          init.push(`        ${self}_pad = nn.ConstantPad1d((${left}, ${right}), 0.0)  # "same" padding with stride ${p.strides}`);
          x = `${self}_pad(${x})`;
          padding = '0';
        }
        init.push(`        ${self} = nn.Conv1d(${inShape[1]}, ${p.filters}, kernel_size=${p.kernelSize}, stride=${p.strides}, padding=${padding}${p.useBias ? '' : ', bias=False'})`);
        const call = `${self}(${x})`;
        line(activationExpr(p.activation, call, true) ?? call, 'ncl');
        break;
      }
      case 'maxPool1d':
        init.push(`        ${self} = nn.MaxPool1d(kernel_size=${p.poolSize}, stride=${p.strides})`);
        line(`${self}(${inputIn(src, 'ncl', notes)})`, 'ncl');
        break;
      case 'globalAvgPool1d': {
        const layout = layouts.get(src);
        line(`${names.get(src)}.mean(dim=${layout === 'ncl' ? 2 : 1})`, 'flat', 'average over the time steps');
        break;
      }
      case 'simpleRnn':
      case 'lstm':
      case 'gru': {
        const cls = { simpleRnn: 'RNN', lstm: 'LSTM', gru: 'GRU' }[node.type];
        const extra = node.type === 'simpleRnn' ? `, nonlinearity=${pyString(p.activation)}` : '';
        init.push(`        ${self} = nn.${cls}(${inShape[1]}, ${p.units}, batch_first=True${extra})`);
        const x = inputIn(src, 'nlc', notes);
        const select = p.returnSequences ? '' : '[:, -1, :]';
        line(`${self}(${x})[0]${select}`, p.returnSequences ? 'nlc' : 'flat', p.returnSequences ? 'every time step' : 'output of the last time step');
        break;
      }
      case 'embedding':
        init.push(`        ${self} = nn.Embedding(${p.inputDim}, ${p.outputDim})`);
        line(`${self}(${names.get(src)}.long())`, 'nlc', 'word ids → vectors');
        break;
      case 'depthwiseConv2d': {
        // A convolution per channel: groups = channels (depth multiplier m → C·m outputs).
        let x = inputIn(src, 'nchw', notes);
        let padding = p.padding === 'same' && p.strides === 1 ? '"same"' : '0';
        if (p.padding === 'same' && p.strides > 1) {
          const [top, bottom] = samePadding(inShape[0], p.kernelH, p.strides);
          const [left, right] = samePadding(inShape[1], p.kernelW, p.strides);
          init.push(`        ${self}_pad = nn.ZeroPad2d((${left}, ${right}, ${top}, ${bottom}))  # "same" padding with stride ${p.strides}`);
          x = `${self}_pad(${x})`;
        }
        const channels = inShape[2];
        init.push(`        ${self} = nn.Conv2d(${channels}, ${channels * p.depthMultiplier}, kernel_size=(${p.kernelH}, ${p.kernelW}), stride=${p.strides}, padding=${padding}, groups=${channels}${p.useBias ? '' : ', bias=False'})  # depthwise`);
        const call = `${self}(${x})`;
        line(activationExpr(p.activation, call, true) ?? call, 'nchw');
        break;
      }
      case 'freqAvgPool':
        line(`${inputIn(src, 'nchw', notes)}.mean(dim=2, keepdim=True)`, 'nchw', 'average over frequency (height 1, broadcast back by an add)');
        break;
      case 'tokenPositionEmbedding':
        helpers.add('tokenPosition');
        init.push(`        ${self} = TokenPositionEmbedding(${p.inputDim}, ${inShape[0]}, ${p.outputDim})`);
        line(`${self}(${names.get(src)})`, 'nlc', 'token ids → vectors + position vectors');
        break;
      case 'selfAttention':
        helpers.add('attention');
        init.push(`        ${self} = SelfAttention(${inShape[1]}, heads=${p.heads}, causal=${pyBool(p.causal)})`);
        line(`${self}(${inputIn(src, 'nlc', notes)})`, 'nlc');
        break;
      case 'lastStep':
        line(`${inputIn(src, 'nlc', notes)}[:, -1, :]`, 'flat', 'the last time step');
        break;
      case 'add':
      case 'concatenate': {
        const first = layouts.get(sources[0]);
        const wanted = first === 'flat' || first === 'tokens' ? null : first;
        const parts = sources.map((source) => inputIn(source, wanted, notes));
        if (node.type === 'add') line(parts.join(' + '), wanted ?? 'flat');
        else line(`torch.cat([${parts.join(', ')}], dim=${isChannelFirst(wanted) ? 1 : -1})`, wanted ?? 'flat');
        break;
      }
      default:
        errors.push(`${node.name}: ${node.type}`);
        forward.push(`        # ${node.name} (${node.type}) has no PyTorch translation`);
    }
  }

  const out = outputs[0];
  const outVar = out ? names.get(out.id) : 'x';
  const outLayout = out ? layouts.get(out.id) : 'flat';
  const loss = resolveLoss(train, task);
  const last = out ? lastActivation(graph, out) : 'linear';
  const classification = task?.kind === 'classification';
  const binary = classification && task.classes === 2 && task.binaryOutput === 1;
  const lossLine = {
    categoricalCrossentropy: train.labelSmoothing > 0
      ? (last === 'softmax' ? `lambda out, y: -(((1 - ${pyNumber(train.labelSmoothing)}) * F.one_hot(y, out.shape[1]) + ${pyNumber(train.labelSmoothing)} / out.shape[1]) * torch.log(out.clamp_min(1e-7))).sum(1).mean()  # label smoothing` : `nn.CrossEntropyLoss(label_smoothing=${pyNumber(train.labelSmoothing)})`)
      : last === 'softmax' ? 'lambda out, y: F.nll_loss(torch.log(out.clamp_min(1e-7)), y)  # the model already ends with softmax' : 'nn.CrossEntropyLoss()',
    binaryCrossentropy: last === 'sigmoid' ? 'nn.BCELoss()' : 'nn.BCEWithLogitsLoss()',
    meanAbsoluteError: 'nn.L1Loss()',
    huber: 'nn.HuberLoss(delta=1.0)',
    meanSquaredError: 'nn.MSELoss()',
  }[loss] ?? 'nn.MSELoss()';
  const optimizerLine = {
    sgd: 'torch.optim.SGD(model.parameters(), lr=lr, weight_decay=wd)',
    momentum: 'torch.optim.SGD(model.parameters(), lr=lr, momentum=CONFIG["momentum"], nesterov=CONFIG["nesterov"], weight_decay=wd)',
    rmsprop: 'torch.optim.RMSprop(model.parameters(), lr=lr, alpha=CONFIG["rho"], eps=CONFIG["epsilon"], weight_decay=wd)',
    adagrad: 'torch.optim.Adagrad(model.parameters(), lr=lr, weight_decay=wd)',
    adadelta: 'torch.optim.Adadelta(model.parameters(), lr=lr, rho=CONFIG["rho"], eps=CONFIG["epsilon"], weight_decay=wd)',
    adamax: 'torch.optim.Adamax(model.parameters(), lr=lr, betas=(CONFIG["beta1"], CONFIG["beta2"]), eps=CONFIG["epsilon"], weight_decay=wd)',
    adam: 'torch.optim.Adam(model.parameters(), lr=lr, betas=(CONFIG["beta1"], CONFIG["beta2"]), eps=CONFIG["epsilon"], weight_decay=wd)',
  }[train.optimizer];
  const correct = classification
    ? binary
      ? `((out > ${last === 'sigmoid' ? '0.5' : '0.0'}).float() == y).sum().item()`
      : '(out.argmax(dim=1) == y).sum().item()'
    : null;
  const flattenOut = outLayout && outLayout !== 'flat' && outLayout !== 'tokens' && isChannelFirst(outLayout) ? CONVERT[`${outLayout}>${toLast(outLayout)}`][0] : '';

  const lines = [];
  lines.push(`"""${project.name || 'MyTrainer model'} — PyTorch script generated by MyTrainer.`);
  lines.push('');
  lines.push('Edit freely: the "mt" module (mytrainer_bridge) loads the data that MyTrainer prepared,');
  lines.push('reports progress, and mt.trace() / mt.watch() let MyTrainer show what every layer and');
  lines.push('neuron does. Remove them and the script still trains; MyTrainer then only shows the logs.');
  lines.push('"""');
  lines.push('import copy');
  lines.push('import math');
  lines.push('');
  lines.push('import torch');
  lines.push('import torch.nn as nn');
  lines.push('import torch.nn.functional as F');
  lines.push('');
  lines.push('import mytrainer_bridge as mt');
  lines.push('');
  lines.push('# Training settings (a Python dictionary: change a value here or in MyTrainer\'s Train tab).');
  lines.push('CONFIG = {');
  lines.push(`    "epochs": ${train.epochs},`);
  lines.push(`    "batch_size": ${train.batchSize},`);
  lines.push(`    "learning_rate": ${pyNumber(train.learningRate)},`);
  lines.push(`    "weight_decay": ${pyNumber(train.weightDecay)},`);
  lines.push(`    "optimizer": ${pyString(train.optimizer)},`);
  lines.push(`    "loss": ${pyString(loss)},`);
  lines.push(`    "schedule": ${pyString(train.schedule)},`);
  lines.push(`    "step_size": ${train.stepSize},  # epochs per step (0: a quarter of the epochs)`);
  lines.push(`    "decay_rate": ${pyNumber(train.decayRate)},  # step / exponential factor (0: 0.5 / 0.95)`);
  lines.push(`    "min_learning_rate": ${pyNumber(train.minLearningRate)},`);
  lines.push(`    "warmup_epochs": ${train.warmupEpochs},`);
  lines.push(`    "momentum": ${pyNumber(train.momentum)},`);
  lines.push(`    "nesterov": ${pyBool(train.nesterov)},`);
  lines.push(`    "beta1": ${pyNumber(train.beta1)},`);
  lines.push(`    "beta2": ${pyNumber(train.beta2)},`);
  lines.push(`    "epsilon": ${pyNumber(train.epsilon)},`);
  lines.push(`    "rho": ${pyNumber(train.rho)},`);
  lines.push(`    "shuffle": ${pyBool(train.shuffle)},`);
  lines.push(`    "label_smoothing": ${pyNumber(train.labelSmoothing)},`);
  lines.push(`    "monitor": ${pyString(train.monitor)},  # what early stopping watches`);
  lines.push(`    "min_delta": ${pyNumber(train.minDelta)},`);
  lines.push(`    "restore_best": ${pyBool(train.restoreBest)},`);
  lines.push(`    "early_stopping": ${pyBool(train.earlyStop)},`);
  lines.push(`    "patience": ${train.patience},`);
  lines.push('}');
  lines.push('');
  lines.push('');
  if (helpers.has('tokenPosition')) lines.push(...TOKEN_POSITION_PY, '', '');
  if (helpers.has('attention')) lines.push(...ATTENTION_PY, '', '');
  lines.push('class Net(nn.Module):');
  lines.push(`    """${graph.nodes.length} layers; input ${inputShape ? `(${inputShape.join(', ')})` : '?'} → output ${out && shapes.get(out.id)?.shape ? `(${shapes.get(out.id).shape.join(', ')})` : '?'}."""`);
  lines.push('');
  lines.push('    def __init__(self):');
  lines.push('        super().__init__()');
  if (init.length) lines.push(...init); else lines.push('        pass');
  lines.push('');
  lines.push('    def forward(self, x):');
  lines.push(...forward);
  lines.push(`        return ${outVar}${flattenOut}`);
  lines.push('');
  lines.push('');
  lines.push(`loss_fn = ${lossLine}`);
  lines.push('');
  lines.push('');
  lines.push('def learning_rate(epoch):');
  lines.push('    """The learning rate of an epoch (0-based): schedule, floor and warm-up, as in MyTrainer."""');
  lines.push('    lr, low = CONFIG["learning_rate"], min(CONFIG["min_learning_rate"], CONFIG["learning_rate"])');
  lines.push('    step = CONFIG["step_size"] or max(1, round(CONFIG["epochs"] / 4))');
  lines.push('    if CONFIG["schedule"] == "step":');
  lines.push('        rate = lr * (CONFIG["decay_rate"] or 0.5) ** (epoch // step)');
  lines.push('    elif CONFIG["schedule"] == "exponential":');
  lines.push('        rate = lr * (CONFIG["decay_rate"] or 0.95) ** epoch');
  lines.push('    elif CONFIG["schedule"] == "cosine":');
  lines.push('        rate = low + (lr - low) * 0.5 * (1 + math.cos(math.pi * epoch / max(1, CONFIG["epochs"])))');
  lines.push('    else:');
  lines.push('        rate = lr');
  lines.push('    rate = max(low, rate)');
  lines.push('    if CONFIG["warmup_epochs"] > 0 and epoch < CONFIG["warmup_epochs"]:');
  lines.push('        rate *= (epoch + 1) / (CONFIG["warmup_epochs"] + 1)');
  lines.push('    return rate');
  lines.push('');
  lines.push('');
  lines.push('def evaluate(model, x, y, device, prefix=""):');
  lines.push('    """Loss (and accuracy) over a whole data part, without training."""');
  lines.push('    if x is None or len(x) == 0:');
  lines.push('        return {}');
  lines.push('    model.eval()');
  lines.push('    total, right = 0.0, 0');
  lines.push('    with torch.no_grad():');
  lines.push('        for xb, yb in mt.batches(x, y, 256):');
  lines.push('            xb, yb = xb.to(device), yb.to(device)');
  lines.push('            out = model(xb)');
  lines.push('            total += loss_fn(out, yb).item() * len(xb)');
  if (correct) lines.push(`            right += ${correct.replace(/\by\b/g, 'yb')}`);
  lines.push(`    logs = {prefix + "loss": total / len(x)}`);
  if (correct) lines.push('    logs[prefix + "acc"] = right / len(x)');
  lines.push('    return logs');
  lines.push('');
  lines.push('');
  lines.push('def main():');
  lines.push('    data = mt.load_data()  # dict: x_train, y_train, x_val, y_val, x_test, y_test (torch tensors)');
  lines.push('    device = mt.device()  # "cuda", "mps" or "cpu"');
  lines.push('    model = Net().to(device)');
  lines.push('    mt.watch(model, loss_fn)  # weights, gradients and activations for MyTrainer');
  lines.push('    lr, wd = CONFIG["learning_rate"], CONFIG["weight_decay"]');
  lines.push(`    optimizer = ${optimizerLine}`);
  lines.push('    best, waited, best_state = float("inf"), 0, None');
  lines.push('');
  lines.push('    for epoch in range(CONFIG["epochs"]):');
  lines.push('        for group in optimizer.param_groups:');
  lines.push('            group["lr"] = learning_rate(epoch)');
  lines.push('        model.train()');
  lines.push('        total, right, seen = 0.0, 0, 0');
  lines.push('        for xb, yb in mt.batches(data["x_train"], data["y_train"], CONFIG["batch_size"], shuffle=CONFIG["shuffle"]):');
  lines.push('            xb, yb = xb.to(device), yb.to(device)');
  lines.push('            optimizer.zero_grad()');
  lines.push('            out = model(xb)');
  lines.push('            loss = loss_fn(out, yb)');
  lines.push('            loss.backward()');
  lines.push('            optimizer.step()');
  lines.push('            total += loss.item() * len(xb)');
  lines.push('            seen += len(xb)');
  if (correct) lines.push(`            right += ${correct.replace(/\by\b/g, 'yb')}`);
  lines.push('            mt.report_batch(epoch, loss.item())');
  lines.push(`        logs = {"loss": total / seen${correct ? ', "acc": right / seen' : ''}}`);
  lines.push('        logs.update(evaluate(model, data["x_val"], data["y_val"], device, prefix="val_"))');
  lines.push('        mt.report_epoch(epoch, logs, lr=optimizer.param_groups[0]["lr"])');
  lines.push('        monitor = CONFIG["monitor"]');
  lines.push('        value = logs.get(monitor, logs.get(monitor.replace("val_", ""), logs["loss"]))');
  lines.push('        watched = -value if monitor.endswith("acc") else value');
  lines.push('        if watched < best - max(1e-6, CONFIG["min_delta"]):');
  lines.push('            best, waited = watched, 0');
  lines.push('            if CONFIG["early_stopping"] and CONFIG["restore_best"]:');
  lines.push('                best_state = copy.deepcopy(model.state_dict())');
  lines.push('        else:');
  lines.push('            waited += 1');
  lines.push('        if mt.should_stop() or (CONFIG["early_stopping"] and waited >= CONFIG["patience"]):');
  lines.push('            break');
  lines.push('');
  lines.push('    if best_state is not None:');
  lines.push('        model.load_state_dict(best_state)  # the best epoch (early stopping, restore best)');
  lines.push('    mt.finish(model, evaluate(model, data["x_test"], data["y_test"], device))');
  lines.push('    mt.serve(model)  # answers MyTrainer\'s test requests until the app stops the run');
  lines.push('');
  lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push('    main()');
  lines.push('');
  return { code: lines.join('\n'), errors };
}

function outputsOf(graph, id) {
  return graph.edges.filter((edge) => edge.from === id).map((edge) => nodeById(graph, edge.to)).filter(Boolean);
}

const TOKEN_POSITION_PY = [
  'class TokenPositionEmbedding(nn.Module):',
  '    """Token ids → vectors, plus a learned vector for every position (the input of a transformer)."""',
  '',
  '    def __init__(self, vocab, length, dim):',
  '        super().__init__()',
  '        self.embeddings = nn.Embedding(vocab, dim)',
  '        nn.init.normal_(self.embeddings.weight, std=0.02)',
  '        self.positions = nn.Parameter(torch.randn(length, dim) * 0.02)',
  '',
  '    def forward(self, ids):',
  '        return self.embeddings(ids.long()) + self.positions',
];

const ATTENTION_PY = [
  'class SelfAttention(nn.Module):',
  '    """Multi-head self-attention: softmax(Q·Kᵀ/√d)·V per head. Causal: a token sees only itself and earlier tokens (GPT)."""',
  '',
  '    def __init__(self, dim, heads, causal):',
  '        super().__init__()',
  '        self.heads, self.causal = heads, causal',
  '        self.query = nn.Linear(dim, dim)',
  '        self.key = nn.Linear(dim, dim)',
  '        self.value = nn.Linear(dim, dim)',
  '        self.output = nn.Linear(dim, dim)',
  '        self.weights = None  # the last attention weights (N, heads, L, L), for MyTrainer',
  '',
  '    def forward(self, x):',
  '        n, length, dim = x.shape',
  '        h, dh = self.heads, dim // self.heads',
  '        split = lambda t: t.view(n, length, h, dh).transpose(1, 2)',
  '        q, k, v = split(self.query(x)), split(self.key(x)), split(self.value(x))',
  '        scores = q @ k.transpose(-2, -1) / dh ** 0.5',
  '        if self.causal:',
  '            later = torch.ones(length, length, dtype=torch.bool, device=x.device).triu(1)',
  '            scores = scores.masked_fill(later, float("-inf"))',
  '        self.weights = torch.softmax(scores, dim=-1)',
  '        mixed = (self.weights @ v).transpose(1, 2).reshape(n, length, dim)',
  '        return self.output(mixed)',
];
