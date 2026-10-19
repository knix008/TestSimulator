// The Python / PyTorch dictionary: what the code editor completes, shows on
// hover and lists in its Dictionary panel. Each entry is
//   [label, kind, signature, Korean, English, example?]
// kind: 'syntax' (grammar), 'keyword', 'builtin', 'dict' (dictionary methods),
// 'list' (list / str methods), 'torch', 'tensor' (tensor methods), 'nn', 'F',
// 'optim', 'mt' (MyTrainer bridge).
const E = (label, kind, signature, ko, en, example = '') => ({ label, kind, signature, ko, en, example });

export const PY_DICTIONARY = [
  // ── grammar
  E('if', 'syntax', 'if 조건:\n    ...\nelif 조건:\n    ...\nelse:\n    ...', '조건이 참일 때만 블록을 실행합니다. 들여쓰기(공백 4칸)가 블록을 정합니다.', 'Runs a block only when the condition is true. Indentation (4 spaces) marks the block.', 'if loss < best:\n    best = loss'),
  E('for', 'syntax', 'for 변수 in 반복가능객체:\n    ...', '리스트·range·딕셔너리 등의 항목을 하나씩 꺼내 반복합니다.', 'Repeats a block for every item of a list, range, dict, ….', 'for epoch in range(10):\n    print(epoch)'),
  E('while', 'syntax', 'while 조건:\n    ...', '조건이 참인 동안 반복합니다.', 'Repeats while the condition is true.', 'while step < 100:\n    step += 1'),
  E('def', 'syntax', 'def 이름(인자, 기본값=1):\n    return 값', '함수를 정의합니다.', 'Defines a function.', 'def accuracy(out, y):\n    return (out.argmax(1) == y).float().mean()'),
  E('class', 'syntax', 'class 이름(부모):\n    def __init__(self):\n        ...', '클래스를 정의합니다. PyTorch 모델은 nn.Module을 상속한 클래스입니다.', 'Defines a class. A PyTorch model is a class derived from nn.Module.', 'class Net(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.fc = nn.Linear(2, 1)'),
  E('return', 'keyword', 'return 값', '함수의 결과를 돌려주고 함수를 끝냅니다.', 'Ends a function and gives back a value.'),
  E('import', 'syntax', 'import 모듈 [as 별칭]', '모듈을 불러옵니다.', 'Loads a module.', 'import torch\nimport torch.nn as nn'),
  E('from', 'syntax', 'from 모듈 import 이름', '모듈에서 특정 이름만 불러옵니다.', 'Imports names from a module.', 'from torch import nn'),
  E('with', 'syntax', 'with 컨텍스트 [as 이름]:\n    ...', '블록 동안만 효과가 있는 환경을 만듭니다(파일 열기, torch.no_grad() 등).', 'Runs a block inside a context (an open file, torch.no_grad(), …).', 'with torch.no_grad():\n    out = model(x)'),
  E('try', 'syntax', 'try:\n    ...\nexcept 오류 as e:\n    ...\nfinally:\n    ...', '오류가 나도 프로그램이 멈추지 않게 처리합니다.', 'Handles errors instead of stopping the program.', 'try:\n    value = float(text)\nexcept ValueError:\n    value = 0.0'),
  E('lambda', 'syntax', 'lambda 인자: 식', '이름 없는 한 줄 함수입니다.', 'A one-line function without a name.', 'loss_fn = lambda out, y: ((out - y) ** 2).mean()'),
  E('list comprehension', 'syntax', '[식 for 변수 in 목록 if 조건]', '목록을 한 줄로 만듭니다.', 'Builds a list in one line.', 'squares = [n * n for n in range(5)]'),
  E('dict comprehension', 'syntax', '{키: 값 for 변수 in 목록}', '딕셔너리를 한 줄로 만듭니다.', 'Builds a dictionary in one line.', 'sizes = {name: p.numel() for name, p in model.named_parameters()}'),
  E('dict literal', 'syntax', '{"키": 값, "키2": 값2}', '딕셔너리(키 → 값 사전)를 만듭니다. 키로 값을 찾습니다: d["키"].', 'Creates a dictionary (key → value). Look values up by key: d["key"].', 'CONFIG = {"epochs": 30, "lr": 0.01}\nprint(CONFIG["epochs"])'),
  E('f-string', 'syntax', 'f"글자 {식:.3f}"', '문자열 안에 값을 넣습니다. {값:.3f}는 소수점 셋째 자리까지.', 'Puts values inside text. {value:.3f} shows three decimals.', 'print(f"epoch {epoch}: loss {loss:.4f}")'),
  E('slicing', 'syntax', '목록[시작:끝:간격]', '목록·텐서의 일부를 잘라냅니다. 끝은 포함하지 않습니다.', 'Takes part of a list or tensor (the end is not included).', 'first = x[:32]\nlast_step = out[:, -1, :]'),
  E('elif', 'keyword', 'elif 조건:', 'if의 앞 조건이 거짓일 때 다음 조건을 검사합니다.', 'Checks another condition when the ones before were false.'),
  E('else', 'keyword', 'else:', '앞의 조건이 모두 거짓일 때 실행합니다.', 'Runs when no condition before was true.'),
  E('in', 'keyword', 'x in 목록', '목록·딕셔너리에 들어 있는지 검사하거나 for에서 반복 대상을 가리킵니다.', 'Tests membership, or names what a for loop goes through.', 'if "val_loss" in logs:'),
  E('not', 'keyword', 'not 조건', '참·거짓을 뒤집습니다.', 'Negates a condition.'),
  E('and', 'keyword', 'a and b', '둘 다 참일 때 참.', 'True when both are true.'),
  E('or', 'keyword', 'a or b', '하나라도 참이면 참.', 'True when either is true.'),
  E('is', 'keyword', 'a is None', '같은 객체인지 검사합니다(None 비교에 사용).', 'Tests identity (use it to compare with None).'),
  E('None', 'keyword', 'None', '값이 없음을 뜻합니다.', 'Means "no value".'),
  E('True', 'keyword', 'True', '참.', 'True.'),
  E('False', 'keyword', 'False', '거짓.', 'False.'),
  E('pass', 'keyword', 'pass', '아무것도 하지 않는 자리 채움 문장입니다.', 'Does nothing (a placeholder).'),
  E('break', 'keyword', 'break', '반복문을 즉시 빠져나옵니다.', 'Leaves the loop at once.'),
  E('continue', 'keyword', 'continue', '반복의 나머지를 건너뛰고 다음 차례로 갑니다.', 'Skips to the next round of the loop.'),
  E('raise', 'keyword', 'raise 오류("설명")', '오류를 일으킵니다.', 'Raises an error.'),
  E('assert', 'keyword', 'assert 조건, "설명"', '조건이 거짓이면 오류를 냅니다(검사용).', 'Fails with an error when the condition is false.', 'assert x.shape[1] == 2, "two features expected"'),
  E('global', 'keyword', 'global 이름', '함수 안에서 전역 변수를 바꿉니다.', 'Lets a function change a global variable.'),
  E('yield', 'keyword', 'yield 값', '값을 하나씩 내주는 생성기 함수를 만듭니다.', 'Makes a generator function that hands out values one by one.'),
  E('del', 'keyword', 'del d["키"]', '변수·항목을 지웁니다.', 'Deletes a variable or an item.'),
  E('self', 'keyword', 'self', '클래스의 메서드에서 자기 자신(객체)을 가리킵니다.', 'The object itself inside a class method.'),
  E('super', 'builtin', 'super().__init__()', '부모 클래스의 메서드를 부릅니다. nn.Module 모델의 __init__ 첫 줄에 필요합니다.', 'Calls the parent class. Needed first in an nn.Module\'s __init__.'),
  E('__init__', 'syntax', 'def __init__(self, ...):', '객체를 만들 때 실행되는 메서드(층 만들기).', 'Runs when the object is created (build the layers here).'),
  // ── built-in functions
  E('print', 'builtin', 'print(*값, sep=" ", end="\\n")', '값을 콘솔에 출력합니다. MyTrainer 콘솔에 보입니다.', 'Prints values (shown in MyTrainer\'s console).', 'print("shape:", x.shape)'),
  E('len', 'builtin', 'len(객체)', '길이(항목 수)를 돌려줍니다.', 'Number of items.'),
  E('range', 'builtin', 'range(시작, 끝, 간격)', '정수 범위를 만듭니다(끝 미포함).', 'A range of whole numbers (end not included).', 'for i in range(0, 100, 10):'),
  E('enumerate', 'builtin', 'enumerate(목록, start=0)', '번호와 항목을 함께 꺼냅니다.', 'Gives (index, item) pairs.', 'for i, (xb, yb) in enumerate(loader):'),
  E('zip', 'builtin', 'zip(a, b)', '여러 목록을 짝지어 꺼냅니다.', 'Pairs items of several lists.'),
  E('sorted', 'builtin', 'sorted(목록, key=None, reverse=False)', '정렬된 새 목록을 만듭니다.', 'Returns a new sorted list.'),
  E('sum', 'builtin', 'sum(목록)', '합계.', 'Sum of the items.'),
  E('min', 'builtin', 'min(목록) / min(a, b)', '최솟값.', 'Smallest value.'),
  E('max', 'builtin', 'max(목록) / max(a, b)', '최댓값.', 'Largest value.'),
  E('abs', 'builtin', 'abs(x)', '절댓값.', 'Absolute value.'),
  E('round', 'builtin', 'round(x, 자릿수)', '반올림.', 'Rounds a number.'),
  E('int', 'builtin', 'int(x)', '정수로 바꿉니다.', 'Converts to a whole number.'),
  E('float', 'builtin', 'float(x)', '실수로 바꿉니다. float("inf")는 무한대.', 'Converts to a float. float("inf") is infinity.'),
  E('str', 'builtin', 'str(x)', '문자열로 바꿉니다.', 'Converts to text.'),
  E('bool', 'builtin', 'bool(x)', '참·거짓으로 바꿉니다.', 'Converts to True / False.'),
  E('list', 'builtin', 'list(반복가능객체)', '리스트를 만듭니다.', 'Creates a list.'),
  E('dict', 'builtin', 'dict(키=값, ...)', '딕셔너리를 만듭니다.', 'Creates a dictionary.', 'logs = dict(loss=0.5, acc=0.9)'),
  E('set', 'builtin', 'set(목록)', '중복 없는 집합을 만듭니다.', 'Creates a set (no duplicates).'),
  E('tuple', 'builtin', 'tuple(목록)', '바꿀 수 없는 목록(튜플)을 만듭니다.', 'Creates a tuple (an unchangeable list).'),
  E('isinstance', 'builtin', 'isinstance(객체, 타입)', '객체의 타입을 검사합니다.', 'Checks an object\'s type.', 'if isinstance(m, nn.Linear):'),
  E('type', 'builtin', 'type(객체)', '객체의 타입.', 'The type of an object.'),
  E('getattr', 'builtin', 'getattr(객체, "이름", 기본값)', '이름으로 속성을 가져옵니다.', 'Gets an attribute by name.'),
  E('open', 'builtin', 'open(경로, "r", encoding="utf-8")', '파일을 엽니다. with와 함께 씁니다.', 'Opens a file (use with "with").'),
  E('map', 'builtin', 'map(함수, 목록)', '모든 항목에 함수를 적용합니다.', 'Applies a function to every item.'),
  E('filter', 'builtin', 'filter(함수, 목록)', '조건에 맞는 항목만 남깁니다.', 'Keeps the items for which the function is true.'),
  E('any', 'builtin', 'any(목록)', '하나라도 참이면 True.', 'True when any item is true.'),
  E('all', 'builtin', 'all(목록)', '모두 참이면 True.', 'True when all items are true.'),
  // ── dictionaries
  E('keys', 'dict', 'd.keys()', '딕셔너리의 키 목록.', 'The keys of a dictionary.', 'for name in CONFIG.keys():'),
  E('values', 'dict', 'd.values()', '딕셔너리의 값 목록.', 'The values of a dictionary.'),
  E('items', 'dict', 'd.items()', '(키, 값) 쌍 목록. for 키, 값 in d.items():', '(key, value) pairs.', 'for key, value in logs.items():\n    print(key, value)'),
  E('get', 'dict', 'd.get(키, 기본값)', '키의 값을, 없으면 기본값을 돌려줍니다(오류 없음).', 'The value for a key, or the default when it is missing.', 'val = logs.get("val_loss", logs["loss"])'),
  E('update', 'dict', 'd.update(다른딕셔너리)', '다른 딕셔너리의 항목을 넣거나 덮어씁니다.', 'Adds / overwrites items from another dictionary.', 'logs.update({"lr": 0.01})'),
  E('pop', 'dict', 'd.pop(키, 기본값) / 목록.pop(위치)', '항목을 꺼내며 지웁니다.', 'Removes an item and returns it.'),
  E('setdefault', 'dict', 'd.setdefault(키, 기본값)', '키가 없으면 기본값을 넣고, 그 값을 돌려줍니다.', 'Inserts the default when the key is missing; returns the value.'),
  E('copy', 'dict', 'd.copy()', '얕은 복사본을 만듭니다.', 'A shallow copy.'),
  E('clear', 'dict', 'd.clear()', '모든 항목을 지웁니다.', 'Removes every item.'),
  // ── lists / strings
  E('append', 'list', 'lst.append(값)', '리스트 끝에 추가합니다.', 'Adds an item at the end.', 'history.append(loss)'),
  E('extend', 'list', 'lst.extend(목록)', '다른 목록의 항목을 모두 추가합니다.', 'Adds every item of another list.'),
  E('insert', 'list', 'lst.insert(위치, 값)', '위치에 끼워 넣습니다.', 'Inserts an item at a position.'),
  E('sort', 'list', 'lst.sort(key=None, reverse=False)', '리스트를 제자리에서 정렬합니다.', 'Sorts the list in place.'),
  E('index', 'list', 'lst.index(값)', '값이 처음 나오는 위치.', 'Position of the first matching item.'),
  E('join', 'list', '", ".join(목록)', '문자열 목록을 이어 붙입니다.', 'Joins a list of strings.'),
  E('split', 'list', 'text.split(",")', '문자열을 나눕니다.', 'Splits a string.'),
  E('format', 'list', '"{:.3f}".format(x)', '문자열 서식.', 'String formatting.'),
  // ── torch
  E('torch', 'torch', 'import torch', 'PyTorch: 텐서 계산과 자동 미분 라이브러리.', 'PyTorch: tensors and automatic differentiation.'),
  E('torch.tensor', 'torch', 'torch.tensor(데이터, dtype=None, device=None)', '파이썬 목록 등에서 텐서를 만듭니다.', 'Creates a tensor from data.', 'x = torch.tensor([[0.0, 1.0]])'),
  E('torch.zeros', 'torch', 'torch.zeros(*shape)', '0으로 채운 텐서.', 'A tensor of zeros.'),
  E('torch.ones', 'torch', 'torch.ones(*shape)', '1로 채운 텐서.', 'A tensor of ones.'),
  E('torch.randn', 'torch', 'torch.randn(*shape)', '표준정규분포 난수 텐서.', 'Random normal values.'),
  E('torch.rand', 'torch', 'torch.rand(*shape)', '0~1 균등분포 난수 텐서.', 'Random values in [0, 1).'),
  E('torch.randperm', 'torch', 'torch.randperm(n)', '0..n-1을 무작위로 섞은 순서.', 'A random permutation of 0..n-1.'),
  E('torch.arange', 'torch', 'torch.arange(시작, 끝, 간격)', '일정 간격 값의 1차원 텐서.', 'Evenly spaced values.'),
  E('torch.linspace', 'torch', 'torch.linspace(시작, 끝, 개수)', '시작~끝을 고르게 나눈 값.', 'Evenly spaced values including both ends.'),
  E('torch.cat', 'torch', 'torch.cat([a, b], dim=0)', '텐서를 한 축으로 이어 붙입니다.', 'Concatenates tensors along a dimension.'),
  E('torch.stack', 'torch', 'torch.stack([a, b], dim=0)', '새 축을 만들며 쌓습니다.', 'Stacks tensors along a new dimension.'),
  E('torch.matmul', 'torch', 'torch.matmul(a, b)  /  a @ b', '행렬 곱.', 'Matrix product.'),
  E('torch.relu', 'torch', 'torch.relu(x)', 'max(0, x).', 'max(0, x).'),
  E('torch.sigmoid', 'torch', 'torch.sigmoid(x)', '1 / (1 + e⁻ˣ): 0~1 사이 값.', '1 / (1 + e⁻ˣ): values in (0, 1).'),
  E('torch.tanh', 'torch', 'torch.tanh(x)', '쌍곡탄젠트: −1~1 사이 값.', 'Hyperbolic tangent: values in (−1, 1).'),
  E('torch.softmax', 'torch', 'torch.softmax(x, dim=-1)', '합이 1인 확률로 바꿉니다.', 'Turns scores into probabilities that sum to 1.'),
  E('torch.argmax', 'torch', 'torch.argmax(x, dim=1)', '가장 큰 값의 위치(예측 클래스).', 'Position of the largest value (the predicted class).'),
  E('torch.flatten', 'torch', 'torch.flatten(x, 1)', '1번 축부터 한 줄로 폅니다.', 'Flattens from dimension 1 on.'),
  E('torch.clamp', 'torch', 'torch.clamp(x, min, max)', '값을 범위 안으로 자릅니다.', 'Limits values to a range.'),
  E('torch.no_grad', 'torch', 'with torch.no_grad():', '기울기 계산을 끕니다(평가·예측 때).', 'Turns gradient tracking off (evaluation, prediction).'),
  E('torch.save', 'torch', 'torch.save(model.state_dict(), "model.pt")', '모델 가중치를 파일로 저장합니다.', 'Saves model weights to a file.'),
  E('torch.load', 'torch', 'torch.load("model.pt")', '저장한 가중치를 읽습니다.', 'Loads saved weights.'),
  E('torch.manual_seed', 'torch', 'torch.manual_seed(42)', '난수 씨앗을 고정해 결과를 재현합니다.', 'Fixes the random seed for repeatable results.'),
  E('torch.cuda.is_available', 'torch', 'torch.cuda.is_available()', 'NVIDIA GPU(CUDA)를 쓸 수 있는지.', 'Whether an NVIDIA GPU (CUDA) is usable.'),
  E('torch.log', 'torch', 'torch.log(x)', '자연로그.', 'Natural logarithm.'),
  E('torch.exp', 'torch', 'torch.exp(x)', 'eˣ.', 'eˣ.'),
  E('torch.mean', 'torch', 'torch.mean(x, dim=None)', '평균.', 'Mean.'),
  // ── tensor methods
  E('shape', 'tensor', 'x.shape', '텐서의 모양. (배치, 특성...)', 'The tensor\'s shape (batch, features…).'),
  E('reshape', 'tensor', 'x.reshape(-1, 4, 4)', '모양을 바꿉니다(-1은 자동 계산).', 'Changes the shape (-1 = computed).'),
  E('view', 'tensor', 'x.view(-1, 16)', 'reshape와 같지만 메모리가 연속일 때만.', 'Like reshape, for contiguous tensors.'),
  E('permute', 'tensor', 'x.permute(0, 3, 1, 2)', '축 순서를 바꿉니다. (N,H,W,C)→(N,C,H,W).', 'Reorders dimensions: (N,H,W,C) → (N,C,H,W).'),
  E('transpose', 'tensor', 'x.transpose(1, 2)', '두 축을 맞바꿉니다.', 'Swaps two dimensions.'),
  E('unsqueeze', 'tensor', 'x.unsqueeze(0)', '크기 1인 축을 추가합니다.', 'Adds a dimension of size 1.'),
  E('squeeze', 'tensor', 'x.squeeze()', '크기 1인 축을 없앱니다.', 'Removes dimensions of size 1.'),
  E('detach', 'tensor', 'x.detach()', '기울기 추적에서 떼어냅니다.', 'Detaches from gradient tracking.'),
  E('item', 'tensor', 'loss.item()', '값 하나짜리 텐서를 파이썬 숫자로.', 'A one-value tensor as a Python number.'),
  E('numpy', 'tensor', 'x.cpu().numpy()', 'NumPy 배열로 바꿉니다.', 'Converts to a NumPy array.'),
  E('to', 'tensor', 'x.to(device)', '장치(CPU/GPU)나 타입을 바꿉니다.', 'Moves to a device (CPU/GPU) or type.'),
  E('backward', 'tensor', 'loss.backward()', '역전파: 모든 가중치의 기울기를 계산합니다.', 'Backpropagation: computes every weight\'s gradient.'),
  E('float', 'tensor', 'x.float()', 'float32로 바꿉니다.', 'Converts to float32.'),
  E('long', 'tensor', 'x.long()', '정수(int64)로 바꿉니다(클래스 번호, 단어 번호).', 'Converts to int64 (class ids, word ids).'),
  E('numel', 'tensor', 'x.numel()', '값의 개수.', 'Number of values.'),
  E('parameters', 'tensor', 'model.parameters()', '모델의 학습 가능한 가중치들.', 'The model\'s trainable weights.'),
  E('state_dict', 'tensor', 'model.state_dict()', '가중치를 이름 → 텐서 딕셔너리로.', 'Weights as a name → tensor dictionary.'),
  E('train', 'tensor', 'model.train()', '학습 모드(드롭아웃·배치정규화가 학습용으로 동작).', 'Training mode (dropout and batch norm train).'),
  E('eval', 'tensor', 'model.eval()', '평가 모드.', 'Evaluation mode.'),
  // ── nn
  E('nn.Module', 'nn', 'class Net(nn.Module)', '모든 PyTorch 모델의 부모 클래스. __init__에서 층을 만들고 forward에서 계산합니다.', 'Base class of every model: build layers in __init__, compute in forward.'),
  E('nn.Linear', 'nn', 'nn.Linear(입력수, 출력수, bias=True)', '완전연결층: y = xWᵀ + b. Keras의 Dense.', 'Fully connected layer: y = xWᵀ + b (Keras Dense).'),
  E('nn.Conv2d', 'nn', 'nn.Conv2d(입력채널, 출력채널, kernel_size, stride=1, padding=0)', '2차원 합성곱. 입력 (N, C, H, W).', '2-D convolution; input (N, C, H, W).'),
  E('nn.Conv1d', 'nn', 'nn.Conv1d(입력채널, 출력채널, kernel_size)', '1차원 합성곱. 입력 (N, C, L).', '1-D convolution; input (N, C, L).'),
  E('nn.MaxPool2d', 'nn', 'nn.MaxPool2d(kernel_size, stride)', '영역의 최댓값만 남겨 크기를 줄입니다.', 'Keeps the largest value of each window.'),
  E('nn.AvgPool2d', 'nn', 'nn.AvgPool2d(kernel_size, stride)', '영역의 평균으로 크기를 줄입니다.', 'Averages each window.'),
  E('nn.BatchNorm1d', 'nn', 'nn.BatchNorm1d(특성수)', '배치 정규화(벡터·시퀀스).', 'Batch normalization (vectors, sequences).'),
  E('nn.BatchNorm2d', 'nn', 'nn.BatchNorm2d(채널수)', '배치 정규화(그림).', 'Batch normalization (pictures).'),
  E('nn.LayerNorm', 'nn', 'nn.LayerNorm(특성수)', '샘플마다 정규화합니다.', 'Normalizes each sample.'),
  E('nn.Dropout', 'nn', 'nn.Dropout(p=0.5)', '학습 중 무작위로 뉴런을 끕니다(과적합 방지).', 'Randomly switches neurons off while training (less overfitting).'),
  E('nn.Embedding', 'nn', 'nn.Embedding(어휘수, 벡터크기)', '단어 번호를 학습되는 벡터로 바꿉니다.', 'Turns word ids into learned vectors.'),
  E('nn.LSTM', 'nn', 'nn.LSTM(입력크기, 은닉크기, batch_first=True)', '장단기 기억 순환층. 출력 (out, (h, c)).', 'Long short-term memory layer; returns (out, (h, c)).'),
  E('nn.GRU', 'nn', 'nn.GRU(입력크기, 은닉크기, batch_first=True)', 'GRU 순환층. 출력 (out, h).', 'GRU recurrent layer; returns (out, h).'),
  E('nn.RNN', 'nn', 'nn.RNN(입력크기, 은닉크기, batch_first=True)', '단순 순환층.', 'Simple recurrent layer.'),
  E('nn.Sequential', 'nn', 'nn.Sequential(층1, 층2, ...)', '층을 차례로 묶습니다.', 'Chains layers in order.', 'mlp = nn.Sequential(nn.Linear(2, 8), nn.ReLU(), nn.Linear(8, 1))'),
  E('nn.Flatten', 'nn', 'nn.Flatten()', '배치 축을 뺀 나머지를 폅니다.', 'Flattens all but the batch dimension.'),
  E('nn.Upsample', 'nn', 'nn.Upsample(scale_factor=2)', '그림을 크게 만듭니다.', 'Enlarges pictures.'),
  E('nn.ReLU', 'nn', 'nn.ReLU()', 'ReLU 활성화 층.', 'ReLU activation layer.'),
  E('nn.Sigmoid', 'nn', 'nn.Sigmoid()', '시그모이드 활성화 층.', 'Sigmoid activation layer.'),
  E('nn.Tanh', 'nn', 'nn.Tanh()', 'tanh 활성화 층.', 'tanh activation layer.'),
  E('nn.Softmax', 'nn', 'nn.Softmax(dim=-1)', '소프트맥스 층.', 'Softmax layer.'),
  E('nn.LeakyReLU', 'nn', 'nn.LeakyReLU(negative_slope=0.01)', '음수에도 작은 기울기를 둔 ReLU.', 'ReLU with a small slope for negatives.'),
  E('nn.GELU', 'nn', 'nn.GELU()', 'GELU 활성화(트랜스포머에서 흔함).', 'GELU activation (common in transformers).'),
  E('nn.CrossEntropyLoss', 'nn', 'nn.CrossEntropyLoss()', '다중 분류 손실(로짓 입력, 정수 정답).', 'Multi-class loss (logits in, class ids as targets).'),
  E('nn.NLLLoss', 'nn', 'nn.NLLLoss()', 'log 확률에 대한 음의 로그 가능도.', 'Negative log likelihood of log-probabilities.'),
  E('nn.BCELoss', 'nn', 'nn.BCELoss()', '이진 분류 손실(시그모이드 확률 입력).', 'Binary loss (sigmoid probabilities in).'),
  E('nn.BCEWithLogitsLoss', 'nn', 'nn.BCEWithLogitsLoss()', '이진 분류 손실(로짓 입력).', 'Binary loss (logits in).'),
  E('nn.MSELoss', 'nn', 'nn.MSELoss()', '평균제곱오차(회귀).', 'Mean squared error (regression).'),
  E('nn.L1Loss', 'nn', 'nn.L1Loss()', '평균절대오차.', 'Mean absolute error.'),
  E('nn.HuberLoss', 'nn', 'nn.HuberLoss(delta=1.0)', '이상치에 강한 회귀 손실.', 'Regression loss robust to outliers.'),
  // ── functional
  E('F.relu', 'F', 'F.relu(x)', 'ReLU 함수.', 'ReLU function.'),
  E('F.softmax', 'F', 'F.softmax(x, dim=-1)', '소프트맥스 함수.', 'Softmax function.'),
  E('F.log_softmax', 'F', 'F.log_softmax(x, dim=-1)', 'log(softmax(x)), 수치적으로 안정.', 'log(softmax(x)), numerically stable.'),
  E('F.cross_entropy', 'F', 'F.cross_entropy(logits, y)', '교차 엔트로피 손실 함수.', 'Cross-entropy loss function.'),
  E('F.nll_loss', 'F', 'F.nll_loss(log_probs, y)', '음의 로그 가능도 손실.', 'Negative log likelihood loss.'),
  E('F.mse_loss', 'F', 'F.mse_loss(out, y)', '평균제곱오차 함수.', 'Mean squared error function.'),
  E('F.dropout', 'F', 'F.dropout(x, p=0.5, training=self.training)', '드롭아웃 함수.', 'Dropout function.'),
  E('F.max_pool2d', 'F', 'F.max_pool2d(x, 2)', '최대 풀링 함수.', 'Max pooling function.'),
  E('F.leaky_relu', 'F', 'F.leaky_relu(x, negative_slope=0.01)', 'Leaky ReLU 함수.', 'Leaky ReLU function.'),
  E('F.silu', 'F', 'F.silu(x)', 'x·σ(x) (Swish).', 'x·σ(x) (swish).'),
  E('F.gelu', 'F', 'F.gelu(x)', 'GELU 함수.', 'GELU function.'),
  E('F.elu', 'F', 'F.elu(x)', 'ELU 함수.', 'ELU function.'),
  E('F.pad', 'F', 'F.pad(x, (왼, 오, 위, 아래))', '가장자리를 채웁니다.', 'Pads the edges.'),
  E('F.interpolate', 'F', 'F.interpolate(x, scale_factor=2)', '크기를 바꿉니다(보간).', 'Resizes by interpolation.'),
  // ── optim
  E('torch.optim.SGD', 'optim', 'torch.optim.SGD(model.parameters(), lr=0.01, momentum=0.0)', '확률적 경사 하강법.', 'Stochastic gradient descent.'),
  E('torch.optim.Adam', 'optim', 'torch.optim.Adam(model.parameters(), lr=0.001)', '적응형 학습률 최적화(가장 많이 씀).', 'Adaptive optimizer (the usual default).'),
  E('torch.optim.AdamW', 'optim', 'torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.01)', '가중치 감쇠를 분리한 Adam.', 'Adam with decoupled weight decay.'),
  E('torch.optim.RMSprop', 'optim', 'torch.optim.RMSprop(model.parameters(), lr=0.001)', 'RMSprop 최적화.', 'RMSprop optimizer.'),
  E('zero_grad', 'optim', 'optimizer.zero_grad()', '기울기를 0으로 지웁니다(배치마다 처음에).', 'Clears gradients (at the start of every batch).'),
  E('step', 'optim', 'optimizer.step()', '기울기로 가중치를 한 번 고칩니다.', 'Updates the weights once from the gradients.'),
  E('lr_scheduler.StepLR', 'optim', 'torch.optim.lr_scheduler.StepLR(optimizer, step_size, gamma=0.1)', '일정 에포크마다 학습률을 줄입니다.', 'Lowers the learning rate every few epochs.'),
  E('lr_scheduler.CosineAnnealingLR', 'optim', 'torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max)', '코사인 모양으로 학습률을 줄입니다.', 'Lowers the learning rate along a cosine.'),
  // ── MyTrainer bridge
  E('mt.load_data', 'mt', 'mt.load_data() → dict', 'MyTrainer가 전처리·분할한 데이터: x_train, y_train, x_val, y_val, x_test, y_test.', 'The data MyTrainer prepared: x_train, y_train, x_val, y_val, x_test, y_test.'),
  E('mt.device', 'mt', 'mt.device() → "cuda" | "mps" | "cpu"', '쓸 수 있는 가장 빠른 장치.', 'The fastest available device.'),
  E('mt.batches', 'mt', 'mt.batches(x, y, batch_size, shuffle=False)', '미니배치를 하나씩 내줍니다. 일시정지·정지도 처리합니다.', 'Yields mini-batches; also handles pause and stop.'),
  E('mt.watch', 'mt', 'mt.watch(model, loss_fn)', 'MyTrainer가 가중치·기울기·활성값을 보여 줄 수 있게 합니다.', 'Lets MyTrainer show weights, gradients and activations.'),
  E('mt.trace', 'mt', 'mt.trace("이름", tensor, layout=None)', '층 출력을 기록합니다(스냅샷 때만). 텐서를 그대로 돌려줍니다.', 'Records a layer output (during snapshots); returns the tensor.'),
  E('mt.report_batch', 'mt', 'mt.report_batch(epoch, loss)', '배치 진행을 알립니다.', 'Reports batch progress.'),
  E('mt.report_epoch', 'mt', 'mt.report_epoch(epoch, logs, lr=None)', '에포크 결과 딕셔너리(loss, acc, val_loss, val_acc)를 알립니다.', 'Reports an epoch\'s logs dictionary (loss, acc, val_loss, val_acc).'),
  E('mt.should_stop', 'mt', 'mt.should_stop() → bool', '사용자가 정지를 눌렀는지.', 'Whether the user pressed Stop.'),
  E('mt.finish', 'mt', 'mt.finish(model, test_logs)', '학습 끝: 테스트 예측을 보냅니다.', 'End of training: sends test predictions.'),
  E('mt.serve', 'mt', 'mt.serve(model)', '학습 후 MyTrainer의 테스트 요청에 답합니다.', 'Answers MyTrainer\'s test requests after training.'),
];

export const DICTIONARY_KINDS = ['syntax', 'keyword', 'builtin', 'dict', 'list', 'torch', 'tensor', 'nn', 'F', 'optim', 'mt'];

/** Entries matching a search text (label, signature or description), best matches first. */
export function searchDictionary(query, language = 'ko', kind = null) {
  const q = String(query ?? '').trim().toLowerCase();
  const list = PY_DICTIONARY.filter((entry) => !kind || entry.kind === kind);
  if (!q) return list;
  const scored = [];
  for (const entry of list) {
    const label = entry.label.toLowerCase();
    let score = -1;
    if (label === q) score = 100;
    else if (label.startsWith(q) || label.split('.').pop().startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (entry.signature.toLowerCase().includes(q)) score = 40;
    else if ((language === 'en' ? entry.en : entry.ko).toLowerCase().includes(q)) score = 20;
    if (score >= 0) scored.push([score, entry]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].label.localeCompare(b[1].label)).map(([, entry]) => entry);
}

/** The entry for a word under the cursor ("Linear" finds nn.Linear, "relu" finds torch.relu …). */
export function lookupWord(word, before = '') {
  if (!word) return null;
  const full = `${before}${word}`;
  return PY_DICTIONARY.find((entry) => entry.label === full)
    ?? PY_DICTIONARY.find((entry) => entry.label.endsWith(`.${word}`) && full.endsWith(entry.label))
    ?? PY_DICTIONARY.find((entry) => entry.label === word)
    ?? PY_DICTIONARY.find((entry) => entry.label.split('.').pop() === word)
    ?? null;
}
