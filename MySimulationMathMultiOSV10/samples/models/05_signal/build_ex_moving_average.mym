% 이동 평균 (FIR) / Moving average (FIR)
% 최근 8개 샘플의 평균으로 잡음을 줄입니다
% Averaging the last 8 samples smooths the noise
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_moving_average": built from M code, then opened in the model editor.
mdl = 'ex_moving_average';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Signal'], 'Frequency', '0.5', 'Position', [40 50 80 90]);
    add_block('RandomNumber', [mdl '/Noise'], 'Variance', '0.05', 'SampleTime', '0.05', 'Position', [40 145 80 185]);
    add_block('Sum', [mdl '/Add'], 'Inputs', '|++', 'Position', [180 50 220 90]);
    add_block('DiscreteFilter', [mdl '/Average 8'], 'Numerator', 'ones(1, 8)/8', 'Denominator', '1', 'SampleTime', '0.05', 'Position', [320 50 420 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Signal/1', 'Add/1');
    add_line(mdl, 'Noise/1', 'Add/2');
    add_line(mdl, 'Add/1', 'Average 8/1');
    add_line(mdl, 'Add/1', 'Scope/1');
    add_line(mdl, 'Average 8/1', 'Scope/2');
    set_param(mdl, 'StopTime', '15');
    open_system(mdl);
end
