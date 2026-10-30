% 진폭 변조 (AM) / Amplitude modulation (AM)
% 느린 신호로 빠른 반송파의 진폭을 바꿉니다
% A slow message shapes the amplitude of a fast carrier
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_am": built from M code, then opened in the model editor.
mdl = 'ex_am';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Message'], 'Amplitude', '0.5', 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('Bias', [mdl '/Offset'], 'Bias', '1', 'Position', [180 50 220 90]);
    add_block('SineWave', [mdl '/Carrier'], 'Frequency', '25', 'Position', [40 145 80 185]);
    add_block('Product', [mdl '/Modulator'], 'Inputs', '2', 'Position', [320 50 360 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Message/1', 'Offset/1');
    add_line(mdl, 'Offset/1', 'Modulator/1');
    add_line(mdl, 'Carrier/1', 'Modulator/2');
    add_line(mdl, 'Modulator/1', 'Scope/1');
    add_line(mdl, 'Offset/1', 'Scope/2');
    set_param(mdl, 'StopTime', '8');
    open_system(mdl);
end
