# Plotting

When you run a plotting command, a **Figures** tab opens among the document tabs, with a small tab inside it for each figure. The engine keeps running the next commands even while figures are being drawn on screen.

![2D figure with the grid and rulers turned on](images/en/figure-2d.png)

## 2D Plots

```m
x = linspace(0, 2*pi, 200);
plot(x, sin(x), 'r-', x, cos(x), 'b--', 'LineWidth', 1.5)
hold on
plot(x(1:20:end), sin(x(1:20:end)), 'ko', 'MarkerFaceColor', 'y')
hold off
grid on
xlabel('x'); ylabel('y')
title('Sine and cosine')
legend('sin', 'cos', 'samples', 'Location', 'southwest')
axis([0 2*pi -1.2 1.2])
```

| Function | Plot |
| --- | --- |
| `plot`, `plot3`, `fplot` | Lines |
| `scatter`, `scatter3` | Points |
| `bar`, `barh`, `bar3`, `histogram`, `pie`, `pie3` | Bars, histograms, pies |
| `area`, `stairs`, `stem`, `errorbar`, `fill`, `patch` | Areas, stairs, stems, error bars, polygons |
| `semilogx`, `semilogy`, `loglog`, `polarplot` | Logarithmic and polar |
| `contour`, `contourf`, `quiver`, `imagesc`, `image`, `imshow` | Contours, vector fields, images |
| `text`, `annotation`, `xline`, `yline` | Text and annotations |

Specify the line style by combining color, line and marker, as in `'r-'` (red solid line), `'b--'` (blue dashed line) and `'ko'` (black circles), or with properties such as `'Color'`, `'LineWidth'`, `'Marker'` and `'MarkerSize'`.

## Multiple Figures and Layouts

```m
figure                          % new figure (new tab)
subplot(2, 1, 1); plot(rand(1, 10))
subplot(2, 1, 2); bar(rand(1, 5))
figure
tiledlayout(2, 2)
nexttile; plot(1:10)
nexttile; scatter(rand(1, 30), rand(1, 30))
nexttile; histogram(randn(1, 500))
nexttile; pie([3 2 1])
```

`figure(n)` brings figure n to the front, `clf` clears it, and `close` and `close all` close figures. `gcf` and `gca` are the current figure and axes; change properties with `set` and `get` or with dot notation (`ax.XLim = [0 5]`).

## 3D Plots

![3D surface: surf(peaks) with a colorbar](images/en/figure-3d.png)

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

| Function | Plot |
| --- | --- |
| `surf`, `surfc`, `mesh`, `meshc`, `waterfall`, `ribbon` | Surfaces and meshes |
| `plot3`, `scatter3`, `stem3`, `quiver3` | 3D lines and points |
| `contour3`, `fsurf`, `fmesh` | Contours and function surfaces |
| `sphere`, `cylinder`, `peaks` | Shape data |
| `view`, `camlight`, `light`, `lighting`, `material`, `shading` | Viewpoint and lighting |
| `colormap`, `colorbar`, `caxis`, `clim` | Color |

## Figure Toolbar

The toolbar at the top of the Figures tab applies to the selected figure and axes. Each button has an icon and a label, and hovering shows a description.

| Button | Action |
| --- | --- |
| **Zoom in / Zoom out** | Zoom in or out by a factor of 1.25 around the center of the axes |
| **Zoom (%)** | Set the zoom level with the − / + buttons or by typing it |
| **Fit** | Return all axes of this figure to the initial view (zoom, pan, camera) |
| **Box zoom** | Zoom into a box drawn by dragging; a click zooms in 2×, {{Shift}}+click zooms out |
| **Pan** | Drag to move the view |
| **Rotate 3D** | Drag to orbit the camera |
| **Data tips** | Click a point to show its coordinates; {{Shift}}+click adds tips, {{Esc}} clears them |
| **2D view / 3D view** | Switch the selected axes between the 2D top-down view (`view(2)`) and the 3D view |
| **Grid** | 5×5 grid: a major line every 5 minor lines (an endless floor grid in 3D) |
| **Rulers** | Rulers in data units along the top and left edges |
| **Legend / Colorbar** | Show or hide |
| **Export** | Save as PNG, JPEG, SVG or PDF |
| **Copy** | Copy the figure to the clipboard as an image |

Mouse: the wheel zooms in/out at the cursor position, dragging with the middle button pans in any mode, and dragging in a 3D figure rotates it. The status line at the bottom shows the cursor coordinates and the camera angles (azimuth and elevation).

![Data tips](images/en/figure-datatip.png)

> Tip: The on/off state of the grid and rulers is remembered, and you can set the defaults in Settings › Figures.

## 3D shading

The shading of 3D surfaces is set with M commands.

```m
surf(peaks(40))
shading interp
light('Position', [1 0 1], 'Style', 'infinite')
lighting gouraud
material shiny
```

## Exporting and Printing

- Under **Export** on the toolbar, choose PNG · JPEG (raster) or SVG · PDF (vector).
- In code, use `saveas(gcf, 'plot.png')`, `exportgraphics(gca, 'plot.pdf')` or `print('-dpng', 'plot.png')`.
- **Copy** puts the figure on the clipboard so you can paste it into other programs.

## Interactive Dialogs

| Function | Contents |
| --- | --- |
| `ginput(n)` | Receive n points by clicking in the figure ({{Enter}} to finish, {{Esc}} to cancel) |
| `waitforbuttonpress`, `uiwait`, `uiresume` | Wait for a click or key |
| `inputdlg`, `questdlg`, `listdlg`, `msgbox`, `errordlg`, `warndlg` | Input, choice and message windows |
| `uigetfile`, `uiputfile`, `uigetdir` | Choose files and folders |
| `uicontrol`, `uifigure` | Controls such as buttons and sliders |

## Animation

```m
h = plot(nan, nan);
axis([0 2*pi -1 1])
for k = 1:60
    x = linspace(0, 2*pi*k/60, 100);
    set(h, 'XData', x, 'YData', sin(x));
    drawnow
end
```

`drawnow` draws the changes made so far, and `pause(seconds)` waits. You can also draw connected points with `animatedline` and `addpoints`.
