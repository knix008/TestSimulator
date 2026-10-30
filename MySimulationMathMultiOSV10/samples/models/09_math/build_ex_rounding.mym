% 내림 · 반올림 · 올림 / Floor, round and ceil
% 램프를 정수로 내림·반올림·올림합니다
% A ramp rounded down, to nearest and up
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_rounding": built from M code, then opened in the model editor.
mdl = 'ex_rounding';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Ramp', [mdl '/Ramp'], 'slope', '0.5', 'Position', [40 145 80 185]);
    add_block('Rounding', [mdl '/floor'], 'Operator', 'floor', 'Position', [180 50 220 90]);
    add_block('Rounding', [mdl '/round'], 'Operator', 'round', 'Position', [180 145 220 185]);
    add_block('Rounding', [mdl '/ceil'], 'Operator', 'ceil', 'Position', [180 240 220 280]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '4', 'Position', [460 145 500 251]);
    add_line(mdl, 'Ramp/1', 'floor/1');
    add_line(mdl, 'Ramp/1', 'round/1');
    add_line(mdl, 'Ramp/1', 'ceil/1');
    add_line(mdl, 'Ramp/1', 'Scope/1');
    add_line(mdl, 'floor/1', 'Scope/2');
    add_line(mdl, 'round/1', 'Scope/3');
    add_line(mdl, 'ceil/1', 'Scope/4');
    set_param(mdl, 'StopTime', '6');
    open_system(mdl);
end
