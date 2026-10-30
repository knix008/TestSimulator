% 카운터와 비교 / Counter and comparison
% 0~7을 세고 5 이상인 동안 1이 됩니다
% Counts 0 to 7; one while the count is 5 or more
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_counter": built from M code, then opened in the model editor.
mdl = 'ex_counter';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('CounterLimited', [mdl '/Counter'], 'uplimit', '7', 'SampleTime', '0.5', 'Position', [40 50 80 90]);
    add_block('CompareToConstant', [mdl '/At least 5'], 'relop', '>=', 'const', '5', 'Position', [180 145 220 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Counter/1', 'At least 5/1');
    add_line(mdl, 'Counter/1', 'Scope/1');
    add_line(mdl, 'At least 5/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
