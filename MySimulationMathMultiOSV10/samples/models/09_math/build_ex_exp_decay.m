% 지수 감쇠 / Exponential decay
% e^(−0.5t)와 감쇠 진동 e^(−0.5t)·sin 2t
% e^(−0.5t) and the damped wave e^(−0.5t)·sin 2t
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_exp_decay": built from M code, then opened in the model editor.
mdl = 'ex_exp_decay';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Clock', [mdl '/Clock'], 'Position', [40 50 80 90]);
    add_block('Gain', [mdl '/-0.5'], 'Gain', '-0.5', 'Position', [180 50 220 90]);
    add_block('MathFunction', [mdl '/exp'], 'Operator', 'exp', 'Position', [320 50 360 90]);
    add_block('SineWave', [mdl '/sin 2t'], 'Frequency', '2', 'Position', [320 145 360 185]);
    add_block('Product', [mdl '/Product'], 'Inputs', '2', 'Position', [460 145 500 185]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [600 50 640 112]);
    add_line(mdl, 'Clock/1', '-0.5/1');
    add_line(mdl, '-0.5/1', 'exp/1');
    add_line(mdl, 'exp/1', 'Product/1');
    add_line(mdl, 'sin 2t/1', 'Product/2');
    add_line(mdl, 'exp/1', 'Scope/1');
    add_line(mdl, 'Product/1', 'Scope/2');
    set_param(mdl, 'StopTime', '10');
    open_system(mdl);
end
