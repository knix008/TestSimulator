% 2차 시스템과 감쇠비 / Second order and damping
% 감쇠비 0.1 / 0.5 / 1의 계단 응답 비교
% Step responses for damping 0.1, 0.5 and 1
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_second_order": built from M code, then opened in the model editor.
mdl = 'ex_second_order';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Step'], 'Time', '0', 'Position', [40 145 80 185]);
    add_block('TransferFcn', [mdl '/zeta 0.1'], 'Numerator', '[4]', 'Denominator', '[1 0.4 4]', 'Position', [180 50 280 96]);
    add_block('TransferFcn', [mdl '/zeta 0.5'], 'Numerator', '[4]', 'Denominator', '[1 2 4]', 'Position', [180 145 280 191]);
    add_block('TransferFcn', [mdl '/zeta 1'], 'Numerator', '[4]', 'Denominator', '[1 4 4]', 'Position', [180 240 280 286]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [460 145 500 229]);
    add_line(mdl, 'Step/1', 'zeta 0.1/1');
    add_line(mdl, 'Step/1', 'zeta 0.5/1');
    add_line(mdl, 'Step/1', 'zeta 1/1');
    add_line(mdl, 'zeta 0.1/1', 'Scope/1');
    add_line(mdl, 'zeta 0.5/1', 'Scope/2');
    add_line(mdl, 'zeta 1/1', 'Scope/3');
    set_param(mdl, 'StopTime', '8');
    open_system(mdl);
end
