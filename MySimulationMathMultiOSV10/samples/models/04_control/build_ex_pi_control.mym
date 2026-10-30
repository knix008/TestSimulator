% PI 피드백 제어 / PI feedback control
% 오차의 비례·적분으로 2차 플랜트 1/(s²+3s+2)를 목표값에 맞춥니다
% Proportional + integral of the error drive the plant 1/(s²+3s+2) to the set point
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_pi_control": built from M code, then opened in the model editor.
mdl = 'ex_pi_control';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Set point'], 'Time', '1', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('Gain', [mdl '/Kp'], 'Gain', '4', 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/Integral'], 'Position', [320 145 360 185]);
    add_block('Gain', [mdl '/Ki'], 'Gain', '3', 'Position', [460 145 500 185]);
    add_block('Sum', [mdl '/Control'], 'Inputs', '|++', 'Position', [600 50 640 90]);
    add_block('TransferFcn', [mdl '/Plant'], 'Numerator', '[1]', 'Denominator', '[1 3 2]', 'Position', [740 50 840 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [1020 50 1060 112]);
    add_line(mdl, 'Set point/1', 'Error/1');
    add_line(mdl, 'Error/1', 'Kp/1');
    add_line(mdl, 'Error/1', 'Integral/1');
    add_line(mdl, 'Integral/1', 'Ki/1');
    add_line(mdl, 'Kp/1', 'Control/1');
    add_line(mdl, 'Ki/1', 'Control/2');
    add_line(mdl, 'Control/1', 'Plant/1');
    add_line(mdl, 'Plant/1', 'Error/2');
    add_line(mdl, 'Set point/1', 'Scope/1');
    add_line(mdl, 'Plant/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
