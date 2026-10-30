% 온도 조절기 (켜기/끄기) / Thermostat (on / off)
% 히스테리시스가 있는 릴레이로 방 온도를 20도 근처로 유지합니다
% A relay with hysteresis keeps the room near 20 degrees
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_thermostat": built from M code, then opened in the model editor.
mdl = 'ex_thermostat';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Constant', [mdl '/Set 20'], 'Value', '20', 'Position', [40 50 80 90]);
    add_block('Sum', [mdl '/Error'], 'Inputs', '|+-', 'Position', [180 50 220 90]);
    add_block('Relay', [mdl '/Heater'], 'OnSwitchValue', '0.5', 'OffSwitchValue', '-0.5', 'OnOutputValue', '1', 'OffOutputValue', '0', 'Position', [320 50 360 90]);
    add_block('Gain', [mdl '/Power'], 'Gain', '25', 'Position', [460 50 500 90]);
    add_block('TransferFcn', [mdl '/Room'], 'Numerator', '[1]', 'Denominator', '[10 1]', 'Position', [600 50 700 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [880 50 920 112]);
    add_line(mdl, 'Set 20/1', 'Error/1');
    add_line(mdl, 'Error/1', 'Heater/1');
    add_line(mdl, 'Heater/1', 'Power/1');
    add_line(mdl, 'Power/1', 'Room/1');
    add_line(mdl, 'Room/1', 'Error/2');
    add_line(mdl, 'Room/1', 'Scope/1');
    add_line(mdl, 'Heater/1', 'Scope/2');
    set_param(mdl, 'StopTime', '60');
    open_system(mdl);
end
