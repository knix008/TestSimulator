% 상태 공간 모델 / State-space model
% x' = Ax + Bu, y = Cx 로 쓴 감쇠 진동
% A damped oscillator as x' = Ax + Bu, y = Cx
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_state_space": built from M code, then opened in the model editor.
mdl = 'ex_state_space';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Step', [mdl '/Step'], 'Time', '0', 'Position', [40 50 80 90]);
    add_block('StateSpace', [mdl '/Plant'], 'A', '[0 1; -4 -0.8]', 'B', '[0; 4]', 'C', '[1 0]', 'D', '0', 'InitialCondition', '[0; 0]', 'Position', [180 50 280 96]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '1', 'Position', [460 50 500 90]);
    add_line(mdl, 'Step/1', 'Plant/1');
    add_line(mdl, 'Plant/1', 'Scope/1');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
