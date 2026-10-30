% 차분 / Difference
% 샘플 사이의 변화량 u(k) − u(k−1)
% The change between samples, u(k) − u(k−1)
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_difference": built from M code, then opened in the model editor.
mdl = 'ex_difference';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 50 80 90]);
    add_block('ZeroOrderHold', [mdl '/Hold'], 'SampleTime', '0.2', 'Position', [180 50 220 90]);
    add_block('Difference', [mdl '/Difference'], 'Position', [320 50 360 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Sine/1', 'Hold/1');
    add_line(mdl, 'Hold/1', 'Difference/1');
    add_line(mdl, 'Hold/1', 'Scope/1');
    add_line(mdl, 'Difference/1', 'Scope/2');
    set_param(mdl, 'StopTime', '8');
    open_system(mdl);
end
