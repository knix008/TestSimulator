% 비교 연산 / Relational operator
% 사인파가 0.5보다 큰 동안 1이 됩니다
% One while the sine is above 0.5
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_relational": built from M code, then opened in the model editor.
mdl = 'ex_relational';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 50 80 90]);
    add_block('Constant', [mdl '/Threshold'], 'Value', '0.5', 'Position', [40 145 80 185]);
    add_block('RelationalOperator', [mdl '/Greater'], 'Operator', '>', 'Position', [180 50 220 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Sine/1', 'Greater/1');
    add_line(mdl, 'Threshold/1', 'Greater/2');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Greater/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
