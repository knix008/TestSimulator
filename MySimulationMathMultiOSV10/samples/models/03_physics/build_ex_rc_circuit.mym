% RC 회로 충전 / RC circuit charging
% RC·v' = Vin − v (R = 1 kΩ, C = 1 mF, Vin = 5 V)
% RC·v' = Vin − v (R = 1 kΩ, C = 1 mF, Vin = 5 V)
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_rc_circuit": built from M code, then opened in the model editor.
mdl = 'ex_rc_circuit';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Vin'], 'Time', '0.5', 'After', '5', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Sum'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('Gain', [mdl '/1 over RC'], 'Gain', '1', 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/Vc'], 'Position', [460 50 500 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Vin/1', 'Sum/1');
    add_line(mdl, 'Sum/1', '1 over RC/1');
    add_line(mdl, '1 over RC/1', 'Vc/1');
    add_line(mdl, 'Vc/1', 'Sum/2');
    add_line(mdl, 'Vin/1', 'Scope/1');
    add_line(mdl, 'Vc/1', 'Scope/2');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
