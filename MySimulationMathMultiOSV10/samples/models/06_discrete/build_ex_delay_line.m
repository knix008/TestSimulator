% 지연선 / Delay line
% 샘플 5개만큼 늦춘 신호
% The signal delayed by five samples
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_delay_line": built from M code, then opened in the model editor.
mdl = 'ex_delay_line';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 50 80 90]);
    add_block('ZeroOrderHold', [mdl '/Hold'], 'SampleTime', '0.1', 'Position', [180 50 220 90]);
    add_block('Delay', [mdl '/Delay 5'], 'DelayLength', '5', 'Position', [320 50 360 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Sine/1', 'Hold/1');
    add_line(mdl, 'Hold/1', 'Delay 5/1');
    add_line(mdl, 'Hold/1', 'Scope/1');
    add_line(mdl, 'Delay 5/1', 'Scope/2');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
