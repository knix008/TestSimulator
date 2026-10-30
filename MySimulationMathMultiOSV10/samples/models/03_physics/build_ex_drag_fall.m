% 공기 저항이 있는 낙하 / Falling with air drag
% v' = g − k·v² 로 종단 속도 √(g/k)에 다가갑니다
% v' = g − k·v² approaches the terminal speed √(g/k)
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_drag_fall": built from M code, then opened in the model editor.
mdl = 'ex_drag_fall';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Fcn', [mdl '/Dynamics'], 'Expr', '9.81 - 0.1*u(1)^2', 'Position', [40 50 140 96]);
    add_block('Integrator', [mdl '/Speed'], 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/Distance'], 'Position', [460 145 500 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Dynamics/1', 'Speed/1');
    add_line(mdl, 'Speed/1', 'Dynamics/1');
    add_line(mdl, 'Speed/1', 'Distance/1');
    add_line(mdl, 'Speed/1', 'Scope/1');
    add_line(mdl, 'Distance/1', 'Scope/2');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
