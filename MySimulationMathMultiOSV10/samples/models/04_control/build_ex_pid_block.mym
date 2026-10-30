% PID 제어기 블록 / PID controller block
% PID 블록 하나로 플랜트 1/(s²+2s+1)를 제어합니다
% One PID block controls the plant 1/(s²+2s+1)
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_pid_block": built from M code, then opened in the model editor.
mdl = 'ex_pid_block';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Set point'], 'Time', '1', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('PIDController', [mdl '/PID'], 'P', '3', 'I', '2', 'D', '0.5', 'Position', [320 50 420 96]);
    add_block('TransferFcn', [mdl '/Plant'], 'Numerator', '[1]', 'Denominator', '[1 2 1]', 'Position', [460 50 560 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [740 50 780 112]);
    add_line(mdl, 'Set point/1', 'Error/1');
    add_line(mdl, 'Error/1', 'PID/1');
    add_line(mdl, 'PID/1', 'Plant/1');
    add_line(mdl, 'Plant/1', 'Error/2');
    add_line(mdl, 'Set point/1', 'Scope/1');
    add_line(mdl, 'Plant/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
