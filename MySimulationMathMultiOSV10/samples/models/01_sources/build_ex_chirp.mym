% 처프 신호 / Chirp signal
% 주파수가 0.1 Hz에서 2 Hz로 올라가는 사인파
% A sine sweeping from 0.1 Hz to 2 Hz
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_chirp": built from M code, then opened in the model editor.
mdl = 'ex_chirp';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Chirp', [mdl '/Chirp'], 'f1', '0.1', 'T', '10', 'f2', '2', 'Position', [40 50 80 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [320 50 360 90]);
    add_line(mdl, 'Chirp/1', 'Scope/1');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
