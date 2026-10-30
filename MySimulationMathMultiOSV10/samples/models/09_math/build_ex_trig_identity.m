% 삼각 항등식 / Trigonometric identity
% sin²t + cos²t 는 언제나 1
% sin²t + cos²t is always 1
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_trig_identity": built from M code, then opened in the model editor.
mdl = 'ex_trig_identity';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/sin'], 'Position', [40 50 80 90]);
    add_block('SineWave', [mdl '/cos'], 'Phase', 'pi/2', 'Position', [40 145 80 185]);
    add_block('MathFunction', [mdl '/sin^2'], 'Operator', 'square', 'Position', [180 50 220 90]);
    add_block('MathFunction', [mdl '/cos^2'], 'Operator', 'square', 'Position', [180 145 220 185]);
    add_block('Sum', [mdl '/Sum'], 'Inputs', '|++', 'Position', [320 50 360 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [460 50 500 134]);
    add_line(mdl, 'sin/1', 'sin^2/1');
    add_line(mdl, 'cos/1', 'cos^2/1');
    add_line(mdl, 'sin^2/1', 'Sum/1');
    add_line(mdl, 'cos^2/1', 'Sum/2');
    add_line(mdl, 'sin^2/1', 'Scope/1');
    add_line(mdl, 'cos^2/1', 'Scope/2');
    add_line(mdl, 'Sum/1', 'Scope/3');
    set_param(mdl, 'StopTime', '7');
    open_system(mdl);
end
