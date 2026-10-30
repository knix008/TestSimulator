% 로지스틱 사상 / Logistic map
% x(k+1) = 3.7·x(k)·(1 − x(k)) 의 혼돈 수열
% The chaotic sequence x(k+1) = 3.7·x(k)·(1 − x(k))
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_logistic": built from M code, then opened in the model editor.
mdl = 'ex_logistic';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('UnitDelay', [mdl '/x(k)'], 'InitialCondition', '0.2', 'SampleTime', '1', 'Position', [40 50 80 90]);
    add_block('Fcn', [mdl '/Map'], 'Expr', '3.7*u(1)*(1 - u(1))', 'Position', [180 50 280 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [460 50 500 90]);
    add_line(mdl, 'x(k)/1', 'Map/1');
    add_line(mdl, 'Map/1', 'x(k)/1');
    add_line(mdl, 'x(k)/1', 'Scope/1');
    set_param(mdl, 'StopTime', '60');
    open_system(mdl);
end
