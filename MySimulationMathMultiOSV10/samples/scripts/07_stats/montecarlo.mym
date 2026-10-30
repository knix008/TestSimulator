% 몬테카를로 π / Monte Carlo pi
% 무작위 점으로 원주율 추정
% Estimating pi with random points
% (script sample — MySimulationMath start page)
% Monte Carlo estimate of pi.
rng(7);
n = 5000;
p = rand(n, 2) * 2 - 1;
inside = sum(p.^2, 2) <= 1;
piEstimate = 4 * mean(inside)
plot(p(inside, 1), p(inside, 2), '.', p(~inside, 1), p(~inside, 2), '.');
axis equal; title(sprintf('\\pi \\approx %.4f', piEstimate));
