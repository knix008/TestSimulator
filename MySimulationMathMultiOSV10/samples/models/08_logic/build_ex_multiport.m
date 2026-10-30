% 다중 전환 / Multiport switch
% 카운터가 1·2·3을 돌며 세 신호 중 하나를 고릅니다
% A counter cycles 1, 2, 3 and picks one of three signals
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_multiport": built from M code, then opened in the model editor.
mdl = 'ex_multiport';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('CounterLimited', [mdl '/Counter'], 'uplimit', '2', 'SampleTime', '2', 'Position', [40 50 80 90]);
    add_block('Bias', [mdl '/Plus 1'], 'Bias', '1', 'Position', [180 50 220 90]);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 145 80 185]);
    add_block('SignalGenerator', [mdl '/Square'], 'WaveForm', 'square', 'Position', [40 240 80 280]);
    add_block('Ramp', [mdl '/Ramp'], 'slope', '0.1', 'Position', [40 335 80 375]);
    add_block('MultiportSwitch', [mdl '/Select'], 'Inputs', '3', 'Position', [320 145 360 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 145 640 207]);
    add_line(mdl, 'Counter/1', 'Plus 1/1');
    add_line(mdl, 'Plus 1/1', 'Select/1');
    add_line(mdl, 'Sine/1', 'Select/2');
    add_line(mdl, 'Square/1', 'Select/3');
    add_line(mdl, 'Ramp/1', 'Select/4');
    add_line(mdl, 'Select/1', 'Scope/1');
    add_line(mdl, 'Plus 1/1', 'Scope/2');
    set_param(mdl, 'StopTime', '12');
    open_system(mdl);
end
