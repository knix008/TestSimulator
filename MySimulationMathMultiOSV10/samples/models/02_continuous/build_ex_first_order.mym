% 1차 시스템 계단 응답 / First-order step response
% 계단 입력을 1/(0.5s+1)에 넣고 입력과 출력을 함께 봅니다
% A step into 1/(0.5s+1), input and output on one scope
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_first_order": built from M code, then opened in the model editor.
mdl = 'ex_first_order';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Step'], 'Time', '1', 'Position', [40 50 80 90]);
    add_block('TransferFcn', [mdl '/Plant'], 'Numerator', '[1]', 'Denominator', '[0.5 1]', 'Position', [180 50 280 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Step/1', 'Plant/1');
    add_line(mdl, 'Step/1', 'Scope/1');
    add_line(mdl, 'Plant/1', 'Scope/2');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
