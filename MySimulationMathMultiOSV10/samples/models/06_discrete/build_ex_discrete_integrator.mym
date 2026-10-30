% 이산 적분기 / Discrete-time integrator
% 연속 적분과 0.5초 전진 오일러 적분을 비교합니다
% Continuous integration next to forward Euler with a 0.5 s step
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_discrete_integrator": built from M code, then opened in the model editor.
mdl = 'ex_discrete_integrator';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 50 80 90]);
    add_block('Integrator', [mdl '/Continuous'], 'Position', [180 50 220 90]);
    add_block('DiscreteTimeIntegrator', [mdl '/Discrete'], 'SampleTime', '0.5', 'Position', [180 145 220 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Sine/1', 'Continuous/1');
    add_line(mdl, 'Sine/1', 'Discrete/1');
    add_line(mdl, 'Continuous/1', 'Scope/1');
    add_line(mdl, 'Discrete/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
