% 상승 에지 검출 / Rising-edge detection
% 펄스가 켜지는 순간마다 1을 냅니다
% One at every moment the pulse turns on
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_edge_detect": built from M code, then opened in the model editor.
mdl = 'ex_edge_detect';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('PulseGenerator', [mdl '/Pulse'], 'Period', '2', 'PulseWidth', '50', 'SampleTime', '0.1', 'Position', [40 50 80 90]);
    add_block('DetectRisePositive', [mdl '/Rising edge'], 'Position', [180 50 220 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Pulse/1', 'Rising edge/1');
    add_line(mdl, 'Pulse/1', 'Scope/1');
    add_line(mdl, 'Rising edge/1', 'Scope/2');
    set_param(mdl, 'StopTime', '8');
    open_system(mdl);
end
