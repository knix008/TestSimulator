% 통계 / Statistics
% 정규 분포 표본의 히스토그램과 요약 값
% A histogram of normal samples and summary values
% (script sample — MySimulationMath start page)
% Statistics: a histogram of normal samples and summary values.
rng(1);
data = 10 + 2*randn(5000, 1);
histogram(data, 40);
title('Normal samples'); xlabel('value'); ylabel('count');
m = mean(data)
s = std(data)
q = quantile(data, [0.25 0.5 0.75])
