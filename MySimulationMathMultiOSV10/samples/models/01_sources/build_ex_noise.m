% 난수 신호 / Random signals
% 정규 분포와 균등 분포 난수를 비교합니다
% Gaussian and uniform random numbers
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_noise": built from M code, then opened in the model editor.
mdl = 'ex_noise';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('RandomNumber', [mdl '/Gaussian'], 'Variance', '0.25', 'SampleTime', '0.05', 'Position', [40 50 80 90]);
    add_block('UniformRandomNumber', [mdl '/Uniform'], 'Minimum', '-1', 'Maximum', '1', 'SampleTime', '0.05', 'Position', [40 145 80 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [320 50 360 112]);
    add_line(mdl, 'Gaussian/1', 'Scope/1');
    add_line(mdl, 'Uniform/1', 'Scope/2');
    set_param(mdl, 'StopTime', '5');
    open_system(mdl);
end
