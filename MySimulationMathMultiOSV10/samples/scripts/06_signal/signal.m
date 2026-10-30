% 신호 처리 / Signal processing
% FFT 스펙트럼과 버터워스 저역 통과 필터
% An FFT spectrum and a Butterworth low-pass filter
% (script sample — MySimulationMath start page)
% Signal processing: the spectrum of a noisy signal and a low-pass filter.
fs = 1000; t = (0:1/fs:1-1/fs)';
x = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.3*randn(size(t));
X = abs(fft(x)) / numel(x);
f = (0:numel(x)-1)' * fs / numel(x);
[b, a] = butter(4, 80/(fs/2));
y = filter(b, a, x);
subplot(2, 1, 1); plot(f(1:500), X(1:500)); grid on
title('Spectrum'); xlabel('Hz');
subplot(2, 1, 2); plot(t(1:200), x(1:200), t(1:200), y(1:200)); grid on
title('Low-pass filtered'); legend('input', 'output');
