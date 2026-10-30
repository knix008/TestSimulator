% 진자 / Pendulum
% θ'' = −(g/L)·sin θ − b·θ' (g/L = 9.81, b = 0.2), 처음 각도 1 rad
% θ'' = −(g/L)·sin θ − b·θ' (g/L = 9.81, b = 0.2), starting at 1 rad
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_pendulum": built from M code, then opened in the model editor.
mdl = 'ex_pendulum';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Mux', [mdl '/Mux'], 'Inputs', '2', 'Position', [40 50 50 100]);
    add_block('Fcn', [mdl '/Dynamics'], 'Expr', '-9.81*sin(u(1)) - 0.2*u(2)', 'Position', [180 50 280 96]);
    add_block('Integrator', [mdl '/omega'], 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/theta'], 'InitialCondition', '1', 'Position', [460 50 500 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_block('XYGraph', [mdl '/Phase plane'], 'Position', [600 240 640 302]);
    add_line(mdl, 'Mux/1', 'Dynamics/1');
    add_line(mdl, 'Dynamics/1', 'omega/1');
    add_line(mdl, 'omega/1', 'theta/1');
    add_line(mdl, 'theta/1', 'Mux/1');
    add_line(mdl, 'omega/1', 'Mux/2');
    add_line(mdl, 'theta/1', 'Scope/1');
    add_line(mdl, 'omega/1', 'Scope/2');
    add_line(mdl, 'theta/1', 'Phase plane/1');
    add_line(mdl, 'omega/1', 'Phase plane/2');
    set_param(mdl, 'StopTime', '15');
    open_system(mdl);
end
