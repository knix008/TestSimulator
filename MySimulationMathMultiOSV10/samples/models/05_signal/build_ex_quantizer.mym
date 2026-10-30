% 양자화 / Quantization
% 연속 신호를 0.25 단위로 양자화합니다
% A continuous signal quantized in steps of 0.25
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_quantizer": built from M code, then opened in the model editor.
mdl = 'ex_quantizer';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 50 80 90]);
    add_block('Quantizer', [mdl '/Quantizer'], 'QuantizationInterval', '0.25', 'Position', [180 50 220 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Sine/1', 'Quantizer/1');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Quantizer/1', 'Scope/2');
    set_param(mdl, 'StopTime', '7');
    open_system(mdl);
end
