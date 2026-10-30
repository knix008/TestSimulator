% 파형 발생기 / Waveform generator
% 사인·사각·톱니 파형을 함께 비교합니다
% Sine, square and sawtooth waves side by side
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_waveforms": built from M code, then opened in the model editor.
mdl = 'ex_waveforms';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SignalGenerator', [mdl '/Sine'], 'WaveForm', 'sine', 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('SignalGenerator', [mdl '/Square'], 'WaveForm', 'square', 'Frequency', '1', 'Position', [40 145 80 185]);
    add_block('SignalGenerator', [mdl '/Sawtooth'], 'WaveForm', 'sawtooth', 'Frequency', '1', 'Position', [40 240 80 280]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [320 145 360 229]);
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Square/1', 'Scope/2');
    add_line(mdl, 'Sawtooth/1', 'Scope/3');
    set_param(mdl, 'StopTime', '12');
    open_system(mdl);
end
