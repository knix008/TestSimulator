% 영상 필터 / Image filtering
% 합성 영상에 흐림과 가장자리 검출
% Blurring and edge detection on a synthetic image
% (script sample — MySimulationMath start page)
% Image filtering on a synthetic image.
[X, Y] = meshgrid(1:128);
I = double((X - 64).^2 + (Y - 64).^2 < 40^2) + 0.5*double(abs(X - Y) < 6);
Kb = ones(7) / 49;                           % box blur
Ks = [1 0 -1; 2 0 -2; 1 0 -1];               % Sobel
B = conv2(I, Kb, 'same');
E = sqrt(conv2(I, Ks, 'same').^2 + conv2(I, Ks', 'same').^2);
subplot(1, 3, 1); imagesc(I); axis image off; title('image');
subplot(1, 3, 2); imagesc(B); axis image off; title('blurred');
subplot(1, 3, 3); imagesc(E); axis image off; title('edges');
colormap(gray)
