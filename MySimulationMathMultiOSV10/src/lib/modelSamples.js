// Example models shown on the start page (모델 예제), apart from the script
// samples. Each one is the M code that builds the model with new_system /
// add_block / add_line, so it works the same on the desktop and on the web:
// opening an example runs its code quietly and the model opens in the model
// editor (open_system). An example that is already loaded is just shown again.
// A model is written as blocks on a grid (column, row) and wires; build()
// turns that into the M code. name / desc are [한국어, English].
// Tested by test/model-samples.test.mjs (every example builds and simulates).

export const MODEL_CATEGORIES = [
  { id: 'sources', icon: 'sparkle', name: ['신호 원', 'Sources'] },
  { id: 'continuous', icon: 'plotLine', name: ['연속 시스템', 'Continuous systems'] },
  { id: 'physics', icon: 'cube', name: ['물리 · 기계', 'Physics · mechanics'] },
  { id: 'control', icon: 'target', name: ['제어', 'Control'] },
  { id: 'signal', icon: 'waves', name: ['신호 처리', 'Signal processing'] },
  { id: 'discrete', icon: 'clock', name: ['이산 · 디지털', 'Discrete · digital'] },
  { id: 'nonlinear', icon: 'flow', name: ['비선형 · 카오스', 'Nonlinear · chaos'] },
  { id: 'logic', icon: 'branch', name: ['논리 · 라우팅', 'Logic · routing'] },
  { id: 'math', icon: 'hash', name: ['수학 연산', 'Math operations'] },
];

// ── layout → M code ──
const WIDE = new Set(['TransferFcn', 'Fcn', 'StateSpace', 'ZeroPole', 'DiscreteFilter', 'DiscreteTransferFcn', 'PIDController', 'DiscretePIDController', 'Polynomial', 'TransportDelay']);
const PORTS = (lib, p) => (lib === 'Scope' ? Number(p.NumInputPorts || 1) : lib === 'Mux' ? Number(p.Inputs || 2) : lib === 'XYGraph' ? 2 : 1);
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** A block: name, library id, grid column / row, parameters; o: { left: true } faces left (feedback paths). */
const B = (name, lib, col, row, params = {}, o = {}) => ({ name, lib, col, row, params, o });

function blockLine(b) {
  const w = WIDE.has(b.lib) ? 100 : b.lib === 'Mux' ? 10 : 40;
  const n = PORTS(b.lib, b.params);
  const h = b.lib === 'Mux' ? Math.max(40, n * 25) : b.lib === 'Scope' || b.lib === 'XYGraph' ? Math.max(40, n * 22 + 18) : WIDE.has(b.lib) ? 46 : 40;
  const x = 40 + b.col * 140, y = 50 + b.row * 95;
  const args = Object.entries(b.params).map(([k, v]) => `, ${q(k)}, ${q(v)}`).join('');
  const orient = b.o.left ? ", 'Orientation', 'left'" : '';
  return `add_block(${q(b.lib)}, [mdl ${q(`/${b.name}`)}]${args}${orient}, 'Position', [${x} ${y} ${x + w} ${y + h}]);`;
}

/** The M code that builds `model` (shown again when it is loaded), sets the stop time and opens it. */
function build(model, blocks, wires, stop) {
  const lines = [...blocks.map(blockLine), ...wires.map(([a, b]) => `add_line(mdl, ${q(a)}, ${q(b)});`)];
  return `% Example model "${model}": built from M code, then opened in the model editor.
mdl = '${model}';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
${lines.map((l) => `    ${l}`).join('\n')}
    set_param(mdl, 'StopTime', '${stop}');
    open_system(mdl);
end
`;
}

/** An example: id, category, tile color, tags, [ko, en] name and description, blocks, wires, stop time. */
const M = (id, cat, color, tags, name, desc, blocks, wires, stop, feedback = false) => ({
  id, cat, model: `ex_${id}`, color, tags, name, desc, blocks: blocks.length, feedback, code: build(`ex_${id}`, blocks, wires, stop),
});
const scope = (n, col, row, name = 'Scope') => B(name, 'Scope', col, row, { NumInputPorts: String(n) });

export const MODEL_SAMPLES = [
  // ── 신호 원 ──
  M('sources_basic', 'sources', '#4cc9f0', ['Step', 'Ramp', 'Sine Wave'], ['기본 신호 원', 'Basic sources'], ['계단·램프·사인파·상수를 한 스코프에 봅니다', 'Step, ramp, sine and constant on one scope'],
    [B('Step', 'Step', 0, 0, { Time: '1' }), B('Ramp', 'Ramp', 0, 1, { slope: '0.2' }), B('Sine', 'SineWave', 0, 2), B('Constant', 'Constant', 0, 3, { Value: '0.5' }), scope(4, 2, 1)],
    [['Step/1', 'Scope/1'], ['Ramp/1', 'Scope/2'], ['Sine/1', 'Scope/3'], ['Constant/1', 'Scope/4']], '10'),
  M('waveforms', 'sources', '#7b61ff', ['Signal Generator'], ['파형 발생기', 'Waveform generator'], ['사인·사각·톱니 파형을 함께 비교합니다', 'Sine, square and sawtooth waves side by side'],
    [B('Sine', 'SignalGenerator', 0, 0, { WaveForm: 'sine', Frequency: '1' }), B('Square', 'SignalGenerator', 0, 1, { WaveForm: 'square', Frequency: '1' }), B('Sawtooth', 'SignalGenerator', 0, 2, { WaveForm: 'sawtooth', Frequency: '1' }), scope(3, 2, 1)],
    [['Sine/1', 'Scope/1'], ['Square/1', 'Scope/2'], ['Sawtooth/1', 'Scope/3']], '12'),
  M('pulse', 'sources', '#f5c451', ['Pulse Generator'], ['펄스 열', 'Pulse train'], ['주기 2초, 폭 50 %인 펄스와 그 적분', 'A 2 s, 50 % pulse train and its integral'],
    [B('Pulse', 'PulseGenerator', 0, 0, { Period: '2', PulseWidth: '50', SampleTime: '0' }), B('Integrator', 'Integrator', 1, 1), scope(2, 2, 0)],
    [['Pulse/1', 'Scope/1'], ['Pulse/1', 'Integrator/1'], ['Integrator/1', 'Scope/2']], '10'),
  M('sawtooth', 'sources', '#2ec4b6', ['Repeating Sequence'], ['반복 수열 (톱니파)', 'Repeating sequence (sawtooth)'], ['시간·값 표로 만든 반복 신호', 'A repeating signal made from a time / value table'],
    [B('Sequence', 'RepeatingSequence', 0, 0, { rep_seq_t: '[0 1 2]', rep_seq_y: '[0 1 0]' }), B('Sawtooth', 'RepeatingSequence', 0, 1, { rep_seq_t: '[0 2]', rep_seq_y: '[-1 1]' }), scope(2, 2, 0)],
    [['Sequence/1', 'Scope/1'], ['Sawtooth/1', 'Scope/2']], '8'),
  M('noise', 'sources', '#ff6b6b', ['Random Number', 'Uniform Random'], ['난수 신호', 'Random signals'], ['정규 분포와 균등 분포 난수를 비교합니다', 'Gaussian and uniform random numbers'],
    [B('Gaussian', 'RandomNumber', 0, 0, { Variance: '0.25', SampleTime: '0.05' }), B('Uniform', 'UniformRandomNumber', 0, 1, { Minimum: '-1', Maximum: '1', SampleTime: '0.05' }), scope(2, 2, 0)],
    [['Gaussian/1', 'Scope/1'], ['Uniform/1', 'Scope/2']], '5'),
  M('chirp', 'sources', '#e07be0', ['Chirp'], ['처프 신호', 'Chirp signal'], ['주파수가 0.1 Hz에서 2 Hz로 올라가는 사인파', 'A sine sweeping from 0.1 Hz to 2 Hz'],
    [B('Chirp', 'Chirp', 0, 0, { f1: '0.1', T: '10', f2: '2' }), scope(1, 2, 0)],
    [['Chirp/1', 'Scope/1']], '10'),

  // ── 연속 시스템 ──
  M('first_order', 'continuous', '#4cc9f0', ['Step', 'Transfer Fcn'], ['1차 시스템 계단 응답', 'First-order step response'], ['계단 입력을 1/(0.5s+1)에 넣고 입력과 출력을 함께 봅니다', 'A step into 1/(0.5s+1), input and output on one scope'],
    [B('Step', 'Step', 0, 0, { Time: '1' }), B('Plant', 'TransferFcn', 1, 0, { Numerator: '[1]', Denominator: '[0.5 1]' }), scope(2, 3, 0)],
    [['Step/1', 'Plant/1'], ['Step/1', 'Scope/1'], ['Plant/1', 'Scope/2']], '6'),
  M('second_order', 'continuous', '#7b61ff', ['Transfer Fcn'], ['2차 시스템과 감쇠비', 'Second order and damping'], ['감쇠비 0.1 / 0.5 / 1의 계단 응답 비교', 'Step responses for damping 0.1, 0.5 and 1'],
    [B('Step', 'Step', 0, 1, { Time: '0' }), B('zeta 0.1', 'TransferFcn', 1, 0, { Numerator: '[4]', Denominator: '[1 0.4 4]' }), B('zeta 0.5', 'TransferFcn', 1, 1, { Numerator: '[4]', Denominator: '[1 2 4]' }), B('zeta 1', 'TransferFcn', 1, 2, { Numerator: '[4]', Denominator: '[1 4 4]' }), scope(3, 3, 1)],
    [['Step/1', 'zeta 0.1/1'], ['Step/1', 'zeta 0.5/1'], ['Step/1', 'zeta 1/1'], ['zeta 0.1/1', 'Scope/1'], ['zeta 0.5/1', 'Scope/2'], ['zeta 1/1', 'Scope/3']], '8'),
  M('integrate_sine', 'continuous', '#f5c451', ['Integrator', 'Derivative'], ['적분과 미분', 'Integral and derivative'], ['sin t 의 적분 (1−cos t)과 미분 (cos t)', 'The integral (1−cos t) and derivative (cos t) of sin t'],
    [B('Sine', 'SineWave', 0, 1), B('Integrator', 'Integrator', 1, 0), B('Derivative', 'Derivative', 1, 2), scope(3, 3, 1)],
    [['Sine/1', 'Integrator/1'], ['Sine/1', 'Derivative/1'], ['Sine/1', 'Scope/1'], ['Integrator/1', 'Scope/2'], ['Derivative/1', 'Scope/3']], '10'),
  M('state_space', 'continuous', '#2ec4b6', ['State-Space'], ['상태 공간 모델', 'State-space model'], ["x' = Ax + Bu, y = Cx 로 쓴 감쇠 진동", "A damped oscillator as x' = Ax + Bu, y = Cx"],
    [B('Step', 'Step', 0, 0, { Time: '0' }), B('Plant', 'StateSpace', 1, 0, { A: '[0 1; -4 -0.8]', B: '[0; 4]', C: '[1 0]', D: '0', InitialCondition: '[0; 0]' }), scope(1, 3, 0)],
    [['Step/1', 'Plant/1'], ['Plant/1', 'Scope/1']], '10'),
  M('zero_pole', 'continuous', '#ff6b6b', ['Zero-Pole'], ['영점-극점 모델', 'Zero-pole model'], ['영점 −1, 극점 −2·−3 인 시스템의 계단 응답', 'Step response with a zero at −1 and poles at −2, −3'],
    [B('Step', 'Step', 0, 0, { Time: '0' }), B('Plant', 'ZeroPole', 1, 0, { Zeros: '[-1]', Poles: '[-2 -3]', Gain: '6' }), scope(2, 3, 0)],
    [['Step/1', 'Plant/1'], ['Step/1', 'Scope/1'], ['Plant/1', 'Scope/2']], '5'),
  M('transport_delay', 'continuous', '#e07be0', ['Transport Delay'], ['시간 지연', 'Transport delay'], ['신호를 1.5초 늦추고 원래 신호와 비교합니다', 'A signal delayed by 1.5 s next to the original'],
    [B('Sine', 'SineWave', 0, 0, { Frequency: '1' }), B('Delay', 'TransportDelay', 1, 1, { DelayTime: '1.5' }), scope(2, 3, 0)],
    [['Sine/1', 'Delay/1'], ['Sine/1', 'Scope/1'], ['Delay/1', 'Scope/2']], '10'),

  // ── 물리 · 기계 ──
  M('mass_spring', 'physics', '#7b61ff', ['Integrator', 'Gain', 'Sum'], ['질량-스프링-댐퍼', 'Mass-spring-damper'], ["m·x'' + c·x' + k·x = F 를 적분기 두 개로 풉니다 (m=1, c=0.5, k=4)", "m·x'' + c·x' + k·x = F with two integrators (m=1, c=0.5, k=4)"],
    [B('Force', 'Step', 0, 0, { Time: '0' }), B('Sum', 'Sum', 1, 0, { Inputs: '|+--' }), B('1 over m', 'Gain', 2, 0, { Gain: '1' }), B('Velocity', 'Integrator', 3, 0), B('Position', 'Integrator', 4, 0), scope(2, 5, 0),
      B('Damping c', 'Gain', 3, 1, { Gain: '0.5' }, { left: true }), B('Spring k', 'Gain', 4, 2, { Gain: '4' }, { left: true })],
    [['Force/1', 'Sum/1'], ['Sum/1', '1 over m/1'], ['1 over m/1', 'Velocity/1'], ['Velocity/1', 'Position/1'], ['Position/1', 'Scope/1'], ['Velocity/1', 'Scope/2'],
      ['Velocity/1', 'Damping c/1'], ['Position/1', 'Spring k/1'], ['Damping c/1', 'Sum/2'], ['Spring k/1', 'Sum/3']], '15', true),
  M('pendulum', 'physics', '#4cc9f0', ['Fcn', 'Mux', 'Integrator'], ['진자', 'Pendulum'], ["θ'' = −(g/L)·sin θ − b·θ' (g/L = 9.81, b = 0.2), 처음 각도 1 rad", "θ'' = −(g/L)·sin θ − b·θ' (g/L = 9.81, b = 0.2), starting at 1 rad"],
    [B('Mux', 'Mux', 0, 0, { Inputs: '2' }), B('Dynamics', 'Fcn', 1, 0, { Expr: '-9.81*sin(u(1)) - 0.2*u(2)' }), B('omega', 'Integrator', 2, 0), B('theta', 'Integrator', 3, 0, { InitialCondition: '1' }), scope(2, 4, 0), B('Phase plane', 'XYGraph', 4, 2)],
    [['Mux/1', 'Dynamics/1'], ['Dynamics/1', 'omega/1'], ['omega/1', 'theta/1'], ['theta/1', 'Mux/1'], ['omega/1', 'Mux/2'], ['theta/1', 'Scope/1'], ['omega/1', 'Scope/2'], ['theta/1', 'Phase plane/1'], ['omega/1', 'Phase plane/2']], '15', true),
  M('rc_circuit', 'physics', '#f5c451', ['Integrator', 'Sum', 'Gain'], ['RC 회로 충전', 'RC circuit charging'], ["RC·v' = Vin − v (R = 1 kΩ, C = 1 mF, Vin = 5 V)", "RC·v' = Vin − v (R = 1 kΩ, C = 1 mF, Vin = 5 V)"],
    [B('Vin', 'Step', 0, 0, { Time: '0.5', After: '5' }), B('Sum', 'Sum', 1, 0, { Inputs: '|+-' }), B('1 over RC', 'Gain', 2, 0, { Gain: '1' }), B('Vc', 'Integrator', 3, 0), scope(2, 4, 0)],
    [['Vin/1', 'Sum/1'], ['Sum/1', '1 over RC/1'], ['1 over RC/1', 'Vc/1'], ['Vc/1', 'Sum/2'], ['Vin/1', 'Scope/1'], ['Vc/1', 'Scope/2']], '6', true),
  M('rlc', 'physics', '#2ec4b6', ['Transfer Fcn'], ['RLC 회로', 'RLC circuit'], ['L = 1 H, C = 0.25 F, R = 0.6 Ω 직렬 회로의 축전기 전압', 'Capacitor voltage of a series circuit, L = 1 H, C = 0.25 F, R = 0.6 Ω'],
    [B('Vin', 'Step', 0, 0, { Time: '0' }), B('Circuit', 'TransferFcn', 1, 0, { Numerator: '[1]', Denominator: '[0.25 0.15 1]' }), scope(2, 3, 0)],
    [['Vin/1', 'Circuit/1'], ['Vin/1', 'Scope/1'], ['Circuit/1', 'Scope/2']], '15'),
  M('drag_fall', 'physics', '#ff6b6b', ['Fcn', 'Integrator'], ['공기 저항이 있는 낙하', 'Falling with air drag'], ["v' = g − k·v² 로 종단 속도 √(g/k)에 다가갑니다", "v' = g − k·v² approaches the terminal speed √(g/k)"],
    [B('Dynamics', 'Fcn', 0, 0, { Expr: '9.81 - 0.1*u(1)^2' }), B('Speed', 'Integrator', 2, 0), B('Distance', 'Integrator', 3, 1), scope(2, 4, 0)],
    [['Dynamics/1', 'Speed/1'], ['Speed/1', 'Dynamics/1'], ['Speed/1', 'Distance/1'], ['Speed/1', 'Scope/1'], ['Distance/1', 'Scope/2']], '6', true),
  M('predator_prey', 'physics', '#8ac926', ['Fcn', 'Mux', 'XY Graph'], ['포식자-피식자 (로트카-볼테라)', 'Predator-prey (Lotka-Volterra)'], ['토끼와 여우 개체 수가 주기적으로 오르내립니다', 'Rabbit and fox populations rise and fall in cycles'],
    [B('Mux', 'Mux', 0, 0, { Inputs: '2' }), B('Prey rate', 'Fcn', 1, 0, { Expr: 'u(1) - 0.1*u(1)*u(2)' }), B('Predator rate', 'Fcn', 1, 1, { Expr: '-1.5*u(2) + 0.075*u(1)*u(2)' }), B('Prey', 'Integrator', 2, 0, { InitialCondition: '10' }), B('Predator', 'Integrator', 2, 1, { InitialCondition: '5' }), scope(2, 4, 0), B('Phase', 'XYGraph', 4, 2)],
    [['Mux/1', 'Prey rate/1'], ['Mux/1', 'Predator rate/1'], ['Prey rate/1', 'Prey/1'], ['Predator rate/1', 'Predator/1'], ['Prey/1', 'Mux/1'], ['Predator/1', 'Mux/2'], ['Prey/1', 'Scope/1'], ['Predator/1', 'Scope/2'], ['Prey/1', 'Phase/1'], ['Predator/1', 'Phase/2']], '20', true),

  // ── 제어 ──
  M('pi_control', 'control', '#f5c451', ['Sum', 'Integrator', 'Transfer Fcn'], ['PI 피드백 제어', 'PI feedback control'], ['오차의 비례·적분으로 2차 플랜트 1/(s²+3s+2)를 목표값에 맞춥니다', 'Proportional + integral of the error drive the plant 1/(s²+3s+2) to the set point'],
    [B('Set point', 'Step', 0, 0, { Time: '1' }), B('Error', 'Sum', 1, 0, { Inputs: '|+-' }), B('Kp', 'Gain', 2, 0, { Gain: '4' }), B('Integral', 'Integrator', 2, 1), B('Ki', 'Gain', 3, 1, { Gain: '3' }), B('Control', 'Sum', 4, 0, { Inputs: '|++' }), B('Plant', 'TransferFcn', 5, 0, { Numerator: '[1]', Denominator: '[1 3 2]' }), scope(2, 7, 0)],
    [['Set point/1', 'Error/1'], ['Error/1', 'Kp/1'], ['Error/1', 'Integral/1'], ['Integral/1', 'Ki/1'], ['Kp/1', 'Control/1'], ['Ki/1', 'Control/2'], ['Control/1', 'Plant/1'], ['Plant/1', 'Error/2'], ['Set point/1', 'Scope/1'], ['Plant/1', 'Scope/2']], '10', true),
  M('pid_block', 'control', '#4cc9f0', ['PID Controller'], ['PID 제어기 블록', 'PID controller block'], ['PID 블록 하나로 플랜트 1/(s²+2s+1)를 제어합니다', 'One PID block controls the plant 1/(s²+2s+1)'],
    [B('Set point', 'Step', 0, 0, { Time: '1' }), B('Error', 'Sum', 1, 0, { Inputs: '|+-' }), B('PID', 'PIDController', 2, 0, { P: '3', I: '2', D: '0.5' }), B('Plant', 'TransferFcn', 3, 0, { Numerator: '[1]', Denominator: '[1 2 1]' }), scope(2, 5, 0)],
    [['Set point/1', 'Error/1'], ['Error/1', 'PID/1'], ['PID/1', 'Plant/1'], ['Plant/1', 'Error/2'], ['Set point/1', 'Scope/1'], ['Plant/1', 'Scope/2']], '10', true),
  M('thermostat', 'control', '#ff6b6b', ['Relay', 'Transfer Fcn'], ['온도 조절기 (켜기/끄기)', 'Thermostat (on / off)'], ['히스테리시스가 있는 릴레이로 방 온도를 20도 근처로 유지합니다', 'A relay with hysteresis keeps the room near 20 degrees'],
    [B('Set 20', 'Constant', 0, 0, { Value: '20' }), B('Error', 'Sum', 1, 0, { Inputs: '|+-' }), B('Heater', 'Relay', 2, 0, { OnSwitchValue: '0.5', OffSwitchValue: '-0.5', OnOutputValue: '1', OffOutputValue: '0' }), B('Power', 'Gain', 3, 0, { Gain: '25' }), B('Room', 'TransferFcn', 4, 0, { Numerator: '[1]', Denominator: '[10 1]' }), scope(2, 6, 0)],
    [['Set 20/1', 'Error/1'], ['Error/1', 'Heater/1'], ['Heater/1', 'Power/1'], ['Power/1', 'Room/1'], ['Room/1', 'Error/2'], ['Room/1', 'Scope/1'], ['Heater/1', 'Scope/2']], '60', true),
  M('saturation_control', 'control', '#7b61ff', ['Saturation', 'Gain'], ['구동기 포화', 'Actuator saturation'], ['제어 입력을 ±1로 제한하면 응답이 느려집니다', 'Limiting the control input to ±1 slows the response'],
    [B('Set point', 'Step', 0, 0, { Time: '0', After: '2' }), B('Error', 'Sum', 1, 0, { Inputs: '|+-' }), B('K', 'Gain', 2, 0, { Gain: '10' }), B('Limit', 'Saturation', 3, 0, { UpperLimit: '1', LowerLimit: '-1' }), B('Plant', 'TransferFcn', 4, 0, { Numerator: '[1]', Denominator: '[1 1]' }), scope(2, 6, 0)],
    [['Set point/1', 'Error/1'], ['Error/1', 'K/1'], ['K/1', 'Limit/1'], ['Limit/1', 'Plant/1'], ['Plant/1', 'Error/2'], ['Plant/1', 'Scope/1'], ['Limit/1', 'Scope/2']], '8', true),
  M('delay_control', 'control', '#2ec4b6', ['PID Controller', 'Transport Delay'], ['지연이 있는 공정 제어', 'Control with dead time'], ['0.5초 지연이 있는 공정을 PI 제어합니다', 'PI control of a process with 0.5 s dead time'],
    [B('Set point', 'Step', 0, 0, { Time: '1' }), B('Error', 'Sum', 1, 0, { Inputs: '|+-' }), B('PI', 'PIDController', 2, 0, { Controller: 'PI', P: '0.8', I: '0.4' }), B('Dead time', 'TransportDelay', 3, 0, { DelayTime: '0.5' }), B('Process', 'TransferFcn', 4, 0, { Numerator: '[1]', Denominator: '[2 1]' }), scope(2, 6, 0)],
    [['Set point/1', 'Error/1'], ['Error/1', 'PI/1'], ['PI/1', 'Dead time/1'], ['Dead time/1', 'Process/1'], ['Process/1', 'Error/2'], ['Set point/1', 'Scope/1'], ['Process/1', 'Scope/2']], '20', true),
  M('open_closed', 'control', '#e07be0', ['Gain', 'Transfer Fcn'], ['개루프와 폐루프', 'Open loop vs closed loop'], ['같은 플랜트를 피드백 없이·있이 움직여 비교합니다', 'The same plant driven without and with feedback'],
    [B('Step', 'Step', 0, 0, { Time: '0' }), B('Open loop', 'TransferFcn', 2, 0, { Numerator: '[1]', Denominator: '[1 1]' }), B('Error', 'Sum', 1, 1, { Inputs: '|+-' }), B('K', 'Gain', 2, 1, { Gain: '5' }), B('Closed loop', 'TransferFcn', 3, 1, { Numerator: '[1]', Denominator: '[1 1]' }), scope(3, 5, 0)],
    [['Step/1', 'Open loop/1'], ['Step/1', 'Error/1'], ['Error/1', 'K/1'], ['K/1', 'Closed loop/1'], ['Closed loop/1', 'Error/2'], ['Step/1', 'Scope/1'], ['Open loop/1', 'Scope/2'], ['Closed loop/1', 'Scope/3']], '6', true),

  // ── 신호 처리 ──
  M('filter', 'signal', '#2ec4b6', ['Sine Wave', 'Random Number', 'Transfer Fcn'], ['잡음 거르기 (저역 통과 필터)', 'Removing noise (low-pass filter)'], ['잡음이 섞인 사인파를 1/(0.1s+1)로 거르고 전후를 비교합니다', 'A noisy sine through 1/(0.1s+1), before and after'],
    [B('Signal', 'SineWave', 0, 0, { Frequency: '1' }), B('Noise', 'RandomNumber', 0, 1, { Variance: '0.04', SampleTime: '0.01' }), B('Add', 'Sum', 1, 0, { Inputs: '|++' }), B('Low-pass', 'TransferFcn', 2, 0, { Numerator: '[1]', Denominator: '[0.1 1]' }), scope(2, 4, 0)],
    [['Signal/1', 'Add/1'], ['Noise/1', 'Add/2'], ['Add/1', 'Low-pass/1'], ['Add/1', 'Scope/1'], ['Low-pass/1', 'Scope/2']], '10'),
  M('moving_average', 'signal', '#4cc9f0', ['Discrete Filter'], ['이동 평균 (FIR)', 'Moving average (FIR)'], ['최근 8개 샘플의 평균으로 잡음을 줄입니다', 'Averaging the last 8 samples smooths the noise'],
    [B('Signal', 'SineWave', 0, 0, { Frequency: '0.5' }), B('Noise', 'RandomNumber', 0, 1, { Variance: '0.05', SampleTime: '0.05' }), B('Add', 'Sum', 1, 0, { Inputs: '|++' }), B('Average 8', 'DiscreteFilter', 2, 0, { Numerator: 'ones(1, 8)/8', Denominator: '1', SampleTime: '0.05' }), scope(2, 4, 0)],
    [['Signal/1', 'Add/1'], ['Noise/1', 'Add/2'], ['Add/1', 'Average 8/1'], ['Add/1', 'Scope/1'], ['Average 8/1', 'Scope/2']], '15'),
  M('highpass', 'signal', '#7b61ff', ['Signal Generator', 'Transfer Fcn'], ['고역 통과 필터', 'High-pass filter'], ['사각파를 s/(s+1)에 통과시키면 모서리만 남습니다', 'A square wave through s/(s+1) keeps only its edges'],
    [B('Square', 'SignalGenerator', 0, 0, { WaveForm: 'square', Frequency: '0.5' }), B('High-pass', 'TransferFcn', 1, 0, { Numerator: '[1 0]', Denominator: '[1 1]' }), scope(2, 3, 0)],
    [['Square/1', 'High-pass/1'], ['Square/1', 'Scope/1'], ['High-pass/1', 'Scope/2']], '25'),
  M('am', 'signal', '#f5c451', ['Product', 'Bias'], ['진폭 변조 (AM)', 'Amplitude modulation (AM)'], ['느린 신호로 빠른 반송파의 진폭을 바꿉니다', 'A slow message shapes the amplitude of a fast carrier'],
    [B('Message', 'SineWave', 0, 0, { Amplitude: '0.5', Frequency: '1' }), B('Offset', 'Bias', 1, 0, { Bias: '1' }), B('Carrier', 'SineWave', 0, 1, { Frequency: '25' }), B('Modulator', 'Product', 2, 0, { Inputs: '2' }), scope(2, 4, 0)],
    [['Message/1', 'Offset/1'], ['Offset/1', 'Modulator/1'], ['Carrier/1', 'Modulator/2'], ['Modulator/1', 'Scope/1'], ['Offset/1', 'Scope/2']], '8'),
  M('rectifier', 'signal', '#ff6b6b', ['Abs', 'Transfer Fcn'], ['정류와 평활', 'Rectifying and smoothing'], ['전파 정류(|sin|) 후 저역 필터로 직류에 가깝게 만듭니다', 'Full-wave rectify (|sin|), then low-pass it towards DC'],
    [B('AC', 'SineWave', 0, 0, { Frequency: '6' }), B('Rectifier', 'Abs', 1, 0), B('Smoothing', 'TransferFcn', 2, 0, { Numerator: '[1]', Denominator: '[0.5 1]' }), scope(3, 4, 0)],
    [['AC/1', 'Rectifier/1'], ['Rectifier/1', 'Smoothing/1'], ['AC/1', 'Scope/1'], ['Rectifier/1', 'Scope/2'], ['Smoothing/1', 'Scope/3']], '5'),
  M('quantizer', 'signal', '#8ac926', ['Quantizer'], ['양자화', 'Quantization'], ['연속 신호를 0.25 단위로 양자화합니다', 'A continuous signal quantized in steps of 0.25'],
    [B('Sine', 'SineWave', 0, 0), B('Quantizer', 'Quantizer', 1, 0, { QuantizationInterval: '0.25' }), scope(2, 3, 0)],
    [['Sine/1', 'Quantizer/1'], ['Sine/1', 'Scope/1'], ['Quantizer/1', 'Scope/2']], '7'),

  // ── 이산 · 디지털 ──
  M('sampling', 'discrete', '#8ac926', ['Zero-Order Hold', 'Unit Delay'], ['샘플링과 단위 지연', 'Sampling and unit delay'], ['연속 사인파를 0.25초마다 붙잡고 한 샘플 늦춘 신호를 비교합니다', 'A sine held every 0.25 s, and the same samples one step later'],
    [B('Sine', 'SineWave', 0, 0, { Frequency: '1' }), B('Hold', 'ZeroOrderHold', 1, 0, { SampleTime: '0.25' }), B('Delay', 'UnitDelay', 2, 0, { SampleTime: '0.25' }), scope(3, 3, 0)],
    [['Sine/1', 'Hold/1'], ['Hold/1', 'Delay/1'], ['Sine/1', 'Scope/1'], ['Hold/1', 'Scope/2'], ['Delay/1', 'Scope/3']], '6'),
  M('discrete_integrator', 'discrete', '#4cc9f0', ['Discrete-Time Integrator'], ['이산 적분기', 'Discrete-time integrator'], ['연속 적분과 0.5초 전진 오일러 적분을 비교합니다', 'Continuous integration next to forward Euler with a 0.5 s step'],
    [B('Sine', 'SineWave', 0, 0), B('Continuous', 'Integrator', 1, 0), B('Discrete', 'DiscreteTimeIntegrator', 1, 1, { SampleTime: '0.5' }), scope(2, 3, 0)],
    [['Sine/1', 'Continuous/1'], ['Sine/1', 'Discrete/1'], ['Continuous/1', 'Scope/1'], ['Discrete/1', 'Scope/2']], '10'),
  M('discrete_tf', 'discrete', '#7b61ff', ['Discrete Transfer Fcn'], ['이산 전달 함수', 'Discrete transfer function'], ['0.1/(z−0.9)의 계단 응답 (샘플 0.1초)', 'Step response of 0.1/(z−0.9), sample time 0.1 s'],
    [B('Step', 'Step', 0, 0, { Time: '0' }), B('Plant', 'DiscreteTransferFcn', 1, 0, { Numerator: '[0.1]', Denominator: '[1 -0.9]', SampleTime: '0.1' }), scope(2, 3, 0)],
    [['Step/1', 'Plant/1'], ['Step/1', 'Scope/1'], ['Plant/1', 'Scope/2']], '5'),
  M('discrete_pid', 'discrete', '#f5c451', ['Discrete PID Controller'], ['디지털 PID 제어', 'Digital PID control'], ['샘플 0.1초인 PID로 이산 플랜트를 제어합니다', 'A PID sampled at 0.1 s controls a discrete plant'],
    [B('Set point', 'Step', 0, 0, { Time: '0.5' }), B('Error', 'Sum', 1, 0, { Inputs: '|+-' }), B('PID', 'DiscretePIDController', 2, 0, { P: '1.5', I: '1', D: '0', SampleTime: '0.1' }), B('Plant', 'DiscreteTransferFcn', 3, 0, { Numerator: '[0.1]', Denominator: '[1 -0.9]', SampleTime: '0.1' }), scope(2, 5, 0)],
    [['Set point/1', 'Error/1'], ['Error/1', 'PID/1'], ['PID/1', 'Plant/1'], ['Plant/1', 'Error/2'], ['Set point/1', 'Scope/1'], ['Plant/1', 'Scope/2']], '6', true),
  M('difference', 'discrete', '#2ec4b6', ['Difference', 'Zero-Order Hold'], ['차분', 'Difference'], ['샘플 사이의 변화량 u(k) − u(k−1)', 'The change between samples, u(k) − u(k−1)'],
    [B('Sine', 'SineWave', 0, 0), B('Hold', 'ZeroOrderHold', 1, 0, { SampleTime: '0.2' }), B('Difference', 'Difference', 2, 0), scope(2, 4, 0)],
    [['Sine/1', 'Hold/1'], ['Hold/1', 'Difference/1'], ['Hold/1', 'Scope/1'], ['Difference/1', 'Scope/2']], '8'),
  M('delay_line', 'discrete', '#ff6b6b', ['Delay', 'Memory'], ['지연선', 'Delay line'], ['샘플 5개만큼 늦춘 신호', 'The signal delayed by five samples'],
    [B('Sine', 'SineWave', 0, 0), B('Hold', 'ZeroOrderHold', 1, 0, { SampleTime: '0.1' }), B('Delay 5', 'Delay', 2, 0, { DelayLength: '5' }), scope(2, 4, 0)],
    [['Sine/1', 'Hold/1'], ['Hold/1', 'Delay 5/1'], ['Hold/1', 'Scope/1'], ['Delay 5/1', 'Scope/2']], '6'),

  // ── 비선형 · 카오스 ──
  M('vanderpol', 'nonlinear', '#ff6b6b', ['Fcn', 'Mux', 'XY Graph'], ['반 데르 폴 진동자', 'Van der Pol oscillator'], ["x'' = μ(1−x²)x' − x (μ=1)의 시간 응답과 위상 평면 궤적", "x'' = μ(1−x²)x' − x (μ=1): time response and phase-plane orbit"],
    [B('Mux', 'Mux', 0, 0, { Inputs: '2' }), B('Dynamics', 'Fcn', 1, 0, { Expr: '(1 - u(1)^2)*u(2) - u(1)' }), B('dx', 'Integrator', 2, 0), B('x', 'Integrator', 3, 0, { InitialCondition: '2' }), scope(1, 4, 0), B('Phase plane', 'XYGraph', 4, 1)],
    [['Mux/1', 'Dynamics/1'], ['Dynamics/1', 'dx/1'], ['dx/1', 'x/1'], ['x/1', 'Mux/1'], ['dx/1', 'Mux/2'], ['x/1', 'Scope/1'], ['x/1', 'Phase plane/1'], ['dx/1', 'Phase plane/2']], '20', true),
  M('lorenz', 'nonlinear', '#7b61ff', ['Fcn', 'Integrator', 'XY Graph'], ['로렌츠 끌개', 'Lorenz attractor'], ['σ=10, ρ=28, β=8/3 의 혼돈 궤적 (나비 모양)', 'The chaotic orbit for σ=10, ρ=28, β=8/3 (the butterfly)'],
    [B('Mux', 'Mux', 0, 1, { Inputs: '3' }), B('dx', 'Fcn', 1, 0, { Expr: '10*(u(2) - u(1))' }), B('dy', 'Fcn', 1, 1, { Expr: 'u(1)*(28 - u(3)) - u(2)' }), B('dz', 'Fcn', 1, 2, { Expr: 'u(1)*u(2) - 8/3*u(3)' }),
      B('x', 'Integrator', 3, 0, { InitialCondition: '1' }), B('y', 'Integrator', 3, 1, { InitialCondition: '1' }), B('z', 'Integrator', 3, 2, { InitialCondition: '1' }), B('x-z', 'XYGraph', 5, 1), scope(1, 5, 0)],
    [['Mux/1', 'dx/1'], ['Mux/1', 'dy/1'], ['Mux/1', 'dz/1'], ['dx/1', 'x/1'], ['dy/1', 'y/1'], ['dz/1', 'z/1'], ['x/1', 'Mux/1'], ['y/1', 'Mux/2'], ['z/1', 'Mux/3'], ['x/1', 'x-z/1'], ['z/1', 'x-z/2'], ['x/1', 'Scope/1']], '25', true),
  M('duffing', 'nonlinear', '#f5c451', ['Fcn', 'Sine Wave', 'Mux'], ['더핑 진동자', 'Duffing oscillator'], ["x'' + 0.2x' − x + x³ = 0.3·cos(1.2t): 주기 외력이 만드는 혼돈", "x'' + 0.2x' − x + x³ = 0.3·cos(1.2t): chaos from a periodic force"],
    [B('Force', 'SineWave', 0, 2, { Amplitude: '0.3', Frequency: '1.2', Phase: 'pi/2' }), B('Mux', 'Mux', 1, 0, { Inputs: '3' }), B('Dynamics', 'Fcn', 2, 0, { Expr: 'u(3) - 0.2*u(2) + u(1) - u(1)^3' }), B('v', 'Integrator', 3, 0), B('x', 'Integrator', 4, 0, { InitialCondition: '1' }), B('Phase plane', 'XYGraph', 5, 1), scope(1, 5, 0)],
    [['Mux/1', 'Dynamics/1'], ['Dynamics/1', 'v/1'], ['v/1', 'x/1'], ['x/1', 'Mux/1'], ['v/1', 'Mux/2'], ['Force/1', 'Mux/3'], ['x/1', 'Phase plane/1'], ['v/1', 'Phase plane/2'], ['x/1', 'Scope/1']], '60', true),
  M('logistic', 'nonlinear', '#2ec4b6', ['Unit Delay', 'Fcn'], ['로지스틱 사상', 'Logistic map'], ['x(k+1) = 3.7·x(k)·(1 − x(k)) 의 혼돈 수열', 'The chaotic sequence x(k+1) = 3.7·x(k)·(1 − x(k))'],
    [B('x(k)', 'UnitDelay', 0, 0, { InitialCondition: '0.2', SampleTime: '1' }), B('Map', 'Fcn', 1, 0, { Expr: '3.7*u(1)*(1 - u(1))' }), scope(1, 3, 0)],
    [['x(k)/1', 'Map/1'], ['Map/1', 'x(k)/1'], ['x(k)/1', 'Scope/1']], '60', true),
  M('nonlinear_blocks', 'nonlinear', '#e07be0', ['Saturation', 'Dead Zone', 'Backlash'], ['비선형 요소 비교', 'Nonlinear elements'], ['포화·불감대·백래시가 사인파를 어떻게 바꾸는지 봅니다', 'How saturation, dead zone and backlash reshape a sine'],
    [B('Sine', 'SineWave', 0, 1, { Amplitude: '2' }), B('Saturation', 'Saturation', 1, 0, { UpperLimit: '1', LowerLimit: '-1' }), B('Dead zone', 'DeadZone', 1, 1, { LowerValue: '-0.5', UpperValue: '0.5' }), B('Backlash', 'Backlash', 1, 2, { BacklashWidth: '1' }), scope(4, 3, 1)],
    [['Sine/1', 'Saturation/1'], ['Sine/1', 'Dead zone/1'], ['Sine/1', 'Backlash/1'], ['Sine/1', 'Scope/1'], ['Saturation/1', 'Scope/2'], ['Dead zone/1', 'Scope/3'], ['Backlash/1', 'Scope/4']], '10'),
  M('rate_limiter', 'nonlinear', '#4cc9f0', ['Rate Limiter'], ['변화율 제한', 'Rate limiter'], ['사각파의 오르내림을 초당 2로 제한합니다', 'A square wave limited to a slope of 2 per second'],
    [B('Square', 'SignalGenerator', 0, 0, { WaveForm: 'square', Frequency: '1' }), B('Rate limit', 'RateLimiter', 1, 0, { RisingSlewLimit: '2', FallingSlewLimit: '-2' }), scope(2, 3, 0)],
    [['Square/1', 'Rate limit/1'], ['Square/1', 'Scope/1'], ['Rate limit/1', 'Scope/2']], '15'),
  M('lissajous', 'nonlinear', '#e07be0', ['Sine Wave', 'XY Graph'], ['리사주 도형', 'Lissajous figure'], ['주파수 1:2인 두 사인파를 XY 그래프에 그립니다', 'Two sines at 1:2 frequency drawn on an XY graph'],
    [B('X', 'SineWave', 0, 0, { Frequency: '1' }), B('Y', 'SineWave', 0, 1, { Frequency: '2', Phase: 'pi/2' }), B('XY Graph', 'XYGraph', 2, 0)],
    [['X/1', 'XY Graph/1'], ['Y/1', 'XY Graph/2']], '6.3'),

  // ── 논리 · 라우팅 ──
  M('relational', 'logic', '#4cc9f0', ['Relational Operator'], ['비교 연산', 'Relational operator'], ['사인파가 0.5보다 큰 동안 1이 됩니다', 'One while the sine is above 0.5'],
    [B('Sine', 'SineWave', 0, 0), B('Threshold', 'Constant', 0, 1, { Value: '0.5' }), B('Greater', 'RelationalOperator', 1, 0, { Operator: '>' }), scope(2, 3, 0)],
    [['Sine/1', 'Greater/1'], ['Threshold/1', 'Greater/2'], ['Sine/1', 'Scope/1'], ['Greater/1', 'Scope/2']], '10'),
  M('logic_and', 'logic', '#7b61ff', ['Logical Operator', 'Pulse Generator'], ['논리곱 (AND)', 'Logical AND'], ['주기가 다른 두 펄스가 모두 켜진 동안만 1', 'One only while both pulse trains are on'],
    [B('Pulse A', 'PulseGenerator', 0, 0, { Period: '2', PulseWidth: '50', SampleTime: '0' }), B('Pulse B', 'PulseGenerator', 0, 1, { Period: '3', PulseWidth: '50', SampleTime: '0' }), B('AND', 'LogicalOperator', 1, 0, { Operator: 'AND' }), scope(3, 3, 0)],
    [['Pulse A/1', 'AND/1'], ['Pulse B/1', 'AND/2'], ['Pulse A/1', 'Scope/1'], ['Pulse B/1', 'Scope/2'], ['AND/1', 'Scope/3']], '12'),
  M('switch_time', 'logic', '#f5c451', ['Switch', 'Clock'], ['시간에 따라 전환', 'Switching over time'], ['5초 전에는 사인파, 그 뒤로는 사각파를 내보냅니다', 'The sine before 5 s, the square wave after'],
    [B('Square', 'SignalGenerator', 0, 0, { WaveForm: 'square' }), B('Clock', 'Clock', 0, 1), B('Sine', 'SineWave', 0, 2), B('Switch', 'Switch', 1, 1, { Threshold: '5' }), scope(1, 3, 1)],
    [['Square/1', 'Switch/1'], ['Clock/1', 'Switch/2'], ['Sine/1', 'Switch/3'], ['Switch/1', 'Scope/1']], '10'),
  M('multiport', 'logic', '#2ec4b6', ['Multiport Switch', 'Counter Limited'], ['다중 전환', 'Multiport switch'], ['카운터가 1·2·3을 돌며 세 신호 중 하나를 고릅니다', 'A counter cycles 1, 2, 3 and picks one of three signals'],
    [B('Counter', 'CounterLimited', 0, 0, { uplimit: '2', SampleTime: '2' }), B('Plus 1', 'Bias', 1, 0, { Bias: '1' }), B('Sine', 'SineWave', 0, 1), B('Square', 'SignalGenerator', 0, 2, { WaveForm: 'square' }), B('Ramp', 'Ramp', 0, 3, { slope: '0.1' }),
      B('Select', 'MultiportSwitch', 2, 1, { Inputs: '3' }), scope(2, 4, 1)],
    [['Counter/1', 'Plus 1/1'], ['Plus 1/1', 'Select/1'], ['Sine/1', 'Select/2'], ['Square/1', 'Select/3'], ['Ramp/1', 'Select/4'], ['Select/1', 'Scope/1'], ['Plus 1/1', 'Scope/2']], '12'),
  M('edge_detect', 'logic', '#ff6b6b', ['Detect Rise Positive'], ['상승 에지 검출', 'Rising-edge detection'], ['펄스가 켜지는 순간마다 1을 냅니다', 'One at every moment the pulse turns on'],
    [B('Pulse', 'PulseGenerator', 0, 0, { Period: '2', PulseWidth: '50', SampleTime: '0.1' }), B('Rising edge', 'DetectRisePositive', 1, 0), scope(2, 3, 0)],
    [['Pulse/1', 'Rising edge/1'], ['Pulse/1', 'Scope/1'], ['Rising edge/1', 'Scope/2']], '8'),
  M('counter', 'logic', '#8ac926', ['Counter Limited', 'Compare To Constant'], ['카운터와 비교', 'Counter and comparison'], ['0~7을 세고 5 이상인 동안 1이 됩니다', 'Counts 0 to 7; one while the count is 5 or more'],
    [B('Counter', 'CounterLimited', 0, 0, { uplimit: '7', SampleTime: '0.5' }), B('At least 5', 'CompareToConstant', 1, 1, { relop: '>=', const: '5' }), scope(2, 3, 0)],
    [['Counter/1', 'At least 5/1'], ['Counter/1', 'Scope/1'], ['At least 5/1', 'Scope/2']], '10'),

  // ── 수학 연산 ──
  M('polynomial', 'math', '#4cc9f0', ['Polynomial', 'Ramp', 'XY Graph'], ['다항식', 'Polynomial'], ['u³ − 2u 를 u = −2…2 에 대해 그립니다', 'u³ − 2u over u = −2 … 2'],
    [B('u', 'Ramp', 0, 0, { slope: '1', InitialOutput: '-2' }), B('p(u)', 'Polynomial', 1, 0, { coefs: '[1 0 -2 0]' }), B('XY Graph', 'XYGraph', 3, 0)],
    [['u/1', 'p(u)/1'], ['u/1', 'XY Graph/1'], ['p(u)/1', 'XY Graph/2']], '4'),
  M('trig_identity', 'math', '#7b61ff', ['Math Function', 'Sum'], ['삼각 항등식', 'Trigonometric identity'], ['sin²t + cos²t 는 언제나 1', 'sin²t + cos²t is always 1'],
    [B('sin', 'SineWave', 0, 0), B('cos', 'SineWave', 0, 1, { Phase: 'pi/2' }), B('sin^2', 'MathFunction', 1, 0, { Operator: 'square' }), B('cos^2', 'MathFunction', 1, 1, { Operator: 'square' }), B('Sum', 'Sum', 2, 0, { Inputs: '|++' }), scope(3, 3, 0)],
    [['sin/1', 'sin^2/1'], ['cos/1', 'cos^2/1'], ['sin^2/1', 'Sum/1'], ['cos^2/1', 'Sum/2'], ['sin^2/1', 'Scope/1'], ['cos^2/1', 'Scope/2'], ['Sum/1', 'Scope/3']], '7'),
  M('exp_decay', 'math', '#f5c451', ['Clock', 'Math Function'], ['지수 감쇠', 'Exponential decay'], ['e^(−0.5t)와 감쇠 진동 e^(−0.5t)·sin 2t', 'e^(−0.5t) and the damped wave e^(−0.5t)·sin 2t'],
    [B('Clock', 'Clock', 0, 0), B('-0.5', 'Gain', 1, 0, { Gain: '-0.5' }), B('exp', 'MathFunction', 2, 0, { Operator: 'exp' }), B('sin 2t', 'SineWave', 2, 1, { Frequency: '2' }), B('Product', 'Product', 3, 1, { Inputs: '2' }), scope(2, 4, 0)],
    [['Clock/1', '-0.5/1'], ['-0.5/1', 'exp/1'], ['exp/1', 'Product/1'], ['sin 2t/1', 'Product/2'], ['exp/1', 'Scope/1'], ['Product/1', 'Scope/2']], '10'),
  M('minmax', 'math', '#2ec4b6', ['MinMax'], ['최댓값 고르기', 'Picking the maximum'], ['위상이 다른 세 사인파 중 매 순간의 최댓값', 'The largest of three phase-shifted sines at each instant'],
    [B('Phase 0', 'SineWave', 0, 0), B('Phase 120', 'SineWave', 0, 1, { Phase: '2*pi/3' }), B('Phase 240', 'SineWave', 0, 2, { Phase: '4*pi/3' }), B('Max', 'MinMax', 1, 1, { Function: 'max', Inputs: '3' }), scope(4, 3, 1)],
    [['Phase 0/1', 'Max/1'], ['Phase 120/1', 'Max/2'], ['Phase 240/1', 'Max/3'], ['Phase 0/1', 'Scope/1'], ['Phase 120/1', 'Scope/2'], ['Phase 240/1', 'Scope/3'], ['Max/1', 'Scope/4']], '7'),
  M('rounding', 'math', '#ff6b6b', ['Rounding Function'], ['내림 · 반올림 · 올림', 'Floor, round and ceil'], ['램프를 정수로 내림·반올림·올림합니다', 'A ramp rounded down, to nearest and up'],
    [B('Ramp', 'Ramp', 0, 1, { slope: '0.5' }), B('floor', 'Rounding', 1, 0, { Operator: 'floor' }), B('round', 'Rounding', 1, 1, { Operator: 'round' }), B('ceil', 'Rounding', 1, 2, { Operator: 'ceil' }), scope(4, 3, 1)],
    [['Ramp/1', 'floor/1'], ['Ramp/1', 'round/1'], ['Ramp/1', 'ceil/1'], ['Ramp/1', 'Scope/1'], ['floor/1', 'Scope/2'], ['round/1', 'Scope/3'], ['ceil/1', 'Scope/4']], '6'),
  M('abs_sign', 'math', '#8ac926', ['Abs', 'Sign', 'Sqrt'], ['절댓값 · 부호 · 제곱근', 'Abs, sign and square root'], ['사인파의 |u|, sign(u), √|u|', '|u|, sign(u) and √|u| of a sine'],
    [B('Sine', 'SineWave', 0, 1), B('Abs', 'Abs', 1, 0), B('Sign', 'Sign', 1, 2), B('Sqrt', 'Sqrt', 2, 0), scope(4, 3, 1)],
    [['Sine/1', 'Abs/1'], ['Sine/1', 'Sign/1'], ['Abs/1', 'Sqrt/1'], ['Sine/1', 'Scope/1'], ['Abs/1', 'Scope/2'], ['Sign/1', 'Scope/3'], ['Sqrt/1', 'Scope/4']], '7'),
];
