% 변화율 제한 / Rate limiter
% 사각파의 오르내림을 초당 2로 제한합니다
% A square wave limited to a slope of 2 per second
% (example model, builds and opens the model — MySimulationMath start page)
% Example model "ex_rate_limiter": built from M code, then opened in the model editor.
mdl = 'ex_rate_limiter';
try
    open_system(mdl);            % already loaded: show it
catch
    new_system(mdl);
    add_block('SignalGenerator', [mdl '/Square'], 'WaveForm', 'square', 'Frequency', '1', 'Position', [40 50 80 90]);
    add_block('RateLimiter', [mdl '/Rate limit'], 'RisingSlewLimit', '2', 'FallingSlewLimit', '-2', 'Position', [180 50 220 90]);
    add_block('Scope', [mdl '/Scope'], 'NumInputPorts', '2', 'Position', [460 50 500 112]);
    add_line(mdl, 'Square/1', 'Rate limit/1');
    add_line(mdl, 'Square/1', 'Scope/1');
    add_line(mdl, 'Rate limit/1', 'Scope/2');
    set_param(mdl, 'StopTime', '15');
    open_system(mdl);
end
