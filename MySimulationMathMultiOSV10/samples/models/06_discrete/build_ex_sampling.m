% 샘플링과 단위 지연 / Sampling and unit delay
% 연속 사인파를 0.25초마다 붙잡고 한 샘플 늦춘 신호를 비교합니다
% A sine held every 0.25 s, and the same samples one step later
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_sampling": built from M code, then opened in the model editor.
mdl = 'ex_sampling';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('ZeroOrderHold', [mdl '/Hold'], 'SampleTime', '0.25', 'Position', [180 50 220 90]);
    add_block('UnitDelay', [mdl '/Delay'], 'SampleTime', '0.25', 'Position', [320 50 360 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [460 50 500 134]);
    add_line(mdl, 'Sine/1', 'Hold/1');
    add_line(mdl, 'Hold/1', 'Delay/1');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Hold/1', 'Scope/2');
    add_line(mdl, 'Delay/1', 'Scope/3');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
