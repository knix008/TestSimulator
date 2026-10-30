% 포식자-피식자 (로트카-볼테라) / Predator-prey (Lotka-Volterra)
% 토끼와 여우 개체 수가 주기적으로 오르내립니다
% Rabbit and fox populations rise and fall in cycles
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_predator_prey": built from M code, then opened in the model editor.
mdl = 'ex_predator_prey';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Mux', [mdl '/Mux'], 'Inputs', '2', 'Position', [40 50 50 100]);
    add_block('Fcn', [mdl '/Prey rate'], 'Expr', 'u(1) - 0.1*u(1)*u(2)', 'Position', [180 50 280 96]);
    add_block('Fcn', [mdl '/Predator rate'], 'Expr', '-1.5*u(2) + 0.075*u(1)*u(2)', 'Position', [180 145 280 191]);
    add_block('Integrator', [mdl '/Prey'], 'InitialCondition', '10', 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/Predator'], 'InitialCondition', '5', 'Position', [320 145 360 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_block('XYGraph', [mdl '/Phase'], 'Position', [600 240 640 302]);
    add_line(mdl, 'Mux/1', 'Prey rate/1');
    add_line(mdl, 'Mux/1', 'Predator rate/1');
    add_line(mdl, 'Prey rate/1', 'Prey/1');
    add_line(mdl, 'Predator rate/1', 'Predator/1');
    add_line(mdl, 'Prey/1', 'Mux/1');
    add_line(mdl, 'Predator/1', 'Mux/2');
    add_line(mdl, 'Prey/1', 'Scope/1');
    add_line(mdl, 'Predator/1', 'Scope/2');
    add_line(mdl, 'Prey/1', 'Phase/1');
    add_line(mdl, 'Predator/1', 'Phase/2');
    set_param(mdl, 'StopTime', '20');
    open_system(mdl);
end
