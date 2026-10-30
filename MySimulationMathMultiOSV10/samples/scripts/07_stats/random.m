% 큰 수의 법칙 / Law of large numbers
% 주사위 평균이 3.5로 수렴
% The running mean of dice rolls converging to 3.5
% (script sample — MySimulationMath start page)
% The law of large numbers with dice rolls.
rng(11);
rolls = randi(6, 1, 3000);
runningMean = cumsum(rolls) ./ (1:numel(rolls));
subplot(1, 2, 1); plot(runningMean); yline(3.5, '--'); grid on
title('Running mean'); xlabel('rolls');
subplot(1, 2, 2); bar(histcounts(rolls, 0.5:1:6.5)); title('Counts per face');
