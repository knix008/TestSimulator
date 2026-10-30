% 비선형 요소 비교 / Nonlinear elements
% 포화·불감대·백래시가 사인파를 어떻게 바꾸는지 봅니다
% How saturation, dead zone and backlash reshape a sine
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_nonlinear_blocks": built from M code, then opened in the model editor.
mdl = 'ex_nonlinear_blocks';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/Sine'], 'Amplitude', '2', 'Position', [40 145 80 185]);
    add_block('Saturation', [mdl '/Saturation'], 'UpperLimit', '1', 'LowerLimit', '-1', 'Position', [180 50 220 90]);
    add_block('DeadZone', [mdl '/Dead zone'], 'LowerValue', '-0.5', 'UpperValue', '0.5', 'Position', [180 145 220 185]);
    add_block('Backlash', [mdl '/Backlash'], 'BacklashWidth', '1', 'Position', [180 240 220 280]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '4', 'Position', [460 145 500 251]);
    add_line(mdl, 'Sine/1', 'Saturation/1');
    add_line(mdl, 'Sine/1', 'Dead zone/1');
    add_line(mdl, 'Sine/1', 'Backlash/1');
    add_line(mdl, 'Sine/1', 'Scope/1');
    add_line(mdl, 'Saturation/1', 'Scope/2');
    add_line(mdl, 'Dead zone/1', 'Scope/3');
    add_line(mdl, 'Backlash/1', 'Scope/4');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
