% 고역 통과 필터 / High-pass filter
% 사각파를 s/(s+1)에 통과시키면 모서리만 남습니다
% A square wave through s/(s+1) keeps only its edges
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_highpass": built from M code, then opened in the model editor.
mdl = 'ex_highpass';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SignalGenerator', [mdl '/Square'], 'WaveForm', 'square', 'Frequency', '0.5', 'Position', [40 50 80 90]);
    add_block('TransferFcn', [mdl '/High-pass'], 'Numerator', '[1 0]', 'Denominator', '[1 1]', 'Position', [180 50 280 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Square/1', 'High-pass/1');
    add_line(mdl, 'Square/1', 'Scope/1');
    add_line(mdl, 'High-pass/1', 'Scope/2');
    set_param(mdl, 'StopTime', '25');
    open_system(mdl);
end
