% 다항식 / Polynomial
% u³ − 2u 를 u = −2…2 에 대해 그립니다
% u³ − 2u over u = −2 … 2
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_polynomial": built from M code, then opened in the model editor.
mdl = 'ex_polynomial';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('Ramp', [mdl '/u'], 'slope', '1', 'InitialOutput', '-2', 'Position', [40 50 80 90]);
    add_block('Polynomial', [mdl '/p(u)'], 'coefs', '[1 0 -2 0]', 'Position', [180 50 280 96]);
    add_block('XYGraph', [mdl '/XY Graph'], 'Position', [460 50 500 112]);
    add_line(mdl, 'u/1', 'p(u)/1');
    add_line(mdl, 'u/1', 'XY Graph/1');
    add_line(mdl, 'p(u)/1', 'XY Graph/2');
    set_param(mdl, 'StopTime', '4');
    open_system(mdl);
end
