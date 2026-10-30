% 논리곱 (AND) / Logical AND
% 주기가 다른 두 펄스가 모두 켜진 동안만 1
% One only while both pulse trains are on
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_logic_and": built from M code, then opened in the model editor.
mdl = 'ex_logic_and';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('PulseGenerator', [mdl '/Pulse A'], 'Period', '2', 'PulseWidth', '50', 'SampleTime', '0', 'Position', [40 50 80 90]);
    add_block('PulseGenerator', [mdl '/Pulse B'], 'Period', '3', 'PulseWidth', '50', 'SampleTime', '0', 'Position', [40 145 80 185]);
    add_block('LogicalOperator', [mdl '/AND'], 'Operator', 'AND', 'Position', [180 50 220 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '3', 'Position', [460 50 500 134]);
    add_line(mdl, 'Pulse A/1', 'AND/1');
    add_line(mdl, 'Pulse B/1', 'AND/2');
    add_line(mdl, 'Pulse A/1', 'Scope/1');
    add_line(mdl, 'Pulse B/1', 'Scope/2');
    add_line(mdl, 'AND/1', 'Scope/3');
    set_param(mdl, 'StopTime', '12');
    open_system(mdl);
end
