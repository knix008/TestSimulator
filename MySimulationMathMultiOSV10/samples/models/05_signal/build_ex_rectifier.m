% 정류와 평활 / Rectifying and smoothing
% 전파 정류(|sin|) 후 저역 필터로 직류에 가깝게 만듭니다
% Full-wave rectify (|sin|), then low-pass it towards DC
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_rectifier": built from M code, then opened in the model editor.
mdl = 'ex_rectifier';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/AC'], 'Frequency', '6', 'Position', [40 50 80 90]);
    add_block('Abs', [mdl '/Rectifier'], 'Position', [180 50 220 90]);
    add_block('TransferFcn', [mdl '/Smoothing'], 'Numerator', '[1]', 'Denominator', '[0.5 1]', 'Position', [320 50 420 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [600 50 640 134]);
    add_line(mdl, 'AC/1', 'Rectifier/1');
    add_line(mdl, 'Rectifier/1', 'Smoothing/1');
    add_line(mdl, 'AC/1', 'Scope/1');
    add_line(mdl, 'Rectifier/1', 'Scope/2');
    add_line(mdl, 'Smoothing/1', 'Scope/3');
    set_param(mdl, 'StopTime', '5');
    open_system(mdl);
end
