% 반 데르 폴 진동자 / Van der Pol oscillator
% x'' = μ(1−x²)x' − x (μ=1)의 시간 응답과 위상 평면 궤적
% x'' = μ(1−x²)x' − x (μ=1): time response and phase-plane orbit
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_vanderpol": built from M code, then opened in the model editor.
mdl = 'ex_vanderpol';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Mux', [mdl '/Mux'], 'Inputs', '2', 'Position', [40 50 50 100]);
    add_block('Fcn', [mdl '/Dynamics'], 'Expr', '(1 - u(1)^2)*u(2) - u(1)', 'Position', [180 50 280 96]);
    add_block('Integrator', [mdl '/dx'], 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/x'], 'InitialCondition', '2', 'Position', [460 50 500 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [600 50 640 90]);
    add_block('XYGraph', [mdl '/Phase plane'], 'Position', [600 145 640 207]);
    add_line(mdl, 'Mux/1', 'Dynamics/1');
    add_line(mdl, 'Dynamics/1', 'dx/1');
    add_line(mdl, 'dx/1', 'x/1');
    add_line(mdl, 'x/1', 'Mux/1');
    add_line(mdl, 'dx/1', 'Mux/2');
    add_line(mdl, 'x/1', 'Scope/1');
    add_line(mdl, 'x/1', 'Phase plane/1');
    add_line(mdl, 'dx/1', 'Phase plane/2');
    set_param(mdl, 'StopTime', '20');
    open_system(mdl);
end
