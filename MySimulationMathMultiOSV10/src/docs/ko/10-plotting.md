# 그림 그리기

그림 명령을 실행하면 문서 탭에 **그림** 탭이 열리고, 그 안에 그림(figure)마다 작은 탭이 생깁니다. 그림은 화면에 그려지는 동안에도 엔진은 다음 명령을 계속 실행합니다.

![2D 그림: 격자와 눈금자를 켠 모습](images/ko/figure-2d.png)

## 2D 그림

```m
x = linspace(0, 2*pi, 200);
plot(x, sin(x), 'r-', x, cos(x), 'b--', 'LineWidth', 1.5)
hold on
plot(x(1:20:end), sin(x(1:20:end)), 'ko', 'MarkerFaceColor', 'y')
hold off
grid on
xlabel('x'); ylabel('y')
title('사인과 코사인')
legend('sin', 'cos', '표본', 'Location', 'southwest')
axis([0 2*pi -1.2 1.2])
```

| 함수 | 그림 |
| --- | --- |
| `plot`, `plot3`, `fplot` | 선 |
| `scatter`, `scatter3` | 점 |
| `bar`, `barh`, `bar3`, `histogram`, `pie`, `pie3` | 막대·히스토그램·원 |
| `area`, `stairs`, `stem`, `errorbar`, `fill`, `patch` | 영역·계단·줄기·오차 막대·다각형 |
| `semilogx`, `semilogy`, `loglog`, `polarplot` | 로그·극좌표 |
| `contour`, `contourf`, `quiver`, `imagesc`, `image`, `imshow` | 등고선·벡터장·영상 |
| `text`, `annotation`, `xline`, `yline` | 글자와 주석 |

선 모양은 `'r-'`(빨간 실선), `'b--'`(파란 점선), `'ko'`(검은 원) 처럼 색·선·표지를 묶어 쓰거나, `'Color'`, `'LineWidth'`, `'Marker'`, `'MarkerSize'` 같은 속성으로 정합니다.

## 여러 그림과 배치

```m
figure                          % 새 그림 (새 탭)
subplot(2, 1, 1); plot(rand(1, 10))
subplot(2, 1, 2); bar(rand(1, 5))
figure
tiledlayout(2, 2)
nexttile; plot(1:10)
nexttile; scatter(rand(1, 30), rand(1, 30))
nexttile; histogram(randn(1, 500))
nexttile; pie([3 2 1])
```

`figure(n)` 은 n번 그림을 앞으로 가져오고, `clf` 는 지우고, `close`, `close all` 은 닫습니다. `gcf`, `gca` 는 현재 그림과 좌표축이며, `set`, `get` 이나 점 표기(`ax.XLim = [0 5]`)로 속성을 바꿉니다.

## 3D 그림

![3D 곡면: surf(peaks) 와 컬러바](images/ko/figure-3d.png)

```m
[X, Y] = meshgrid(-2:0.1:2);
Z = X .* exp(-X.^2 - Y.^2);
surf(X, Y, Z)
colormap(parula)
colorbar
shading interp
view(-35, 30)
xlabel('X'); ylabel('Y'); zlabel('Z')
```

| 함수 | 그림 |
| --- | --- |
| `surf`, `surfc`, `mesh`, `meshc`, `waterfall`, `ribbon` | 곡면·그물 |
| `plot3`, `scatter3`, `stem3`, `quiver3` | 3D 선·점 |
| `contour3`, `fsurf`, `fmesh` | 등고선·함수 곡면 |
| `sphere`, `cylinder`, `peaks` | 모양 데이터 |
| `view`, `camlight`, `light`, `lighting`, `material`, `shading` | 시점과 조명 |
| `colormap`, `colorbar`, `caxis`, `clim` | 색 |

## 그림 도구 모음

그림 탭 위쪽의 도구 모음은 선택한 그림과 좌표축에 적용됩니다. 각 단추는 아이콘과 이름이 함께 있고, 마우스를 올리면 설명이 나옵니다.

| 단추 | 동작 |
| --- | --- |
| **확대 / 축소** | 좌표축 가운데를 기준으로 1.25배씩 확대·축소 |
| **배율 (%)** | − / + 단추나 직접 입력으로 배율을 정함 |
| **맞춤** | 이 그림의 모든 좌표축을 처음 보기로 (확대·이동·카메라) |
| **상자 확대** | 끌어서 그린 상자로 확대, 클릭은 2배 확대, {{Shift}}+클릭은 축소 |
| **이동** | 끌어서 보기를 옮김 |
| **3D 회전** | 끌어서 카메라를 궤도 회전 |
| **데이터 팁** | 점을 클릭하면 좌표가 나옴, {{Shift}}+클릭으로 팁 추가, {{Esc}} 로 지움 |
| **2D / 3D** | 선택한 좌표축을 위에서 본 2D 보기(`view(2)`)와 3D 보기 사이에서 전환 |
| **격자** | 5×5 격자: 보조선 5칸마다 주선 (3D 에서는 끝없는 바닥 격자) |
| **눈금자** | 위쪽과 왼쪽 가장자리에 데이터 단위 눈금자 |
| **범례 / 컬러바** | 표시·숨기기 |
| **내보내기** | PNG, JPEG, SVG, PDF 로 저장 |
| **복사** | 그림을 이미지로 클립보드에 복사 |

마우스: 휠은 커서 위치에서 확대/축소, 가운데 버튼 끌기는 어느 모드에서나 이동, 3D 그림에서 끌기는 회전입니다. 아래쪽 상태 줄에 커서 좌표와 카메라 각도(방위각·고도)가 나옵니다.

![데이터 팁](images/ko/figure-datatip.png)

> 팁: 격자와 눈금자의 켜짐 상태는 기억되며, 설정 › 그림에서 기본값을 정할 수 있습니다.

## 3D 음영

3D 곡면의 밝기와 음영은 M 명령으로 정합니다.

```m
surf(peaks(40))
shading interp
light('Position', [1 0 1], 'Style', 'infinite')
lighting gouraud
material shiny
```

## 내보내기와 인쇄

- 도구 모음 **내보내기** 에서 PNG · JPEG(그림), SVG · PDF(벡터)를 고릅니다.
- 코드로는 `saveas(gcf, 'plot.png')`, `exportgraphics(gca, 'plot.pdf')`, `print('-dpng', 'plot.png')` 를 씁니다.
- **복사** 는 그림을 클립보드에 넣어 다른 프로그램에 붙여 넣게 합니다.

## 상호작용 대화 상자

| 함수 | 내용 |
| --- | --- |
| `ginput(n)` | 그림에서 점 n개를 클릭으로 받음 ({{Enter}} 로 끝, {{Esc}} 로 취소) |
| `waitforbuttonpress`, `uiwait`, `uiresume` | 클릭·키 기다리기 |
| `inputdlg`, `questdlg`, `listdlg`, `msgbox`, `errordlg`, `warndlg` | 입력·선택·메시지 창 |
| `uigetfile`, `uiputfile`, `uigetdir` | 파일·폴더 고르기 |
| `uicontrol`, `uifigure` | 단추·슬라이더 같은 컨트롤 |

## 애니메이션

```m
h = plot(nan, nan);
axis([0 2*pi -1 1])
for k = 1:60
    x = linspace(0, 2*pi*k/60, 100);
    set(h, 'XData', x, 'YData', sin(x));
    drawnow
end
```

`drawnow` 는 그때까지의 변경을 화면에 그리고, `pause(초)` 는 기다립니다. `animatedline` 과 `addpoints` 로 점을 이어 그릴 수도 있습니다.
