% 곡선 맞춤 / Curve fitting
% 감쇠 진동 모델의 매개변수 추정
% Estimating the parameters of a damped oscillation
% (script sample — MySimulationMath start page)
% Nonlinear curve fitting: a damped oscillation.
rng(8);
t = linspace(0, 10, 80)';
model = @(p, t) p(1) * exp(-p(2)*t) .* cos(p(3)*t);
y = model([2 0.3 2.2], t) + 0.08*randn(size(t));
p = lsqcurvefit(model, [1 0.1 2], t, y)
plot(t, y, 'o', t, model(p, t), 'LineWidth', 1.5); grid on
legend('data', 'fit'); title('A e^{-bt} cos(\omega t)');
