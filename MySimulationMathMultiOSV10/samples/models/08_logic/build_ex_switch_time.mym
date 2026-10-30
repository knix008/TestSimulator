% 시간에 따라 전환 / Switching over time
% 5초 전에는 사인파, 그 뒤로는 사각파를 내보냅니다
% The sine before 5 s, the square wave after
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_switch_time": built from M code, then opened in the model editor.
mdl = 'ex_switch_time';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SignalGenerator', [mdl '/Square'], 'WaveForm', 'square', 'Position', [40 50 80 90]);
    add_block('Clock', [mdl '/Clock'], 'Position', [40 145 80 185]);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 240 80 280]);
    add_block('Switch', [mdl '/Switch'], 'Threshold', '5', 'Position', [180 145 220 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [460 145 500 185]);
    add_line(mdl, 'Square/1', 'Switch/1');
    add_line(mdl, 'Clock/1', 'Switch/2');
    add_line(mdl, 'Sine/1', 'Switch/3');
    add_line(mdl, 'Switch/1', 'Scope/1');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
