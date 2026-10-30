% 구동기 포화 / Actuator saturation
% 제어 입력을 ±1로 제한하면 응답이 느려집니다
% Limiting the control input to ±1 slows the response
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_saturation_control": built from M code, then opened in the model editor.
mdl = 'ex_saturation_control';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Set point'], 'Time', '0', 'After', '2', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('Gain', [mdl '/K'], 'Gain', '10', 'Position', [320 50 360 90]);
    add_block('Saturation', [mdl '/Limit'], 'UpperLimit', '1', 'LowerLimit', '-1', 'Position', [460 50 500 90]);
    add_block('TransferFcn', [mdl '/Plant'], 'Numerator', '[1]', 'Denominator', '[1 1]', 'Position', [600 50 700 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [880 50 920 112]);
    add_line(mdl, 'Set point/1', 'Error/1');
    add_line(mdl, 'Error/1', 'K/1');
    add_line(mdl, 'K/1', 'Limit/1');
    add_line(mdl, 'Limit/1', 'Plant/1');
    add_line(mdl, 'Plant/1', 'Error/2');
    add_line(mdl, 'Plant/1', 'Scope/1');
    add_line(mdl, 'Limit/1', 'Scope/2');
    set_param(mdl, 'StopTime', '8');
    open_system(mdl);
end
