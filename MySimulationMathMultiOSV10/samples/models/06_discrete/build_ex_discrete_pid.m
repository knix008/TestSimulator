% 디지털 PID 제어 / Digital PID control
% 샘플 0.1초인 PID로 이산 플랜트를 제어합니다
% A PID sampled at 0.1 s controls a discrete plant
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_discrete_pid": built from M code, then opened in the model editor.
mdl = 'ex_discrete_pid';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Set point'], 'Time', '0.5', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('DiscretePIDController', [mdl '/PID'], 'P', '1.5', 'I', '1', 'D', '0', 'SampleTime', '0.1', 'Position', [320 50 420 96]);
    add_block('DiscreteTransferFcn', [mdl '/Plant'], 'Numerator', '[0.1]', 'Denominator', '[1 -0.9]', 'SampleTime', '0.1', 'Position', [460 50 560 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [740 50 780 112]);
    add_line(mdl, 'Set point/1', 'Error/1');
    add_line(mdl, 'Error/1', 'PID/1');
    add_line(mdl, 'PID/1', 'Plant/1');
    add_line(mdl, 'Plant/1', 'Error/2');
    add_line(mdl, 'Set point/1', 'Scope/1');
    add_line(mdl, 'Plant/1', 'Scope/2');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
