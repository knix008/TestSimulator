% 반복 수열 (톱니파) / Repeating sequence (sawtooth)
% 시간·값 표로 만든 반복 신호
% A repeating signal made from a time / value table
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_sawtooth": built from M code, then opened in the model editor.
mdl = 'ex_sawtooth';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('RepeatingSequence', [mdl '/Sequence'], 'rep_seq_t', '[0 1 2]', 'rep_seq_y', '[0 1 0]', 'Position', [40 50 80 90]);
    add_block('RepeatingSequence', [mdl '/Sawtooth'], 'rep_seq_t', '[0 2]', 'rep_seq_y', '[-1 1]', 'Position', [40 145 80 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [320 50 360 112]);
    add_line(mdl, 'Sequence/1', 'Scope/1');
    add_line(mdl, 'Sawtooth/1', 'Scope/2');
    set_param(mdl, 'StopTime', '8');
    open_system(mdl);
end
