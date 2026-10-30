% 개루프와 폐루프 / Open loop vs closed loop
% 같은 플랜트를 피드백 없이·있이 움직여 비교합니다
% The same plant driven without and with feedback
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_open_closed": built from M code, then opened in the model editor.
mdl = 'ex_open_closed';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Step'], 'Time', '0', 'Position', [40 50 80 90]);
    add_block('TransferFcn', [mdl '/Open loop'], 'Numerator', '[1]', 'Denominator', '[1 1]', 'Position', [320 50 420 96]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 145 220 185]);
    add_block('Gain', [mdl '/K'], 'Gain', '5', 'Position', [320 145 360 185]);
    add_block('TransferFcn', [mdl '/Closed loop'], 'Numerator', '[1]', 'Denominator', '[1 1]', 'Position', [460 145 560 191]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [740 50 780 134]);
    add_line(mdl, 'Step/1', 'Open loop/1');
    add_line(mdl, 'Step/1', 'Error/1');
    add_line(mdl, 'Error/1', 'K/1');
    add_line(mdl, 'K/1', 'Closed loop/1');
    add_line(mdl, 'Closed loop/1', 'Error/2');
    add_line(mdl, 'Step/1', 'Scope/1');
    add_line(mdl, 'Open loop/1', 'Scope/2');
    add_line(mdl, 'Closed loop/1', 'Scope/3');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
