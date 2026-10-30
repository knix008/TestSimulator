% 시간 지연 / Transport delay
% 신호를 1.5초 늦추고 원래 신호와 비교합니다
% A signal delayed by 1.5 s next to the original
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_transport_delay": built from M code, then opened in the model editor.
mdl = 'ex_transport_delay';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('TransportDelay', [mdl '/Delay'], 'DelayTime', '1.5', 'Position', [180 145 280 191]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Sine/1', 'Delay/1');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Delay/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
