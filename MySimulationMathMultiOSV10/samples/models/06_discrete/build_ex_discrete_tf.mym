% 이산 전달 함수 / Discrete transfer function
% 0.1/(z−0.9)의 계단 응답 (샘플 0.1초)
% Step response of 0.1/(z−0.9), sample time 0.1 s
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_discrete_tf": built from M code, then opened in the model editor.
mdl = 'ex_discrete_tf';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Step'], 'Time', '0', 'Position', [40 50 80 90]);
    add_block('DiscreteTransferFcn', [mdl '/Plant'], 'Numerator', '[0.1]', 'Denominator', '[1 -0.9]', 'SampleTime', '0.1', 'Position', [180 50 280 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Step/1', 'Plant/1');
    add_line(mdl, 'Step/1', 'Scope/1');
    add_line(mdl, 'Plant/1', 'Scope/2');
    set_param(mdl, 'StopTime', '5');
    open_system(mdl);
end
