% 합성곱 / Convolution
% 임펄스 응답과의 합성곱으로 이동 평균
% A moving average as convolution with an impulse response
% (script sample — MySimulationMath start page)
% Convolution: smoothing with a moving-average kernel.
rng(5);
n = 0:199;
x = double(mod(floor(n / 40), 2)) + 0.25*randn(1, 200);   % noisy square wave
h = ones(1, 9) / 9;
y = conv(x, h, 'same');
plot(n, x, n, y, 'LineWidth', 1.3); grid on
legend('noisy', 'smoothed'); title('y = x * h');
