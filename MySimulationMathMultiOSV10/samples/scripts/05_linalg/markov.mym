% 마르코프 연쇄 / Markov chain
% 전이 행렬의 정상 분포
% The stationary distribution of a transition matrix
% (script sample — MySimulationMath start page)
% A Markov chain: the stationary distribution is an eigenvector.
P = [0.9 0.075 0.025; 0.15 0.8 0.05; 0.25 0.25 0.5];   % rows sum to 1
[V, D] = eig(P');
[~, k] = min(abs(diag(D) - 1));
piStat = V(:, k)' / sum(V(:, k))
x = [1 0 0];
for n = 1:50, x = x * P; end
after50Steps = x
