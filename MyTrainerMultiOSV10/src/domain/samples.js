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
    variants: {
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
      bcResNetPlus: {
        ko: 'BC-ResNet+', en: 'BC-ResNet+', descKo: 'TODO', descEn: 'TODO',
        layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 5, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
          ...bcStage('s1_', 16, 'relu_1', 2), ...bcStage('s2_', 24, 's1_2_relu', 2, true), ['pool', 'maxPool2d', { poolSize: 2, strides: 2 }],
          ...bcStage('s3_', 32, 'pool', 3, true), ...bcStage('s4_', 40, 's3_3_relu', 3, true),
          ['head', 'conv2d', { filters: 64, kernelSize: 1, activation: 'relu' }], ['gap', 'globalAvgPool2d'], ['dropout', 'dropout', { rate: 0.2 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
      },
      bcLite: {
        ko: 'lite', en: 'lite', descKo: 'TODO', descEn: 'TODO',
        layers: [['input', 'input', { shape: '32,32,1' }], ['conv_1', 'conv2d', { filters: 16, kernelSize: 5, strides: 2, activation: 'linear' }], ['bn_1', 'batchNorm', { momentum: 0.9 }], ['relu_1', 'activation', { activation: 'relu' }],
          ...bcStage('s1_', 16, 'relu_1', 2), ['pool', 'maxPool2d', { poolSize: 2, strides: 2 }],
          ...bcStage('s2_', 24, 'pool', 3, true), ...bcStage('s3_', 32, 's2_3_relu', 3, true),
          ['head', 'conv2d', { filters: 48, kernelSize: 1, activation: 'relu' }], ['gap', 'globalAvgPool2d'], ['dropout', 'dropout', { rate: 0.2 }], ['output', 'dense', { units: 6, activation: 'softmax' }]],
      },
    },
    train: { learningRate: 0.003, epochs: 20, batchSize: 32, schedule: 'cosine', labelSmoothing: 0.1, mixup: 0.3 },
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
