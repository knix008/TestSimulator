% 제어 시스템 / Control systems
% 전달 함수, 폐루프 계단 응답, 보드 선도
% Transfer functions, a closed-loop step response and a Bode plot
% (script sample — MySimulationMath start page)
% Control systems: a second-order plant in closed loop.
s = tf('s');
G = 4 / (s^2 + 1.2*s + 4);
C = 1 + 0.5/s;
T = feedback(C*G, 1)
subplot(1, 2, 1); step(T); grid on
subplot(1, 2, 2); bode(G); grid on
[Gm, Pm] = margin(C*G)
