% 펄스 열 / Pulse train
% 주기 2초, 폭 50 %인 펄스와 그 적분
% A 2 s, 50 % pulse train and its integral
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_pulse": built from M code, then opened in the model editor.
mdl = 'ex_pulse';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('PulseGenerator', [mdl '/Pulse'], 'Period', '2', 'PulseWidth', '50', 'SampleTime', '0', 'Position', [40 50 80 90]);
    add_block('Integrator', [mdl '/Integrator'], 'Position', [180 145 220 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [320 50 360 112]);
    add_line(mdl, 'Pulse/1', 'Scope/1');
    add_line(mdl, 'Pulse/1', 'Integrator/1');
    add_line(mdl, 'Integrator/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
