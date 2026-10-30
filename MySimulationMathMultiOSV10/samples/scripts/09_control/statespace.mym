% 상태 공간과 LQR / State space and LQR
% 역진자 모델을 LQR로 안정화
% Stabilizing an inverted pendulum with LQR
% (script sample — MySimulationMath start page)
% State-space model of an inverted pendulum stabilized with LQR.
A = [0 1; 9.81 0]; B = [0; 1]; C = [1 0]; D = 0;
sys = ss(A, B, C, D);
openLoopPoles = eig(A)'
K = lqr(A, B, diag([10 1]), 1)
cl = ss(A - B*K, B, C, D);
closedLoopPoles = eig(A - B*K)'
initial(cl, [0.2; 0]); grid on; title('Closed-loop response from 0.2 rad');
