'use strict';

// Data-science rules: NumPy, pandas, scikit-learn, PyTorch.

const { define } = require('./def');
const { dotted, isTrue, short, walkLocal } = require('../ast');
const { BUILTIN } = require('../scope');
const U = require('./util');

const RULES = [];
const R = define(RULES);

const kw = (call, name) => { for (const k of call.keywords) if (k.arg === name) return k.value; return null; };
const q = (c, e) => c.q(e) || '';

// expression known to produce a pandas DataFrame / Series
function pandasValue(c, e, depth = 0) {
  if (!e || depth > 4) return false;
  if (e.type === 'Call') {
    const name = q(c, e.func);
    if (/^pandas\.(?:DataFrame|Series|read_\w+|concat|merge|pivot_table|get_dummies|crosstab|json_normalize)$/.test(name)) return true;
    if (e.func.type === 'Attribute' && /^(?:copy|dropna|fillna|drop|rename|reset_index|set_index|sort_values|sort_index|merge|join|groupby|agg|apply|query|assign|astype|head|tail|sample|loc|iloc|filter|pivot|melt)$/.test(e.func.attr)) return pandasValue(c, e.func.value, depth + 1);
    return false;
  }
  if (e.type === 'Subscript') return pandasValue(c, e.value, depth + 1);
  if (e.type === 'Attribute' && /^(?:loc|iloc|at|iat|T)$/.test(e.attr)) return pandasValue(c, e.value, depth + 1);
  if (e.type === 'Name' && e.sym && e.sym !== BUILTIN && e.sym.bindings.length === 1) {
    const b = e.sym.bindings[0];
    if (b.kind === 'assign' && b.stmt && b.stmt.type === 'Assign' && b.stmt.targets.length === 1 && b.stmt.targets[0] === b.node) return pandasValue(c, b.stmt.value, depth + 1);
    if (b.kind === 'param' && b.node.annotation && /DataFrame|Series/.test(dotted(b.node.annotation) || '')) return true;
  }
  if (e.type === 'Name' && e.sym && e.sym !== BUILTIN && e.sym.bindings.length > 1) {
    // df = pd.DataFrame(); df = df.dropna(); ... : every rebinding is a pandas value or derived from the name itself
    let any = false;
    for (const b of e.sym.bindings) {
      if (b.kind !== 'assign' || !b.stmt || b.stmt.type !== 'Assign' || b.stmt.targets.length !== 1 || b.stmt.targets[0] !== b.node) return false;
      const v = b.stmt.value;
      if (rootName(v) === e.id) continue;
      if (!pandasValue(c, v, depth + 1)) return false;
      any = true;
    }
    return any;
  }
  return false;
}

// root variable of a call / attribute / subscript chain (df.a.b() -> 'df')
function rootName(e) {
  let x = e;
  while (x && (x.type === 'Call' || x.type === 'Attribute' || x.type === 'Subscript')) x = x.type === 'Call' ? x.func : x.value;
  return x && x.type === 'Name' ? x.id : null;
}

R('numpy-deprecated-alias', 'B', 'MA', 5, ['data-science', 'numpy'], null,
  ['Removed NumPy type alias', '제거된 NumPy 타입 별칭'],
  ['np.float, np.int, np.bool, np.object, np.str, np.long and np.complex were deprecated aliases of builtins and are removed since NumPy 1.24 (AttributeError).', 'np.float, np.int, np.bool, np.object, np.str, np.long, np.complex는 내장 타입의 폐기된 별칭으로 NumPy 1.24부터 제거되었습니다(AttributeError).'],
  ['Use the builtin (float, int, bool...) or the sized NumPy type (np.float64, np.int64, np.bool_).', '내장 타입(float, int, bool...)이나 크기가 정해진 NumPy 타입(np.float64, np.int64, np.bool_)을 쓰세요.'],
  {
    on: {
      Attribute(n, c, r) {
        const name = q(c, n);
        const m = /^numpy\.(float|int|bool|object|str|long|unicode|complex)$/.exec(name);
        if (m) r.report(n, `'np.${m[1]}' was removed in NumPy 1.24; use '${m[1] === 'long' ? 'int' : m[1] === 'unicode' ? 'str' : m[1]}' or a sized NumPy type.`, `'np.${m[1]}'는 NumPy 1.24에서 제거됐습니다. '${m[1] === 'long' ? 'int' : m[1] === 'unicode' ? 'str' : m[1]}'나 크기가 정해진 NumPy 타입을 쓰세요.`);
      },
    },
  });

const LEGACY_RANDOM = /^numpy\.random\.(?:seed|rand|randn|randint|random|random_sample|ranf|sample|choice|shuffle|permutation|normal|uniform|binomial|poisson|exponential|beta|gamma|standard_normal|multivariate_normal|random_integers|bytes|lognormal|laplace|logistic|geometric|multinomial|dirichlet|chisquare|triangular)$/;

R('numpy-legacy-random', 'S', 'MA', 10, ['data-science', 'numpy'], 'S6711',
  ['Legacy NumPy random API', '레거시 NumPy 난수 API'],
  ['The np.random.* functions share one global RandomState; results depend on every other caller and the API is frozen.', 'np.random.* 함수는 전역 RandomState 하나를 공유해 결과가 다른 모든 호출에 좌우되고 API도 동결됐습니다.'],
  ['Create a generator with rng = np.random.default_rng(seed) and call rng.integers(), rng.normal()...', 'rng = np.random.default_rng(seed)로 생성기를 만들고 rng.integers(), rng.normal() 등을 호출하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (LEGACY_RANDOM.test(name)) r.report(n, `Use a numpy.random.Generator instead of the legacy '${name.replace(/^numpy\./, 'np.')}'.`, `레거시 '${name.replace(/^numpy\./, 'np.')}' 대신 numpy.random.Generator를 쓰세요.`);
      },
    },
  });

R('random-seed-missing', 'S', 'MA', 5, ['data-science', 'numpy', 'reproducibility'], 'S6709',
  ['Random generator created without a seed', '시드 없이 난수 생성기를 만듭니다'],
  ['Results built on an unseeded generator cannot be reproduced, which hides bugs and makes experiments uncomparable.', '시드 없는 생성기로 만든 결과는 재현할 수 없어 버그를 숨기고 실험을 비교할 수 없게 합니다.'],
  ['Pass a seed (np.random.default_rng(42)) or make it configurable.', '시드를 넘기거나(np.random.default_rng(42)) 설정 가능하게 하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!/^numpy\.random\.(?:default_rng|RandomState|Generator)$/.test(name)) return;
        if (n.args.length || n.keywords.length) return;
        if (c.isTest) return;
        r.report(n, `Provide a seed to '${name.replace(/^numpy\./, 'np.')}()' so results are reproducible.`, `결과를 재현할 수 있도록 '${name.replace(/^numpy\./, 'np.')}()'에 시드를 넘기세요.`);
      },
    },
  });

const SKLEARN_RANDOM = /^sklearn\.(?:ensemble\.(?:RandomForest|ExtraTrees|GradientBoosting|HistGradientBoosting|AdaBoost|Bagging)(?:Classifier|Regressor)|ensemble\.IsolationForest|ensemble\.RandomTreesEmbedding|tree\.(?:DecisionTree|ExtraTree)(?:Classifier|Regressor)|cluster\.(?:KMeans|MiniBatchKMeans|SpectralClustering|BisectingKMeans)|linear_model\.(?:SGDClassifier|SGDRegressor|Perceptron|PassiveAggressiveClassifier|RANSACRegressor)|neural_network\.(?:MLPClassifier|MLPRegressor)|decomposition\.(?:TruncatedSVD|NMF|FastICA|LatentDirichletAllocation)|manifold\.TSNE|model_selection\.(?:train_test_split|ShuffleSplit|StratifiedShuffleSplit|GroupShuffleSplit)|utils\.shuffle|datasets\.make_\w+|mixture\.(?:GaussianMixture|BayesianGaussianMixture)|svm\.LinearSVC|kernel_approximation\.(?:RBFSampler|Nystroem)|random_projection\.\w+|dummy\.DummyClassifier)$/;

R('sklearn-random-state-missing', 'S', 'MA', 5, ['data-science', 'scikit-learn', 'reproducibility'], 'S6709',
  ['scikit-learn estimator or split without random_state', 'random_state 없는 scikit-learn 추정기나 분할'],
  ['Without random_state every run shuffles, initializes or splits differently, so scores and models cannot be reproduced.', 'random_state가 없으면 실행할 때마다 섞기, 초기화, 분할이 달라져 점수와 모델을 재현할 수 없습니다.'],
  ['Pass random_state=<int>.', 'random_state=<정수>를 넘기세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!name.startsWith('sklearn.')) return;
        if (n.keywords.some((k) => k.arg === 'random_state' || k.arg === null)) return;
        let need = SKLEARN_RANDOM.test(name);
        if (/^sklearn\.model_selection\.(?:KFold|StratifiedKFold|RepeatedKFold|RepeatedStratifiedKFold)$/.test(name)) {
          const sh = kw(n, 'shuffle');
          need = /Repeated/.test(name) || (sh && isTrue(sh));
        }
        if (!need) return;
        r.report(n, `Specify 'random_state' for '${name.split('.').pop()}' to make results reproducible.`, `결과를 재현할 수 있도록 '${name.split('.').pop()}'에 'random_state'를 지정하세요.`);
      },
    },
  });

R('numpy-where-single-arg', 'S', 'MI', 2, ['data-science', 'numpy'], 'S6729',
  ['np.where() called with only a condition', '조건만 넘겨 np.where()를 호출합니다'],
  ['np.where(cond) is documented as a discouraged alias of np.nonzero(cond).', 'np.where(cond)는 np.nonzero(cond)의 권장되지 않는 별칭으로 문서화돼 있습니다.'],
  ['Use np.nonzero() (or np.argwhere()).', 'np.nonzero()(또는 np.argwhere())를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        if (q(c, n.func) === 'numpy.where' && n.args.length === 1 && !n.keywords.length) r.report(n, "Use 'np.nonzero()' instead of 'np.where()' with a single argument.", "인자 하나인 'np.where()' 대신 'np.nonzero()'를 쓰세요.");
      },
    },
  });

R('numpy-matrix', 'S', 'MI', 5, ['data-science', 'numpy'], null,
  ['np.matrix is deprecated', 'np.matrix는 폐기 예정입니다'],
  ['np.matrix is no longer recommended and will be removed; operators behave differently from regular arrays.', 'np.matrix는 더 이상 권장되지 않고 제거될 예정이며, 연산자가 일반 배열과 다르게 동작합니다.'],
  ['Use regular ndarrays and the @ operator.', '일반 ndarray와 @ 연산자를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        if (/^numpy\.(?:matrix|mat|asmatrix|bmat)$/.test(q(c, n.func))) r.report(n, 'Use a regular ndarray instead of np.matrix.', 'np.matrix 대신 일반 ndarray를 쓰세요.');
      },
    },
  });

R('pandas-inplace', 'S', 'MA', 5, ['data-science', 'pandas'], 'S6734',
  ['pandas operation with inplace=True', 'inplace=True를 쓴 pandas 연산'],
  ['inplace=True rarely saves memory, breaks method chaining, returns None (a common source of bugs) and is slated for deprecation.', 'inplace=True는 메모리를 거의 아끼지 못하고 메서드 체이닝을 깨며 None을 반환해(흔한 버그 원인) 폐기 예정입니다.'],
  ['Assign the result instead: df = df.dropna().', '결과를 대입하세요: df = df.dropna().'],
  {
    on: {
      Call(n, c, r) {
        if (!c.imported('pandas') || n.func.type !== 'Attribute') return;
        const ip = kw(n, 'inplace');
        if (ip && isTrue(ip) && /^(?:drop|dropna|fillna|rename|sort_values|sort_index|reset_index|set_index|replace|drop_duplicates|interpolate|clip|where|mask|query|eval|ffill|bfill|rename_axis|set_axis|update|insert|astype)$/.test(n.func.attr)) {
          r.report(ip, `Do not use 'inplace=True' with '${n.func.attr}()'; assign the result instead.`, `'${n.func.attr}()'에 'inplace=True'를 쓰지 말고 결과를 대입하세요.`);
        }
      },
    },
  });

R('pandas-merge-args', 'S', 'MA', 5, ['data-science', 'pandas'], 'S6735',
  ['pandas merge without how / on / validate', 'how / on / validate 없는 pandas merge'],
  ['Relying on defaults (inner join on common columns, no cardinality check) silently drops or multiplies rows when the data changes.', '기본값(공통 열 내부 조인, 관계 검사 없음)에 기대면 데이터가 바뀔 때 행이 조용히 빠지거나 늘어납니다.'],
  ['Pass how=, on= (or left_on/right_on) and validate= explicitly.', 'how=, on=(또는 left_on/right_on), validate=를 명시하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        const isMerge = name === 'pandas.merge' || (n.func.type === 'Attribute' && n.func.attr === 'merge' && c.imported('pandas') && (pandasValue(c, n.func.value) || /df/i.test(dotted(n.func.value) || '')));
        if (!isMerge || n.keywords.some((k) => k.arg === null)) return;
        const has = (k) => n.keywords.some((x) => x.arg === k);
        const missing = [];
        if (!has('how')) missing.push('how');
        if (!(has('on') || has('left_on') || has('right_on') || has('left_index') || has('right_index'))) missing.push('on');
        if (!has('validate')) missing.push('validate');
        if (missing.length) r.report(n, `Specify ${missing.map((m) => `'${m}'`).join(', ')} for this merge.`, `이 merge에 ${missing.map((m) => `'${m}'`).join(', ')}를 지정하세요.`);
      },
    },
  });

R('pandas-values', 'S', 'MI', 2, ['data-science', 'pandas'], 'S6741',
  ['DataFrame.values instead of to_numpy()', 'to_numpy() 대신 DataFrame.values를 씁니다'],
  ['.values has inconsistent return types (arrays, extension arrays, object copies); to_numpy() is explicit and configurable.', '.values는 반환 타입이 일관되지 않으며(배열, 확장 배열, 객체 복사본), to_numpy()는 명시적이고 설정 가능합니다.'],
  ['Use .to_numpy().', '.to_numpy()를 쓰세요.'],
  {
    on: {
      Attribute(n, c, r) {
        if (n.attr !== 'values' || n.ctx !== 'Load') return;
        if (n.parent && n.parent.type === 'Call' && n.parent.func === n) return; // dict.values()
        if (pandasValue(c, n.value)) r.report(n, "Use '.to_numpy()' instead of '.values'.", "'.values' 대신 '.to_numpy()'를 쓰세요.");
      },
    },
  });

function chainHasPandasAccessor(e) {
  for (let x = e; x; x = x.type === 'Subscript' || x.type === 'Attribute' ? x.value : null) {
    if (x.type === 'Attribute' && /^(?:loc|iloc)$/.test(x.attr)) return true;
  }
  return false;
}

R('pandas-chained-assignment', 'B', 'MA', 10, ['data-science', 'pandas'], null,
  ['pandas chained indexing assignment', 'pandas 연쇄 인덱싱 대입'],
  ['df[a][b] = v assigns into a temporary copy (SettingWithCopyWarning); with copy-on-write in pandas 3 it never changes df.', 'df[a][b] = v는 임시 복사본에 대입되며(SettingWithCopyWarning), pandas 3의 copy-on-write에서는 df가 절대 바뀌지 않습니다.'],
  ['Use a single indexer: df.loc[row, col] = v.', '인덱서 하나를 쓰세요: df.loc[row, col] = v.'],
  {
    on: {
      Subscript(n, c, r) {
        if (n.ctx !== 'Store') return;
        const inner = n.value;
        if (!(inner.type === 'Subscript' || (inner.type === 'Attribute' && /^(?:loc|iloc|at|iat)$/.test(inner.attr) && inner.value.type === 'Subscript'))) return;
        const base = inner.type === 'Subscript' ? inner : inner.value;
        if (!(chainHasPandasAccessor(base) || pandasValue(c, base.value))) return;
        if (inner.type === 'Attribute' && !(pandasValue(c, base.value) || chainHasPandasAccessor(base.value))) return;
        r.report(n, `Chained indexing '${short(c.slice(n), 40)}' assigns to a copy; use a single .loc[...] indexer.`, `연쇄 인덱싱 '${short(c.slice(n), 40)}'는 복사본에 대입합니다. .loc[...] 인덱서 하나를 쓰세요.`);
      },
    },
  });

R('pandas-append-removed', 'B', 'MA', 5, ['data-science', 'pandas'], null,
  ['DataFrame.append / Series.append was removed', 'DataFrame.append / Series.append는 제거됐습니다'],
  ['append was deprecated in pandas 1.4 and removed in 2.0, so this call raises AttributeError.', 'append는 pandas 1.4에서 폐기되고 2.0에서 제거되어 이 호출은 AttributeError가 납니다.'],
  ['Collect rows in a list and call pd.concat once.', '행을 리스트에 모은 뒤 pd.concat을 한 번 호출하세요.'],
  {
    on: {
      Call(n, c, r) {
        if (n.func.type !== 'Attribute' || n.func.attr !== 'append' || !pandasValue(c, n.func.value)) return;
        r.report(n, "pandas 'append' was removed in 2.0; use pd.concat().", "pandas 'append'는 2.0에서 제거됐습니다. pd.concat()을 쓰세요.");
      },
    },
  });

function isTorchModuleBase(c, b) {
  const name = c.q(b) || dotted(b) || '';
  return /^(?:torch\.nn\.Module|torch\.nn\.modules\.module\.Module)$/.test(name) || (name === 'nn.Module' && c.imported('torch'));
}

R('torch-module-init', 'B', 'BL', 5, ['data-science', 'pytorch'], 'S6978',
  ['nn.Module subclass does not call super().__init__()', 'nn.Module 하위 클래스가 super().__init__()을 호출하지 않습니다'],
  ['nn.Module.__init__ sets up the parameter and sub-module registries; assigning layers before it runs raises AttributeError.', 'nn.Module.__init__는 매개변수와 하위 모듈 등록부를 준비하므로, 실행 전에 층을 대입하면 AttributeError가 납니다.'],
  ['Call super().__init__() first in __init__.', '__init__에서 super().__init__()을 먼저 호출하세요.'],
  {
    on: {
      ClassDef(n, c, r) {
        if (!n.bases.some((b) => isTorchModuleBase(c, b))) return;
        const init = n.body.find((s) => s.type === 'FunctionDef' && s.name === '__init__');
        if (!init) return;
        let calls = false;
        walkLocal(init, (m) => {
          if (calls) return false;
          if (m.type === 'Call' && m.func.type === 'Attribute' && m.func.attr === '__init__') calls = true;
          return true;
        });
        if (!calls) r.report(init, `Call 'super().__init__()' in '${n.name}.__init__'.`, `'${n.name}.__init__'에서 'super().__init__()'을 호출하세요.`);
      },
    },
  });

R('torch-forward-direct', 'S', 'MA', 5, ['data-science', 'pytorch'], null,
  ['Module.forward() called directly', 'Module.forward()를 직접 호출합니다'],
  ['Calling forward() skips the hooks that module(x) runs (forward / backward hooks, tracing, profiling).', 'forward()를 직접 호출하면 module(x)가 실행하는 훅(forward/backward 훅, 추적, 프로파일링)을 건너뜁니다.'],
  ['Call the module itself: model(x).', '모듈 자체를 호출하세요: model(x).'],
  {
    on: {
      Call(n, c, r) {
        if (!c.imported('torch') || n.func.type !== 'Attribute' || n.func.attr !== 'forward') return;
        const v = n.func.value;
        if (v.type === 'Call' && U.isBuiltinName(v.func, 'super')) return;
        if (/^[A-Z]/.test(U.lastPart(dotted(v) || ''))) return; // Base.forward(self, x) / nn.Linear.forward(self, x)
        r.report(n, `Call '${short(c.slice(v), 30)}(...)' instead of '.forward(...)' so hooks run.`, `훅이 실행되도록 '.forward(...)' 대신 '${short(c.slice(v), 30)}(...)'를 호출하세요.`);
      },
    },
  });

R('torch-variable-deprecated', 'S', 'MI', 5, ['data-science', 'pytorch'], null,
  ['torch.autograd.Variable is deprecated', 'torch.autograd.Variable은 폐기됐습니다'],
  ['Since PyTorch 0.4 tensors track gradients themselves; Variable is a no-op wrapper kept for compatibility.', 'PyTorch 0.4부터 텐서가 스스로 기울기를 추적하며, Variable은 호환용 빈 래퍼입니다.'],
  ['Use tensors directly (requires_grad=True when needed).', '텐서를 바로 쓰세요(필요하면 requires_grad=True).'],
  {
    on: {
      Call(n, c, r) {
        if (/^torch\.autograd(?:\.variable)?\.Variable$/.test(q(c, n.func))) r.report(n, 'Use a tensor instead of the deprecated torch.autograd.Variable.', '폐기된 torch.autograd.Variable 대신 텐서를 쓰세요.');
      },
    },
  });

module.exports = { RULES, pandasValue };
