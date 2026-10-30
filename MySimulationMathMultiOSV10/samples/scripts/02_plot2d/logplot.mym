% 로그 눈금 / Log scales
% loglog와 semilogy로 거듭제곱·지수 관계 보기
% Power laws and exponentials on log axes
% (script sample — MySimulationMath start page)
% Log axes: straight lines for power laws and exponentials.
x = logspace(-1, 3, 100);
subplot(1, 2, 1); loglog(x, x.^2, x, x.^0.5); grid on
legend('x^2', 'x^{1/2}'); title('loglog');
t = linspace(0, 5, 100);
subplot(1, 2, 2); semilogy(t, exp(2*t), t, exp(-t)); grid on
legend('e^{2t}', 'e^{-t}'); title('semilogy');
