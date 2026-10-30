% 잡음 거르기 (저역 통과 필터) / Removing noise (low-pass filter)
% 잡음이 섞인 사인파를 1/(0.1s+1)로 거르고 전후를 비교합니다
% A noisy sine through 1/(0.1s+1), before and after
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_filter": built from M code, then opened in the model editor.
mdl = 'ex_filter';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Signal'], 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('RandomNumber', [mdl '/Noise'], 'Variance', '0.04', 'SampleTime', '0.01', 'Position', [40 145 80 185]);
    add_block('Sum', [mdl '/Add'], 'Inputs', '|++', 'Position', [180 50 220 90]);
    add_block('TransferFcn', [mdl '/Low-pass'], 'Numerator', '[1]', 'Denominator', '[0.1 1]', 'Position', [320 50 420 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Signal/1', 'Add/1');
    add_line(mdl, 'Noise/1', 'Add/2');
    add_line(mdl, 'Add/1', 'Low-pass/1');
    add_line(mdl, 'Add/1', 'Scope/1');
    add_line(mdl, 'Low-pass/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
