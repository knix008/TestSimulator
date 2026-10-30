% 스펙트로그램 / Spectrogram
% 주파수가 변하는 처프 신호의 시간-주파수 분석
% Time-frequency view of a chirp
% (script sample — MySimulationMath start page)
% A spectrogram of a linear chirp.
fs = 2000; t = 0:1/fs:2;
x = chirp(t, 50, 2, 600);
spectrogram(x, 128, 100, 256, fs, 'yaxis');
title('Chirp 50 → 600 Hz');
