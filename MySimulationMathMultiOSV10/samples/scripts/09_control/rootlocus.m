% 근궤적 / Root locus
% 이득에 따른 폐루프 극점의 이동
% How the closed-loop poles move with gain
% (script sample — MySimulationMath start page)
% Root locus of a third-order plant.
G = tf([1 3], [1 6 8 0]);
p = pole(G)'
z = zero(G)'
rlocus(G); grid on
title('Root locus of (s+3)/(s(s+2)(s+4))');
