% 기본 신호 원 / Basic sources
% 계단·램프·사인파·상수를 한 스코프에 봅니다
% Step, ramp, sine and constant on one scope
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_sources_basic": built from M code, then opened in the model editor.
mdl = 'ex_sources_basic';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Step'], 'Time', '1', 'Position', [40 50 80 90]);
    add_block('Ramp', [mdl '/Ramp'], 'slope', '0.2', 'Position', [40 145 80 185]);
    add_block('SineWave', [mdl '/Sine'], 'Position', [40 240 80 280]);
    add_block('Constant', [mdl '/Constant'], 'Value', '0.5', 'Position', [40 335 80 375]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '4', 'Position', [320 145 360 251]);
    add_line(mdl, 'Step/1', 'Scope/1');
    add_line(mdl, 'Ramp/1', 'Scope/2');
    add_line(mdl, 'Sine/1', 'Scope/3');
    add_line(mdl, 'Constant/1', 'Scope/4');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
