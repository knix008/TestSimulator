% 질량-스프링-댐퍼 / Mass-spring-damper
% m·x'' + c·x' + k·x = F 를 적분기 두 개로 풉니다 (m=1, c=0.5, k=4)
% m·x'' + c·x' + k·x = F with two integrators (m=1, c=0.5, k=4)
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_mass_spring": built from M code, then opened in the model editor.
mdl = 'ex_mass_spring';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Force'], 'Time', '0', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Sum'], 'Inputs', '|+--', 'Position', [180 50 220 90]);
    add_block('Gain', [mdl '/1 over m'], 'Gain', '1', 'Position', [320 50 360 90]);
    add_block('Integrator', [mdl '/Velocity'], 'Position', [460 50 500 90]);
    add_block('Integrator', [mdl '/Position'], 'Position', [600 50 640 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [740 50 780 112]);
    add_block('Gain', [mdl '/Damping c'], 'Gain', '0.5', 'Orientation', 'left', 'Position', [460 145 500 185]);
    add_block('Gain', [mdl '/Spring k'], 'Gain', '4', 'Orientation', 'left', 'Position', [600 240 640 280]);
    add_line(mdl, 'Force/1', 'Sum/1');
    add_line(mdl, 'Sum/1', '1 over m/1');
    add_line(mdl, '1 over m/1', 'Velocity/1');
    add_line(mdl, 'Velocity/1', 'Position/1');
    add_line(mdl, 'Position/1', 'Scope/1');
    add_line(mdl, 'Velocity/1', 'Scope/2');
    add_line(mdl, 'Velocity/1', 'Damping c/1');
    add_line(mdl, 'Position/1', 'Spring k/1');
    add_line(mdl, 'Damping c/1', 'Sum/2');
    add_line(mdl, 'Spring k/1', 'Sum/3');
    set_param(mdl, 'StopTime', '15');
    open_system(mdl);
end
