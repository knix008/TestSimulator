% 적분과 미분 / Integral and derivative
% sin t 의 적분 (1−cos t)과 미분 (cos t)
% The integral (1−cos t) and derivative (cos t) of sin t
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_integrate_sine": built from M code, then opened in the model editor.
mdl = 'ex_integrate_sine';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 145 80 185]);
    add_block('Integrator', [mdl '/Integrator'], 'Position', [180 50 220 90]);
    add_block('Derivative', [mdl '/Derivative'], 'Position', [180 240 220 280]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [460 145 500 229]);
    add_line(mdl, 'Sine/1', 'Integrator/1');
    add_line(mdl, 'Sine/1', 'Derivative/1');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Integrator/1', 'Scope/2');
    add_line(mdl, 'Derivative/1', 'Scope/3');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
