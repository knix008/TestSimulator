% RLC 회로 / RLC circuit
% L = 1 H, C = 0.25 F, R = 0.6 Ω 직렬 회로의 축전기 전압
% Capacitor voltage of a series circuit, L = 1 H, C = 0.25 F, R = 0.6 Ω
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_rlc": built from M code, then opened in the model editor.
mdl = 'ex_rlc';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Vin'], 'Time', '0', 'Position', [40 50 80 90]);
    add_block('TransferFcn', [mdl '/Circuit'], 'Numerator', '[1]', 'Denominator', '[0.25 0.15 1]', 'Position', [180 50 280 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Vin/1', 'Circuit/1');
    add_line(mdl, 'Vin/1', 'Scope/1');
    add_line(mdl, 'Circuit/1', 'Scope/2');
    set_param(mdl, 'StopTime', '15');
    open_system(mdl);
end
