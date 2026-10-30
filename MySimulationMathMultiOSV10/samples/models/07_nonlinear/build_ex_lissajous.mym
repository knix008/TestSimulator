% 리사주 도형 / Lissajous figure
% 주파수 1:2인 두 사인파를 XY 그래프에 그립니다
% Two sines at 1:2 frequency drawn on an XY graph
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_lissajous": built from M code, then opened in the model editor.
mdl = 'ex_lissajous';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SineWave', [mdl '/X'], 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('SineWave', [mdl '/Y'], 'Frequency', '2', 'Phase', 'pi/2', 'Position', [40 145 80 185]);
    add_block('XYGraph', [mdl '/XY Graph'], 'Position', [320 50 360 112]);
    add_line(mdl, 'X/1', 'XY Graph/1');
    add_line(mdl, 'Y/1', 'XY Graph/2');
    set_param(mdl, 'StopTime', '6.3');
    open_system(mdl);
end
