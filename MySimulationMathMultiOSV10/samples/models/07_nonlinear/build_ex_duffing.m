% 더핑 진동자 / Duffing oscillator
% x'' + 0.2x' − x + x³ = 0.3·cos(1.2t): 주기 외력이 만드는 혼돈
% x'' + 0.2x' − x + x³ = 0.3·cos(1.2t): chaos from a periodic force
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_duffing": built from M code, then opened in the model editor.
mdl = 'ex_duffing';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Force'], 'Amplitude', '0.3', 'Frequency', '1.2', 'Phase', 'pi/2', 'Position', [40 240 80 280]);
    add_block('Mux', [mdl '/Mux'], 'Inputs', '3', 'Position', [180 50 190 125]);
    add_block('Fcn', [mdl '/Dynamics'], 'Expr', 'u(3) - 0.2*u(2) + u(1) - u(1)^3', 'Position', [320 50 420 96]);
    add_block('Integrator', [mdl '/v'], 'Position', [460 50 500 90]);
    add_block('Integrator', [mdl '/x'], 'InitialCondition', '1', 'Position', [600 50 640 90]);
    add_block('XYGraph', [mdl '/Phase plane'], 'Position', [740 145 780 207]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [740 50 780 90]);
    add_line(mdl, 'Mux/1', 'Dynamics/1');
    add_line(mdl, 'Dynamics/1', 'v/1');
    add_line(mdl, 'v/1', 'x/1');
    add_line(mdl, 'x/1', 'Mux/1');
    add_line(mdl, 'v/1', 'Mux/2');
    add_line(mdl, 'Force/1', 'Mux/3');
    add_line(mdl, 'x/1', 'Phase plane/1');
    add_line(mdl, 'v/1', 'Phase plane/2');
    add_line(mdl, 'x/1', 'Scope/1');
    set_param(mdl, 'StopTime', '60');
    open_system(mdl);
end
