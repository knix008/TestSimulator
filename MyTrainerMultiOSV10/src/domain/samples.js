// Sample projects: one for each kind of network the app teaches — from a
// two-neuron XOR network to CNNs, autoencoders, recurrent networks, embeddings,
// residual and wide-and-deep graphs. Every sample uses a generated dataset, so
// it trains offline straight away.
import { generatorDefaults } from './datasets.js';
import { addNode, emptyModel, layoutModel } from './graph.js';
import { cleanTrain, newProject } from './project.js';
import { defaultSplit, newStep } from './preprocess.js';
import { houseCsv, studentCsv } from './tables.js';

/**
 * A graph from a list of layers: [name, type, params, inputs?]. Without `inputs` a layer reads
 * the layer listed before it; inputs = [names] wires merges and skips.
 */
export function graphOf(spec) {
  const model = emptyModel();
  const byName = new Map();
  let prev = null;
  let edge = 0;
  for (const [name, type, params = {}, inputs = null] of spec) {
    const node = addNode(model, type, params, null, name);
    byName.set(name, node);
    const sources = inputs ?? (prev && type !== 'input' ? [prev.name] : []);
    for (const source of sources) model.edges.push({ id: `e${++edge}_${node.id}`, from: byName.get(source).id, to: node.id });
    prev = node;
  }
  layoutModel(model);
  return model;
}

const data = (id, params = {}, steps = [], split = {}) => ({ source: { kind: 'generator', id, params: { ...generatorDefaults(id), ...params } }, steps, split: { ...defaultSplit(), ...split } });
const table = (name, text, target, steps = []) => ({ source: { kind: 'table', name, text, target, features: null, task: 'auto' }, steps, split: defaultSplit() });
const step = (type, params = {}) => ({ ...newStep(type), params: { ...newStep(type).params, ...params } });

/**
 * A stage of BC-ResNet: `blocks` broadcasted residual blocks of `filters` channels named `<p>1_…`, `<p>2_…`
 * after the layer `from`. With `widen` a 1×1 convolution first brings the channels to `filters` (the
 * paper's transition block). Ends in `<p><blocks>_relu`.
 */
function bcStage(p, filters, from, blocks, widen = false) {
  const out = [];
  if (widen) {
    out.push([`${p}_widen`, 'conv2d', { filters, kernelSize: 1, activation: 'linear' }, [from]], [`${p}_widen_bn`, 'batchNorm', { momentum: 0.9 }], [`${p}_widen_relu`, 'activation', { activation: 'relu' }]);
    from = `${p}_widen_relu`;
  }
  for (let i = 1; i <= blocks; i++) {
    const b = `${p}${i}`;
    out.push([`${b}_freq`, 'depthwiseConv2d', { kernelH: 3, kernelW: 1 }, [from]], [`${b}_freq_bn`, 'batchNorm', { momentum: 0.9 }], [`${b}_avg`, 'freqAvgPool'],
      [`${b}_time`, 'depthwiseConv2d', { kernelH: 1, kernelW: 3 }], [`${b}_time_bn`, 'batchNorm', { momentum: 0.9 }], [`${b}_swish`, 'activation', { activation: 'swish' }],
      [`${b}_point`, 'conv2d', { filters, kernelSize: 1, activation: 'linear' }], [`${b}_drop`, 'dropout', { rate: 0.1 }],
      [`${b}_add`, 'add', {}, [`${b}_drop`, `${b}_freq_bn`, from]], [`${b}_relu`, 'activation', { activation: 'relu' }]);
    from = `${b}_relu`;
  }
  return out;
}

/** The models of the Korean keyword samples (the Train tab's "Model" choice). */
const KWS_KO_MODELS = {
  resCnn: {
    ko: 'ResNet CNN (권장)', en: 'ResNet CNN (recommended)',
    descKo: '3×3 합성곱 두 개와 잔차 연결로 된 블록 3개 (48 채널). DS-CNN 보다 매개변수가 많지만 처음 듣는 목소리에도 더 고르게 맞힙니다. 라벨 스무딩·믹스업(두 음성 섞기)·코사인 학습률로 한 단어에 쏠리지 않게 학습합니다.',
    descEn: 'Three residual blocks of two 3×3 convolutions (48 channels). More parameters than DS-CNN, but steadier on voices it has not heard; label smoothing, mixup (blends of two clips) and a cosine learning rate keep it from favouring one word.',
    layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }], ['pool_1', 'avgPool2d', { poolSize: 2, strides: 2 }],
      ['r1_conv_a', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['r1_bn_a', 'batchNorm', { momentum: 0.9 }], ['r1_relu_a', 'activation', { activation: 'relu' }], ['r1_conv_b', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['r1_bn_b', 'batchNorm', { momentum: 0.9 }], ['r1_add', 'add', {}, ['r1_bn_b', 'pool_1']], ['r1_relu', 'activation', { activation: 'relu' }],
      ['r2_conv_a', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['r2_bn_a', 'batchNorm', { momentum: 0.9 }], ['r2_relu_a', 'activation', { activation: 'relu' }], ['r2_conv_b', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['r2_bn_b', 'batchNorm', { momentum: 0.9 }], ['r2_add', 'add', {}, ['r2_bn_b', 'r1_relu']], ['r2_relu', 'activation', { activation: 'relu' }], ['pool_2', 'maxPool2d', { poolSize: 2, strides: 2 }],
      ['r3_conv_a', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['r3_bn_a', 'batchNorm', { momentum: 0.9 }], ['r3_relu_a', 'activation', { activation: 'relu' }], ['r3_conv_b', 'conv2d', { filters: 48, kernelSize: 3, activation: 'linear' }], ['r3_bn_b', 'batchNorm', { momentum: 0.9 }], ['r3_add', 'add', {}, ['r3_bn_b', 'pool_2']], ['r3_relu', 'activation', { activation: 'relu' }],
      ['dropout', 'dropout', { rate: 0.3 }], ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
  },
  dsCnn: {
    ko: 'DS-CNN', en: 'DS-CNN', descKo: '깊이별 + 점별 합성곱 블록 4개 (Hello Edge). 매개변수가 적고 마이크로컨트롤러에서 빠릅니다.', descEn: 'Four depthwise + pointwise blocks (Hello Edge): few parameters, fast on a microcontroller.',
    layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 64, kernelSize: 3, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
      ['dw_1', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_1', 'batchNorm', { momentum: 0.9 }], ['dw_relu_1', 'activation', { activation: 'relu' }], ['pw_1', 'conv2d', { filters: 64, kernelSize: 1, activation: 'linear' }], ['pw_bn_1', 'batchNorm', { momentum: 0.9 }], ['pw_relu_1', 'activation', { activation: 'relu' }], ['dw_2', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_2', 'batchNorm', { momentum: 0.9 }], ['dw_relu_2', 'activation', { activation: 'relu' }], ['pw_2', 'conv2d', { filters: 64, kernelSize: 1, activation: 'linear' }], ['pw_bn_2', 'batchNorm', { momentum: 0.9 }], ['pw_relu_2', 'activation', { activation: 'relu' }], ['dw_3', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_3', 'batchNorm', { momentum: 0.9 }], ['dw_relu_3', 'activation', { activation: 'relu' }], ['pw_3', 'conv2d', { filters: 64, kernelSize: 1, activation: 'linear' }], ['pw_bn_3', 'batchNorm', { momentum: 0.9 }], ['pw_relu_3', 'activation', { activation: 'relu' }], ['dw_4', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_4', 'batchNorm', { momentum: 0.9 }], ['dw_relu_4', 'activation', { activation: 'relu' }], ['pw_4', 'conv2d', { filters: 64, kernelSize: 1, activation: 'linear' }], ['pw_bn_4', 'batchNorm', { momentum: 0.9 }], ['pw_relu_4', 'activation', { activation: 'relu' }],
      ['dropout', 'dropout', { rate: 0.2 }], ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
  },
  bcResNet: {
    ko: 'BC-ResNet', en: 'BC-ResNet', descKo: '주파수 방향 합성곱 → 주파수 평균 → 시간 방향 합성곱을 원래 크기로 브로드캐스트해 더하는 잔차 블록 3개 (Qualcomm, 2021). 아주 적은 매개변수로 높은 정확도.', descEn: 'Three broadcasted residual blocks — frequency conv, average over frequency, temporal conv broadcast back and added (Qualcomm, 2021): high accuracy from very few parameters.',
    layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 24, kernelSize: 5, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
      ['b1_freq', 'depthwiseConv2d', { kernelH: 3, kernelW: 1 }], ['b1_freq_bn', 'batchNorm', { momentum: 0.9 }], ['b1_avg', 'freqAvgPool'],
    ['b1_time', 'depthwiseConv2d', { kernelH: 1, kernelW: 3 }], ['b1_time_bn', 'batchNorm', { momentum: 0.9 }], ['b1_swish', 'activation', { activation: 'swish' }], ['b1_point', 'conv2d', { filters: 24, kernelSize: 1, activation: 'linear' }], ['b1_drop', 'dropout', { rate: 0.1 }],
    ['b1_add', 'add', {}, ['b1_drop', 'b1_freq_bn', 'relu_1']], ['b1_relu', 'activation', { activation: 'relu' }],
      ['b2_freq', 'depthwiseConv2d', { kernelH: 3, kernelW: 1 }], ['b2_freq_bn', 'batchNorm', { momentum: 0.9 }], ['b2_avg', 'freqAvgPool'],
    ['b2_time', 'depthwiseConv2d', { kernelH: 1, kernelW: 3 }], ['b2_time_bn', 'batchNorm', { momentum: 0.9 }], ['b2_swish', 'activation', { activation: 'swish' }], ['b2_point', 'conv2d', { filters: 24, kernelSize: 1, activation: 'linear' }], ['b2_drop', 'dropout', { rate: 0.1 }],
    ['b2_add', 'add', {}, ['b2_drop', 'b2_freq_bn', 'b1_relu']], ['b2_relu', 'activation', { activation: 'relu' }],
      ['b3_freq', 'depthwiseConv2d', { kernelH: 3, kernelW: 1 }], ['b3_freq_bn', 'batchNorm', { momentum: 0.9 }], ['b3_avg', 'freqAvgPool'],
    ['b3_time', 'depthwiseConv2d', { kernelH: 1, kernelW: 3 }], ['b3_time_bn', 'batchNorm', { momentum: 0.9 }], ['b3_swish', 'activation', { activation: 'swish' }], ['b3_point', 'conv2d', { filters: 24, kernelSize: 1, activation: 'linear' }], ['b3_drop', 'dropout', { rate: 0.1 }],
    ['b3_add', 'add', {}, ['b3_drop', 'b3_freq_bn', 'b2_relu']], ['b3_relu', 'activation', { activation: 'relu' }],
      ['head', 'conv2d', { filters: 32, kernelSize: 1, activation: 'relu' }], ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
  },
};

/** id → { group, icon, ko, en, descKo, descEn, dataset, layers, train } */
export const SAMPLES = {
  xor: {
    group: 'basics', icon: 'smXor', ko: 'XOR 문제', en: 'XOR problem',
    descKo: '직선 하나로는 나눌 수 없는 XOR을 은닉층 4개 뉴런이 푸는 과정을 뉴런 단위로 봅니다.',
    descEn: 'Watch four hidden neurons solve XOR, which no single straight line can separate.',
    dataset: data('xor'),
    layers: [['input', 'input', { shape: '2' }], ['hidden', 'dense', { units: 4, activation: 'tanh' }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { optimizer: 'adam', learningRate: 0.05, epochs: 150, batchSize: 16 },
  },
  circles: {
    group: 'basics', icon: 'smCircles', ko: '동심원 분류', en: 'Circles',
    descKo: '안쪽 원과 바깥쪽 원을 나누는 결정 경계가 학습되는 모습을 실시간으로 봅니다.',
    descEn: 'A decision boundary forms between an inner and an outer ring, live.',
    dataset: data('circles'),
    layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 8 }], ['dense_2', 'dense', { units: 8 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.03, epochs: 60, batchSize: 16 },
  },
  logisticPoly: {
    group: 'basics', icon: 'smPoly', ko: '다항 특성 + 로지스틱 회귀', en: 'Polynomial features + logistic regression',
    descKo: '전처리(다항 특성)만으로 뉴런 하나가 원형 경계를 만드는 예입니다.',
    descEn: 'Feature engineering (polynomial terms) lets a single neuron draw a round boundary.',
    dataset: data('circles', {}, [step('polynomial', { degree: 2 })]),
    layers: [['input', 'input', { shape: '5' }], ['logistic', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.1, epochs: 80, batchSize: 16 },
  },
  moons: {
    group: 'basics', icon: 'smMoons', ko: '두 개의 반달', en: 'Two moons',
    descKo: '서로 맞물린 반달 모양 데이터를 ReLU 은닉층 두 개로 분류합니다.',
    descEn: 'Two interleaving half circles, separated with two ReLU layers.',
    dataset: data('moons'),
    layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 16 }], ['dense_2', 'dense', { units: 16 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.02, epochs: 60, batchSize: 16 },
  },
  spiral: {
    group: 'basics', icon: 'smSpiral', ko: '나선 3분류', en: 'Spiral (3 classes)',
    descKo: '깊은 MLP가 세 갈래 나선을 나눕니다. 층별 활성값과 가중치 분포 변화를 관찰하세요.',
    descEn: 'A deeper MLP untangles three spiral arms; watch activations and weight histograms change.',
    dataset: data('spiral'),
    layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 32 }], ['dense_2', 'dense', { units: 32 }], ['dense_3', 'dense', { units: 32 }], ['output', 'dense', { units: 3, activation: 'softmax' }]],
    train: { learningRate: 0.01, epochs: 120, batchSize: 32 },
  },
  blobs: {
    group: 'basics', icon: 'smBlobs', ko: '소프트맥스 회귀', en: 'Softmax regression',
    descKo: '은닉층 없이 소프트맥스 층 하나로 네 무리의 점을 나눕니다(선형 분류기).',
    descEn: 'A single softmax layer (a linear classifier) separates four clusters.',
    dataset: data('blobs'),
    layers: [['input', 'input', { shape: '2' }], ['softmax', 'dense', { units: 4, activation: 'softmax' }]],
    train: { learningRate: 0.05, epochs: 50, batchSize: 16 },
  },
  checker: {
    group: 'basics', icon: 'smChecker', ko: '체커보드 + 배치 정규화', en: 'Checkerboard + batch norm',
    descKo: '배치 정규화와 드롭아웃이 들어간 MLP로 체커보드 무늬를 학습합니다.',
    descEn: 'An MLP with batch normalization and dropout learns a checkerboard.',
    dataset: data('checker'),
    layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 48, activation: 'linear' }], ['bn_1', 'batchNorm'], ['relu_1', 'activation', { activation: 'relu' }],
      ['dense_2', 'dense', { units: 48, activation: 'linear' }], ['bn_2', 'batchNorm'], ['relu_2', 'activation', { activation: 'relu' }], ['dropout', 'dropout', { rate: 0.1 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.01, epochs: 120, batchSize: 32 },
  },
  linear: {
    group: 'regression', icon: 'smLine', ko: '선형 회귀', en: 'Linear regression',
    descKo: '뉴런 하나(y = wx + b)가 경사 하강법으로 직선을 찾아가는 과정입니다.',
    descEn: 'One neuron (y = wx + b) finds a straight line by gradient descent.',
    dataset: data('line'),
    layers: [['input', 'input', { shape: '1' }], ['line', 'dense', { units: 1, activation: 'linear' }]],
    train: { optimizer: 'sgd', learningRate: 0.1, epochs: 40, batchSize: 16 },
  },
  sine: {
    group: 'regression', icon: 'smSine', ko: '사인 곡선 근사', en: 'Sine curve fitting',
    descKo: 'tanh 은닉층이 곡선을 조각조각 이어 붙여 사인 함수를 근사합니다.',
    descEn: 'tanh hidden units piece together an approximation of a sine wave.',
    dataset: data('sine'),
    layers: [['input', 'input', { shape: '1' }], ['dense_1', 'dense', { units: 32, activation: 'tanh' }], ['dense_2', 'dense', { units: 32, activation: 'tanh' }], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.01, epochs: 150, batchSize: 16 },
  },
  tabular: {
    group: 'regression', icon: 'smTable', ko: '표 데이터 회귀 (Friedman)', en: 'Tabular regression (Friedman)',
    descKo: '8개 특성(그중 3개는 잡음)에서 값을 예측합니다. 표준화 전처리를 씁니다.',
    descEn: 'Predicts a value from 8 features (3 of them noise), after standardization.',
    dataset: data('friedman', {}, [step('standardize')]),
    layers: [['input', 'input', { shape: '8' }], ['dense_1', 'dense', { units: 64 }], ['dense_2', 'dense', { units: 32 }], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.005, epochs: 80, batchSize: 32, schedule: 'cosine' },
  },
  digitsMlp: {
    group: 'vision', icon: 'smDigits', ko: '숫자 인식 (MLP)', en: 'Digits (MLP)',
    descKo: '16×16 손글씨풍 숫자를 펼쳐(Flatten) 완전연결층으로 분류합니다.',
    descEn: 'Flattens 16×16 hand-drawn-style digits and classifies them with dense layers.',
    dataset: data('digits'),
    layers: [['input', 'input', { shape: '16,16,1' }], ['flatten', 'flatten'], ['hidden', 'dense', { units: 64 }], ['output', 'dense', { units: 10, activation: 'softmax' }]],
    train: { learningRate: 0.002, epochs: 15, batchSize: 32 },
  },
  digitsCnn: {
    group: 'vision', icon: 'smCnn', ko: '숫자 인식 (CNN)', en: 'Digits (CNN)',
    descKo: '합성곱 필터와 특징 맵을 채널별로 보며 CNN이 획을 찾는 방법을 봅니다.',
    descEn: 'See filters and feature maps channel by channel as a CNN learns strokes.',
    dataset: data('digits'),
    layers: [['input', 'input', { shape: '16,16,1' }], ['conv_1', 'conv2d', { filters: 8, kernelSize: 3 }], ['pool_1', 'maxPool2d'], ['conv_2', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_2', 'maxPool2d'],
      ['flatten', 'flatten'], ['dense', 'dense', { units: 32 }], ['output', 'dense', { units: 10, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 12, batchSize: 32 },
  },
  shapesCnn: {
    group: 'vision', icon: 'smShapes', ko: '도형 분류 (CNN + BN + 증강)', en: 'Shapes (CNN + BN + augmentation)',
    descKo: '원·사각형·삼각형·십자를 분류합니다. 이동·뒤집기 증강과 전역 평균 풀링을 씁니다.',
    descEn: 'Circles, squares, triangles and crosses, with shift/flip augmentation and global average pooling.',
    dataset: data('shapes', {}, [step('flipH'), step('shift', { copies: 1, pixels: 2 })]),
    layers: [['input', 'input', { shape: '24,24,1' }], ['conv_1', 'conv2d', { filters: 12, kernelSize: 3, activation: 'linear' }], ['bn_1', 'batchNorm'], ['relu_1', 'activation', { activation: 'relu' }], ['pool_1', 'maxPool2d'],
      ['conv_2', 'conv2d', { filters: 24, kernelSize: 3 }], ['pool_2', 'maxPool2d'], ['conv_3', 'conv2d', { filters: 32, kernelSize: 3 }], ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 4, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 15, batchSize: 32 },
  },
  colorCnn: {
    group: 'vision', icon: 'smColor', ko: '색깔 도형 (RGB CNN)', en: 'Coloured shapes (RGB CNN)',
    descKo: '3채널 컬러 그림에서 색과 모양을 함께 맞히는 6분류 CNN입니다.',
    descEn: 'A 6-class CNN that tells colour and shape apart in 3-channel pictures.',
    dataset: data('colorShapes'),
    layers: [['input', 'input', { shape: '20,20,3' }], ['conv_1', 'conv2d', { filters: 8, kernelSize: 3 }], ['pool_1', 'maxPool2d'], ['conv_2', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_2', 'maxPool2d'],
      ['flatten', 'flatten'], ['dense', 'dense', { units: 32 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 12, batchSize: 32 },
  },
  autoencoder: {
    group: 'generative', icon: 'smAuto', ko: '오토인코더', en: 'Autoencoder',
    descKo: '숫자 그림을 16개 값(병목)으로 압축했다가 복원합니다. 잠재 공간을 관찰하세요.',
    descEn: 'Squeezes digit pictures through a 16-value bottleneck and rebuilds them.',
    dataset: data('digitsAuto'),
    layers: [['input', 'input', { shape: '16,16,1' }], ['flatten', 'flatten'], ['encode', 'dense', { units: 64 }], ['bottleneck', 'dense', { units: 16 }], ['decode', 'dense', { units: 64 }], ['output', 'dense', { units: 256, activation: 'sigmoid' }]],
    train: { learningRate: 0.003, epochs: 30, batchSize: 32 },
  },
  convAutoencoder: {
    group: 'generative', icon: 'smConvAuto', ko: '합성곱 오토인코더', en: 'Convolutional autoencoder',
    descKo: '합성곱·풀링으로 줄이고 업샘플링으로 다시 키우는 인코더-디코더입니다.',
    descEn: 'An encoder–decoder that shrinks with convolution and pooling and grows back with upsampling.',
    dataset: data('digitsAuto'),
    layers: [['input', 'input', { shape: '16,16,1' }], ['enc_1', 'conv2d', { filters: 8 }], ['pool_1', 'maxPool2d'], ['enc_2', 'conv2d', { filters: 4 }], ['pool_2', 'maxPool2d'],
      ['up_1', 'upSampling2d'], ['dec_1', 'conv2d', { filters: 8 }], ['up_2', 'upSampling2d'], ['dec_2', 'conv2d', { filters: 1, activation: 'sigmoid' }], ['flatten', 'flatten']],
    train: { learningRate: 0.005, epochs: 20, batchSize: 32 },
  },
  lstmForecast: {
    group: 'sequence', icon: 'smLstm', ko: '시계열 예측 (LSTM)', en: 'Forecasting (LSTM)',
    descKo: '사인파 24걸음을 보고 다음 값을 예측합니다. LSTM 게이트 값을 시간대별로 봅니다.',
    descEn: 'Predicts the next value of a sine wave from 24 steps; inspect the LSTM gates over time.',
    dataset: data('sineForecast'),
    layers: [['input', 'input', { shape: '24,1' }], ['lstm', 'lstm', { units: 16 }], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.01, epochs: 30, batchSize: 32 },
  },
  gruPatterns: {
    group: 'sequence', icon: 'smGru', ko: '패턴 분류 (GRU)', en: 'Pattern classification (GRU)',
    descKo: '상승·하강·봉우리·골짜기 모양의 시계열을 GRU로 분류합니다.',
    descEn: 'A GRU classifies rising, falling, peak and valley sequences.',
    dataset: data('patterns'),
    layers: [['input', 'input', { shape: '30,1' }], ['gru', 'gru', { units: 16 }], ['output', 'dense', { units: 4, activation: 'softmax' }]],
    train: { learningRate: 0.01, epochs: 25, batchSize: 32 },
  },
  rnnCounting: {
    group: 'sequence', icon: 'smRnn', ko: '1의 개수 세기 (RNN)', en: 'Counting ones (RNN)',
    descKo: '단순 RNN이 은닉 상태에 개수를 누적하는 방법을 배웁니다.',
    descEn: 'A simple RNN learns to accumulate a count in its hidden state.',
    dataset: data('counting'),
    layers: [['input', 'input', { shape: '12,1' }], ['rnn', 'simpleRnn', { units: 8 }], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.01, epochs: 40, batchSize: 32 },
  },
  activityConv1d: {
    group: 'sequence', icon: 'smConv1d', ko: '동작 인식 (Conv1D)', en: 'Activity recognition (Conv1D)',
    descKo: '2채널 센서 신호에서 걷기·달리기·정지를 1차원 합성곱으로 구분합니다.',
    descEn: '1-D convolutions tell walking, running and standing still apart in 2-channel sensor data.',
    dataset: data('activity', {}, [step('standardize')]),
    layers: [['input', 'input', { shape: '40,2' }], ['conv_1', 'conv1d', { filters: 16, kernelSize: 5 }], ['pool', 'maxPool1d'], ['conv_2', 'conv1d', { filters: 16, kernelSize: 3 }], ['gap', 'globalAvgPool1d'], ['output', 'dense', { units: 3, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 20, batchSize: 32 },
  },
  sentiment: {
    group: 'sequence', icon: 'smText', ko: '감성 분석 (임베딩 + LSTM)', en: 'Sentiment (embedding + LSTM)',
    descKo: '짧은 문장(단어 번호)을 임베딩으로 바꾸고 LSTM으로 긍정·부정을 판단합니다. "not"도 배웁니다.',
    descEn: 'Turns word ids into embeddings and reads them with an LSTM — including "not".',
    dataset: data('sentiment'),
    layers: [['input', 'input', { shape: '8' }], ['embedding', 'embedding', { inputDim: 36, outputDim: 8 }], ['lstm', 'lstm', { units: 16 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.01, epochs: 25, batchSize: 32 },
  },
  residual: {
    group: 'graphs', icon: 'smResidual', ko: '잔차 연결 (ResNet 블록)', en: 'Residual connection (ResNet block)',
    descKo: '건너뛰는 연결(Add)이 있는 그래프 모델입니다. 모델 편집기에서 연결선을 직접 바꿔 보세요.',
    descEn: 'A graph with a skip connection (Add). Try rewiring it in the model editor.',
    dataset: data('spiral'),
    layers: [['input', 'input', { shape: '2' }], ['stem', 'dense', { units: 32 }], ['res_a', 'dense', { units: 32 }], ['res_b', 'dense', { units: 32, activation: 'linear' }],
      ['skip_add', 'add', {}, ['res_b', 'stem']], ['relu', 'activation', { activation: 'relu' }], ['output', 'dense', { units: 3, activation: 'softmax' }]],
    train: { learningRate: 0.01, epochs: 100, batchSize: 32 },
  },
  wideDeep: {
    group: 'graphs', icon: 'smWide', ko: '와이드 & 딥 (Concatenate)', en: 'Wide & deep (concatenate)',
    descKo: '입력을 깊은 경로와 넓은 경로로 나눈 뒤 이어 붙여(Concatenate) 예측합니다.',
    descEn: 'Splits the input into a deep path and a wide path, then concatenates them.',
    dataset: data('moons'),
    layers: [['input', 'input', { shape: '2' }], ['deep_1', 'dense', { units: 16 }], ['deep_2', 'dense', { units: 16 }], ['merge', 'concatenate', {}, ['deep_2', 'input']], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.02, epochs: 60, batchSize: 16 },
  },

  // ── recognition: speech, pictures, characters, video
  speechCnn: {
    group: 'speech', icon: 'smSpeech', ko: '음성 명령 인식 (스펙트로그램 CNN)', en: 'Speech commands (spectrogram CNN)',
    descKo: '합성한 키워드 음성(yes, no, up, down, left, right)을 멜 스펙트로그램 그림으로 바꿔 CNN으로 인식합니다. 데이터 탭에서 소리를 들어 보세요.',
    descEn: 'Synthesized keywords (yes, no, up, down, left, right) become mel-spectrogram pictures a CNN recognizes. Listen to them in the Data tab.',
    dataset: data('speech'),
    layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_1', 'maxPool2d'], ['conv_2', 'conv2d', { filters: 32, kernelSize: 3 }], ['pool_2', 'maxPool2d'],
      ['conv_3', 'conv2d', { filters: 32, kernelSize: 3 }], ['gap', 'globalAvgPool2d'], ['dropout', 'dropout', { rate: 0.2 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 15, batchSize: 32 },
  },
  speechGru: {
    group: 'speech', icon: 'smSpeechGru', ko: '음성 명령 인식 (프레임 + GRU)', en: 'Speech commands (frames + GRU)',
    descKo: '스펙트로그램을 시간 프레임의 시퀀스로 읽는 순환 신경망입니다. GRU 게이트가 단어의 소리 변화를 따라가는 모습을 봅니다.',
    descEn: 'A recurrent network reads the spectrogram frame by frame; watch the GRU gates follow the word.',
    dataset: data('speechSeq', {}, [step('standardize')]),
    layers: [['input', 'input', { shape: '32,32' }], ['gru', 'gru', { units: 48 }], ['dropout', 'dropout', { rate: 0.2 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 20, batchSize: 32 },
  },
  objectsCnn: {
    group: 'vision', icon: 'smObjects', ko: '사물 인식 (컬러 CNN)', en: 'Object recognition (colour CNN)',
    descKo: '집·나무·자동차·해·배·물고기 32×32 컬러 그림을 배치 정규화 CNN으로 분류합니다. 좌우 뒤집기 증강을 씁니다.',
    descEn: '32×32 colour pictures of houses, trees, cars, suns, boats and fish, classified by a batch-norm CNN with flip augmentation.',
    dataset: data('objects', {}, [step('flipH')]),
    layers: [['input', 'input', { shape: '32,32,3' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 3, activation: 'linear' }], ['bn_1', 'batchNorm'], ['relu_1', 'activation', { activation: 'relu' }], ['pool_1', 'maxPool2d'],
      ['conv_2', 'conv2d', { filters: 32, kernelSize: 3 }], ['pool_2', 'maxPool2d'], ['conv_3', 'conv2d', { filters: 48, kernelSize: 3 }], ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 12, batchSize: 32 },
  },
  lettersOcr: {
    group: 'ocr', icon: 'smLetters', ko: '영문자 인식 (OCR A–Z)', en: 'Letter recognition (OCR A–Z)',
    descKo: '손글씨풍 영문 대문자 26자를 CNN으로 읽습니다. 테스트 탭에서 직접 글자를 써 보세요.',
    descEn: 'A CNN reads the 26 hand-drawn-style capital letters. Write your own in the Test tab.',
    dataset: data('letters'),
    layers: [['input', 'input', { shape: '20,20,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_1', 'maxPool2d'], ['conv_2', 'conv2d', { filters: 32, kernelSize: 3 }], ['pool_2', 'maxPool2d'],
      ['flatten', 'flatten'], ['dense', 'dense', { units: 96 }], ['dropout', 'dropout', { rate: 0.3 }], ['output', 'dense', { units: 26, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 12, batchSize: 32 },
  },
  hangulOcr: {
    group: 'ocr', icon: 'smHangul', ko: '한글 자음 인식 (ㄱ–ㅎ)', en: 'Korean consonants (ㄱ–ㅎ)',
    descKo: '한글 자음 14자를 CNN으로 인식합니다. ㄱ과 ㅋ, ㅈ과 ㅊ처럼 획 하나 차이를 어떻게 구분하는지 특징 맵에서 확인하세요.',
    descEn: 'A CNN recognizes the 14 Korean consonants; see in the feature maps how one extra stroke (ㄱ vs ㅋ) is told apart.',
    dataset: data('hangul'),
    layers: [['input', 'input', { shape: '20,20,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_1', 'maxPool2d'], ['conv_2', 'conv2d', { filters: 32, kernelSize: 3 }], ['pool_2', 'maxPool2d'],
      ['flatten', 'flatten'], ['dense', 'dense', { units: 64 }], ['output', 'dense', { units: 14, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 12, batchSize: 32 },
  },
  videoLstm: {
    group: 'video', icon: 'smVideo', ko: '영상 동작 인식 (프레임 + LSTM)', en: 'Video action recognition (frames + LSTM)',
    descKo: '짧은 영상의 각 프레임을 완전연결 층으로 요약한 뒤 LSTM이 시간 순서를 읽어 움직임(오른쪽·왼쪽·위·아래·커짐·작아짐)을 맞힙니다.',
    descEn: 'Each frame of a short clip is summarized by a dense layer; an LSTM reads them in order to tell the motion (right, left, up, down, grow, shrink).',
    dataset: data('video'),
    layers: [['input', 'input', { shape: '8,144' }], ['frame_encoder', 'dense', { units: 32 }], ['lstm', 'lstm', { units: 32 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 20, batchSize: 32 },
  },
  videoStack: {
    group: 'video', icon: 'smVideoStack', ko: '영상 동작 인식 (프레임 쌓기 CNN)', en: 'Video action recognition (stacked-frame CNN)',
    descKo: '영상의 프레임 8장을 채널로 쌓아(초기 융합) 2D CNN 하나로 움직임을 인식합니다. 첫 합성곱의 필터가 시간 변화를 잡습니다.',
    descEn: 'The 8 frames are stacked as channels (early fusion) so one 2-D CNN recognizes the motion; the first filters capture change over time.',
    dataset: data('videoStack'),
    layers: [['input', 'input', { shape: '12,12,8' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool', 'maxPool2d'], ['conv_2', 'conv2d', { filters: 32, kernelSize: 3 }], ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 15, batchSize: 32 },
  },
  // ── table data (CSV)
  studentsCsv: {
    group: 'tables', icon: 'smStudents', ko: '합격 예측 (CSV 표 분류)', en: 'Pass prediction (CSV table classification)',
    descKo: '공부 시간·수면·출석·동아리(글자 열)·이전 점수로 합격 여부를 예측합니다. 글자 열은 원-핫, 빈 값은 평균으로 채워집니다.',
    descEn: 'Predicts pass / fail from study hours, sleep, attendance, club (a text column) and previous score; text becomes one-hot, missing values the mean.',
    dataset: table('student-pass.csv', studentCsv(), 'passed', [step('standardize')]),
    layers: [['input', 'input', { shape: '8' }], ['dense_1', 'dense', { units: 16 }], ['dense_2', 'dense', { units: 8 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.01, epochs: 40, batchSize: 16 },
  },
  housesCsv: {
    group: 'tables', icon: 'smHouses', ko: '집값 예측 (CSV 표 회귀)', en: 'House prices (CSV table regression)',
    descKo: '면적·방 수·연식·지역·거리로 집값을 예측하는 회귀 모델입니다. 테스트 탭에서 예측-정답 그림과 오차 분포를 봅니다.',
    descEn: 'A regression model predicting house prices from area, rooms, age, district and distance; see predicted vs actual in the Test tab.',
    dataset: table('house-prices.csv', houseCsv(), 'price', [step('standardize')]),
    layers: [['input', 'input', { shape: '8' }], ['dense_1', 'dense', { units: 32 }], ['dense_2', 'dense', { units: 16 }], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.01, epochs: 60, batchSize: 16 },
  },

  // ── embedded keyword spotting
  dsCnn: {
    group: 'speech', icon: 'smDsCnn', ko: '키워드 인식 DS-CNN (임베디드)', en: 'Keyword spotting DS-CNN (embedded)',
    descKo: '마이크로컨트롤러용 음성 인식 모델(Hello Edge의 DS-CNN). 깊이별 합성곱 + 점별 1×1 합성곱으로 일반 CNN보다 매개변수와 연산이 훨씬 적습니다.',
    descEn: 'A keyword-spotting model for microcontrollers (DS-CNN from Hello Edge): depthwise + pointwise 1×1 convolutions need far fewer parameters and operations than a plain CNN.',
    dataset: data('speech'),
    layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 32, kernelSize: 3, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
      ['dw_1', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_1', 'batchNorm', { momentum: 0.9 }], ['dw_relu_1', 'activation', { activation: 'relu' }], ['pw_1', 'conv2d', { filters: 32, kernelSize: 1, activation: 'linear' }], ['pw_bn_1', 'batchNorm', { momentum: 0.9 }], ['pw_relu_1', 'activation', { activation: 'relu' }], ['dw_2', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_2', 'batchNorm', { momentum: 0.9 }], ['dw_relu_2', 'activation', { activation: 'relu' }], ['pw_2', 'conv2d', { filters: 32, kernelSize: 1, activation: 'linear' }], ['pw_bn_2', 'batchNorm', { momentum: 0.9 }], ['pw_relu_2', 'activation', { activation: 'relu' }], ['dw_3', 'depthwiseConv2d', { kernelH: 3, kernelW: 3 }], ['dw_bn_3', 'batchNorm', { momentum: 0.9 }], ['dw_relu_3', 'activation', { activation: 'relu' }], ['pw_3', 'conv2d', { filters: 32, kernelSize: 1, activation: 'linear' }], ['pw_bn_3', 'batchNorm', { momentum: 0.9 }], ['pw_relu_3', 'activation', { activation: 'relu' }],
      ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 15, batchSize: 32 },
  },
  bcResNet: {
    group: 'speech', icon: 'smBcResNet', ko: '키워드 인식 BC-ResNet (임베디드)', en: 'Keyword spotting BC-ResNet (embedded)',
    descKo: 'Broadcasted Residual Learning(BC-ResNet). 주파수 방향 깊이별 합성곱 → 주파수 평균 → 시간 방향 깊이별 합성곱 → 1×1 합성곱을 원래 크기로 브로드캐스트해 더합니다. (서브스펙트럴 정규화는 배치 정규화로 단순화)',
    descEn: 'Broadcasted residual learning (BC-ResNet): a frequency-wise depthwise conv, an average over frequency, a temporal depthwise conv and a 1×1 conv broadcast back and added. (Sub-spectral norm simplified to batch norm.)',
    dataset: data('speech'),
    layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 5, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
      ['b1_freq', 'depthwiseConv2d', { kernelH: 3, kernelW: 1 }], ['b1_freq_bn', 'batchNorm', { momentum: 0.9 }], ['b1_avg', 'freqAvgPool'],
      ['b1_time', 'depthwiseConv2d', { kernelH: 1, kernelW: 3 }], ['b1_time_bn', 'batchNorm', { momentum: 0.9 }], ['b1_swish', 'activation', { activation: 'swish' }], ['b1_point', 'conv2d', { filters: 16, kernelSize: 1, activation: 'linear' }], ['b1_drop', 'dropout', { rate: 0.1 }],
      ['b1_add', 'add', {}, ['b1_drop', 'b1_freq_bn', 'relu_1']], ['b1_relu', 'activation', { activation: 'relu' }],
      ['b2_freq', 'depthwiseConv2d', { kernelH: 3, kernelW: 1 }], ['b2_freq_bn', 'batchNorm', { momentum: 0.9 }], ['b2_avg', 'freqAvgPool'],
      ['b2_time', 'depthwiseConv2d', { kernelH: 1, kernelW: 3 }], ['b2_time_bn', 'batchNorm', { momentum: 0.9 }], ['b2_swish', 'activation', { activation: 'swish' }], ['b2_point', 'conv2d', { filters: 16, kernelSize: 1, activation: 'linear' }], ['b2_drop', 'dropout', { rate: 0.1 }],
      ['b2_add', 'add', {}, ['b2_drop', 'b2_freq_bn', 'b1_relu']], ['b2_relu', 'activation', { activation: 'relu' }],
      ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 15, batchSize: 32 },
  },
  kwsKo: {
    group: 'speech', icon: 'smKwsKo', ko: '한국어 키워드 인식: 출근·퇴근·경비·해제', en: 'Korean keyword spotting: 출근·퇴근·경비·해제',
    descKo: 'Supertonic TTS 화자 120명(기본 10명 + 두 목소리를 섞은 30명 + 세 목소리를 섞어 조금 바꾼 80명)이 여러 억양·빠르기로 말한 음성 5520개로 출퇴근·경비 명령어 4개 + unknown(비슷한 말과 일상어 120여 개) + noise(배경 소음)를 구별합니다. 학습 탭의 "모델 구조"에서 ResNet CNN(권장, 기본) · 임베디드용 DS-CNN · BC-ResNet 중 하나를 골라 학습하고 비교하세요. data/predict/kws-ko 의 파일로 "파일로 실행"도 해 보세요.',
    descEn: '5520 clips from 120 Supertonic TTS voices (the 10 built-in ones, 30 blends of two and 80 nudged mixes of three) in several intonations and speeds: tell four commands (clock in / clock out / arm / disarm) from unknown (about 120 similar and everyday words) and noise. In the Train tab pick the model under "Model" — ResNet CNN (recommended, the default), or the embedded DS-CNN or BC-ResNet — train and compare. Try "Run on files" with data/predict/kws-ko.',
    dataset: { source: { kind: 'sounds', bank: 'kws-ko', name: 'Korean keywords', seconds: 1, copies: 4, noiseClass: true, layout: 'image', seed: 1 }, steps: [], split: { ...defaultSplit(), stratify: true } },
    variants: KWS_KO_MODELS,
    train: { learningRate: 0.003, epochs: 20, batchSize: 32, schedule: 'cosine', labelSmoothing: 0.1, mixup: 0.3 },
  },
  kwsKoAttend: {
    group: 'speech', icon: 'smKwsKo', ko: '한국어 키워드 인식: 출근·퇴근·외출·복귀', en: 'Korean keyword spotting: 출근·퇴근·외출·복귀',
    descKo: 'Supertonic TTS 화자 120명이 여러 억양·빠르기로 말한 음성 5520개로 근태 명령어 4개(출근·퇴근·외출·복귀) + unknown(외식·복구·귀가 같은 비슷한 말과 일상어 150여 개) + noise(배경 소음)를 구별합니다. 기본 모델 BC-ResNet+ 는 매개변수 약 2만 개로 마이크 실시간 인식에 알맞습니다. 학습 탭의 "모델 구조"에서 ResNet CNN · DS-CNN · BC-ResNet 과 비교해 보세요. data/predict/kws-ko-attend 의 파일로 "파일로 실행"도 해 보세요.',
    descEn: '5520 clips from 120 Supertonic TTS voices in several intonations and speeds: tell four attendance commands (출근 clock in / 퇴근 clock out / 외출 going out / 복귀 back) from unknown (about 150 similar and everyday words such as 외식, 복구, 귀가) and noise. The default model, BC-ResNet+, has about 20 thousand parameters, small enough for live microphone use; compare it with ResNet CNN, DS-CNN and BC-ResNet under "Model" in the Train tab. Try "Run on files" with data/predict/kws-ko-attend.',
    dataset: { source: { kind: 'sounds', bank: 'kws-ko-attend', name: 'Korean attendance keywords', seconds: 1, copies: 4, noiseClass: true, layout: 'image', seed: 1 }, steps: [], split: { ...defaultSplit(), stratify: true } },
    variants: {
      bcResNetPlus: {
        ko: 'BC-ResNet+ (권장)', en: 'BC-ResNet+ (recommended)',
        descKo: 'BC-ResNet 블록 10개를 네 단계로 쌓고 단계마다 1×1 합성곱으로 채널을 16 → 24 → 32 → 40 으로 넓힙니다(논문의 전이 블록). 가운데서 크기를 반으로 줄여 층이 늘어도 연산은 BC-ResNet 의 1.7배(약 1 M MAC), 매개변수는 약 2만 개로 DS-CNN 보다 적습니다.',
        descEn: 'Ten BC-ResNet blocks in four stages, a 1×1 convolution widening the channels 16 → 24 → 32 → 40 at each (the paper\'s transition blocks). Halving the size midway keeps the work at 1.7× BC-ResNet (about 1 M MACs) for all the extra layers, with about 20 thousand parameters — fewer than DS-CNN.',
        layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 5, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
          ...bcStage('s1_', 16, 'relu_1', 2), ...bcStage('s2_', 24, 's1_2_relu', 2, true), ['pool', 'maxPool2d', { poolSize: 2, strides: 2 }],
          ...bcStage('s3_', 32, 'pool', 3, true), ...bcStage('s4_', 40, 's3_3_relu', 3, true),
          ['head', 'conv2d', { filters: 64, kernelSize: 1, activation: 'relu' }], ['gap', 'globalAvgPool2d'], ['dropout', 'dropout', { rate: 0.2 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
      },
      resCnn: { ...KWS_KO_MODELS.resCnn, ko: 'ResNet CNN', en: 'ResNet CNN' },
      dsCnn: KWS_KO_MODELS.dsCnn,
      bcResNet: KWS_KO_MODELS.bcResNet,
    },
    train: { learningRate: 0.003, epochs: 20, batchSize: 32, schedule: 'cosine', labelSmoothing: 0.1, mixup: 0.3 },
  },

  // ── machine-learning basics: one idea each, most of them as a choice of models to compare
  perceptron: {
    group: 'basics', icon: 'smPerceptron', ko: '퍼셉트론 (뉴런 하나)', en: 'Perceptron (a single neuron)',
    descKo: '가중치 두 개와 편향 하나뿐인 뉴런이 두 무리의 점을 직선 하나로 나눕니다. 학습 탭에서 결정 경계(직선)가 자리를 찾아가는 모습을 보세요. 직선으로 나눌 수 없는 XOR 예제와 비교해 보세요.',
    descEn: 'A neuron with two weights and a bias splits two clusters of points with one straight line. Watch the decision boundary find its place in the Train tab, then compare with XOR, which no straight line can split.',
    dataset: data('blobs', { classes: 2, spread: 0.3 }),
    layers: [['input', 'input', { shape: '2' }], ['neuron', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { optimizer: 'sgd', learningRate: 0.5, epochs: 40, batchSize: 16 },
  },
  activations: {
    group: 'basics', icon: 'smActivation', ko: '활성화 함수 비교', en: 'Activation functions compared',
    descKo: '같은 나선 데이터와 같은 크기의 망(32 × 3층)에서 활성화 함수만 바꿉니다. 학습 탭의 "모델 구조"에서 sigmoid · tanh · ReLU · GELU 를 차례로 학습해 손실 곡선과 결정 경계가 어떻게 다른지 비교하세요.',
    descEn: 'The same spiral data and the same network (3 layers of 32); only the activation changes. Under "Model" in the Train tab train sigmoid, tanh, ReLU and GELU in turn and compare the loss curves and decision boundaries.',
    dataset: data('spiral'),
    variants: Object.fromEntries(['relu', 'tanh', 'sigmoid', 'gelu'].map((activation) => [activation, {
      ko: activation === 'relu' ? 'ReLU' : activation === 'gelu' ? 'GELU' : activation, en: activation === 'relu' ? 'ReLU' : activation === 'gelu' ? 'GELU' : activation,
      descKo: { relu: '0 보다 작으면 0, 크면 그대로. 기울기가 1 이라 깊어도 잘 전달되고 계산이 가장 쌉니다.', tanh: '−1 … 1 로 눌러 담는 S 자. 0 을 중심으로 대칭이라 sigmoid 보다 빨리 배웁니다.', sigmoid: '0 … 1 로 눌러 담는 S 자. 양 끝에서 기울기가 거의 0 이 되어 가장 느리게 배웁니다.', gelu: 'ReLU 를 부드럽게 만든 함수(트랜스포머가 씀). 0 근처에서도 기울기가 살아 있습니다.' }[activation],
      descEn: { relu: 'Zero below zero, unchanged above: a slope of 1 carries through deep networks, and it is the cheapest to compute.', tanh: 'An S squeezing into −1 … 1; centred on zero, so it learns faster than sigmoid.', sigmoid: 'An S squeezing into 0 … 1; the slope is almost zero at both ends, so it learns slowest.', gelu: 'A smooth ReLU (the one transformers use); the slope stays alive around zero.' }[activation],
      layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 32, activation }], ['dense_2', 'dense', { units: 32, activation }], ['dense_3', 'dense', { units: 32, activation }], ['output', 'dense', { units: 3, activation: 'softmax' }]],
    }])),
    train: { learningRate: 0.01, epochs: 120, batchSize: 32 },
  },
  overfitting: {
    group: 'basics', icon: 'smOverfit', ko: '과적합과 정규화', en: 'Overfitting and regularization',
    descKo: '점 120개뿐인 잡음 많은 반달 데이터. 큰 망은 학습 데이터를 외워 학습 손실은 계속 내려가지만 검증 손실은 다시 올라갑니다(과적합). "모델 구조"에서 드롭아웃 · 작은 망과 비교해 두 손실 곡선의 간격과 결정 경계의 모양을 보세요.',
    descEn: 'Noisy two moons with only 120 points. The big network memorises the training points: training loss keeps falling while validation loss rises again (overfitting). Compare it under "Model" with dropout and a small network — look at the gap between the two loss curves and the shape of the boundary.',
    dataset: data('moons', { n: 120, noise: 0.35 }),
    variants: {
      big: {
        ko: '큰 망 (과적합)', en: 'Big network (overfits)', descKo: '128 뉴런 3층, 규제 없음: 매개변수 3만 개가 점 84개를 외웁니다.', descEn: 'Three layers of 128 with no regularization: 30 thousand parameters memorise 84 points.',
        layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 128 }], ['dense_2', 'dense', { units: 128 }], ['dense_3', 'dense', { units: 128 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
      },
      dropout: {
        ko: '드롭아웃', en: 'Dropout', descKo: '같은 큰 망의 층마다 드롭아웃 0.5: 학습 때마다 뉴런 절반을 꺼서 특정 점에 기대지 못하게 합니다.', descEn: 'The same big network with dropout 0.5 after every layer: half the neurons are off at each step, so none can lean on particular points.',
        layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 128 }], ['drop_1', 'dropout', { rate: 0.5 }], ['dense_2', 'dense', { units: 128 }], ['drop_2', 'dropout', { rate: 0.5 }], ['dense_3', 'dense', { units: 128 }], ['drop_3', 'dropout', { rate: 0.5 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
      },
      small: {
        ko: '작은 망', en: 'Small network', descKo: '8 뉴런 한 층: 외울 만큼 크지 않아 매끈한 경계를 긋습니다.', descEn: 'One layer of 8: too small to memorise, it draws a smooth boundary.',
        layers: [['input', 'input', { shape: '2' }], ['dense_1', 'dense', { units: 8 }], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
      },
    },
    train: { learningRate: 0.01, epochs: 300, batchSize: 16 },
  },
  vanishing: {
    group: 'basics', icon: 'smVanishing', ko: '깊은 망의 기울기 소실', en: 'Vanishing gradients in deep networks',
    descKo: '8층짜리 깊은 망. sigmoid 만 쌓으면 뒤로 갈수록 기울기가 작아져 앞쪽 층이 거의 배우지 못합니다(기울기 소실). 학습 탭의 기울기 흐름을 보고, "모델 구조"에서 ReLU + 배치 정규화 · 잔차 연결이 이 문제를 어떻게 푸는지 비교하세요.',
    descEn: 'An 8-layer network. Stacking sigmoids shrinks the gradient layer by layer, so the first layers hardly learn (vanishing gradients). Watch the gradient flow in the Train tab, then compare under "Model" how ReLU + batch normalization and residual connections fix it.',
    dataset: data('spiral'),
    variants: {
      sigmoid: {
        ko: 'sigmoid 8층', en: '8 sigmoid layers', descKo: '기울기가 층마다 0.25 배 이하로 줄어듭니다.', descEn: 'The gradient shrinks to a quarter or less at every layer.',
        layers: [['input', 'input', { shape: '2' }], ...Array.from({ length: 8 }, (_, i) => [`dense_${i + 1}`, 'dense', { units: 24, activation: 'sigmoid' }]), ['output', 'dense', { units: 3, activation: 'softmax' }]],
      },
      reluBn: {
        ko: 'ReLU + 배치 정규화', en: 'ReLU + batch norm', descKo: 'ReLU 는 기울기를 줄이지 않고, 배치 정규화가 층마다 값의 크기를 고르게 맞춥니다.', descEn: 'ReLU keeps the gradient, and batch normalization keeps every layer\'s values at an even scale.',
        layers: [['input', 'input', { shape: '2' }], ...Array.from({ length: 8 }, (_, i) => [[`dense_${i + 1}`, 'dense', { units: 24, activation: 'linear' }], [`bn_${i + 1}`, 'batchNorm'], [`relu_${i + 1}`, 'activation', { activation: 'relu' }]]).flat(), ['output', 'dense', { units: 3, activation: 'softmax' }]],
      },
      residual: {
        ko: '잔차 연결', en: 'Residual connections', descKo: '두 층마다 입력을 그대로 더해 기울기가 지름길로 앞쪽까지 갑니다(ResNet).', descEn: 'Every two layers add their input back, so the gradient takes a shortcut to the first layers (ResNet).',
        layers: [['input', 'input', { shape: '2' }], ['stem', 'dense', { units: 24 }], ...Array.from({ length: 4 }, (_, i) => {
          const from = i ? `res_${i}` : 'stem';
          return [[`block_${i + 1}_a`, 'dense', { units: 24 }, [from]], [`block_${i + 1}_b`, 'dense', { units: 24, activation: 'linear' }], [`add_${i + 1}`, 'add', {}, [`block_${i + 1}_b`, from]], [`res_${i + 1}`, 'activation', { activation: 'relu' }]];
        }).flat(), ['output', 'dense', { units: 3, activation: 'softmax' }]],
      },
    },
    train: { learningRate: 0.005, epochs: 80, batchSize: 32 },
  },
  polyRegression: {
    group: 'regression', icon: 'smPolyFit', ko: '다항 회귀', en: 'Polynomial regression',
    descKo: '입력 x 를 x · x² · x³ 로 늘리는 전처리(다항 특성) 뒤에 선형 뉴런 하나: 3차 곡선 y = a·x + b·x² + c·x³ + d 를 사인 곡선에 맞춥니다. 은닉층 없이도 곡선을 그릴 수 있지만 3차까지만 굽는 한계도 보입니다.',
    descEn: 'A preprocessing step that turns x into x, x², x³ (polynomial features) and a single linear neuron: the cubic y = a·x + b·x² + c·x³ + d is fitted to a sine curve. It bends without a hidden layer — but only as far as a cubic can.',
    dataset: data('sine', { frequency: 1 }, [step('polynomial', { degree: 3 })]),
    layers: [['input', 'input', { shape: '3' }], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.05, epochs: 200, batchSize: 16 },
  },

  // ── CNN architectures, all on the same coloured object pictures
  vggCnn: {
    group: 'vision', icon: 'smVgg', ko: 'VGG 스타일 CNN', en: 'VGG-style CNN',
    descKo: '3×3 합성곱 두 개 + 최대 풀링을 한 단계로, 단계마다 채널을 16 → 32 → 64 로 두 배씩 늘립니다(VGG, 2014). 작은 커널을 겹쳐 큰 커널 하나와 같은 넓이를 더 적은 매개변수로 봅니다.',
    descEn: 'Two 3×3 convolutions and a max pool per stage, the channels doubling 16 → 32 → 64 (VGG, 2014): stacked small kernels see as far as one big kernel with fewer parameters.',
    dataset: data('objects', {}, [step('flipH')]),
    layers: [['input', 'input', { shape: '32,32,3' }],
      ['conv_1a', 'conv2d', { filters: 16, kernelSize: 3 }], ['conv_1b', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_1', 'maxPool2d'],
      ['conv_2a', 'conv2d', { filters: 32, kernelSize: 3 }], ['conv_2b', 'conv2d', { filters: 32, kernelSize: 3 }], ['pool_2', 'maxPool2d'],
      ['conv_3a', 'conv2d', { filters: 64, kernelSize: 3 }], ['conv_3b', 'conv2d', { filters: 64, kernelSize: 3 }], ['pool_3', 'maxPool2d'],
      ['gap', 'globalAvgPool2d'], ['dense', 'dense', { units: 64 }], ['dropout', 'dropout', { rate: 0.3 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.002, epochs: 15, batchSize: 32 },
  },
  inceptionCnn: {
    group: 'vision', icon: 'smInception', ko: 'Inception 블록', en: 'Inception blocks',
    descKo: '한 블록 안에서 1×1 · 3×3 · 5×5 합성곱을 나란히 계산해 이어 붙입니다(GoogLeNet, 2014). 3×3 · 5×5 앞의 1×1 합성곱이 채널을 줄여 연산을 아낍니다. 그래프에서 갈라졌다 합쳐지는 가지를 보세요.',
    descEn: 'Each block runs 1×1, 3×3 and 5×5 convolutions side by side and concatenates them (GoogLeNet, 2014); a 1×1 convolution before the 3×3 and 5×5 cuts the channels to save work. See the branches split and join in the graph.',
    dataset: data('objects', {}, [step('flipH')]),
    layers: [['input', 'input', { shape: '32,32,3' }], ['stem', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_0', 'maxPool2d'],
      ...[1, 2].map((k) => {
        const from = k === 1 ? 'pool_0' : 'pool_1';
        return [[`b${k}_1x1`, 'conv2d', { filters: 16, kernelSize: 1 }, [from]],
          [`b${k}_3x3_reduce`, 'conv2d', { filters: 12, kernelSize: 1 }, [from]], [`b${k}_3x3`, 'conv2d', { filters: 16, kernelSize: 3 }],
          [`b${k}_5x5_reduce`, 'conv2d', { filters: 6, kernelSize: 1 }, [from]], [`b${k}_5x5`, 'conv2d', { filters: 8, kernelSize: 5 }],
          [`b${k}_concat`, 'concatenate', {}, [`b${k}_1x1`, `b${k}_3x3`, `b${k}_5x5`]], [`pool_${k}`, 'maxPool2d']];
      }).flat(),
      ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 15, batchSize: 32 },
  },
  denseNetCnn: {
    group: 'vision', icon: 'smDenseNet', ko: 'DenseNet 스타일 CNN', en: 'DenseNet-style CNN',
    descKo: '블록 안의 층마다 앞선 모든 층의 출력을 이어 붙여 입력으로 받습니다(DenseNet, 2017). 특징을 다시 쓰므로 층마다 채널 12 개씩만 새로 만들어도 됩니다. 블록 사이의 1×1 합성곱 + 평균 풀링이 크기를 줄입니다.',
    descEn: 'Inside a block every layer takes the concatenated outputs of all the layers before it (DenseNet, 2017); features are reused, so each layer adds only 12 new channels. A 1×1 convolution and an average pool between the blocks shrink the size.',
    dataset: data('objects', {}, [step('flipH')]),
    layers: [['input', 'input', { shape: '32,32,3' }], ['stem', 'conv2d', { filters: 16, kernelSize: 3 }], ['pool_0', 'maxPool2d'],
      ...[1, 2].map((k) => {
        const from = k === 1 ? 'pool_0' : 'trans_pool';
        return [[`d${k}_c1`, 'conv2d', { filters: 12, kernelSize: 3 }, [from]], [`d${k}_cat1`, 'concatenate', {}, [from, `d${k}_c1`]],
          [`d${k}_c2`, 'conv2d', { filters: 12, kernelSize: 3 }], [`d${k}_cat2`, 'concatenate', {}, [`d${k}_cat1`, `d${k}_c2`]],
          [`d${k}_c3`, 'conv2d', { filters: 12, kernelSize: 3 }], [`d${k}_cat3`, 'concatenate', {}, [`d${k}_cat2`, `d${k}_c3`]],
          ...(k === 1 ? [['trans', 'conv2d', { filters: 32, kernelSize: 1 }], ['trans_pool', 'avgPool2d']] : [])];
      }).flat(),
      ['gap', 'globalAvgPool2d'], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 15, batchSize: 32 },
  },
  mobileNetCnn: {
    group: 'vision', icon: 'smMobileNet', ko: 'MobileNet 스타일 CNN', en: 'MobileNet-style CNN',
    descKo: '일반 합성곱을 깊이별 3×3 합성곱(채널마다 따로) + 점별 1×1 합성곱(채널 섞기)으로 나눕니다(MobileNet, 2017). 연산과 매개변수가 8~9 배 줄어 휴대폰에서도 빠릅니다. 매개변수 수를 VGG 스타일과 비교해 보세요.',
    descEn: 'An ordinary convolution split into a depthwise 3×3 (each channel on its own) and a pointwise 1×1 (mixing the channels) — MobileNet, 2017: 8–9× less work and parameters, fast enough for a phone. Compare the parameter count with the VGG-style model.',
    dataset: data('objects', {}, [step('flipH')]),
    layers: [['input', 'input', { shape: '32,32,3' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 3, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm'], ['relu_1', 'activation', { activation: 'relu6' }],
      ...[[32, 1], [64, 2], [64, 1], [128, 2]].map(([filters, strides], i) => [
        [`dw_${i + 1}`, 'depthwiseConv2d', { kernelH: 3, kernelW: 3, strides }], [`dw_bn_${i + 1}`, 'batchNorm'], [`dw_relu_${i + 1}`, 'activation', { activation: 'relu6' }],
        [`pw_${i + 1}`, 'conv2d', { filters, kernelSize: 1, activation: 'linear' }], [`pw_bn_${i + 1}`, 'batchNorm'], [`pw_relu_${i + 1}`, 'activation', { activation: 'relu6' }]]).flat(),
      ['gap', 'globalAvgPool2d'], ['dropout', 'dropout', { rate: 0.2 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 15, batchSize: 32 },
  },

  // ── sequences and transformers
  transformerSentiment: {
    group: 'sequence', icon: 'smTransformerText', ko: '감성 분석 (트랜스포머)', en: 'Sentiment (transformer)',
    descKo: '토큰 + 위치 임베딩 → 셀프 어텐션(마스크 없음: 문장 전체를 한꺼번에 봄) → 피드포워드, 잔차 연결과 층 정규화를 갖춘 트랜스포머 인코더가 문장의 긍정 · 부정을 가립니다. 같은 데이터의 "감성 분석 (임베딩 + LSTM)" 과 비교하고, 테스트 탭에서 어텐션이 "not" 같은 낱말을 보는지 확인하세요.',
    descEn: 'A transformer encoder — token + position embedding, self-attention without a mask (it sees the whole sentence at once), feed-forward, residual connections and layer norm — tells positive from negative sentences. Compare it with "Sentiment (embedding + LSTM)" on the same data, and check in the Test tab whether attention looks at words like "not".',
    dataset: data('sentiment'),
    layers: [['input', 'input', { shape: '8' }], ['embed', 'tokenPositionEmbedding', { inputDim: 36, outputDim: 16 }],
      ['norm_1', 'layerNorm'], ['attention', 'selfAttention', { heads: 2, causal: false }], ['residual_1', 'add', {}, ['attention', 'embed']],
      ['norm_2', 'layerNorm'], ['ffn_1', 'dense', { units: 32, activation: 'gelu' }], ['ffn_2', 'dense', { units: 16, activation: 'linear' }], ['residual_2', 'add', {}, ['ffn_2', 'residual_1']],
      ['pool', 'globalAvgPool1d'], ['output', 'dense', { units: 1, activation: 'sigmoid' }]],
    train: { learningRate: 0.005, epochs: 25, batchSize: 32 },
  },
  transformerForecast: {
    group: 'sequence', icon: 'smTransformerTime', ko: '시계열 예측 (트랜스포머)', en: 'Forecasting (transformer)',
    descKo: '1D 합성곱이 값 24 개를 16 차원 벡터로 바꾸고(이웃한 값으로 순서도 담음), 인과 마스크가 있는 셀프 어텐션이 지난 값들 중 어디를 볼지 고른 뒤 마지막 시점에서 다음 값을 예측합니다. 같은 데이터의 "시계열 예측 (LSTM)" 과 비교해 보세요.',
    descEn: 'A 1-D convolution turns the 24 values into 16-dimensional vectors (neighbours carry the order), causal self-attention picks which past values to look at, and the last step predicts the next value. Compare with "Forecasting (LSTM)" on the same data.',
    dataset: data('sineForecast'),
    layers: [['input', 'input', { shape: '24,1' }], ['embed', 'conv1d', { filters: 16, kernelSize: 3, activation: 'linear' }],
      ['norm_1', 'layerNorm'], ['attention', 'selfAttention', { heads: 2, causal: true }], ['residual_1', 'add', {}, ['attention', 'embed']],
      ['norm_2', 'layerNorm'], ['ffn_1', 'dense', { units: 32, activation: 'gelu' }], ['ffn_2', 'dense', { units: 16, activation: 'linear' }], ['residual_2', 'add', {}, ['ffn_2', 'residual_1']],
      ['last', 'lastStep'], ['output', 'dense', { units: 1, activation: 'linear' }]],
    train: { learningRate: 0.003, epochs: 40, batchSize: 32 },
  },
  cnnLstm: {
    group: 'sequence', icon: 'smCnnLstm', ko: '동작 인식 (CNN + LSTM)', en: 'Activity recognition (CNN + LSTM)',
    descKo: '1D 합성곱이 센서 신호의 짧은 무늬(걸음 한 번, 흔들림)를 찾고, 풀링으로 짧아진 특징 열을 LSTM 이 시간 순서대로 읽어 동작을 가립니다. 합성곱만 쓰는 "동작 인식 (Conv1D)" 과 비교해 보세요.',
    descEn: 'A 1-D convolution finds short motifs in the sensor signal (a step, a shake); an LSTM reads the pooled, shorter feature sequence in order and names the activity. Compare with the convolution-only "Activity recognition (Conv1D)".',
    dataset: data('activity', {}, [step('standardize')]),
    layers: [['input', 'input', { shape: '40,2' }], ['conv_1', 'conv1d', { filters: 16, kernelSize: 5 }], ['pool_1', 'maxPool1d'], ['conv_2', 'conv1d', { filters: 32, kernelSize: 3 }], ['pool_2', 'maxPool1d'],
      ['lstm', 'lstm', { units: 32 }], ['output', 'dense', { units: 3, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 20, batchSize: 32 },
  },
  rnnCompare: {
    group: 'sequence', icon: 'smRnnCompare', ko: 'RNN · GRU · LSTM 비교', en: 'RNN, GRU and LSTM compared',
    descKo: '90 걸음짜리 긴 신호(잡음 섞임)의 패턴 4 가지를 같은 크기(24)의 순환층으로 가립니다. "모델 구조"에서 단순 RNN · GRU(게이트 2개) · LSTM(게이트 3개 + 셀 상태)을 바꿔 가며 학습 속도와 정확도, 매개변수 수를 비교하세요. 신호가 길어 게이트 없는 RNN 은 앞부분을 잊어 거의 배우지 못합니다.',
    descEn: 'Four patterns in long, noisy 90-step signals, told apart by a recurrent layer of 24 units. Switch under "Model" between a simple RNN, a GRU (two gates) and an LSTM (three gates and a cell state) and compare learning speed, accuracy and parameter count. The signals are long enough that the gateless RNN forgets their beginning and hardly learns.',
    dataset: data('patterns', { steps: 90, noise: 0.25 }),
    variants: Object.fromEntries([['lstm', 'LSTM', '게이트 3 개(입력 · 망각 · 출력)와 셀 상태로 긴 기억을 지킵니다. 매개변수가 가장 많습니다.', 'Three gates (input, forget, output) and a cell state guard long memories; the most parameters.'],
      ['gru', 'GRU', '게이트 2 개(갱신 · 리셋)로 LSTM 과 비슷한 기억을 매개변수 3/4 로 냅니다.', 'Two gates (update, reset) give LSTM-like memory with three quarters of the parameters.'],
      ['simpleRnn', 'RNN', '게이트 없이 이전 상태와 입력을 더해 tanh 만 거칩니다. 긴 의존성에서 기울기가 사라지기 쉽습니다.', 'No gates: the previous state and the input go through a tanh; the gradient fades over long spans.']].map(([type, name, descKo, descEn]) => [type, {
      ko: name, en: name, descKo, descEn,
      layers: [['input', 'input', { shape: '90,1' }], [type, type, { units: 24 }], ['output', 'dense', { units: 4, activation: 'softmax' }]],
    }])),
    train: { learningRate: 0.01, epochs: 25, batchSize: 32 },
  },

  // ── unsupervised: autoencoders that clean pictures and find odd ones
  denoisingAe: {
    group: 'generative', icon: 'smDenoise', ko: '잡음 제거 오토인코더', en: 'Denoising autoencoder',
    descKo: '입력은 회색 잡음이 끼고 군데군데 지워진 숫자, 정답은 깨끗한 숫자입니다. 합성곱 오토인코더가 숫자의 모양을 배워 잡음을 걷어 냅니다. 테스트 탭에서 원본(잡음)과 복원 결과를 나란히 보세요.',
    descEn: 'The input is a digit under grey noise with blocks wiped out, the target the clean digit: a convolutional autoencoder learns what digits look like and strips the noise. See the noisy input and the clean output side by side in the Test tab.',
    dataset: data('digitsNoisy'),
    layers: [['input', 'input', { shape: '16,16,1' }], ['enc_1', 'conv2d', { filters: 32 }], ['pool', 'maxPool2d'], ['enc_2', 'conv2d', { filters: 32 }],
      ['up', 'upSampling2d'], ['dec_1', 'conv2d', { filters: 32 }], ['dec_2', 'conv2d', { filters: 1, activation: 'sigmoid' }], ['flatten', 'flatten']],
    train: { learningRate: 0.003, epochs: 30, batchSize: 32 },
  },
  anomalyAe: {
    group: 'generative', icon: 'smAnomaly', ko: '이상 탐지 (오토인코더)', en: 'Anomaly detection (autoencoder)',
    descKo: '숫자 그림 사이에 숫자가 아닌 그림(흑백이 뒤집힌 숫자 · 얼룩 · 격자)이 6% 섞여 있습니다. 병목이 4 뿐인 오토인코더는 흔한 숫자만 잘 복원하므로, 복원 오차가 큰 그림이 이상 후보입니다. 정답(이상 표시)은 학습에 쓰지 않습니다. 테스트 탭의 "복원 오차가 큰 샘플" 에서 ● 표시(실제 이상)가 위쪽에 모이는지 보세요.',
    descEn: 'Among digit pictures 6% are no digit at all (inverted digits, smudges, grids). An autoencoder with a bottleneck of only 4 rebuilds the common digits well, so pictures with a large reconstruction error are the anomaly candidates; the anomaly flags are never used for training. In the Test tab see whether the ● marks (real anomalies) gather at the top of "Worst reconstructions".',
    dataset: data('digitsAnomaly'),
    layers: [['input', 'input', { shape: '16,16,1' }], ['flatten', 'flatten'], ['encode', 'dense', { units: 64 }], ['bottleneck', 'dense', { units: 4 }], ['decode', 'dense', { units: 64 }], ['output', 'dense', { units: 256, activation: 'sigmoid' }]],
    train: { learningRate: 0.003, epochs: 30, batchSize: 32 },
  },
  // ── language models (LLM)
  gptEn: {
    group: 'llm', icon: 'smGpt', ko: '미니 GPT (영어 글자 단위)', en: 'Mini GPT (English, characters)',
    descKo: '토큰+위치 임베딩 → 마스크된 셀프 어텐션 → 피드포워드, 잔차 연결이 있는 작은 트랜스포머가 다음 글자를 예측합니다. 테스트 탭에서 문장을 이어 쓰게 하고, 어텐션이 어느 글자를 보는지 확인하세요.',
    descEn: 'A tiny transformer — token + position embedding, masked self-attention, feed-forward, residual connections — predicts the next character. Let it continue a sentence in the Test tab and see which characters the attention looks at.',
    dataset: data('charLm'),
    layers: [['input', 'input', { shape: '24' }], ['embed', 'tokenPositionEmbedding', { inputDim: 28, outputDim: 32 }],
      ['norm_1', 'layerNorm'], ['attention', 'selfAttention', { heads: 2, causal: true }], ['residual_1', 'add', {}, ['attention', 'embed']],
      ['norm_2', 'layerNorm'], ['ffn_1', 'dense', { units: 64, activation: 'relu' }], ['ffn_2', 'dense', { units: 32, activation: 'linear' }], ['residual_2', 'add', {}, ['ffn_2', 'residual_1']],
      ['last', 'lastStep'], ['output', 'dense', { units: 28, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 25, batchSize: 64 },
  },
  gptKo: {
    group: 'llm', icon: 'smGptKo', ko: '미니 GPT (한국어 글자 단위)', en: 'Mini GPT (Korean, characters)',
    descKo: '한국어 문장으로 학습하는 작은 트랜스포머 언어 모델입니다. 조사(이/가, 을/를)를 받침에 맞게 고르는 법까지 데이터에서 배웁니다.',
    descEn: 'A tiny transformer language model trained on Korean sentences; it even learns to pick particles (이/가, 을/를) to match the final consonant.',
    dataset: data('charLmKo'),
    layers: [['input', 'input', { shape: '16' }], ['embed', 'tokenPositionEmbedding', { inputDim: 61, outputDim: 48 }],
      ['norm_1', 'layerNorm'], ['attention', 'selfAttention', { heads: 2, causal: true }], ['residual_1', 'add', {}, ['attention', 'embed']],
      ['norm_2', 'layerNorm'], ['ffn_1', 'dense', { units: 96, activation: 'relu' }], ['ffn_2', 'dense', { units: 48, activation: 'linear' }], ['residual_2', 'add', {}, ['ffn_2', 'residual_1']],
      ['last', 'lastStep'], ['output', 'dense', { units: 61, activation: 'softmax' }]],
    train: { learningRate: 0.003, epochs: 30, batchSize: 64 },
  },
  lstmLm: {
    group: 'llm', icon: 'smLstmLm', ko: 'LSTM 언어 모델 (비교용)', en: 'LSTM language model (for comparison)',
    descKo: '트랜스포머 이전의 언어 모델: 임베딩 + LSTM이 글자를 하나씩 읽어 다음 글자를 예측합니다. 미니 GPT와 학습 곡선을 비교해 보세요.',
    descEn: 'A language model from before transformers: an embedding and an LSTM read the characters one by one and predict the next. Compare its learning curve with the mini GPT.',
    dataset: data('charLm'),
    layers: [['input', 'input', { shape: '24' }], ['embedding', 'embedding', { inputDim: 28, outputDim: 32 }], ['lstm', 'lstm', { units: 96 }], ['output', 'dense', { units: 28, activation: 'softmax' }]],
    train: { learningRate: 0.005, epochs: 25, batchSize: 64 },
  },
};
export const SAMPLE_IDS = Object.keys(SAMPLES);
export const SAMPLE_GROUPS = ['basics', 'regression', 'tables', 'vision', 'ocr', 'speech', 'video', 'llm', 'generative', 'sequence', 'graphs'];

/** A new project from a sample, in the UI language. */
export function sampleProject(id, language = 'ko') {
  const sample = SAMPLES[id];
  if (!sample) throw new Error(`unknown sample ${id}`);
  const project = newProject(language === 'en' ? sample.en : sample.ko);
  project.sample = id;
  project.description = language === 'en' ? sample.descEn : sample.descKo;
  project.dataset = structuredClone(sample.dataset);
  if (sample.variants) {
    // Several models for the same data: the Train tab switches between them.
    const list = Object.entries(sample.variants).map(([id, v]) => ({ id, name: language === 'en' ? v.en : v.ko, description: language === 'en' ? v.descEn : v.descKo, model: graphOf(v.layers) }));
    project.variants = { current: list[0].id, list };
    project.model = structuredClone(list[0].model);
  } else project.model = graphOf(sample.layers);
  project.train = cleanTrain({ ...project.train, ...sample.train });
  return project;
}
