% 지연이 있는 공정 제어 / Control with dead time
% 0.5초 지연이 있는 공정을 PI 제어합니다
% PI control of a process with 0.5 s dead time
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_delay_control": built from M code, then opened in the model editor.
mdl = 'ex_delay_control';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Set point'], 'Time', '1', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('PIDController', [mdl '/PI'], 'Controller', 'PI', 'P', '0.8', 'I', '0.4', 'Position', [320 50 420 96]);
    add_block('TransportDelay', [mdl '/Dead time'], 'DelayTime', '0.5', 'Position', [460 50 560 96]);
    add_block('TransferFcn', [mdl '/Process'], 'Numerator', '[1]', 'Denominator', '[2 1]', 'Position', [600 50 700 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [880 50 920 112]);
    add_line(mdl, 'Set point/1', 'Error/1');
    add_line(mdl, 'Error/1', 'PI/1');
    add_line(mdl, 'PI/1', 'Dead time/1');
    add_line(mdl, 'Dead time/1', 'Process/1');
    add_line(mdl, 'Process/1', 'Error/2');
    add_line(mdl, 'Set point/1', 'Scope/1');
    add_line(mdl, 'Process/1', 'Scope/2');
    set_param(mdl, 'StopTime', '20');
    open_system(mdl);
end
