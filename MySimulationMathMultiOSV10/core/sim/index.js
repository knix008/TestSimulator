// Simulation area: block-diagram engine (compile.js, runtime.js, solvers.js),
// block library (blocks/), editor protocol (messages.js, PROTOCOL.md) and the
// M-language builtins (builtins.js). Pure ESM; runs in the engine Web Worker.
import { builtins as B, classes as C } from './builtins.js';
import { handleMessage } from './messages.js';

const H = (en, ko, syntax) => ({ en, ko, syntax: Array.isArray(syntax) ? syntax : [syntax] });

export const builtins = B;
export const classes = C;

export const help = {
  new_system: H('Creates a new empty block-diagram model.', '새 빈 블록 다이어그램 모델을 만듭니다.', ["new_system('name')", "h = new_system('name')"]),
  open_system: H('Loads a model (or uses the loaded one) and shows it in an editor tab.', '모델을 불러와(이미 불러온 경우 그대로) 편집기 탭에 표시합니다.', ["open_system('name')", "open_system('file.smdl')", "open_system('model/Subsystem')"]),
  load_system: H('Loads a model file (.smdl, .slx, .mdl) without opening an editor.', '편집기를 열지 않고 모델 파일(.smdl, .slx, .mdl)을 불러옵니다.', ["load_system('name')", "h = load_system('folder/model.smdl')"]),
  close_system: H('Closes a loaded model, optionally saving it first.', '불러온 모델을 닫습니다 (먼저 저장할 수 있음).', ["close_system('name')", "close_system('name', 1)"]),
  save_system: H('Saves a model as a .smdl file (renames the model when the file name differs).', '모델을 .smdl 파일로 저장합니다 (파일 이름이 다르면 모델 이름이 바뀜).', ["save_system('name')", "save_system('name', 'file.smdl')", "p = save_system('name')"]),
  bdroot: H('Name of the model that contains a block (or of the current model).', '블록이 속한 모델(또는 현재 모델)의 이름.', ['m = bdroot', "m = bdroot('model/Sub/Gain')"]),
  gcs: H('Path of the current system.', '현재 시스템의 경로.', 'p = gcs'),
  gcb: H('Path of the current block (the block last added or changed by M code).', '현재 블록의 경로 (M 코드로 마지막에 추가·변경한 블록).', 'p = gcb'),
  gcbh: H('Handle of the current block (-1 when there is none).', '현재 블록의 핸들 (없으면 -1).', 'h = gcbh'),
  find_system: H('Finds models and blocks by type, name or parameter values.', '종류·이름·파라미터 값으로 모델과 블록을 찾습니다.', ["paths = find_system('model')", "paths = find_system('model', 'BlockType', 'Gain')", "paths = find_system('model', 'SearchDepth', 1, 'Name', 'Out1')", "h = find_system('model', 'FindAll', 'on', 'BlockType', 'Scope')"]),
  add_block: H('Adds a library block (by name, e.g. \'Math Operations/Gain\' or \'Gain\') or a copy of a model block.', '라이브러리 블록(\'Math Operations/Gain\' 또는 \'Gain\' 같은 이름) 또는 모델 블록의 복사본을 추가합니다.', ["add_block('Gain', 'model/K')", "add_block('Sources/Sine Wave', 'model/Sine', 'Amplitude', '2')", "h = add_block('model/K', 'model/K2', 'MakeNameUnique', 'on')"]),
  delete_block: H('Deletes blocks (and the lines connected to them).', '블록(과 연결된 선)을 삭제합니다.', ["delete_block('model/K')", 'delete_block(h)']),
  add_line: H("Connects an output port to an input port: 'block/port' (control ports: 'block/Enable', 'block/Trigger', 'block/Ifaction').", "출력 포트를 입력 포트에 연결합니다: 'block/port' (제어 포트: 'block/Enable', 'block/Trigger', 'block/Ifaction').", ["add_line('model', 'Sine/1', 'Scope/1')", "h = add_line('model/Sub', 'In1/1', 'Gain/1', 'autorouting', 'on')"]),
  delete_line: H('Deletes the line between two ports (or by line handle).', '두 포트 사이의 선(또는 선 핸들)을 삭제합니다.', ["delete_line('model', 'Sine/1', 'Scope/1')", 'delete_line(h)']),
  replace_block: H('Replaces every block of one type with another library block, keeping names, positions and matching parameters.', '한 종류의 모든 블록을 다른 라이브러리 블록으로 바꿉니다 (이름·위치·같은 파라미터 유지).', ["replace_block('model', 'Gain', 'Slider Gain', 'noprompt')", "paths = replace_block('model', 'Scope', 'Floating Scope')"]),
  set_param: H('Sets block parameters, model settings or the simulation command (start, stop, pause, continue, step, update).', '블록 파라미터, 모델 설정 또는 시뮬레이션 명령(start, stop, pause, continue, step, update)을 설정합니다.', ["set_param('model/K', 'Gain', '5')", "set_param('model', 'StopTime', '20', 'Solver', 'ode23')", "set_param('model', 'SimulationCommand', 'start')"]),
  get_param: H('Value of a block parameter or a model setting (text), Position, Handle, ObjectParameters …', '블록 파라미터 또는 모델 설정 값(텍스트), Position, Handle, ObjectParameters 등.', ["v = get_param('model/K', 'Gain')", "t = get_param('model', 'StopTime')", "s = get_param('model/K', 'ObjectParameters')", "c = get_param({'m/A', 'm/B'}, 'BlockType')"]),
  eq2model: H("Builds a model from equations and opens it: differential equations (x'' = -x, x(0) = 1), a transfer function (G = 1/(s + 1)) or state-space matrices (A = …; B = …; C = …; D = …). Undefined names become inputs; constant definitions go to the model workspace. Options: Kind (auto, ode, tf, ss), Input (step, sine, constant, inport), StopTime, Open, Overwrite.", "수식으로 모델을 만들어 엽니다: 미분방정식(x'' = -x, x(0) = 1), 전달 함수(G = 1/(s + 1)) 또는 상태 공간 행렬(A = …; B = …; C = …; D = …). 정의되지 않은 이름은 입력이 되고, 상수 정의는 모델 작업 공간에 들어갑니다. 옵션: Kind (auto, ode, tf, ss), Input (step, sine, constant, inport), StopTime, Open, Overwrite.", ["eq2model('m', \"x'' = -2*x' - x + u\")", "name = eq2model(\"x' = -x; x(0) = 1\")", "eq2model('m', {\"k = 2\", \"x'' = -k*x\", \"x(0) = 1\"}, 'StopTime', 20)", "eq2model('plant', 'G = 5/(s^2 + 2*s + 5)', 'Input', 'sine')"]),
  ode2model: H("Builds a model from differential equations (one per argument or in a cell): states x', x'' (or dx/dt, der(x)), initial values x(0) = …, parameters and output definitions. Integrators per state; terms become Gain, Constant or Fcn blocks added by a Sum.", "미분방정식으로 모델을 만듭니다 (인수마다 또는 셀에 한 식씩): 상태 x', x'' (또는 dx/dt, der(x)), 초기값 x(0) = …, 매개변수와 출력 정의. 상태마다 적분기를 두고, 항은 이득·상수·Fcn 블록이 되어 합 블록에서 더해집니다.", ["ode2model('spring', \"x'' = -c*x' - k*x + u\", 'k = 4', 'c = 0.5')", "ode2model('pend', {\"th'' = -g/L*sin(th)\", 'g = 9.81', 'L = 1', 'th(0) = 0.5'})", "ode2model('lorenz', \"x' = 10*(y - x)\", \"y' = x*(28 - z) - y\", \"z' = x*y - 8/3*z\", 'x(0) = 1', 'Open', 'off')"]),
  tf2model: H('Builds a model with a transfer function: from coefficients (num, den), from an expression of s (z with Ts for discrete) or from a tf / zpk / ss object (one input, one output). Input → transfer function → Scope and Out port.', '전달 함수 모델을 만듭니다: 계수(num, den), s의 식(이산이면 z와 Ts) 또는 tf / zpk / ss 객체(입력 1개, 출력 1개)에서. 입력 → 전달 함수 → 스코프와 출력 포트.', ["tf2model('m', [1 1], [1 2 1])", "tf2model('m', '(s + 1)/(s^2 + 2*s + 1)')", "tf2model('m', tf(1, [1 1]))", "tf2model('d', [0.5], [1 -0.5], 'Ts', 0.1)"]),
  ss2model: H('Builds a model with a state-space block from A, B, C, D (and x0), from text or from an ss / tf object. Several inputs are joined by a Mux; Ts makes it discrete.', '상태 공간 블록 모델을 만듭니다: A, B, C, D (와 x0), 텍스트 또는 ss / tf 객체에서. 입력이 여러 개면 먹스로 묶고, Ts를 주면 이산 모델이 됩니다.', ["ss2model('m', [0 1; -2 -3], [0; 1], [1 0], 0)", "ss2model('m', 'A = [0 1; -2 -3]; B = [0; 1]; C = [1 0]; x0 = [1; 0]')", "ss2model('m', ss(tf(1, [1 2 1])))"]),
  sim: H('Simulates a model and returns a SimulationOutput (tout, yout, logsout, To Workspace data). Without outputs the results go to the base workspace.', '모델을 시뮬레이션하고 SimulationOutput(tout, yout, logsout, To Workspace 데이터)을 돌려줍니다. 출력 인수가 없으면 결과를 기본 작업 공간에 씁니다.', ["out = sim('model')", "out = sim('model', 'StopTime', '5', 'Solver', 'ode4', 'FixedStep', '0.01')", 'out = sim(simIn)', "[t, x, y] = sim('model', 10)", "out = sim('model', simset('RelTol', 1e-6))"]),
  simset: H('Options struct for sim (model setting names and values).', 'sim용 옵션 구조체 (모델 설정 이름과 값).', ["opts = simset('Solver', 'ode45', 'RelTol', 1e-6)", "opts = simset(opts, 'StopTime', 5)"]),
  simget: H('Model settings as a struct, or one setting.', '모델 설정 전체(구조체) 또는 하나의 설정.', ["s = simget('model')", "v = simget('model', 'RelTol')", "v = simget(opts, 'Solver')"]),
  parsim: H('Runs several simulations (one per SimulationInput); returns a cell array of SimulationOutput.', '여러 시뮬레이션(SimulationInput마다 하나)을 실행하고 SimulationOutput의 셀 배열을 돌려줍니다.', ['outs = parsim(simIns)', 'outs = parsim({in1, in2})']),
  SimulationInput: H('Simulation input: model name with variables, block parameters, model parameters and external input for sim / parsim. Methods setVariable, setBlockParameter, setModelParameter, setExternalInput.', '시뮬레이션 입력: sim/parsim용 모델 이름과 변수·블록 파라미터·모델 파라미터·외부 입력. 메서드 setVariable, setBlockParameter, setModelParameter, setExternalInput.', ["in = SimulationInput('model')", "in = in.setVariable('K', 3)", "in = setBlockParameter(in, 'model/Gain', 'Gain', '2')", "in = in.setModelParameter('StopTime', '20')", 'out = sim(in)']),
  SimulationOutput: H('Result of sim: properties tout, yout, logsout, xout, To Workspace and scope variables, SimulationMetadata, ErrorMessage. Methods get, find, who.', 'sim의 결과: tout, yout, logsout, xout, To Workspace·스코프 변수, SimulationMetadata, ErrorMessage 속성. 메서드 get, find, who.', ['t = out.tout', "y = out.get('yout')", 'names = out.who']),
};

/** Registers the editor protocol handler (PROTOCOL.md). */
export function install(ctx) {
  ctx.onMessage('sim.', (msg) => handleMessage(ctx, msg));
}

export { handleMessage };
