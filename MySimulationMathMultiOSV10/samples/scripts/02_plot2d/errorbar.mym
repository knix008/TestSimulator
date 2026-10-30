% 오차 막대와 신뢰 구간 / Error bars and bands
% 측정값의 오차 막대와 음영 구간
% Error bars and a shaded confidence band
% (script sample — MySimulationMath start page)
% Error bars and a shaded band around a mean curve.
x = 0:0.5:6;
y = sin(x); e = 0.1 + 0.05*x;
fill([x fliplr(x)], [y-e fliplr(y+e)], [0.6 0.8 1], 'EdgeColor', 'none'); hold on
errorbar(x, y, e, 'o-', 'LineWidth', 1.2); hold off
grid on; title('Measurements with uncertainty');
