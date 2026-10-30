% 최댓값 고르기 / Picking the maximum
% 위상이 다른 세 사인파 중 매 순간의 최댓값
% The largest of three phase-shifted sines at each instant
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_minmax": built from M code, then opened in the model editor.
mdl = 'ex_minmax';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Phase 0'], 'Position', [40 50 80 90]);
    add_block('SineWave', [mdl '/Phase 120'], 'Phase', '2*pi/3', 'Position', [40 145 80 185]);
    add_block('SineWave', [mdl '/Phase 240'], 'Phase', '4*pi/3', 'Position', [40 240 80 280]);
    add_block('MinMax', [mdl '/Max'], 'Function', 'max', 'Inputs', '3', 'Position', [180 145 220 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '4', 'Position', [460 145 500 251]);
    add_line(mdl, 'Phase 0/1', 'Max/1');
    add_line(mdl, 'Phase 120/1', 'Max/2');
    add_line(mdl, 'Phase 240/1', 'Max/3');
    add_line(mdl, 'Phase 0/1', 'Scope/1');
    add_line(mdl, 'Phase 120/1', 'Scope/2');
    add_line(mdl, 'Phase 240/1', 'Scope/3');
    add_line(mdl, 'Max/1', 'Scope/4');
    set_param(mdl, 'StopTime', '7');
    open_system(mdl);
end
