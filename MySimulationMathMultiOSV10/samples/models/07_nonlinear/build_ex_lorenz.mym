% 로렌츠 끌개 / Lorenz attractor
% σ=10, ρ=28, β=8/3 의 혼돈 궤적 (나비 모양)
% The chaotic orbit for σ=10, ρ=28, β=8/3 (the butterfly)
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_lorenz": built from M code, then opened in the model editor.
mdl = 'ex_lorenz';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Mux', [mdl '/Mux'], 'Inputs', '3', 'Position', [40 145 50 220]);
    add_block('Fcn', [mdl '/dx'], 'Expr', '10*(u(2) - u(1))', 'Position', [180 50 280 96]);
    add_block('Fcn', [mdl '/dy'], 'Expr', 'u(1)*(28 - u(3)) - u(2)', 'Position', [180 145 280 191]);
    add_block('Fcn', [mdl '/dz'], 'Expr', 'u(1)*u(2) - 8/3*u(3)', 'Position', [180 240 280 286]);
    add_block('Integrator', [mdl '/x'], 'InitialCondition', '1', 'Position', [460 50 500 90]);
    add_block('Integrator', [mdl '/y'], 'InitialCondition', '1', 'Position', [460 145 500 185]);
    add_block('Integrator', [mdl '/z'], 'InitialCondition', '1', 'Position', [460 240 500 280]);
    add_block('XYGraph', [mdl '/x-z'], 'Position', [740 145 780 207]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [740 50 780 90]);
    add_line(mdl, 'Mux/1', 'dx/1');
    add_line(mdl, 'Mux/1', 'dy/1');
    add_line(mdl, 'Mux/1', 'dz/1');
    add_line(mdl, 'dx/1', 'x/1');
    add_line(mdl, 'dy/1', 'y/1');
    add_line(mdl, 'dz/1', 'z/1');
    add_line(mdl, 'x/1', 'Mux/1');
    add_line(mdl, 'y/1', 'Mux/2');
    add_line(mdl, 'z/1', 'Mux/3');
    add_line(mdl, 'x/1', 'x-z/1');
    add_line(mdl, 'z/1', 'x-z/2');
    add_line(mdl, 'x/1', 'Scope/1');
    set_param(mdl, 'StopTime', '25');
    open_system(mdl);
end
