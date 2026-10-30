% 절댓값 · 부호 · 제곱근 / Abs, sign and square root
% 사인파의 |u|, sign(u), √|u|
% |u|, sign(u) and √|u| of a sine
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_abs_sign": built from M code, then opened in the model editor.
mdl = 'ex_abs_sign';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 145 80 185]);
    add_block('Abs', [mdl '/Abs'], 'Position', [180 50 220 90]);
    add_block('Sign', [mdl '/Sign'], 'Position', [180 240 220 280]);
    add_block('Sqrt', [mdl '/Sqrt'], 'Position', [320 50 360 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '4', 'Position', [460 145 500 251]);
    add_line(mdl, 'Sine/1', 'Abs/1');
    add_line(mdl, 'Sine/1', 'Sign/1');
    add_line(mdl, 'Abs/1', 'Sqrt/1');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Abs/1', 'Scope/2');
    add_line(mdl, 'Sign/1', 'Scope/3');
    add_line(mdl, 'Sqrt/1', 'Scope/4');
    set_param(mdl, 'StopTime', '7');
    open_system(mdl);
end
